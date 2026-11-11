import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApprovalHistory } from "@/components/ApprovalHistory";
import { OvertimeCalendar } from "@/components/OvertimeCalendar";
import { db } from "@/db/client";
import {
  approvalEvents,
  overtimeEntries,
  overtimeReports,
  users,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";

const statusLabels: Record<string, string> = {
  submitted: "Требуется решение",
  hr_proposed: "Ожидает сотрудника",
  reopened: "Открыто повторно",
  approved: "Утверждено",
};

export default async function HrOvertimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireHr();
  const { id } = await params;
  const [report] = await db
    .select({
      id: overtimeReports.id,
      year: overtimeReports.year,
      month: overtimeReports.month,
      version: overtimeReports.version,
      status: overtimeReports.status,
      zeroConfirmed: overtimeReports.zeroConfirmed,
      fullName: users.fullName,
    })
    .from(overtimeReports)
    .innerJoin(users, eq(users.id, overtimeReports.userId))
    .where(
      and(
        eq(overtimeReports.id, id),
        eq(overtimeReports.organizationId, actor.organizationId),
        sql`EXISTS (
          SELECT 1 FROM department_quarter_approvals approval
          WHERE approval.organization_id = ${actor.organizationId}
            AND approval.department_id = ${overtimeReports.departmentId}
            AND approval.year = ${overtimeReports.year}
            AND approval.quarter = CEIL(${overtimeReports.month} / 3.0)::int
            AND approval.status = 'approved'
        )`,
      ),
    )
    .limit(1);
  if (!report) notFound();
  const [rows, history] = await Promise.all([
    db.select().from(overtimeEntries).where(eq(overtimeEntries.reportId, id)),
    db
      .select({
        id: approvalEvents.id,
        fromStatus: approvalEvents.fromStatus,
        toStatus: approvalEvents.toStatus,
        comment: approvalEvents.comment,
        createdAt: approvalEvents.createdAt,
        actorName: users.fullName,
      })
      .from(approvalEvents)
      .innerJoin(users, eq(users.id, approvalEvents.actorId))
      .where(
        and(
          eq(approvalEvents.aggregateType, "overtime_report"),
          eq(approvalEvents.aggregateId, id),
        ),
      )
      .orderBy(desc(approvalEvents.createdAt))
      .limit(10),
  ]);
  const initial = {
    ...report,
    entries: Object.fromEntries(rows.map((row) => [row.workDate, row.minutes])),
    sources: Object.fromEntries(
      rows.map((row) => [
        row.workDate,
        row.source === "employee" ? "employee" : "hr",
      ]),
    ) as Record<string, "hr" | "employee">,
  };
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">
            Проверка времени · {String(report.month).padStart(2, "0")}.
            {report.year}
          </p>
          <h1>{report.fullName}</h1>
        </div>
        <span className="statusPill">
          {statusLabels[report.status] ?? report.status}
        </span>
      </header>
      <OvertimeCalendar initial={initial} mode="hr" />
      <ApprovalHistory
        events={history}
        statusLabels={statusLabels}
        emptyLabel="Это первая кадровая проверка отчёта."
      />
    </AppShell>
  );
}
