import { sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { DepartmentRuleEditor } from "@/components/DepartmentRuleEditor";
import { db } from "@/db/client";
import { requireHr } from "@/lib/auth";

type DepartmentRow = {
  id: string;
  name: string;
  headcount: number;
  maxAbsent: number | null;
  minPresent: number | null;
  isActive: boolean;
  assignedCount: number;
  updatedAt: Date | string;
};

export default async function HrDepartmentsPage() {
  const actor = await requireHr();
  const rows = await db.execute<DepartmentRow>(sql`
    SELECT
      department.id::text AS id,
      department.name,
      department.headcount,
      department.is_active AS "isActive",
      (SELECT COUNT(*)::int FROM department_assignments assignment WHERE assignment.department_id = department.id AND assignment.valid_to IS NULL) AS "assignedCount",
      rule.max_absent AS "maxAbsent",
      rule.min_present AS "minPresent",
      department.updated_at AS "updatedAt"
    FROM departments department
    LEFT JOIN LATERAL (
      SELECT absence_rule.max_absent, absence_rule.min_present
      FROM department_absence_rules absence_rule
      WHERE absence_rule.department_id = department.id
      ORDER BY absence_rule.updated_at DESC
      LIMIT 1
    ) rule ON true
    WHERE department.organization_id = ${actor.organizationId}
    ORDER BY department.name
  `);
  const departments = rows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Подразделения</h1>
        <span className="statusPill">
          {departments.filter((item) => item.isActive).length} активных
        </span>
      </header>
      <DepartmentRuleEditor
        key={departments.map((department) => department.id).join(":")}
        departments={departments}
      />
    </AppShell>
  );
}
