import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  buildAbsenceRisks,
  type AbsenceDay,
  type AbsenceRisk,
} from "./absence-risk";

export async function getOrganizationAbsenceRisks(
  organizationId: string,
  startYear: number,
): Promise<AbsenceRisk[]> {
  const startsOn = `${startYear}-01-01`;
  const endsOn = `${startYear + 1}-12-31`;
  const rows = await db.execute<AbsenceDay>(sql`
    SELECT
      department.id::text AS "departmentId",
      department.name AS "departmentName",
      department.headcount AS "headcount",
      calendar.day::date::text AS "day",
      count(DISTINCT plan.user_id)::int AS "absentCount",
      bool_or(assignment.is_critical) AS "criticalAbsent",
      array_agg(DISTINCT employee.full_name ORDER BY employee.full_name) AS "employeeNames"
    FROM vacation_periods period
    INNER JOIN vacation_plans plan ON plan.id = period.plan_id
    INNER JOIN users employee ON employee.id = plan.user_id
    INNER JOIN department_assignments assignment ON assignment.user_id = plan.user_id
    INNER JOIN departments department ON department.id = assignment.department_id
    CROSS JOIN LATERAL generate_series(period.starts_on, period.ends_on, interval '1 day') AS calendar(day)
    WHERE plan.organization_id = ${organizationId}
      AND department.organization_id = ${organizationId}
      AND plan.status IN ('submitted', 'hr_proposed', 'approved')
      AND calendar.day::date BETWEEN ${startsOn}::date AND ${endsOn}::date
      AND assignment.valid_from <= calendar.day::date
      AND (assignment.valid_to IS NULL OR assignment.valid_to >= calendar.day::date)
      AND department.is_active = true
    GROUP BY department.id, department.name, department.headcount, calendar.day::date
    ORDER BY department.name, calendar.day::date
  `);
  return buildAbsenceRisks(rows);
}
