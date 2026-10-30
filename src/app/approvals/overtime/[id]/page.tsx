import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OvertimeCalendar } from "@/components/OvertimeCalendar";
import { db } from "@/db/client";
import { overtimeEntries, overtimeReports, users } from "@/db/schema";
import { requireDepartmentApprover } from "@/lib/auth";

export default async function ApprovalOvertimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireDepartmentApprover();
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
        inArray(overtimeReports.departmentId, actor.departmentIds),
      ),
    )
    .limit(1);
  if (!report) notFound();
  const entries = await db
    .select()
    .from(overtimeEntries)
    .where(eq(overtimeEntries.reportId, id));
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">
            {String(report.month).padStart(2, "0")}.{report.year}
          </p>
          <h1>{report.fullName}</h1>
        </div>
      </header>
      <OvertimeCalendar
        mode="review"
        initial={{
          ...report,
          entries: Object.fromEntries(
            entries.map((entry) => [entry.workDate, entry.minutes]),
          ),
          sources: Object.fromEntries(
            entries.map((entry) => [entry.workDate, "employee" as const]),
          ),
        }}
      />
    </AppShell>
  );
}
