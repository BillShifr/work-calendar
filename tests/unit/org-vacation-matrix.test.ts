import { describe, expect, it } from "vitest";
import {
  clipPeriodToYear,
  dayIndex,
  daysInYear,
  monthStarts,
  periodTrack,
} from "@/domain/org-vacation-matrix-shared";
import { getAppNavGroups, isNavActive } from "@/components/AppNavigation";

describe("org vacation matrix layout", () => {
  it("counts leap years and day indexes from January 1", () => {
    expect(daysInYear(2027)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(dayIndex("2027-01-01")).toBe(0);
    expect(dayIndex("2027-12-31")).toBe(364);
  });

  it("clips periods to the requested year and places a one-day bar", () => {
    expect(
      clipPeriodToYear({ startsOn: "2026-12-20", endsOn: "2027-01-10" }, 2027),
    ).toEqual({ startsOn: "2027-01-01", endsOn: "2027-01-10" });
    expect(
      clipPeriodToYear({ startsOn: "2026-01-01", endsOn: "2026-01-10" }, 2027),
    ).toBeNull();
    const track = periodTrack(
      { startsOn: "2027-01-01", endsOn: "2027-01-01" },
      2027,
    );
    expect(track?.leftPct).toBe(0);
    expect(track?.widthPct).toBeCloseTo(100 / 365, 5);
  });

  it("puts July after the first half of a common year", () => {
    const july = monthStarts(2027).find((month) => month.month === 7);
    expect(july?.leftPct).toBeCloseTo((dayIndex("2027-07-01") / 365) * 100, 5);
  });
});

describe("vacation schedule navigation", () => {
  it("keeps the personal plan and the org board as separate current items", () => {
    const vacations = getAppNavGroups(false, false).find(
      (group) => group.id === "vacations",
    );
    expect(vacations?.primary.match?.("/vacations")).toBe(true);
    expect(vacations?.primary.match?.("/vacations/board")).toBe(false);
    expect(isNavActive("/vacations/board", vacations!.children![0])).toBe(true);
  });
});
