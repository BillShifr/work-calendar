import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  departmentQuarterApprovals,
  departments,
  overtimeEntries,
  overtimeReports,
} from "@/db/schema";
import { monthsForQuarter } from "./department-approval";

const submittedStatuses = ["submitted", "hr_proposed", "approved"] as const;

export async function getDepartmentApprovalDashboard(
  actor: { id: string; organizationId: string },
  year: number,
) {
  const ownedDepartments = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        eq(departments.organizationId, actor.organizationId),
        eq(departments.approverUserId, actor.id),
        eq(departments.isActive, true),
      ),
    )
    .orderBy(departments.name);
  if (!ownedDepartments.length) return [];
  const departmentIds = ownedDepartments.map((department) => department.id);
  const [employees, reports, approvals] = await Promise.all([
    db.execute<{
      userId: string;
      fullName: string;
      departmentId: string;
      month: number;
    }>(sql`
      WITH months AS (
        SELECT generate_series(1, 12)::int AS month
      )
      SELECT employee.id::text AS "userId", employee.full_name AS "fullName",
        owned_assignment.department_id::text AS "departmentId", months.month
      FROM users employee
      CROSS JOIN months
      CROSS JOIN LATERAL (
        SELECT assignment.department_id
        FROM department_assignments assignment
        WHERE assignment.user_id = employee.id
          AND assignment.valid_from <= (make_date(${year}, months.month, 1) + interval '1 month - 1 day')::date
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= make_date(${year}, months.month, 1))
        ORDER BY assignment.valid_from DESC, assignment.created_at DESC
        LIMIT 1
      ) owned_assignment
      WHERE employee.organization_id = ${actor.organizationId}
        AND owned_assignment.department_id IN (${sql.join(
          departmentIds.map((departmentId) => sql`${departmentId}`),
          sql`, `,
        )})
    `),
    db
      .select({
        id: overtimeReports.id,
        userId: overtimeReports.userId,
        departmentId: overtimeReports.departmentId,
        month: overtimeReports.month,
        status: overtimeReports.status,
        totalMinutes: sql<number>`COALESCE(SUM(${overtimeEntries.minutes}), 0)::int`,
      })
      .from(overtimeReports)
      .leftJoin(
        overtimeEntries,
        eq(overtimeEntries.reportId, overtimeReports.id),
      )
      .where(
        and(
          eq(overtimeReports.organizationId, actor.organizationId),
          eq(overtimeReports.year, year),
          inArray(overtimeReports.departmentId, departmentIds),
        ),
      )
      .groupBy(overtimeReports.id),
    db
      .select()
      .from(departmentQuarterApprovals)
      .where(
        and(
          eq(departmentQuarterApprovals.organizationId, actor.organizationId),
          eq(departmentQuarterApprovals.year, year),
          inArray(departmentQuarterApprovals.departmentId, departmentIds),
        ),
      ),
  ]);

  return ownedDepartments.map((department) => ({
    ...department,
    quarters: [1, 2, 3, 4].map((quarter) => {
      const months = monthsForQuarter(quarter);
      const assignedInMonth = (
        employee: (typeof employees)[number],
        month: number,
      ) => employee.departmentId === department.id && employee.month === month;
      const departmentEmployees = employees.filter((employee) =>
        months.some((month) => assignedInMonth(employee, month)),
      );
      const expectedReports = months.reduce(
        (total, month) =>
          total +
          new Set(
            departmentEmployees
              .filter((employee) => assignedInMonth(employee, month))
              .map((employee) => employee.userId),
          ).size,
        0,
      );
      const quarterReports = reports.filter(
        (report) =>
          report.departmentId === department.id &&
          months.includes(report.month) &&
          departmentEmployees.some(
            (employee) =>
              employee.userId === report.userId &&
              assignedInMonth(employee, report.month),
          ),
      );
      const readyReports = quarterReports.filter((report) =>
        submittedStatuses.includes(
          report.status as (typeof submittedStatuses)[number],
        ),
      );
      const approval = approvals.find(
        (item) =>
          item.departmentId === department.id && item.quarter === quarter,
      );
      return {
        quarter,
        employeeCount: new Set(
          departmentEmployees.map((employee) => employee.userId),
        ).size,
        expectedReports,
        readyReports: readyReports.length,
        status: approval?.status ?? "draft",
        reports: quarterReports.map((report) => ({
          ...report,
          fullName:
            departmentEmployees.find(
              (employee) => employee.userId === report.userId,
            )?.fullName ?? "Сотрудник",
        })),
      };
    }),
  }));
}

export async function approveDepartmentQuarter(input: {
  actor: { id: string; organizationId: string };
  departmentId: string;
  year: number;
  quarter: number;
}) {
  return db.transaction(async (tx) => {
    const [department] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.id, input.departmentId),
          eq(departments.organizationId, input.actor.organizationId),
          eq(departments.approverUserId, input.actor.id),
          eq(departments.isActive, true),
        ),
      )
      .limit(1);
    if (!department) throw new Error("FORBIDDEN");
    const months = monthsForQuarter(input.quarter);
    const firstMonth = months[0];
    const lastMonth = months[2];
    const [expectedRow] = await tx.execute<{ count: number }>(sql`
      WITH months AS (
        SELECT generate_series(${firstMonth}::int, ${lastMonth}::int)::int AS month
      )
      SELECT COUNT(*)::int AS count
      FROM users employee
      CROSS JOIN months
      CROSS JOIN LATERAL (
        SELECT assignment.department_id
        FROM department_assignments assignment
        WHERE assignment.user_id = employee.id
          AND assignment.valid_from <= (make_date(${input.year}, months.month, 1) + interval '1 month - 1 day')::date
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= make_date(${input.year}, months.month, 1))
        ORDER BY assignment.valid_from DESC, assignment.created_at DESC
        LIMIT 1
      ) owned_assignment
      WHERE employee.organization_id = ${input.actor.organizationId}
        AND owned_assignment.department_id = ${input.departmentId}
    `);
    const [readiness] = await tx.execute<{
      readyCount: number;
      missingCount: number;
    }>(sql`
      WITH months AS (
        SELECT generate_series(${firstMonth}::int, ${lastMonth}::int)::int AS month
      ), expected AS (
        SELECT employee.id AS user_id, months.month
        FROM users employee
        CROSS JOIN months
        CROSS JOIN LATERAL (
          SELECT assignment.department_id
          FROM department_assignments assignment
          WHERE assignment.user_id = employee.id
            AND assignment.valid_from <= (make_date(${input.year}, months.month, 1) + interval '1 month - 1 day')::date
            AND (assignment.valid_to IS NULL OR assignment.valid_to >= make_date(${input.year}, months.month, 1))
          ORDER BY assignment.valid_from DESC, assignment.created_at DESC
          LIMIT 1
        ) owned_assignment
        WHERE employee.organization_id = ${input.actor.organizationId}
          AND owned_assignment.department_id = ${input.departmentId}
      )
      SELECT
        COUNT(report.id)::int AS "readyCount",
        COUNT(*) FILTER (WHERE report.id IS NULL)::int AS "missingCount"
      FROM expected
      LEFT JOIN overtime_reports report
        ON report.user_id = expected.user_id
        AND report.organization_id = ${input.actor.organizationId}
        AND report.department_id = ${input.departmentId}
        AND report.year = ${input.year}
        AND report.month = expected.month
        AND report.status IN ('submitted','hr_proposed','approved')
    `);
    const expected = expectedRow?.count ?? 0;
    if (
      !expected ||
      (readiness?.readyCount ?? 0) !== expected ||
      (readiness?.missingCount ?? expected) !== 0
    )
      throw new Error("INCOMPLETE");
    const now = new Date();
    const [approval] = await tx
      .insert(departmentQuarterApprovals)
      .values({
        organizationId: input.actor.organizationId,
        departmentId: input.departmentId,
        year: input.year,
        quarter: input.quarter,
        status: "approved",
        approvedBy: input.actor.id,
        approvedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          departmentQuarterApprovals.departmentId,
          departmentQuarterApprovals.year,
          departmentQuarterApprovals.quarter,
        ],
        set: {
          status: "approved",
          approvedBy: input.actor.id,
          approvedAt: now,
          version: sql`${departmentQuarterApprovals.version} + 1`,
          updatedAt: now,
        },
      })
      .returning();
    await tx.insert(auditEvents).values({
      organizationId: input.actor.organizationId,
      actorId: input.actor.id,
      action: "department_quarter.approved",
      objectType: "department_quarter_approval",
      objectId: approval.id,
      metadata: {
        departmentId: input.departmentId,
        year: input.year,
        quarter: input.quarter,
        reports: expected,
      },
    });
    return approval;
  });
}
