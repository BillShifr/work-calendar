import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VacationExportEmployee } from "@/domain/vacation-export-types";
import { buildVacationChessboardWorkbook } from "@/domain/vacation-export-workbooks";
import { sanitizeWorkbookForExcel } from "@/domain/vacation-export-xlsx-sanitize";

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

function cellsInsideMergedRanges(xml: string) {
  const mergeSection = xml.match(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/);
  if (!mergeSection) return [] as string[];
  const references = [
    ...mergeSection[0].matchAll(/<mergeCell ref="([^"]+)"/g),
  ].map((match) => match[1]);
  const cells = [...xml.matchAll(/<c r="([A-Z]+\d+)"/g)].map(
    (match) => match[1],
  );
  const columnToNumber = (letters: string) =>
    [...letters].reduce(
      (value, letter) => value * 26 + (letter.charCodeAt(0) - 64),
      0,
    );
  const position = (address: string) => {
    const match = /^([A-Z]+)(\d+)$/.exec(address);
    return {
      column: columnToNumber(match![1]),
      row: Number(match![2]),
    };
  };
  const parseRange = (reference: string) => {
    const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(reference);
    return {
      left: columnToNumber(match![1]),
      top: Number(match![2]),
      right: columnToNumber(match![3]),
      bottom: Number(match![4]),
    };
  };

  const invalid: string[] = [];
  for (const cell of cells) {
    const { column, row } = position(cell);
    for (const reference of references) {
      const range = parseRange(reference);
      if (
        range.left <= column &&
        column <= range.right &&
        range.top <= row &&
        row <= range.bottom &&
        !(column === range.left && row === range.top)
      ) {
        invalid.push(cell);
      }
    }
  }
  return invalid;
}

describe("vacation export xlsx sanitize", () => {
  it("removes non-master cells inside merged ranges for Excel on Windows", async () => {
    const workbook = await buildVacationChessboardWorkbook(
      sample,
      sample[0].departmentName!,
    );
    const raw = Buffer.from(await workbook.xlsx.writeBuffer());
    const dir = mkdtempSync(path.join(tmpdir(), "xlsx-"));
    const rawFile = path.join(dir, "raw.xlsx");
    writeFileSync(rawFile, raw);
    const rawXml = execFileSync(
      "unzip",
      ["-p", rawFile, "xl/worksheets/sheet1.xml"],
      {
        encoding: "utf8",
      },
    );
    expect(cellsInsideMergedRanges(rawXml).length).toBeGreaterThan(0);

    const cleaned = await sanitizeWorkbookForExcel(raw);
    const cleanFile = path.join(dir, "clean.xlsx");
    writeFileSync(cleanFile, cleaned);
    const cleanXml = execFileSync(
      "unzip",
      ["-p", cleanFile, "xl/worksheets/sheet1.xml"],
      { encoding: "utf8" },
    );
    expect(cellsInsideMergedRanges(cleanXml)).toEqual([]);
    expect(cleanXml).not.toContain("4294967295");
  });
});
