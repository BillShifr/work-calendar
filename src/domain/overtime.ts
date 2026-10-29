export const OVERTIME_MINUTES = [5, 10, 15, 30, 60] as const;
export type OvertimeMinutes = (typeof OVERTIME_MINUTES)[number];
export const MAX_OVERTIME_MINUTES_PER_DAY = 24 * 60;

export function isOvertimeTotal(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= OVERTIME_MINUTES[0] &&
    value <= MAX_OVERTIME_MINUTES_PER_DAY &&
    value % OVERTIME_MINUTES[0] === 0
  );
}

export function addOvertimeMinutes(current: number, increment: number): number {
  if (!OVERTIME_MINUTES.includes(increment as OvertimeMinutes)) return current;
  const next = current + increment;
  return next <= MAX_OVERTIME_MINUTES_PER_DAY ? next : current;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}
