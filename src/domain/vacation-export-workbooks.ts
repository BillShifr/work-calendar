import path from "node:path";
import ExcelJS from "exceljs";
import {
  formatVacationPeriodCell,
  isoToExcelDate,
} from "./vacation-export-format";
import { periodDays, totalPeriodDays } from "./vacation";
import type { VacationExportEmployee } from "./vacation-export-types";

const TEMPLATE_DIR = path.join(process.cwd(), "templates", "vacation-export");
const TABLE_TEMPLATE = path.join(TEMPLATE_DIR, "appendix-1-table.xlsx");
const CHESSBOARD_TEMPLATE = path.join(
  TEMPLATE_DIR,
  "appendix-2-chessboard.xlsx",
);

const TABLE_DATE_FMT = "dd.mm.yyyy";
const CHESSBOARD_DATA_START = 7;
const CHESSBOARD_DATA_COLS = 17;
const TEMPLATE_SAMPLE_END = 17;

function monthColumn(month: number) {
  return 4 + month;
}

async function readTemplateWorkbook(templatePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  return workbook;
}

function unmergeFromRow(sheet: ExcelJS.Worksheet, fromRow: number) {
  const merges = [
    ...(sheet.model.merges ?? []),
    ...Object.keys(
      (sheet as { _merges?: Record<string, unknown> })._merges ?? {},
    ),
  ];
  for (const range of new Set(merges)) {
    const top = Number(
      String(range).split(":")[0]?.replace(/[A-Z]/gi, "") ?? 0,
    );
    if (top >= fromRow) sheet.unMergeCells(range);
  }
}

function clearRect(
  sheet: ExcelJS.Worksheet,
  fromRow: number,
  toRow: number,
  toCol: number,
) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = 1; col <= toCol; col += 1)
      sheet.getRow(row).getCell(col).value = null;
  }
}

function setTableDate(cell: ExcelJS.Cell, iso: string) {
  cell.value = isoToExcelDate(iso);
  cell.numFmt = TABLE_DATE_FMT;
}

export async function buildVacationTableWorkbook(
  employees: VacationExportEmployee[],
) {
  const workbook = await readTemplateWorkbook(TABLE_TEMPLATE);
  const sheet = workbook.worksheets[0];
  clearRect(sheet, 2, Math.max(sheet.rowCount, 48), 4);
  let rowNumber = 2;
  for (const employee of employees) {
    let firstForEmployee = true;
    for (const period of employee.periods) {
      const row = sheet.getRow(rowNumber);
      row.getCell(1).value = firstForEmployee ? employee.fullName : null;
      row.getCell(2).value = "основной";
      setTableDate(row.getCell(3), period.startsOn);
      setTableDate(row.getCell(4), period.endsOn);
      firstForEmployee = false;
      rowNumber += 1;
    }
  }
  return workbook;
}

export async function buildVacationChessboardWorkbook(
  employees: VacationExportEmployee[],
  departmentName: string,
) {
  const workbook = await readTemplateWorkbook(CHESSBOARD_TEMPLATE);
  const sheet = workbook.worksheets[0];
  unmergeFromRow(sheet, CHESSBOARD_DATA_START);
  clearRect(
    sheet,
    CHESSBOARD_DATA_START,
    Math.max(sheet.rowCount, TEMPLATE_SAMPLE_END),
    CHESSBOARD_DATA_COLS,
  );

  let rowNumber = CHESSBOARD_DATA_START;
  for (const employee of employees) {
    const blockStart = rowNumber;
    const summaryRow = sheet.getRow(rowNumber);
    summaryRow.getCell(3).value = employee.fullName;
    summaryRow.getCell(4).value = totalPeriodDays(employee.periods);
    if (employee.jobTitle) summaryRow.getCell(2).value = employee.jobTitle;
    rowNumber += 1;
    for (const period of employee.periods) {
      const periodRow = sheet.getRow(rowNumber);
      periodRow.getCell(4).value = periodDays(period);
      const month = Number(period.startsOn.slice(5, 7));
      periodRow.getCell(monthColumn(month)).value = formatVacationPeriodCell(
        period.startsOn,
        period.endsOn,
      );
      rowNumber += 1;
    }
    const blockEnd = rowNumber - 1;
    if (blockEnd > blockStart) {
      sheet.mergeCells(blockStart, 3, blockEnd, 3);
      if (employee.jobTitle) sheet.mergeCells(blockStart, 2, blockEnd, 2);
    }
  }

  const lastRow = rowNumber - 1;
  if (lastRow >= CHESSBOARD_DATA_START) {
    sheet.mergeCells(CHESSBOARD_DATA_START, 1, lastRow, 1);
    sheet.getCell(CHESSBOARD_DATA_START, 1).value = departmentName;
    sheet.getCell(CHESSBOARD_DATA_START, 1).alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  }
  return workbook;
}
