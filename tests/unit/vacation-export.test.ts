import { describe, expect, it } from "vitest";
import { formatVacationPeriodCell } from "@/domain/vacation-export-format";

describe("vacation export formatting", () => {
  it("matches the chessboard template for a same-month period", () => {
    expect(formatVacationPeriodCell("2027-06-01", "2027-06-14")).toBe(
      "01.06.-14.06",
    );
  });

  it("matches the chessboard template for a same-month period starting on the 5th", () => {
    expect(formatVacationPeriodCell("2027-02-05", "2027-02-16")).toBe(
      "05.02-16.02",
    );
  });
});
