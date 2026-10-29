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
  updatedAt: Date | string;
};

export default async function HrDepartmentsPage() {
  const actor = await requireHr();
  const rows = await db.execute<DepartmentRow>(sql`
    SELECT
      department.id::text AS id,
      department.name,
      department.headcount,
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
      AND department.is_active = true
    ORDER BY department.name
  `);
  const departments = rows.map((row) => ({
    ...row,
    updatedAt: new Date(row.updatedAt).toISOString(),
  }));
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Правила отделов</h1>
        <span className="statusPill">
          {departments.length} активных отделов
        </span>
      </header>
      <DepartmentRuleEditor departments={departments} />
    </AppShell>
  );
}
