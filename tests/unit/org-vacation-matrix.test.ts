import { describe, expect, it } from "vitest";
import {
  clipPeriodToYear,
  dayIndex,
  daysInYear,
  defaultDepartmentIds,
  employeeAbsentDates,
  filterBoardPeople,
  assignBoardLayerColors,
  firstOverlapDayInMonth,
  firstOverlapOrBusyMonth,
  orgOccupancyByDate,
  overlapDetailsForDate,
  overlapRunsInMonth,
  peakOccupancyByMonth,
  sortBoardPeopleForMonth,
} from "@/domain/org-vacation-matrix-shared";
import {
  getAppNavGroups,
  isNavActive,
  isNavSectionActive,
} from "@/components/AppNavigation";

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
    expect(firstOverlapDayInMonth(occupancy, 2027, 5, 31)).toBe("2027-05-13");
  });

  it("sorts people with overlap first, without vacation in the month last", () => {
    const people = [
      {
        userId: "x",
        fullName: "Холостой",
        departmentId: "it",
        departmentName: "ИТ",
        periods: [],
      },
      {
        userId: "a",
        fullName: "Анна",
        departmentId: "it",
        departmentName: "ИТ",
        periods: [{ startsOn: "2027-05-10", endsOn: "2027-05-14", days: 5 }],
      },
      {
        userId: "b",
        fullName: "Борис",
        departmentId: "it",
        departmentName: "ИТ",
        periods: [{ startsOn: "2027-05-13", endsOn: "2027-05-16", days: 4 }],
      },
    ];
    const absentByPerson = new Map(
      people.map((person) => [
        person.userId,
        employeeAbsentDates(person, 2027),
      ]),
    );
    const occupancy = orgOccupancyByDate(people, 2027);
    expect(
      sortBoardPeopleForMonth(
        people,
        absentByPerson,
        occupancy,
        2027,
        5,
        31,
      ).map((person) => person.userId),
    ).toEqual(["a", "b", "x"]);
    expect(assignBoardLayerColors(["a", "b"]).get("a")).not.toBe(
      assignBoardLayerColors(["a", "b"]).get("b"),
    );
  });

  it("groups consecutive overlap days with the same people into one run", () => {
    const people = filterBoardPeople(
      departments,
      new Set(["it"]),
      new Set(["a", "b"]),
    );
    const occupancy = orgOccupancyByDate(people, 2027);
    expect(overlapRunsInMonth(people, occupancy, 2027, 5, 31)).toEqual([
      expect.objectContaining({
        startsOn: "2027-05-13",
        endsOn: "2027-05-14",
        startDay: 13,
        dayCount: 2,
      }),
    ]);
  });

  it("lists people and the shared span of an overlap day", () => {
    const people = filterBoardPeople(
      departments,
      new Set(["it", "hr"]),
      new Set(["a", "b", "c"]),
    );
    expect(overlapDetailsForDate(people, "2027-05-13")).toMatchObject({
      people: [{ fullName: "Анна" }, { fullName: "Борис" }],
      span: { startsOn: "2027-05-13", endsOn: "2027-05-14" },
      spanDays: 2,
    });
    expect(overlapDetailsForDate(people, "2027-05-14").span).toEqual({
      startsOn: "2027-05-14",
      endsOn: "2027-05-14",
    });
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

  it("places entry windows under the HR cabinet", () => {
    const vacations = getAppNavGroups(true, false).find(
      (group) => group.id === "vacations",
    );
    const cabinet = getAppNavGroups(true, false).find(
      (group) => group.id === "hr-cabinet",
    );
    expect(vacations?.children?.map((child) => child.href)).toEqual([
      "/vacations/board",
    ]);
    expect(cabinet?.children?.map((child) => child.href)).toEqual([
      "/hr/periods",
      "/hr/reporting",
    ]);
    expect(isNavActive("/hr/periods", cabinet!.children![0])).toBe(true);
    expect(isNavActive("/hr/reporting", cabinet!.children![1])).toBe(true);
    expect(isNavSectionActive("/hr/periods", cabinet!)).toBe(true);
    expect(isNavSectionActive("/hr/reporting", cabinet!)).toBe(true);
    expect(isNavSectionActive("/hr/periods", vacations!)).toBe(false);
    const overtime = getAppNavGroups(true, false).find(
      (group) => group.id === "overtime",
    );
    expect(overtime?.children ?? []).toEqual([]);
    expect(isNavSectionActive("/hr/reporting", overtime!)).toBe(false);
  });
});
