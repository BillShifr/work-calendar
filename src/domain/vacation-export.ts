import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { VacationExportEmployee } from "./vacation-export-types";
import {
  buildVacationChessboardWorkbook,
  buildVacationTableWorkbook,
} from "./vacation-export-workbooks";

export { formatVacationPeriodCell } from "./vacation-export-format";
export type { VacationExportEmployee } from "./vacation-export-types";
export {
  buildVacationChessboardWorkbook,
  buildVacationTableWorkbook,
} from "./vacation-export-workbooks";

export const VACATION_EXPORT_STATUSES = [
  "manager_review",
  "submitted",
  "hr_proposed",
  "approved",
  "reopened",
] as const;

export async function loadVacationExportEmployees(
  organizationId: string,
  year: number,
): Promise<VacationExportEmployee[]> {
  const rows = await db.execute<{
    userId: string;
    fullName: string;
    departmentId: string | null;
    departmentName: string | null;
    jobTitle: string | null;
    startsOn: string;
    endsOn: string;
  }>(sql`
    SELECT employee.id::text AS "userId",
      employee.full_name AS "fullName",
      department.id::text AS "departmentId",
      department.name AS "departmentName",
      COALESCE(title.name, assignment.job_title) AS "jobTitle",
      period.starts_on AS "startsOn",
      period.ends_on AS "endsOn"
    FROM vacation_plans plan
    INNER JOIN users employee ON employee.id = plan.user_id
    INNER JOIN vacation_periods period ON period.plan_id = plan.id
    LEFT JOIN LATERAL (
      SELECT historical_assignment.*
      FROM department_assignments historical_assignment
      WHERE historical_assignment.user_id = employee.id
        AND historical_assignment.valid_from <= ${`${year}-12-31`}
        AND (historical_assignment.valid_to IS NULL OR historical_assignment.valid_to >= ${`${year}-01-01`})
      ORDER BY historical_assignment.valid_from DESC, historical_assignment.created_at DESC
      LIMIT 1
    ) assignment ON true
    LEFT JOIN departments department ON department.id = assignment.department_id
    LEFT JOIN job_titles title ON title.id = assignment.job_title_id
    WHERE plan.organization_id = ${organizationId}
      AND plan.year = ${year}
      AND plan.status IN (
        'manager_review',
        'submitted',
        'hr_proposed',
        'approved',
        'reopened'
      )
    ORDER BY department.name NULLS LAST, employee.full_name, period.starts_on
  `);

  const grouped = new Map<string, VacationExportEmployee>();
  for (const row of rows) {
    const current = grouped.get(row.userId) ?? {
      userId: row.userId,
      fullName: row.fullName,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      jobTitle: row.jobTitle,
      periods: [],
    };
    current.periods.push({ startsOn: row.startsOn, endsOn: row.endsOn });
    grouped.set(row.userId, current);
  }
  return [...grouped.values()];
}

export async function buildVacationExportBundles(
  organizationId: string,
  year: number,
) {
  const employees = await loadVacationExportEmployees(organizationId, year);
  const tableWorkbook = await buildVacationTableWorkbook(employees);
  const tableBuffer = Buffer.from(await tableWorkbook.xlsx.writeBuffer());

  const byDepartment = new Map<string, VacationExportEmployee[]>();
  for (const employee of employees) {
    const key = employee.departmentId ?? "none";
    const list = byDepartment.get(key) ?? [];
    list.push(employee);
    byDepartment.set(key, list);
  }

  const chessboards: Array<{ departmentName: string; buffer: Buffer }> = [];
  for (const [, departmentEmployees] of byDepartment) {
    const departmentName =
      departmentEmployees[0]?.departmentName ?? "Без подразделения";
    const workbook = await buildVacationChessboardWorkbook(
      departmentEmployees,
      departmentName,
    );
    chessboards.push({
      departmentName,
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
  }

  return {
    employees,
    tableBuffer,
    chessboards,
    archiveName: `vacation-export-${year}.zip`,
    tableFilename: `Приложение 1 - Таблица отпусков ${year}.xlsx`,
  };
}
