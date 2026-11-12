import calendar2024 from "./data/2024.json";
import calendar2025 from "./data/2025.json";
import calendar2026 from "./data/2026.json";
import calendar2027 from "./data/2027.json";
import calendar2028 from "./data/2028.json";
import calendar2029 from "./data/2029.json";
import calendar2030 from "./data/2030.json";
import calendar2031 from "./data/2031.json";
import calendar2032 from "./data/2032.json";
import calendar2033 from "./data/2033.json";
import calendar2034 from "./data/2034.json";
import calendar2035 from "./data/2035.json";
import type { ProductionCalendarYear } from "./types";

const years: ProductionCalendarYear[] = [
  calendar2024,
  calendar2025,
  calendar2026,
  calendar2027,
  calendar2028,
  calendar2029,
  calendar2030,
  calendar2031,
  calendar2032,
  calendar2033,
  calendar2034,
  calendar2035,
] as ProductionCalendarYear[];

export const PRODUCTION_CALENDAR_BY_YEAR: ReadonlyMap<
  number,
  ProductionCalendarYear
> = new Map(years.map((entry) => [entry.year, entry]));

export const PRODUCTION_CALENDAR_YEARS = years
  .map((entry) => entry.year)
  .sort((a, b) => a - b);
