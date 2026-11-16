import { periodDays, shiftIsoDate } from "./vacation";

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

export function firstOverlapDayInMonth(
  occupancy: Map<string, Array<{ userId: string }>>,
  year: number,
  month: number,
  monthLength: number,
) {
  for (let day = 1; day <= monthLength; day += 1) {
    const monthPart = String(month).padStart(2, "0");
    const dayPart = String(day).padStart(2, "0");
    const date = `${year}-${monthPart}-${dayPart}`;
    if ((occupancy.get(date)?.length ?? 0) > 1) return date;
  }
  return null;
}

export const BOARD_LAYER_COLORS = [
  "#176b87",
  "#6b56a5",
  "#b07a12",
  "#237553",
  "#c45b4a",
  "#2f6f9f",
  "#8a4b78",
  "#3d7a5a",
  "#9a5b2f",
  "#4a6b8a",
  "#a04040",
  "#5c6b3a",
] as const;

export function assignBoardLayerColors(userIds: readonly string[]) {
  const colors = new Map<string, string>();
  userIds.forEach((userId, index) => {
    colors.set(userId, BOARD_LAYER_COLORS[index % BOARD_LAYER_COLORS.length]!);
  });
  return colors;
}

export function sortBoardPeopleForMonth(
  people: OrgVacationBoardPerson[],
  absentByPerson: Map<string, Set<string>>,
  occupancy: Map<string, Array<{ userId: string }>>,
  year: number,
  month: number,
  monthLength: number,
) {
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}-`;
  function rank(person: OrgVacationBoardPerson) {
    const dates = absentByPerson.get(person.userId) ?? new Set<string>();
    let inMonth = false;
    let overlap = false;
    for (let day = 1; day <= monthLength; day += 1) {
      const date = `${monthPrefix}${String(day).padStart(2, "0")}`;
      if (!dates.has(date)) continue;
      inMonth = true;
      if ((occupancy.get(date)?.length ?? 0) > 1) overlap = true;
    }
    if (!inMonth) return 2;
    return overlap ? 0 : 1;
  }
  return [...people].sort((left, right) => {
    const byRank = rank(left) - rank(right);
    if (byRank !== 0) return byRank;
    return left.fullName.localeCompare(right.fullName, "ru");
  });
}

export function periodCoveringDate(
  periods: OrgVacationMatrixPeriod[],
  date: string,
) {
  return (
    periods.find(
      (period) => period.startsOn <= date && date <= period.endsOn,
    ) ?? null
  );
}

export function intersectDateRange(
  ranges: Array<Pick<OrgVacationMatrixPeriod, "startsOn" | "endsOn">>,
) {
  if (ranges.length === 0) return null;
  let startsOn = ranges[0]!.startsOn;
  let endsOn = ranges[0]!.endsOn;
  for (const range of ranges.slice(1)) {
    if (range.startsOn > startsOn) startsOn = range.startsOn;
    if (range.endsOn < endsOn) endsOn = range.endsOn;
  }
  if (startsOn > endsOn) return null;
  return { startsOn, endsOn };
}

export type OverlapPersonDetail = {
  userId: string;
  fullName: string;
  departmentName: string;
  period: OrgVacationMatrixPeriod;
};

export function overlapDetailsForDate(
  people: OrgVacationBoardPerson[],
  date: string,
) {
  const details: OverlapPersonDetail[] = [];
  for (const person of people) {
    const period = periodCoveringDate(person.periods, date);
    if (!period) continue;
    details.push({
      userId: person.userId,
      fullName: person.fullName,
      departmentName: person.departmentName,
      period,
    });
  }
  const span = intersectDateRange(details.map((item) => item.period));
  return {
    date,
    people: details,
    span,
    spanDays: span ? periodDays(span) : 0,
  };
}
