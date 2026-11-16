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
import { reopenApprovedMonths } from "@/domain/department-approval-service";
import { actorApprovesUser, vacationSubmitTarget } from "@/domain/manager-gate";
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
  const isHr = ["hr", "hr_lead"].includes(actor.role);
  if (["hr_proposed", "rejected", "reopened"].includes(to) && isHr && !comment)
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

      const isOwner = item.userId === actor.id;
      const isManagerForOwner =
        aggregate === "vacation_plan" &&
        (await actorApprovesUser(tx, actor, item.userId));
      if (!isOwner && !isHr && !isManagerForOwner) throw new Error("FORBIDDEN");
      if (isManagerForOwner && !isOwner && !isHr) {
        if (!(
          item.status === "manager_review" &&
          (to === "submitted" || to === "draft")
        ))
          throw new Error("FORBIDDEN");
      }
      if (
        isOwner &&
        !isManagerForOwner &&
        item.status === "manager_review" &&
        to === "submitted"
      )
        throw new Error("FORBIDDEN");

      let nextStatus = to as WorkflowStatus;
      if (
        isOwner &&
        isHr &&
        ["draft", "reopened"].includes(item.status) &&
        ["submitted", "manager_review", "approved"].includes(to)
      ) {
        nextStatus = "approved";
      } else if (
        isOwner &&
        aggregate === "vacation_plan" &&
        ["draft", "reopened"].includes(item.status) &&
        to === "submitted"
      ) {
        nextStatus = await vacationSubmitTarget(tx, actor);
      } else if (
        isOwner &&
        aggregate === "vacation_plan" &&
        to === "manager_review" &&
        ["draft", "reopened"].includes(item.status)
      ) {
        nextStatus = await vacationSubmitTarget(tx, actor);
      }

      if (
        isOwner &&
        ["submitted", "manager_review", "draft", "approved"].includes(
          nextStatus,
        )
      ) {
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
        isHr &&
        !isOwner &&
        ["hr_proposed", "approved", "rejected", "reopened"].includes(nextStatus)
      ) {
        const report = item as typeof overtimeReports.$inferSelect;
        if (!report.departmentId) throw new Error("NOT_FOUND");
      }
      const transitionRole: ActorRole =
        isManagerForOwner && !isOwner
          ? "department_head"
          : (actor.role as ActorRole);
      assertTransition(
        item.status as WorkflowStatus,
        nextStatus,
        transitionRole,
      );
      if (
        aggregate === "vacation_plan" &&
        ["manager_review", "submitted", "approved"].includes(nextStatus)
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
        .set({
          status: nextStatus,
          version: item.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(table.id, id), eq(table.version, item.version)))
        .returning();
      if (!updated) throw new Error("VERSION_CONFLICT");
      await tx.insert(approvalEvents).values({
        aggregateType: aggregate,
        aggregateId: id,
        fromStatus: item.status,
        toStatus: nextStatus,
        actorId: actor.id,
        comment,
      });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: `${aggregate}.${nextStatus}`,
        objectType: aggregate,
        objectId: id,
        metadata: { from: item.status, to: nextStatus },
      });
      if (
        aggregate === "overtime_report" &&
        isHr &&
        nextStatus === "reopened"
      ) {
        const report = item as typeof overtimeReports.$inferSelect;
        if (report.departmentId)
          await reopenApprovedMonths(tx, {
            organizationId: actor.organizationId,
            actorId: actor.id,
            departmentIds: [report.departmentId],
            year: report.year,
            month: report.month,
            reason: "hr_reopened_report",
            metadata: { reportId: id },
          });
      }
      return { status: nextStatus, version: updated.version };
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
