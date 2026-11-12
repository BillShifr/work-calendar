import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildVacationChessboardWorkbook,
  buildVacationTableWorkbook,
} from "@/domain/vacation-export-workbooks";
import type { VacationExportEmployee } from "@/domain/vacation-export-types";

const sample: VacationExportEmployee[] = [
  {
    userId: "1",
    fullName: "Татьянкин Владислав Михайлович",
    departmentId: "d1",
    departmentName: "Отдел ИТ",
    jobTitle: "Инженер",
    periods: [
      { startsOn: "2027-03-29", endsOn: "2027-04-02" },
      { startsOn: "2027-06-01", endsOn: "2027-06-14" },
    ],
  },
];

describe("vacation export workbooks", () => {
  it("writes table dates with format and avoids repeated employee names", async () => {
    const workbook = await buildVacationTableWorkbook(sample);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(2, 1).value).toBe(sample[0].fullName);
    expect(sheet.getCell(3, 1).value).toBeNull();
    expect(sheet.getCell(2, 3).numFmt).toBe("dd.mm.yyyy");
    expect(sheet.getCell(3, 3).numFmt).toBe("dd.mm.yyyy");
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    expect(reopened.worksheets[0].getCell(2, 3).value).toBeInstanceOf(Date);
  });

  it("fills chessboard data after unmerging template sample cells", async () => {
    const workbook = await buildVacationChessboardWorkbook(
      sample,
      sample[0].departmentName!,
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(7, 3).value).toBe(sample[0].fullName);
    expect(String(sheet.getCell(9, 10).value)).toContain("06");
    expect(sheet.getCell(7, 1).value).toBe(sample[0].departmentName);
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const reopenSheet = reopened.worksheets[0];
    expect(reopenSheet.getCell(7, 3).value).toBe(sample[0].fullName);
    expect(reopenSheet.getCell(8, 4).value).toBeGreaterThan(0);
  });
});
