import { sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { IrregularLeaveSettings } from "@/components/IrregularLeaveSettings";
import { db } from "@/db/client";
import { requireHr } from "@/lib/auth";

type EmployeeRow = {
  id: string;
  fullName: string;
  departmentName: string | null;
  jobTitle: string | null;
  jobTitleMaxDays: number;
  maxDaysOverride: number | null;
  actualDays: number | null;
  proposedNextYearDays: number | null;
};

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const actor = await requireHr();
  const requestedYear = Number((await searchParams).year);
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2020 &&
    requestedYear <= 2100
      ? requestedYear
      : new Date().getFullYear();
  const [employees, approvals] = await Promise.all([
    db.execute<EmployeeRow>(sql`
      SELECT employee.id::text AS id,
        employee.full_name AS "fullName",
        department.name AS "departmentName",
        COALESCE(title.name, assignment.job_title) AS "jobTitle",
        COALESCE(title.irregular_leave_max_days, 0)::int AS "jobTitleMaxDays",
        terms.max_days_override AS "maxDaysOverride",
        terms.actual_days AS "actualDays",
        terms.proposed_next_year_days AS "proposedNextYearDays"
      FROM users employee
      LEFT JOIN department_assignments assignment
        ON assignment.user_id = employee.id AND assignment.valid_to IS NULL
      LEFT JOIN departments department ON department.id = assignment.department_id
      LEFT JOIN job_titles title ON title.id = assignment.job_title_id
      LEFT JOIN employee_irregular_leave_terms terms
        ON terms.user_id = employee.id AND terms.year = ${year}
      WHERE employee.organization_id = ${actor.organizationId}
        AND employee.is_active = true
      ORDER BY department.name NULLS LAST, employee.full_name
    `),
    db.execute<{ departmentName: string; approvedQuarters: number }>(sql`
      SELECT department.name AS "departmentName",
        COUNT(approval.id) FILTER (WHERE approval.status = 'approved')::int AS "approvedQuarters"
      FROM departments department
      LEFT JOIN department_quarter_approvals approval
        ON approval.department_id = department.id AND approval.year = ${year}
      WHERE department.organization_id = ${actor.organizationId}
        AND department.is_active = true
      GROUP BY department.id
      ORDER BY department.name
    `),
  ]);
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Свод внеурочного времени</h1>
      </header>
      <IrregularLeaveSettings
        key={`${year}:${employees.map((employee) => employee.id).join(":")}`}
        employees={employees}
        approvals={approvals}
        year={year}
      />
    </AppShell>
  );
}
