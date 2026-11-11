import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  departmentAssignments,
  departments,
  users,
  vacationPeriods,
  vacationPlans,
} from "@/db/schema";
import { periodDays } from "./vacation";
import type { VacationBoardRow } from "./department-vacation-board-shared";

export type { VacationBoardRow } from "./department-vacation-board-shared";
export { vacationBoardStatusLabel } from "./department-vacation-board-shared";

export async function getDepartmentVacationBoard(
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

  const employees = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      departmentId: departmentAssignments.departmentId,
    })
    .from(users)
    .innerJoin(
      departmentAssignments,
      and(
        eq(departmentAssignments.userId, users.id),
        isNull(departmentAssignments.validTo),
        inArray(departmentAssignments.departmentId, departmentIds),
      ),
    )
    .where(
      and(
        eq(users.organizationId, actor.organizationId),
        eq(users.isActive, true),
      ),
    )
    .orderBy(users.fullName);

  const userIds = employees.map((employee) => employee.userId);
  const plans = userIds.length
    ? await db
        .select({
          id: vacationPlans.id,
          userId: vacationPlans.userId,
          status: vacationPlans.status,
          allowanceDays: vacationPlans.allowanceDays,
        })
        .from(vacationPlans)
        .where(
          and(
            eq(vacationPlans.organizationId, actor.organizationId),
            eq(vacationPlans.year, year),
            inArray(vacationPlans.userId, userIds),
          ),
        )
    : [];
  const planIds = plans.map((plan) => plan.id);
  const periods = planIds.length
    ? await db
        .select({
          planId: vacationPeriods.planId,
          startsOn: vacationPeriods.startsOn,
          endsOn: vacationPeriods.endsOn,
        })
        .from(vacationPeriods)
        .where(inArray(vacationPeriods.planId, planIds))
        .orderBy(vacationPeriods.startsOn)
    : [];

  const periodsByPlan = new Map<string, typeof periods>();
  for (const period of periods) {
    const list = periodsByPlan.get(period.planId) ?? [];
    list.push(period);
    periodsByPlan.set(period.planId, list);
  }
  const planByUser = new Map(plans.map((plan) => [plan.userId, plan]));

  return ownedDepartments.map((department) => {
    const rows: VacationBoardRow[] = employees
      .filter((employee) => employee.departmentId === department.id)
      .map((employee) => {
        const plan = planByUser.get(employee.userId);
        const planPeriods = plan
          ? (periodsByPlan.get(plan.id) ?? []).map((period) => ({
              startsOn: period.startsOn,
              endsOn: period.endsOn,
              days: periodDays(period),
            }))
          : [];
        const usedDays = planPeriods.reduce(
          (sum, period) => sum + period.days,
          0,
        );
        return {
          userId: employee.userId,
          fullName: employee.fullName,
          planId: plan?.id ?? null,
          status: plan?.status ?? "missing",
          allowanceDays: plan?.allowanceDays ?? 0,
          usedDays,
          periodCount: planPeriods.length,
          periods: planPeriods,
        };
      });
    const awaitingManager = rows.filter(
      (row) => row.status === "manager_review",
    ).length;
    const sent = rows.filter((row) =>
      ["manager_review", "submitted", "hr_proposed", "approved"].includes(
        row.status,
      ),
    ).length;
    return {
      ...department,
      year,
      awaitingManager,
      sent,
      total: rows.length,
      rows,
    };
  });
}
