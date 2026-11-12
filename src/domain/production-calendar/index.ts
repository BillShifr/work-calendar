import {
  PRODUCTION_CALENDAR_BY_YEAR,
  PRODUCTION_CALENDAR_YEARS,
} from "./catalog";
import type {
  ProductionCalendarYear,
  ProductionDayKind,
  WeekdayDisplayMode,
} from "./types";

export type {
  ProductionCalendarYear,
  ProductionDayKind,
  WeekdayDisplayMode,
} from "./types";
export { PRODUCTION_CALENDAR_YEARS };

/** Фиксированные нерабочие праздничные даты по ст. 112 ТК РФ (месяц, день). */
const FIXED_HOLIDAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [1, 7],
  [1, 8],
  [2, 23],
  [3, 8],
  [5, 1],
  [5, 9],
  [6, 12],
  [11, 4],
];

const WEEKDAY_SHORT_LABELS = [
  "пн",
  "вт",
  "ср",
  "чт",
  "пт",
  "сб",
  "вс",
] as const;

type DayMarker = {
  nonWorking: boolean;
  short: boolean;
};

const monthCache = new Map<string, Map<number, DayMarker>>();

function parseMonthDays(days: string): Map<number, DayMarker> {
  const markers = new Map<number, DayMarker>();
  if (!days.trim()) return markers;
  for (const token of days.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const match = /^(\d+)([+*]?)$/.exec(trimmed);
    if (!match) continue;
    const day = Number(match[1]);
    const flag = match[2];
    markers.set(day, {
      nonWorking: flag !== "*",
      short: flag === "*",
    });
  }
  return markers;
}

function monthMarkers(
  calendar: ProductionCalendarYear,
  month: number,
): Map<number, DayMarker> {
  const key = `${calendar.year}-${month}`;
  const cached = monthCache.get(key);
  if (cached) return cached;
  const entry = calendar.months.find((item) => item.month === month);
  const markers = parseMonthDays(entry?.days ?? "");
  monthCache.set(key, markers);
  return markers;
}

function parseIsoDate(isoDate: string): {
  year: number;
  month: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Индекс дня недели: 0 = понедельник … 6 = воскресенье (UTC). */
export function weekdayIndexMonday(isoDate: string): number {
  const parts = parseIsoDate(isoDate);
  if (!parts) return 0;
  const utcDay = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();
  return (utcDay + 6) % 7;
}

export function weekdayShortLabel(isoDate: string): string {
  return WEEKDAY_SHORT_LABELS[weekdayIndexMonday(isoDate)] ?? "";
}

export function isFixedHoliday(month: number, day: number): boolean {
  return FIXED_HOLIDAYS.some(([m, d]) => m === month && d === day);
}

function classifyFallback(
  year: number,
  month: number,
  day: number,
): ProductionDayKind {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  if (isFixedHoliday(month, day)) {
    return weekend ? "weekend" : "holiday";
  }
  if (weekend) return "weekend";
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  if (
    next.getUTCFullYear() === year &&
    isFixedHoliday(next.getUTCMonth() + 1, next.getUTCDate()) &&
    next.getUTCDay() !== 0 &&
    next.getUTCDay() !== 6
  ) {
    return "short";
  }
  return "working";
}

export function classifyProductionDay(isoDate: string): ProductionDayKind {
  const parts = parseIsoDate(isoDate);
  if (!parts) return "working";
  const calendar = PRODUCTION_CALENDAR_BY_YEAR.get(parts.year);
  if (!calendar) {
    return classifyFallback(parts.year, parts.month, parts.day);
  }
  const markers = monthMarkers(calendar, parts.month);
  const marker = markers.get(parts.day);
  if (marker?.short) return "short";
  if (marker?.nonWorking) {
    const weekday = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay();
    return weekday === 0 || weekday === 6 ? "weekend" : "holiday";
  }
  return "working";
}

export function hasProductionCalendar(year: number): boolean {
  return PRODUCTION_CALENDAR_BY_YEAR.has(year);
}

export function productionCalendarSource(year: number): string | null {
  return PRODUCTION_CALENDAR_BY_YEAR.get(year)?.source ?? null;
}

export function isWeekdayDisplayMode(
  value: string,
): value is WeekdayDisplayMode {
  return value === "simple" || value === "extended";
}
