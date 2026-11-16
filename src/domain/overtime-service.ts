import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvalEvents,
  auditEvents,
  departmentAssignments,
  overtimeEntries,
  overtimeReports,
  revisions,
} from "@/db/schema";
import { actorApprovesDepartment } from "./manager-gate";
import { reopenApprovedMonths } from "./department-approval-service";
import { isOvertimeTotal } from "./overtime";
import { isEntryWindowOpen } from "./entry-window-service";

export async function getOvertimeReport(
  user: { id: string; organizationId: string },
  year: number,
  month: number,
) {
  let [report] = await db
    .select()
    .from(overtimeReports)
    .where(
      and(
        eq(overtimeReports.userId, user.id),
        eq(overtimeReports.year, year),
        eq(overtimeReports.month, month),
      ),
    )
    .limit(1);
  if (!report) {
    const [assignment] = await db
      .select({ departmentId: departmentAssignments.departmentId })
      .from(departmentAssignments)
      .where(
        and(
          eq(departmentAssignments.userId, user.id),
          isNull(departmentAssignments.validTo),
        ),
      )
      .limit(1);
    const [created] = await db
      .insert(overtimeReports)
      .values({
        organizationId: user.organizationId,
        userId: user.id,
        departmentId: assignment?.departmentId,
        year,
        month,
      })
      .onConflictDoNothing({
        target: [
          overtimeReports.userId,
          overtimeReports.year,
          overtimeReports.month,
        ],
      })
      .returning();
    if (created) report = created;
    else
      [report] = await db
        .select()
        .from(overtimeReports)
        .where(
          and(
            eq(overtimeReports.userId, user.id),
            eq(overtimeReports.year, year),
            eq(overtimeReports.month, month),
          ),
        )
        .limit(1);
  }
  const entries = await db
    .select()
    .from(overtimeEntries)
    .where(eq(overtimeEntries.reportId, report.id));
  const entryWindowOpen = await isEntryWindowOpen(
    user.organizationId,
    "overtime",
    year,
    month,
  );
  return {
    ...report,
    entryWindowOpen,
    entries: Object.fromEntries(
      entries.map((entry) => [entry.workDate, entry.minutes]),
    ),
    sources: Object.fromEntries(
      entries.map((entry) => [
        entry.workDate,
        entry.source === "employee" ? "employee" : "hr",
      ]),
    ) as Record<string, "employee" | "hr">,
  };
}

export async function saveOvertimeReport(input: {
  user: { id: string; organizationId: string };
  year: number;
  month: number;
  version: number;
  entries: Record<string, number>;
  zeroConfirmed: boolean;
}) {
  return db.transaction(async (tx) => {
    const [entryWindow] = await tx.execute<{ isOpen: boolean }>(
      sql`SELECT is_open AS "isOpen" FROM entry_windows WHERE organization_id=${input.user.organizationId} AND kind='overtime' AND year=${input.year} AND month=${input.month} FOR SHARE`,
    );
    if (!entryWindow?.isOpen) throw new Error("ENTRY_WINDOW_CLOSED");
    const [locked] = await tx.execute<{
      id: string;
      version: number;
      status: string;
      departmentId: string | null;
    }>(
      sql`SELECT id, version, status, department_id AS "departmentId" FROM overtime_reports WHERE user_id = ${input.user.id} AND year = ${input.year} AND month = ${input.month} FOR UPDATE`,
    );
    if (!locked) throw new Error("REPORT_NOT_FOUND");
    if (locked.version !== input.version) throw new Error("VERSION_CONFLICT");
    if (
      !["draft", "reopened", "rejected", "withdrawn", "hr_proposed"].includes(
        locked.status,
      )
    )
      throw new Error("REPORT_READ_ONLY");
    const validEntries = Object.entries(input.entries).filter(([, minutes]) =>
      isOvertimeTotal(minutes),
    );
    await tx
      .delete(overtimeEntries)
      .where(eq(overtimeEntries.reportId, locked.id));
    if (validEntries.length)
      await tx.insert(overtimeEntries).values(
        validEntries.map(([workDate, minutes]) => ({
          reportId: locked.id,
          workDate,
          minutes,
          source: "employee" as const,
        })),
      );
    const nextVersion = locked.version + 1;
    const nextStatus =
      locked.status === "hr_proposed" ? "submitted" : locked.status;
    const [report] = await tx
      .update(overtimeReports)
      .set({
        version: nextVersion,
        status: nextStatus as
          "draft" | "submitted" | "reopened" | "rejected" | "withdrawn",
        zeroConfirmed: validEntries.length ? false : input.zeroConfirmed,
        updatedAt: new Date(),
      })
      .where(eq(overtimeReports.id, locked.id))
      .returning();
    const snapshot = {
      entries: Object.fromEntries(validEntries),
      sources: Object.fromEntries(
        validEntries.map(([workDate]) => [workDate, "employee"]),
      ),
      zeroConfirmed: report.zeroConfirmed,
    };
    await tx.insert(revisions).values({
      aggregateType: "overtime_report",
      aggregateId: locked.id,
      version: nextVersion,
      actorId: input.user.id,
      actorRole: "employee",
      snapshot,
    });
    await tx.insert(auditEvents).values({
      organizationId: input.user.organizationId,
      actorId: input.user.id,
      action: "overtime.saved",
      objectType: "overtime_report",
      objectId: locked.id,
      metadata: { version: nextVersion },
    });
    if (locked.status === "hr_proposed") {
      if (locked.departmentId) {
        await reopenApprovedMonths(tx, {
          organizationId: input.user.organizationId,
          actorId: input.user.id,
          departmentIds: [locked.departmentId],
          year: input.year,
          month: input.month,
          reason: "employee_counter_proposal",
          metadata: { reportId: locked.id },
        });
      }
      await tx.insert(approvalEvents).values({
        aggregateType: "overtime_report",
        aggregateId: locked.id,
        fromStatus: "hr_proposed",
        toStatus: "submitted",
        actorId: input.user.id,
        comment: "Сотрудник отправил встречный вариант",
      });
    }
    return {
      version: nextVersion,
      status: nextStatus,
      entries: snapshot.entries,
      sources: snapshot.sources,
      zeroConfirmed: report.zeroConfirmed,
    };
  });
}

const deletableStatuses = [
  "draft",
  "submitted",
  "withdrawn",
  "rejected",
  "reopened",
  "hr_proposed",
] as const;

export async function deleteOvertimeReport(input: {
  actor: { id: string; organizationId: string; role: string };
  reportId: string;
}) {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(overtimeReports)
      .where(
        and(
          eq(overtimeReports.id, input.reportId),
          eq(overtimeReports.organizationId, input.actor.organizationId),
        ),
      )
      .limit(1);
    if (!report) throw new Error("NOT_FOUND");
    const isHr = ["hr", "hr_lead"].includes(input.actor.role);
    const isManager = report.departmentId
      ? await actorApprovesDepartment(
          tx,
          input.actor.id,
          input.actor.organizationId,
          report.departmentId,
        )
      : false;
    if (!isHr && !isManager) throw new Error("FORBIDDEN");
    if (report.status === "approved" && !isHr) throw new Error("READ_ONLY");
    if (
      !deletableStatuses.includes(
        report.status as (typeof deletableStatuses)[number],
      ) &&
      !(isHr && report.status === "approved")
    )
      throw new Error("READ_ONLY");
    await tx.delete(overtimeReports).where(eq(overtimeReports.id, report.id));
    if (report.departmentId)
      await reopenApprovedMonths(tx, {
        organizationId: input.actor.organizationId,
        actorId: input.actor.id,
        departmentIds: [report.departmentId],
        year: report.year,
        month: report.month,
        reason: "overtime_report_deleted",
        metadata: { reportId: report.id, userId: report.userId },
      });
    await tx.insert(auditEvents).values({
      organizationId: input.actor.organizationId,
      actorId: input.actor.id,
      action: "overtime.deleted",
      objectType: "overtime_report",
      objectId: report.id,
      metadata: {
        year: report.year,
        month: report.month,
        status: report.status,
        userId: report.userId,
      },
    });
    return { ok: true };
  });
}
