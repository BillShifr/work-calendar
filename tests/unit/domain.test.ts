import { describe, expect, it } from "vitest";
import { buildAbsenceRisks } from "@/domain/absence-risk";
import {
  monthsForQuarter,
  quarterForMonth,
} from "@/domain/department-approval";
import {
  addOvertimeMinutes,
  isOvertimeTotal,
  MAX_OVERTIME_MINUTES_PER_DAY,
} from "@/domain/overtime";
import {
  assertVacationAllowance,
  normalizePeriod,
  periodDays,
  periodsOverlap,
  totalPeriodDays,
} from "@/domain/vacation";
import { canTransition } from "@/domain/workflow";

describe("domain rules", () => {
  it("accumulates overtime steps and validates the resulting daily total", () => {
    expect(addOvertimeMinutes(10, 10)).toBe(20);
    expect(addOvertimeMinutes(60, 30)).toBe(90);
    expect(addOvertimeMinutes(MAX_OVERTIME_MINUTES_PER_DAY, 5)).toBe(
      MAX_OVERTIME_MINUTES_PER_DAY,
    );
    expect(isOvertimeTotal(20)).toBe(true);
    expect(isOvertimeTotal(65)).toBe(true);
    expect(isOvertimeTotal(62)).toBe(false);
    expect(isOvertimeTotal(MAX_OVERTIME_MINUTES_PER_DAY + 5)).toBe(false);
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
  it("rejects vacation periods above the employee allowance", () => {
    const periods = [
      { startsOn: "2027-04-01", endsOn: "2027-04-14" },
      { startsOn: "2027-08-01", endsOn: "2027-08-15" },
    ];
    expect(totalPeriodDays(periods)).toBe(29);
    expect(() => assertVacationAllowance(periods, 28)).toThrow(
      "ALLOWANCE_EXCEEDED",
    );
    expect(() => assertVacationAllowance(periods, 29)).not.toThrow();
  });
  it("requires HR proposal to be confirmed by employee", () => {
    expect(canTransition("submitted", "hr_proposed", "hr")).toBe(true);
    expect(canTransition("hr_proposed", "approved", "employee")).toBe(true);
    expect(canTransition("hr_proposed", "approved", "hr")).toBe(false);
    expect(canTransition("hr_proposed", "approved", "department_head")).toBe(
      true,
    );
  });
  it("maps every month to the correct approval quarter", () => {
    expect(quarterForMonth(1)).toBe(1);
    expect(quarterForMonth(12)).toBe(4);
    expect(monthsForQuarter(3)).toEqual([7, 8, 9]);
  });
  it("groups consecutive department conflicts and prioritizes critical staff", () => {
    const base = {
      departmentId: "it",
      departmentName: "Информационные технологии",
      headcount: 8,
    };
    const risks = buildAbsenceRisks([
      {
        ...base,
        day: "2027-05-10",
        absentCount: 2,
        criticalAbsent: false,
        employeeNames: ["Алексей", "Мария"],
      },
      {
        ...base,
        day: "2027-05-11",
        absentCount: 2,
        criticalAbsent: true,
        employeeNames: ["Мария", "Олег"],
      },
      {
        ...base,
        day: "2027-05-13",
        absentCount: 1,
        criticalAbsent: false,
        employeeNames: ["Алексей"],
      },
    ]);
    expect(risks).toHaveLength(1);
    expect(risks[0]).toMatchObject({
      startsOn: "2027-05-10",
      endsOn: "2027-05-11",
      peakAbsent: 2,
      criticalAbsent: true,
      employeeNames: ["Алексей", "Мария", "Олег"],
    });
  });
});
