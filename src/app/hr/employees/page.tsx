import { sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { EmployeeDirectory } from "@/components/EmployeeDirectory";
import { WorkforceNavigation } from "@/components/WorkforceNavigation";
import { db } from "@/db/client";
import { requireHr } from "@/lib/auth";

type EmployeeRow = {
  id: string;
  fullName: string;
  login: string;
  role: "employee" | "department_head" | "hr" | "hr_lead" | "admin";
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  jobTitleId: string | null;
  jobTitle: string | null;
  isCritical: boolean | null;
  allowanceDays: number | null;
};

export default async function EmployeesPage({
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
      : new Date().getFullYear() + 1;
  const [employees, departments, jobTitles] = await Promise.all([
    db.execute<EmployeeRow>(sql`
      SELECT employee.id::text AS id, employee.full_name AS "fullName", employee.login,
        employee.role, employee.is_active AS "isActive", assignment.department_id::text AS "departmentId",
        department.name AS "departmentName", assignment.job_title_id::text AS "jobTitleId",
        COALESCE(title.name, assignment.job_title) AS "jobTitle",
        assignment.is_critical AS "isCritical", plan.allowance_days AS "allowanceDays"
      FROM users employee
      LEFT JOIN department_assignments assignment ON assignment.user_id = employee.id AND assignment.valid_to IS NULL
      LEFT JOIN departments department ON department.id = assignment.department_id
      LEFT JOIN job_titles title ON title.id = assignment.job_title_id
      LEFT JOIN vacation_plans plan ON plan.user_id = employee.id AND plan.year = ${year}
      WHERE employee.organization_id = ${actor.organizationId}
      ORDER BY employee.is_active DESC, employee.full_name
    `),
    db.execute<{ id: string; name: string; parentId: string | null }>(sql`
      SELECT id::text AS id, name, parent_id::text AS "parentId" FROM departments
      WHERE organization_id = ${actor.organizationId} AND is_active = true ORDER BY name
    `),
    db.execute<{ id: string; name: string }>(sql`
      SELECT id::text AS id, name FROM job_titles
      WHERE organization_id = ${actor.organizationId} AND is_active = true ORDER BY name
    `),
  ]);
  const departmentsById = new Map(
    departments.map((department) => [department.id, department]),
  );
  const departmentPath = (departmentId: string) => {
    const parts: string[] = [];
    const visited = new Set<string>();
    let current = departmentsById.get(departmentId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      parts.unshift(current.name);
      current = current.parentId
        ? departmentsById.get(current.parentId)
        : undefined;
    }
    return parts.join(" / ");
  };
  const departmentOptions = departments
    .map((department) => ({
      id: department.id,
      name: departmentPath(department.id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));
  return (
    <AppShell>
      <WorkforceNavigation />
      <header className="pageHeader">
        <h1>Сотрудники</h1>
        <span className="statusPill">
          {employees.filter((item) => item.isActive).length} активных
        </span>
      </header>
      <EmployeeDirectory
        key={employees.map((employee) => employee.id).join(":")}
        employees={employees.map((employee) => ({
          ...employee,
          departmentName: employee.departmentId
            ? departmentPath(employee.departmentId)
            : null,
          allowanceDays: employee.allowanceDays ?? 28,
        }))}
        departments={departmentOptions}
        jobTitles={jobTitles}
        year={year}
      />
    </AppShell>
  );
}
