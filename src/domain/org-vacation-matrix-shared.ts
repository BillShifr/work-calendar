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

export function periodTrack(
  period: Pick<OrgVacationMatrixPeriod, "startsOn" | "endsOn">,
  year: number,
) {
  const clipped = clipPeriodToYear(period, year);
  if (!clipped) return null;
  const total = daysInYear(year);
  const start = dayIndex(clipped.startsOn);
  const end = dayIndex(clipped.endsOn);
  return {
    leftPct: (start / total) * 100,
    widthPct: ((end - start + 1) / total) * 100,
    startsOn: clipped.startsOn,
    endsOn: clipped.endsOn,
  };
}

export function monthStarts(year: number) {
  const total = daysInYear(year);
  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return {
      month: index + 1,
      leftPct: (dayIndex(`${year}-${month}-01`) / total) * 100,
    };
  });
}
