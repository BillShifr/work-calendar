import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  approvalEvents,
  auditEvents,
  overtimeReports,
  vacationPeriods,
  vacationPlans,
} from "@/db/schema";
import { assertVacationAllowance } from "@/domain/vacation";
import {
  assertTransition,
  workflowStatuses,
  type ActorRole,
  type WorkflowStatus,
} from "@/domain/workflow";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  aggregate: z.enum(["overtime_report", "vacation_plan"]),
  id: z.uuid(),
  to: z.enum(workflowStatuses),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const actor = await requireUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Некорректное действие" },
      { status: 400 },
    );
  const { aggregate, id, to, comment } = parsed.data;
  if (
    ["hr_proposed", "rejected", "reopened"].includes(to) &&
    actor.role !== "employee" &&
    !comment
  )
    return NextResponse.json(
      { error: "Для кадровой правки обязательна причина" },
      { status: 400 },
    );
  try {
    const result = await db.transaction(async (tx) => {
      const table =
        aggregate === "overtime_report" ? overtimeReports : vacationPlans;
      const [item] = await tx
        .select()
        .from(table)
        .where(
          and(eq(table.id, id), eq(table.organizationId, actor.organizationId)),
        )
        .limit(1);
      if (!item) throw new Error("NOT_FOUND");
      if (actor.role === "employee" && item.userId !== actor.id)
        throw new Error("FORBIDDEN");
      assertTransition(
        item.status as WorkflowStatus,
        to,
        actor.role as ActorRole,
      );
      if (
        aggregate === "vacation_plan" &&
        ["submitted", "approved"].includes(to)
      ) {
        const periods = await tx
          .select({
            startsOn: vacationPeriods.startsOn,
            endsOn: vacationPeriods.endsOn,
          })
          .from(vacationPeriods)
          .where(eq(vacationPeriods.planId, id));
        assertVacationAllowance(
          periods,
          (item as typeof vacationPlans.$inferSelect).allowanceDays,
        );
      }
      const [updated] = await tx
        .update(table)
        .set({ status: to, version: item.version + 1, updatedAt: new Date() })
        .where(and(eq(table.id, id), eq(table.version, item.version)))
        .returning();
      if (!updated) throw new Error("VERSION_CONFLICT");
      await tx.insert(approvalEvents).values({
        aggregateType: aggregate,
        aggregateId: id,
        fromStatus: item.status,
        toStatus: to,
        actorId: actor.id,
        comment,
      });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: `${aggregate}.${to}`,
        objectType: aggregate,
        objectId: id,
        metadata: { from: item.status, to },
      });
      return { status: to, version: updated.version };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN")
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    if (message === "NOT_FOUND")
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (message === "ALLOWANCE_EXCEEDED")
      return NextResponse.json(
        { error: "Количество дней превышает доступный лимит" },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error: message.startsWith("Недопустимый переход")
          ? message
          : "Запись уже изменилась",
      },
      { status: 409 },
    );
  }
}
