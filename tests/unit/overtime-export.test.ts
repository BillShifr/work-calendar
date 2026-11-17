import { describe, expect, it } from "vitest";
import { shouldExportOvertimeMinutes } from "@/domain/overtime-export-policy";

describe("shouldExportOvertimeMinutes", () => {
  it("includes a month closed by the department approver", () => {
    expect(
      shouldExportOvertimeMinutes({
        reportStatus: "submitted",
        monthApproved: true,
      }),
    ).toBe(true);
  });

  it("includes a report HR already approved without a month gate", () => {
    expect(
      shouldExportOvertimeMinutes({
        reportStatus: "approved",
        monthApproved: false,
      }),
    ).toBe(true);
  });

  it("keeps submitted reports out of the workbook until a sign-off", () => {
    expect(
      shouldExportOvertimeMinutes({
        reportStatus: "submitted",
        monthApproved: false,
      }),
    ).toBe(false);
    expect(
      shouldExportOvertimeMinutes({
        reportStatus: "draft",
        monthApproved: true,
      }),
    ).toBe(false);
  });
});
