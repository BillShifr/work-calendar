export type ProductionDayKind = "working" | "short" | "weekend" | "holiday";

export type ProductionCalendarMonth = {
  month: number;
  days: string;
};

export type ProductionCalendarYear = {
  year: number;
  months: ProductionCalendarMonth[];
  source?: string;
  note?: string;
  statistic?: Record<string, unknown>;
  transitions?: unknown;
};

export type WeekdayDisplayMode = "simple" | "extended";
