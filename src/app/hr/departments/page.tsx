import { sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { DepartmentRuleEditor } from "@/components/DepartmentRuleEditor";
import { db } from "@/db/client";
import { requireHr } from "@/lib/auth";

type DepartmentRow = {
  id: string;
  name: string;
  headcount: number;
  isActive: boolean;
  assignedCount: number;
  parentId: string | null;
  headUserId: string | null;
  approverUserId: string | null;
  updatedAt: Date | string;
};

export default async function HrDepartmentsPage() {
  const actor = await requireHr();
  const [rows, employees] = await Promise.all([
    db.execute<DepartmentRow>(sql`
    SELECT
      department.id::text AS id,
      department.name,
      department.headcount,
      department.parent_id::text AS "parentId",
      department.head_user_id::text AS "headUserId",
      department.approver_user_id::text AS "approverUserId",
      department.is_active AS "isActive",
      (SELECT COUNT(*)::int FROM department_assignments assignment WHERE assignment.department_id = department.id AND assignment.valid_to IS NULL) AS "assignedCount",
      department.updated_at AS "updatedAt"
    FROM departments department
    WHERE department.organization_id = ${actor.organizationId}
    ORDER BY department.name
  `),
    db.execute<{ id: string; fullName: string }>(sql`
      SELECT id::text AS id, full_name AS "fullName"
      FROM users
      WHERE organization_id = ${actor.organizationId} AND is_active = true
      ORDER BY full_name
    `),
  ]);
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
        employees={employees}
      />
    </AppShell>
  );
}
