import ExcelJS from "exceljs";
import {
  formatVacationPeriodCell,
  isoToExcelDate,
} from "./vacation-export-format";
import { periodDays, totalPeriodDays } from "./vacation";
import type { VacationExportEmployee } from "./vacation-export-types";

const TABLE_DATE_FMT = "dd.mm.yyyy";
const CHESSBOARD_DATA_START = 7;
const CHESSBOARD_COLS = 17;
const FONT: Partial<ExcelJS.Font> = {
  name: "Times New Roman",
  size: 9,
  charset: 204,
};
const HEADER_FONT: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const SUMMARY_FONT: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FF000000" } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
};
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

function monthColumn(month: number) {
  return 4 + month;
}

function styleCell(
  cell: ExcelJS.Cell,
  options: {
    value?: ExcelJS.CellValue;
    font?: Partial<ExcelJS.Font>;
    align?: Partial<ExcelJS.Alignment>;
    numFmt?: string;
  } = {},
) {
  if (options.value !== undefined) cell.value = options.value;
  cell.font = options.font ?? FONT;
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
    ...options.align,
  };
  cell.border = BORDER;
  if (options.numFmt) cell.numFmt = options.numFmt;
}

export async function buildVacationTableWorkbook(
  employees: VacationExportEmployee[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Лист_1", {
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 18 }];
  for (const [col, title] of [
    [1, "Сотрудник"],
    [2, "Вид отпуска"],
    [3, "Дата начала"],
    [4, "Дата окончания"],
  ] as const) {
    styleCell(sheet.getCell(1, col), {
      value: title,
      font: HEADER_FONT,
    });
  }
  sheet.getRow(1).height = 22;

  let rowNumber = 2;
  for (const employee of employees) {
    const blockStart = rowNumber;
    let firstForEmployee = true;
    for (const period of employee.periods) {
      const row = sheet.getRow(rowNumber);
      if (firstForEmployee) {
        styleCell(row.getCell(1), {
          value: employee.fullName,
          font: FONT,
          align: { horizontal: "left", vertical: "middle", wrapText: true },
        });
        styleCell(row.getCell(2), { value: "основной" });
        firstForEmployee = false;
      }
      styleCell(row.getCell(3), {
        value: isoToExcelDate(period.startsOn),
        numFmt: TABLE_DATE_FMT,
      });
      styleCell(row.getCell(4), {
        value: isoToExcelDate(period.endsOn),
        numFmt: TABLE_DATE_FMT,
      });
      rowNumber += 1;
    }
    const blockEnd = rowNumber - 1;
    if (blockEnd > blockStart) {
      sheet.mergeCells(blockStart, 1, blockEnd, 1);
      sheet.mergeCells(blockStart, 2, blockEnd, 2);
    }
  }
  return workbook;
}

function buildChessboardHeader(sheet: ExcelJS.Worksheet) {
  sheet.mergeCells(3, 1, 5, 1);
  sheet.mergeCells(3, 2, 5, 2);
  sheet.mergeCells(3, 3, 5, 3);
  sheet.mergeCells(3, 4, 3, 16);
  sheet.mergeCells(4, 4, 5, 4);
  sheet.mergeCells(4, 5, 4, 16);
  sheet.mergeCells(3, 17, 5, 17);

  styleCell(sheet.getCell(3, 1), { value: "Структурное подразделение" });
  styleCell(sheet.getCell(3, 2), { value: "Должность" });
  styleCell(sheet.getCell(3, 3), { value: "Фамилия, имя, отчество" });
  styleCell(sheet.getCell(3, 4), { value: "ОТПУСК", font: HEADER_FONT });
  styleCell(sheet.getCell(4, 4), {
    value: "Количество календарных дней (запланированных)",
  });
  styleCell(sheet.getCell(4, 5), { value: "ОТПУСК", font: HEADER_FONT });
  styleCell(sheet.getCell(3, 17), {
    value: "Примечание (лицо заменяющее)",
  });
  MONTHS.forEach((name, index) => {
    styleCell(sheet.getCell(5, monthColumn(index + 1)), { value: name });
  });
  for (let col = 1; col <= CHESSBOARD_COLS; col += 1) {
    styleCell(sheet.getCell(6, col), {
      value: col,
      font: { ...FONT, size: 10 },
    });
  }
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 16;
}

export async function buildVacationChessboardWorkbook(
  employees: VacationExportEmployee[],
  departmentName: string,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HR";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Лист_1", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    properties: { defaultRowHeight: 16 },
  });
  const widths = [
    14, 16, 22, 12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 18,
  ];
  sheet.columns = widths.map((width) => ({ width }));

  buildChessboardHeader(sheet);

  let rowNumber = CHESSBOARD_DATA_START;
  for (const employee of employees) {
    const blockStart = rowNumber;
    const summaryRow = sheet.getRow(rowNumber);
    styleCell(summaryRow.getCell(2), {
      value: employee.jobTitle ?? "",
      align: { horizontal: "center", vertical: "middle", wrapText: true },
    });
    styleCell(summaryRow.getCell(3), {
      value: employee.fullName,
      align: { horizontal: "center", vertical: "middle", wrapText: true },
    });
    styleCell(summaryRow.getCell(4), {
      value: totalPeriodDays(employee.periods),
      font: SUMMARY_FONT,
    });
    rowNumber += 1;
    for (const period of employee.periods) {
      const periodRow = sheet.getRow(rowNumber);
      styleCell(periodRow.getCell(4), { value: periodDays(period) });
      const month = Number(period.startsOn.slice(5, 7));
      styleCell(periodRow.getCell(monthColumn(month)), {
        value: formatVacationPeriodCell(period.startsOn, period.endsOn),
        align: { horizontal: "left", vertical: "middle", wrapText: true },
      });
      rowNumber += 1;
    }
    const blockEnd = rowNumber - 1;
    if (blockEnd > blockStart) {
      sheet.mergeCells(blockStart, 2, blockEnd, 2);
      sheet.mergeCells(blockStart, 3, blockEnd, 3);
    }
  }

  const lastRow = Math.max(rowNumber - 1, CHESSBOARD_DATA_START);
  if (employees.length) {
    sheet.mergeCells(CHESSBOARD_DATA_START, 1, lastRow, 1);
    styleCell(sheet.getCell(CHESSBOARD_DATA_START, 1), {
      value: departmentName,
      align: { horizontal: "center", vertical: "middle", wrapText: true },
    });
  }
  return workbook;
}
