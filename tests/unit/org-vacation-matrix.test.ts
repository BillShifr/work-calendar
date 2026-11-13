import { describe, expect, it } from "vitest";
import {
  clipPeriodToYear,
  dayIndex,
  daysInYear,
  defaultDepartmentIds,
  employeeAbsentDates,
  filterBoardPeople,
  firstOverlapOrBusyMonth,
  orgOccupancyByDate,
  peakOccupancyByMonth,
} from "@/domain/org-vacation-matrix-shared";
import { getAppNavGroups, isNavActive } from "@/components/AppNavigation";

const departments = [
  {
    id: "it",
    name: "ИТ",
    employees: [
      {
        userId: "a",
        fullName: "Анна",
        periods: [{ startsOn: "2027-05-10", endsOn: "2027-05-14", days: 5 }],
      },
      {
        userId: "b",
        fullName: "Борис",
        periods: [{ startsOn: "2027-05-13", endsOn: "2027-05-16", days: 4 }],
      },
    ],
  },
  {
    id: "hr",
    name: "Кадры",
    employees: [
      {
        userId: "c",
        fullName: "Кира",
        periods: [{ startsOn: "2027-05-14", endsOn: "2027-05-14", days: 1 }],
      },
    ],
  },
];

describe("org vacation occupancy", () => {
  it("counts leap years and day indexes from January 1", () => {
    expect(daysInYear(2027)).toBe(365);
    expect(daysInYear(2028)).toBe(366);
    expect(dayIndex("2027-01-01")).toBe(0);
    expect(dayIndex("2027-12-31")).toBe(364);
  });

  it("clips periods to the requested year", () => {
    expect(
      clipPeriodToYear({ startsOn: "2026-12-20", endsOn: "2027-01-10" }, 2027),
    ).toEqual({ startsOn: "2027-01-01", endsOn: "2027-01-10" });
    expect(
      clipPeriodToYear({ startsOn: "2026-01-01", endsOn: "2026-01-10" }, 2027),
    ).toBeNull();
  });

  it("marks overlap days when several selected people are off", () => {
    const occupancy = orgOccupancyByDate(
      departments.flatMap((department) => department.employees),
      2027,
    );
    expect(occupancy.get("2027-05-12")?.map((item) => item.fullName)).toEqual([
      "Анна",
    ]);
    expect(occupancy.get("2027-05-13")?.map((item) => item.fullName)).toEqual([
      "Анна",
      "Борис",
    ]);
    expect(occupancy.get("2027-05-14")?.map((item) => item.fullName)).toEqual([
      "Анна",
      "Борис",
      "Кира",
    ]);
    expect(
      employeeAbsentDates(departments[0].employees[1], 2027).has("2027-05-16"),
    ).toBe(true);
  });

  it("filters by several departments or by named people", () => {
    expect(
      filterBoardPeople(departments, new Set(["it"]), new Set(["a", "b"])).map(
        (person) => person.fullName,
      ),
    ).toEqual(["Анна", "Борис"]);
    expect(
      filterBoardPeople(
        departments,
        new Set(["it", "hr"]),
        new Set(["a", "c"]),
      ).map((person) => person.fullName),
    ).toEqual(["Анна", "Кира"]);
    expect(
      filterBoardPeople(departments, new Set(["hr"]), new Set(["a"])),
    ).toEqual([]);
  });

  it("defaults the board to the actor department and opens the first overlap month", () => {
    expect(defaultDepartmentIds(departments, "c")).toEqual(["hr"]);
    expect(defaultDepartmentIds(departments, "missing")).toEqual(["it"]);
    const occupancy = orgOccupancyByDate(
      departments.flatMap((department) => department.employees),
      2027,
    );
    expect(peakOccupancyByMonth(occupancy, 2027)[4]).toBe(3);
    expect(firstOverlapOrBusyMonth(occupancy, 2027)).toBe(5);
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
