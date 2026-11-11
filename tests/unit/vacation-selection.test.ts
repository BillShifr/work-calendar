import { describe, expect, it, vi } from "vitest";
import {
  beginRange,
  cancelRange,
  commitRange,
  insertPeriod,
  previewRange,
} from "@/domain/vacation-selection";
import type { DatePeriod } from "@/domain/vacation";

const source = "employee" as const;
const empty: DatePeriod[] = [];

describe("vacation range selection", () => {
  it("commits a single-day period without crypto.randomUUID", () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    const result = commitRange(
      beginRange("2027-01-04"),
      "2027-01-04",
      empty,
      28,
      source,
    );
    expect(result).toEqual({
      status: "committed",
      period: {
        id: "2027-01-04_2027-01-04",
        startsOn: "2027-01-04",
        endsOn: "2027-01-04",
        source,
      },
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("normalizes a reverse end date", () => {
    const result = commitRange(
      beginRange("2027-01-12"),
      "2027-01-08",
      empty,
      28,
      source,
    );
    expect(result).toMatchObject({
      status: "committed",
      period: { startsOn: "2027-01-08", endsOn: "2027-01-12" },
    });
  });

  it("commits a range that crosses a month boundary", () => {
    const result = commitRange(
      beginRange("2027-01-30"),
      "2027-02-02",
      empty,
      28,
      source,
    );
    expect(result).toMatchObject({
      status: "committed",
      period: { startsOn: "2027-01-30", endsOn: "2027-02-02" },
    });
  });

  it("rejects an overlapping range and clears the draft", () => {
    const existing: DatePeriod[] = [
      {
        id: "2027-01-08_2027-01-12",
        startsOn: "2027-01-08",
        endsOn: "2027-01-12",
        source,
      },
    ];
    expect(
      commitRange(beginRange("2027-01-10"), "2027-01-15", existing, 28, source),
    ).toEqual({ status: "overlap" });
  });

  it("keeps the anchor when the end exceeds the allowance", () => {
    const result = commitRange(
      beginRange("2029-06-01"),
      "2029-06-15",
      empty,
      10,
      source,
    );
    expect(result).toEqual({
      status: "allowance",
      draft: {
        anchor: "2029-06-01",
        hover: "2029-06-15",
        editing: null,
      },
    });
    const retry = commitRange(
      result.status === "allowance" ? result.draft : beginRange("2029-06-01"),
      "2029-06-07",
      empty,
      10,
      source,
    );
    expect(retry).toMatchObject({
      status: "committed",
      period: { startsOn: "2029-06-01", endsOn: "2029-06-07" },
    });
  });

  it("restores the edited period on cancel", () => {
    const editing: DatePeriod = {
      id: "2027-01-08_2027-01-12",
      startsOn: "2027-01-08",
      endsOn: "2027-01-12",
      source,
    };
    const draft = previewRange(
      beginRange(editing.startsOn, editing),
      "2027-01-14",
    );
    expect(cancelRange(draft)).toEqual(editing);
    expect(cancelRange(null)).toBeNull();
  });

  it("inserts committed periods in date order", () => {
    const first: DatePeriod = {
      id: "2027-05-15_2027-05-20",
      startsOn: "2027-05-15",
      endsOn: "2027-05-20",
      source,
    };
    const second: DatePeriod = {
      id: "2027-01-04_2027-01-04",
      startsOn: "2027-01-04",
      endsOn: "2027-01-04",
      source,
    };
    expect(
      insertPeriod([first], second).map((period) => period.startsOn),
    ).toEqual(["2027-01-04", "2027-05-15"]);
  });
});
