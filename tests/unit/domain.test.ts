import { describe, expect, it } from "vitest";
import { isOvertimeMinutes } from "@/domain/overtime";
import { normalizePeriod, periodDays, periodsOverlap } from "@/domain/vacation";
import { canTransition } from "@/domain/workflow";

describe("domain rules", () => {
  it("accepts only the five overtime values", () => {
    expect([5, 10, 15, 30, 60].every(isOvertimeMinutes)).toBe(true);
    expect(isOvertimeMinutes(20)).toBe(false);
  });
  it("normalizes reverse vacation selection", () => {
    expect(normalizePeriod("2027-05-20", "2027-05-10")).toEqual({
      startsOn: "2027-05-10",
      endsOn: "2027-05-20",
    });
  });
  it("counts inclusive days and detects intersections", () => {
    const period = { startsOn: "2027-02-28", endsOn: "2027-03-02" };
    expect(periodDays(period)).toBe(3);
    expect(
      periodsOverlap(period, { startsOn: "2027-03-02", endsOn: "2027-03-04" }),
    ).toBe(true);
  });
  it("requires HR proposal to be confirmed by employee", () => {
    expect(canTransition("submitted", "hr_proposed", "hr")).toBe(true);
    expect(canTransition("hr_proposed", "approved", "employee")).toBe(true);
    expect(canTransition("hr_proposed", "approved", "hr")).toBe(false);
  });
});
