export type DatePeriod = {
  id: string;
  startsOn: string;
  endsOn: string;
  source: "employee" | "hr";
  status?: "draft" | "approved";
};

export function periodClientId(startsOn: string, endsOn: string): string {
  return `${startsOn}_${endsOn}`;
}

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function occupancyByDate(
  periods: DatePeriod[],
): Map<string, DatePeriod> {
  const map = new Map<string, DatePeriod>();
  for (const period of periods) {
    let date = period.startsOn;
    while (date <= period.endsOn) {
      map.set(date, period);
      date = shiftIsoDate(date, 1);
    }
  }
  return map;
}

export function normalizePeriod(
  first: string,
  second: string,
): Pick<DatePeriod, "startsOn" | "endsOn"> {
  return first <= second
    ? { startsOn: first, endsOn: second }
    : { startsOn: second, endsOn: first };
}

export function periodsOverlap(
  a: Pick<DatePeriod, "startsOn" | "endsOn">,
  b: Pick<DatePeriod, "startsOn" | "endsOn">,
): boolean {
  return a.startsOn <= b.endsOn && b.startsOn <= a.endsOn;
}

export function periodDays(
  period: Pick<DatePeriod, "startsOn" | "endsOn">,
): number {
  const start = Date.parse(`${period.startsOn}T00:00:00Z`);
  const end = Date.parse(`${period.endsOn}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function totalPeriodDays(
  periods: Array<Pick<DatePeriod, "startsOn" | "endsOn">>,
): number {
  return periods.reduce((sum, period) => sum + periodDays(period), 0);
}

export function assertVacationAllowance(
  periods: Array<Pick<DatePeriod, "startsOn" | "endsOn">>,
  allowanceDays: number,
): void {
  if (totalPeriodDays(periods) > allowanceDays)
    throw new Error("ALLOWANCE_EXCEEDED");
}
