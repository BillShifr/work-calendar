import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  departmentMonthApprovals,
  departments,
  overtimeEntries,
  overtimeReports,
} from "@/db/schema";

const submittedStatuses = ["submitted", "hr_proposed", "approved"] as const;
const hrRoles = ["hr", "hr_lead"] as const;

type Actor = {
  id: string;
  organizationId: string;
  role?: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadDepartments(
  actor: Actor,
  scope: "approver" | "organization",
) {
  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        eq(departments.organizationId, actor.organizationId),
        eq(departments.isActive, true),
        ...(scope === "approver"
          ? [eq(departments.approverUserId, actor.id)]
          : []),
      ),
    )
    .orderBy(departments.name);
}

export async function reopenApprovedMonths(
  tx: Tx,
  input: {
    organizationId: string;
    actorId: string;
    departmentIds: string[];
    reason: string;
    year?: number;
    month?: number;
    fromDate?: string;
    throughDate?: string;
    metadata?: Record<string, unknown>;
  },
) {
  if (!input.departmentIds.length) return [];
  const reopened = await tx.execute<{ id: string }>(sql`
    UPDATE department_month_approvals
    SET status = 'reopened', approved_by = NULL, approved_at = NULL,
      version = version + 1, updated_at = now()
    WHERE organization_id = ${input.organizationId}
      AND department_id IN (${sql.join(
        input.departmentIds.map((departmentId) => sql`${departmentId}`),
        sql`, `,
      )})
      AND status = 'approved'
      ${
        input.year != null && input.month != null
          ? sql`AND year = ${input.year} AND month = ${input.month}`
          : sql``
      }
      ${
        input.fromDate
          ? sql`AND (make_date(year, month, 1) + interval '1 month - 1 day')::date >= ${input.fromDate}`
          : sql``
      }
      ${
        input.throughDate
          ? sql`AND make_date(year, month, 1) <= ${input.throughDate}`
          : sql``
      }
    RETURNING id
  `);
  if (reopened.length)
    await tx.insert(auditEvents).values(
      reopened.map((approval) => ({
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: "department_month.reopened",
        objectType: "department_month_approval",
        objectId: approval.id,
        metadata: { reason: input.reason, ...input.metadata },
      })),
    );
  return reopened;
}

export async function getDepartmentApprovalDashboard(
  actor: Actor,
  year: number,
  scope: "approver" | "organization" = "approver",
) {
  const ownedDepartments = await loadDepartments(actor, scope);
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
      .from(departmentMonthApprovals)
      .where(
        and(
          eq(departmentMonthApprovals.organizationId, actor.organizationId),
          eq(departmentMonthApprovals.year, year),
          inArray(departmentMonthApprovals.departmentId, departmentIds),
        ),
      ),
  ]);

  return ownedDepartments
    .map((department) => ({
      ...department,
      months: Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const assigned = employees.filter(
          (employee) =>
            employee.departmentId === department.id && employee.month === month,
        );
        const expectedReports = new Set(
          assigned.map((employee) => employee.userId),
        ).size;
        const monthReports = reports.filter(
          (report) =>
            report.departmentId === department.id &&
            report.month === month &&
            assigned.some((employee) => employee.userId === report.userId),
        );
        const readyReports = monthReports.filter((report) =>
          submittedStatuses.includes(
            report.status as (typeof submittedStatuses)[number],
          ),
        );
        const approval = approvals.find(
          (item) => item.departmentId === department.id && item.month === month,
        );
        return {
          month,
          employeeCount: expectedReports,
          expectedReports,
          readyReports: readyReports.length,
          status: approval?.status ?? "draft",
          reports: monthReports.map((report) => ({
            ...report,
            fullName:
              assigned.find((employee) => employee.userId === report.userId)
                ?.fullName ?? "Сотрудник",
          })),
        };
      }).filter(
        (month) => month.expectedReports > 0 || month.reports.length > 0,
      ),
    }))
    .filter((department) => department.months.length > 0);
}

export async function approveDepartmentMonth(input: {
  actor: Actor;
  departmentId: string;
  year: number;
  month: number;
}) {
  return db.transaction(async (tx) => {
    const isHr = hrRoles.includes(input.actor.role as (typeof hrRoles)[number]);
    const [department] = await tx
      .select({ id: departments.id })
      .from(departments)
      .where(
        and(
          eq(departments.id, input.departmentId),
          eq(departments.organizationId, input.actor.organizationId),
          eq(departments.isActive, true),
          ...(isHr ? [] : [eq(departments.approverUserId, input.actor.id)]),
        ),
      )
      .limit(1);
    if (!department) throw new Error("FORBIDDEN");
    const [expectedRow] = await tx.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count
      FROM users employee
      CROSS JOIN LATERAL (
        SELECT assignment.department_id
        FROM department_assignments assignment
        WHERE assignment.user_id = employee.id
          AND assignment.valid_from <= (make_date(${input.year}, ${input.month}, 1) + interval '1 month - 1 day')::date
          AND (assignment.valid_to IS NULL OR assignment.valid_to >= make_date(${input.year}, ${input.month}, 1))
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
      WITH expected AS (
        SELECT employee.id AS user_id
        FROM users employee
        CROSS JOIN LATERAL (
          SELECT assignment.department_id
          FROM department_assignments assignment
          WHERE assignment.user_id = employee.id
            AND assignment.valid_from <= (make_date(${input.year}, ${input.month}, 1) + interval '1 month - 1 day')::date
            AND (assignment.valid_to IS NULL OR assignment.valid_to >= make_date(${input.year}, ${input.month}, 1))
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
        AND report.month = ${input.month}
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
      .insert(departmentMonthApprovals)
      .values({
        organizationId: input.actor.organizationId,
        departmentId: input.departmentId,
        year: input.year,
        month: input.month,
        status: "approved",
        approvedBy: input.actor.id,
        approvedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          departmentMonthApprovals.departmentId,
          departmentMonthApprovals.year,
          departmentMonthApprovals.month,
        ],
        set: {
          status: "approved",
          approvedBy: input.actor.id,
          approvedAt: now,
          version: sql`${departmentMonthApprovals.version} + 1`,
          updatedAt: now,
        },
      })
      .returning();
    await tx.insert(auditEvents).values({
      organizationId: input.actor.organizationId,
      actorId: input.actor.id,
      action: "department_month.approved",
      objectType: "department_month_approval",
      objectId: approval.id,
      metadata: {
        departmentId: input.departmentId,
        year: input.year,
        month: input.month,
        reports: expected,
      },
    });
    return approval;
  });
}
