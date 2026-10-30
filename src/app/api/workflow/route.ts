import { and, eq, sql } from "drizzle-orm";
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
  const isEmployee = ["employee", "department_head"].includes(actor.role);
  if (
    ["hr_proposed", "rejected", "reopened"].includes(to) &&
    !isEmployee &&
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
      if (isEmployee && item.userId !== actor.id) throw new Error("FORBIDDEN");
      if (isEmployee && ["submitted", "draft"].includes(to)) {
        const kind = aggregate === "overtime_report" ? "overtime" : "vacation";
        const month =
          aggregate === "overtime_report"
            ? (item as typeof overtimeReports.$inferSelect).month
            : 0;
        const [entryWindow] = await tx.execute<{ isOpen: boolean }>(
          sql`SELECT is_open AS "isOpen" FROM entry_windows WHERE organization_id=${actor.organizationId} AND kind=${kind} AND year=${item.year} AND month=${month} FOR SHARE`,
        );
        if (!entryWindow?.isOpen) throw new Error("ENTRY_WINDOW_CLOSED");
      }
      if (
        aggregate === "overtime_report" &&
        !isEmployee &&
        ["hr", "hr_lead"].includes(actor.role)
      ) {
        const report = item as typeof overtimeReports.$inferSelect;
        const [managerApproval] = await tx.execute<{ approved: boolean }>(sql`
          SELECT EXISTS (
            SELECT 1 FROM department_quarter_approvals approval
            WHERE approval.organization_id = ${actor.organizationId}
              AND approval.department_id = ${report.departmentId}
              AND approval.year = ${report.year}
              AND approval.quarter = ${Math.ceil(report.month / 3)}
              AND approval.status = 'approved'
          ) AS approved
        `);
        if (!managerApproval?.approved)
          throw new Error("MANAGER_APPROVAL_REQUIRED");
      }
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
      if (aggregate === "overtime_report" && !isEmployee && to === "reopened") {
        const report = item as typeof overtimeReports.$inferSelect;
        const [reopenedApproval] = await tx.execute<{ id: string }>(sql`
          UPDATE department_quarter_approvals
          SET status = 'reopened', approved_by = NULL, approved_at = NULL,
            version = version + 1, updated_at = now()
          WHERE organization_id = ${actor.organizationId}
            AND department_id = ${report.departmentId}
            AND year = ${report.year}
            AND quarter = ${Math.ceil(report.month / 3)}
            AND status = 'approved'
          RETURNING id
        `);
        if (reopenedApproval)
          await tx.insert(auditEvents).values({
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "department_quarter.reopened",
            objectType: "department_quarter_approval",
            objectId: reopenedApproval.id,
            metadata: { reason: "hr_reopened_report", reportId: id },
          });
      }
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
    if (message === "ENTRY_WINDOW_CLOSED")
      return NextResponse.json(
        { error: "Период заполнения закрыт кадровой службой" },
        { status: 409 },
      );
    if (message === "MANAGER_APPROVAL_REQUIRED")
      return NextResponse.json(
        { error: "Квартал ещё не согласован ответственным подразделения" },
        { status: 409 },
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
