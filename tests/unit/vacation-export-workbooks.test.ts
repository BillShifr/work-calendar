import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { VacationExportEmployee } from "@/domain/vacation-export-types";
import {
  buildVacationChessboardWorkbook,
  buildVacationTableWorkbook,
} from "@/domain/vacation-export-workbooks";

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

function writeTempXlsx(buffer: Uint8Array) {
  const dir = mkdtempSync(path.join(tmpdir(), "xlsx-"));
  const file = path.join(dir, "book.xlsx");
  writeFileSync(file, buffer);
  return file;
}

function unzipXlsxPart(file: string, part: string) {
  return execFileSync("unzip", ["-p", file, part], { encoding: "utf8" });
}

describe("vacation export workbooks", () => {
  it("writes table dates with format and avoids repeated employee names", async () => {
    const workbook = await buildVacationTableWorkbook(sample);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(2, 1).value).toBe(sample[0].fullName);
    expect(sheet.getCell(2, 2).value).toBe("основной");
    expect(sheet.model.merges).toEqual(
      expect.arrayContaining(["A2:A3", "B2:B3"]),
    );
    expect(sheet.getCell(2, 3).numFmt).toBe("dd.mm.yyyy");
    expect(sheet.getCell(3, 3).numFmt).toBe("dd.mm.yyyy");
    const file = writeTempXlsx(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    expect(unzipXlsxPart(file, "xl/worksheets/sheet1.xml")).not.toContain(
      "4294967295",
    );
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.readFile(file);
    expect(reopened.worksheets[0].getCell(2, 3).value).toBeInstanceOf(Date);
    expect(reopened.worksheets[0].getCell(2, 3).numFmt).toBe("dd.mm.yyyy");
  });

  it("builds a chessboard Excel can open, with FIO once and period cells filled", async () => {
    const workbook = await buildVacationChessboardWorkbook(
      sample,
      sample[0].departmentName!,
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell(7, 3).value).toBe(sample[0].fullName);
    expect(String(sheet.getCell(9, 10).value)).toContain("06");
    expect(sheet.getCell(7, 1).value).toBe(sample[0].departmentName);
    const file = writeTempXlsx(
      new Uint8Array(await workbook.xlsx.writeBuffer()),
    );
    const xml = unzipXlsxPart(file, "xl/worksheets/sheet1.xml");
    const strings = unzipXlsxPart(file, "xl/sharedStrings.xml");
    expect(xml).not.toContain("4294967295");
    expect(strings).toContain("Татьянкин");
    expect(strings).toContain("01.06.-14.06");
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.readFile(file);
    const reopenSheet = reopened.worksheets[0];
    expect(reopenSheet.getCell(7, 3).value).toBe(sample[0].fullName);
    expect(reopenSheet.getCell(8, 4).value).toBeGreaterThan(0);
    expect(String(reopenSheet.getCell(9, 10).value)).toContain("06");
  });
});
