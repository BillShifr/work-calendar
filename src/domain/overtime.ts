export const OVERTIME_MINUTES = [5, 10, 15, 30, 60] as const;
export type OvertimeMinutes = (typeof OVERTIME_MINUTES)[number];

export function isOvertimeMinutes(value: number): value is OvertimeMinutes {
  return OVERTIME_MINUTES.includes(value as OvertimeMinutes);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}
