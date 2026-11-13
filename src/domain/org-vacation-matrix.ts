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
import {
  ORG_VACATION_MATRIX_STATUSES,
  type OrgVacationMatrixDepartment,
  type OrgVacationMatrixEmployee,
} from "./org-vacation-matrix-shared";

export {
  ORG_VACATION_MATRIX_STATUSES,
  allDepartmentIds,
  clipPeriodToYear,
  dayIndex,
  daysInYear,
  defaultDepartmentIds,
  employeeAbsentDates,
  filterBoardPeople,
  firstOverlapOrBusyMonth,
  orgOccupancyByDate,
  peakOccupancyByMonth,
  peopleInDepartments,
} from "./org-vacation-matrix-shared";
export type {
  OrgVacationBoardPerson,
  OrgVacationMatrixDepartment,
  OrgVacationMatrixEmployee,
  OrgVacationMatrixPeriod,
} from "./org-vacation-matrix-shared";

export async function getOrgVacationMatrix(
  actor: { organizationId: string },
  year: number,
): Promise<OrgVacationMatrixDepartment[]> {
  const departmentRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(
      and(
        eq(departments.organizationId, actor.organizationId),
        eq(departments.isActive, true),
      ),
    )
    .orderBy(departments.name);

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
        })
        .from(vacationPlans)
        .where(
          and(
            eq(vacationPlans.organizationId, actor.organizationId),
            eq(vacationPlans.year, year),
            inArray(vacationPlans.userId, userIds),
            inArray(vacationPlans.status, [...ORG_VACATION_MATRIX_STATUSES]),
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
  const unassigned: OrgVacationMatrixEmployee[] = [];
  const byDepartment = new Map<string, OrgVacationMatrixEmployee[]>();

  for (const employee of employees) {
    const plan = planByUser.get(employee.userId);
    const row: OrgVacationMatrixEmployee = {
      userId: employee.userId,
      fullName: employee.fullName,
      periods: plan
        ? (periodsByPlan.get(plan.id) ?? []).map((period) => ({
            startsOn: period.startsOn,
            endsOn: period.endsOn,
            days: periodDays(period),
          }))
        : [],
    };
    if (!employee.departmentId) {
      unassigned.push(row);
      continue;
    }
    const list = byDepartment.get(employee.departmentId) ?? [];
    list.push(row);
    byDepartment.set(employee.departmentId, list);
  }

  const grouped = departmentRows
    .map((department) => ({
      id: department.id,
      name: department.name,
      employees: byDepartment.get(department.id) ?? [],
    }))
    .filter((department) => department.employees.length > 0);

  if (unassigned.length) {
    grouped.push({
      id: "unassigned",
      name: "Без подразделения",
      employees: unassigned,
    });
  }
  return grouped;
}
