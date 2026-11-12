import { describe, expect, it } from "vitest";
import {
  classifyProductionDay,
  hasProductionCalendar,
  PRODUCTION_CALENDAR_YEARS,
  weekdayIndexMonday,
  weekdayShortLabel,
} from "@/domain/production-calendar";

describe("production calendar RF", () => {
  it("covers official and projected years through 2035", () => {
    expect(PRODUCTION_CALENDAR_YEARS[0]).toBe(2024);
    expect(PRODUCTION_CALENDAR_YEARS.at(-1)).toBe(2035);
    expect(hasProductionCalendar(2026)).toBe(true);
    expect(hasProductionCalendar(2032)).toBe(true);
    expect(hasProductionCalendar(2036)).toBe(false);
  });

  it("classifies weekends, holidays, transfers and short days for 2026", () => {
    expect(classifyProductionDay("2026-01-10")).toBe("weekend");
    expect(classifyProductionDay("2026-01-07")).toBe("holiday");
    expect(classifyProductionDay("2026-01-09")).toBe("holiday");
    expect(classifyProductionDay("2026-04-30")).toBe("short");
    expect(classifyProductionDay("2026-04-29")).toBe("working");
    expect(classifyProductionDay("2026-05-01")).toBe("holiday");
  });

  it("exposes Monday-based weekday labels", () => {
    expect(weekdayIndexMonday("2026-11-11")).toBe(2);
    expect(weekdayShortLabel("2026-11-11")).toBe("ср");
    expect(weekdayShortLabel("2026-11-15")).toBe("вс");
  });

  it("falls back to ТК РФ fixed holidays outside the catalog", () => {
    expect(classifyProductionDay("2036-01-01")).toBe("holiday");
    expect(classifyProductionDay("2036-01-05")).toBe("weekend");
  });
});
