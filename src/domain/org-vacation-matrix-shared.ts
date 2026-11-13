import { shiftIsoDate } from "./vacation";

export const ORG_VACATION_MATRIX_STATUSES = [
  "manager_review",
  "submitted",
  "hr_proposed",
  "approved",
  "reopened",
] as const;

export type OrgVacationMatrixPeriod = {
  startsOn: string;
  endsOn: string;
  days: number;
};

export type OrgVacationMatrixEmployee = {
  userId: string;
  fullName: string;
  periods: OrgVacationMatrixPeriod[];
};

export type OrgVacationMatrixDepartment = {
  id: string;
  name: string;
  employees: OrgVacationMatrixEmployee[];
};

export type OrgVacationBoardPerson = OrgVacationMatrixEmployee & {
  departmentId: string;
  departmentName: string;
};

export function daysInYear(year: number) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return leap ? 366 : 365;
}

export function dayIndex(isoDate: string) {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const utc = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 1);
  return Math.round((utc - start) / 86_400_000);
}

export function clipPeriodToYear(
  period: Pick<OrgVacationMatrixPeriod, "startsOn" | "endsOn">,
  year: number,
) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (period.endsOn < yearStart || period.startsOn > yearEnd) return null;
  return {
    startsOn: period.startsOn < yearStart ? yearStart : period.startsOn,
    endsOn: period.endsOn > yearEnd ? yearEnd : period.endsOn,
  };
}

export function employeeAbsentDates(
  employee: Pick<OrgVacationMatrixEmployee, "periods">,
  year: number,
) {
  const dates = new Set<string>();
  for (const period of employee.periods) {
    const clipped = clipPeriodToYear(period, year);
    if (!clipped) continue;
    let date = clipped.startsOn;
    while (date <= clipped.endsOn) {
      dates.add(date);
      date = shiftIsoDate(date, 1);
    }
  }
  return dates;
}

export function orgOccupancyByDate(
  employees: Array<
    Pick<OrgVacationMatrixEmployee, "userId" | "fullName" | "periods">
  >,
  year: number,
) {
  const occupancy = new Map<
    string,
    Array<{ userId: string; fullName: string }>
  >();
  for (const employee of employees) {
    for (const date of employeeAbsentDates(employee, year)) {
      const names = occupancy.get(date) ?? [];
      names.push({ userId: employee.userId, fullName: employee.fullName });
      occupancy.set(date, names);
    }
  }
  return occupancy;
}

export function filterBoardPeople(
  departments: OrgVacationMatrixDepartment[],
  departmentIds: ReadonlySet<string>,
  userIds: ReadonlySet<string>,
): OrgVacationBoardPerson[] {
  if (departmentIds.size === 0 || userIds.size === 0) return [];
  const people: OrgVacationBoardPerson[] = [];
  for (const department of departments) {
    if (!departmentIds.has(department.id)) continue;
    for (const employee of department.employees) {
      if (!userIds.has(employee.userId)) continue;
      people.push({
        ...employee,
        departmentId: department.id,
        departmentName: department.name,
      });
    }
  }
  return people;
}

export function allDepartmentIds(departments: OrgVacationMatrixDepartment[]) {
  return departments.map((department) => department.id);
}

export function peopleInDepartments(
  departments: OrgVacationMatrixDepartment[],
  departmentIds: ReadonlySet<string>,
) {
  return departments
    .filter((department) => departmentIds.has(department.id))
    .flatMap((department) => department.employees);
}

export function defaultDepartmentIds(
  departments: OrgVacationMatrixDepartment[],
  actorUserId: string,
) {
  const own = departments.find((department) =>
    department.employees.some((employee) => employee.userId === actorUserId),
  );
  if (own) return [own.id];
  return departments[0] ? [departments[0].id] : [];
}

export function peakOccupancyByMonth(
  occupancy: Map<string, { length: number }>,
  year: number,
) {
  const peaks = Array.from({ length: 12 }, () => 0);
  const prefix = `${year}-`;
  for (const [date, people] of occupancy) {
    if (!date.startsWith(prefix)) continue;
    const month = Number(date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    peaks[month - 1] = Math.max(peaks[month - 1], people.length);
  }
  return peaks;
}

export function firstOverlapOrBusyMonth(
  occupancy: Map<string, { length: number }>,
  year: number,
) {
  const peaks = peakOccupancyByMonth(occupancy, year);
  const overlap = peaks.findIndex((peak) => peak > 1);
  if (overlap >= 0) return overlap + 1;
  const busy = peaks.findIndex((peak) => peak > 0);
  return busy >= 0 ? busy + 1 : 1;
}
