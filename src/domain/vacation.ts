export type DatePeriod = {
  id: string;
  startsOn: string;
  endsOn: string;
  source: "employee" | "hr";
  status?: "draft" | "approved";
};

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
