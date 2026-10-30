import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

type ExportEmployee = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  parentDepartmentName: string | null;
  jobTitleMaxDays: number;
  maxDaysOverride: number | null;
  actualDays: number | null;
  proposedNextYearDays: number | null;
};

type MonthlyTotal = {
  userId: string;
  year: number;
  month: number;
  totalMinutes: number;
};

const durationFormat = '[h]"ч "mm"м"';
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF6F767D" } },
  left: { style: "thin", color: { argb: "FF6F767D" } },
  bottom: { style: "thin", color: { argb: "FF6F767D" } },
  right: { style: "thin", color: { argb: "FF6F767D" } },
};

function excelDuration(minutes: number | undefined) {
  return minutes === undefined ? null : minutes / 1440;
}

function sumMinutes(
  totals: Map<string, number>,
  userId: string,
  periods: Array<[number, number]>,
) {
  return periods.reduce(
    (sum, [year, month]) =>
      sum + (totals.get(`${userId}:${year}:${month}`) ?? 0),
    0,
  );
}

export async function buildOvertimeSummaryWorkbook(
  organizationId: string,
  year: number,
) {
  const [organization, employees, monthlyTotals] = await Promise.all([
    db.execute<{ name: string }>(sql`
      SELECT name FROM organizations WHERE id = ${organizationId} LIMIT 1
    `),
    db.execute<ExportEmployee>(sql`
      SELECT employee.id::text AS id,
        employee.full_name AS "fullName",
        COALESCE(title.name, assignment.job_title) AS "jobTitle",
        department.id::text AS "departmentId",
        department.name AS "departmentName",
        parent.name AS "parentDepartmentName",
        COALESCE(title.irregular_leave_max_days, 0)::int AS "jobTitleMaxDays",
        terms.max_days_override AS "maxDaysOverride",
        terms.actual_days AS "actualDays",
        terms.proposed_next_year_days AS "proposedNextYearDays"
      FROM users employee
      LEFT JOIN LATERAL (
        SELECT historical_assignment.*
        FROM department_assignments historical_assignment
        WHERE historical_assignment.user_id = employee.id
          AND historical_assignment.valid_from <= ${`${year}-12-31`}
          AND (historical_assignment.valid_to IS NULL OR historical_assignment.valid_to >= ${`${year}-01-01`})
        ORDER BY historical_assignment.valid_from DESC, historical_assignment.created_at DESC
        LIMIT 1
      ) assignment ON true
      LEFT JOIN departments department ON department.id = assignment.department_id
      LEFT JOIN departments parent ON parent.id = department.parent_id
      LEFT JOIN job_titles title ON title.id = assignment.job_title_id
      LEFT JOIN employee_irregular_leave_terms terms
        ON terms.user_id = employee.id AND terms.year = ${year}
      WHERE employee.organization_id = ${organizationId}
        AND (
          employee.is_active = true OR EXISTS (
            SELECT 1 FROM overtime_reports historical_report
            WHERE historical_report.user_id = employee.id
              AND historical_report.year BETWEEN ${year - 2} AND ${year}
          )
        )
      ORDER BY COALESCE(parent.name, department.name) NULLS LAST,
        CASE WHEN parent.id IS NULL THEN 0 ELSE 1 END,
        department.name NULLS LAST,
        employee.full_name
    `),
    db.execute<MonthlyTotal>(sql`
      SELECT report.user_id::text AS "userId", report.year, report.month,
        COALESCE(SUM(entry.minutes), 0)::int AS "totalMinutes"
      FROM overtime_reports report
      INNER JOIN department_quarter_approvals approval
        ON approval.department_id = report.department_id
        AND approval.year = report.year
        AND approval.quarter = CEIL(report.month / 3.0)::int
        AND approval.status = 'approved'
      LEFT JOIN overtime_entries entry ON entry.report_id = report.id
      WHERE report.organization_id = ${organizationId}
        AND report.year BETWEEN ${year - 2} AND ${year}
        AND report.status IN ('submitted','hr_proposed','approved')
      GROUP BY report.id
    `),
  ]);
  const totals = new Map(
    monthlyTotals.map((item) => [
      `${item.userId}:${item.year}:${item.month}`,
      item.totalMinutes,
    ]),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HR";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Лист1 (свод по кварталам)", {
    views: [{ state: "frozen", xSplit: 5, ySplit: 5, zoomScale: 70 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  sheet.properties.defaultRowHeight = 24;
  sheet.columns = [
    { key: "gutter", width: 2 },
    { key: "structure", width: 26 },
    { key: "subdivision", width: 30 },
    { key: "jobTitle", width: 32 },
    { key: "fullName", width: 32 },
    { key: "maxDays", width: 16 },
    { key: "actualDays", width: 16 },
    { key: "proposal", width: 14 },
    ...Array.from({ length: 19 }, () => ({ width: 12 })),
    { key: "periodTotal", width: 18 },
    { key: "previousTotal", width: 18 },
  ];

  const monthNames = [
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
  const headers: Array<[string, number, number, string]> = [
    ["B3", 2, 2, "Структурное подразделение"],
    ["D3", 1, 2, "Должность"],
    ["E3", 1, 2, "Фамилия, имя, отчество"],
    [
      "F3",
      1,
      2,
      "Максимальное количество дней отпуска за ненормированный рабочий день, установленное локальными актами ТФОМС Югры по данной должности (ПВТР)",
    ],
    [
      "G3",
      1,
      2,
      `Фактическое количество дней отпуска за ненормированный рабочий день, установленное трудовым договором (доп. соглашением) в ${year} г.`,
    ],
    ["H3", 1, 2, `Предложения на ${year + 1} год`],
    ["I3", 1, 2, ""],
    ["J3", 1, 2, ""],
  ];
  const monthlyColumns = [
    "K",
    "L",
    "M",
    "O",
    "P",
    "Q",
    "S",
    "T",
    "U",
    "W",
    "X",
    "Y",
  ];
  monthlyColumns.forEach((column, index) =>
    headers.push([`${column}3`, 1, 2, monthNames[index]]),
  );
  [
    ["N", 1],
    ["R", 2],
    ["V", 3],
    ["Z", 4],
  ].forEach(([column, quarter]) =>
    headers.push([`${column}3`, 1, 2, `итого за ${quarter} кв.${year}`]),
  );
  headers.push(
    ["AA3", 1, 2, "итого за год"],
    [
      "AB3",
      1,
      2,
      `Итого Общее количество часов, отработанное в режиме ненормированного рабочего дня за период с 01.11.${String(year - 1).slice(-2)} по 01.11.${String(year).slice(-2)} год`,
    ],
    [
      "AC3",
      1,
      2,
      `СПРАВОЧНО, информация о количестве часов, отработанном в режиме ненормированного рабочего дня аналогичного периода в ${year - 1} году`,
    ],
  );
  for (const [address, columnSpan, rowSpan, value] of headers) {
    const cell = sheet.getCell(address);
    const start = Number(cell.col);
    const row = Number(cell.row);
    if (columnSpan > 1 || rowSpan > 1)
      sheet.mergeCells(row, start, row + rowSpan - 1, start + columnSpan - 1);
    cell.value = value;
  }
  sheet.mergeCells("B5:AC5");
  sheet.getCell("B5").value = organization[0]?.name ?? "Организация";
  sheet.getCell("I3").value = new Date(Date.UTC(year - 1, 10, 1));
  sheet.getCell("J3").value = new Date(Date.UTC(year - 1, 11, 1));
  sheet.getCell("I3").numFmt = "mmm-yy";
  sheet.getCell("J3").numFmt = "mmm-yy";

  const headerRange = sheet.getRows(3, 2) ?? [];
  for (const row of headerRange) {
    row.height = 78;
    row.eachCell({ includeEmpty: true }, (cell) => {
      const column = Number(cell.col);
      if (column < 2 || column > 29) return;
      cell.font = { name: "Arial", size: 10, bold: true };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = thinBorder;
    });
  }
  sheet.getRow(4).height = 14;
  sheet.getCell("F3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD6CCE0" },
  };
  sheet.getCell("G3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5E0D2" },
  };
  sheet.getCell("H3").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF200" },
  };
  for (const column of ["N", "R", "V", "Z", "AA"])
    sheet.getCell(`${column}3`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDCE8C5" },
    };
  for (const column of ["AB", "AC"])
    sheet.getCell(`${column}3`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE7B4B4" },
    };
  sheet.getRow(5).height = 30;
  sheet.getCell("B5").font = { name: "Arial", size: 11, bold: true };
  sheet.getCell("B5").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("B5").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEDC" },
  };
  sheet.getCell("B5").border = thinBorder;

  const currentMonthColumns = new Map(
    monthlyColumns.map((column, index) => [index + 1, column]),
  );
  const rowMetadata: Array<{
    row: number;
    topLevel: string;
    subdivision: string;
  }> = [];
  employees.forEach((employee, index) => {
    const rowNumber = 6 + index;
    const row = sheet.getRow(rowNumber);
    row.height = 34;
    const topLevel =
      employee.parentDepartmentName ??
      employee.departmentName ??
      "Без подразделения";
    const subdivision = employee.parentDepartmentName
      ? (employee.departmentName ?? "")
      : "";
    rowMetadata.push({ row: rowNumber, topLevel, subdivision });
    row.getCell(2).value = topLevel;
    row.getCell(3).value = subdivision;
    row.getCell(4).value = employee.jobTitle ?? "";
    row.getCell(5).value = employee.fullName;
    row.getCell(6).value = employee.maxDaysOverride ?? employee.jobTitleMaxDays;
    row.getCell(7).value = employee.actualDays;
    row.getCell(8).value = employee.proposedNextYearDays;
    row.getCell(9).value = excelDuration(
      totals.get(`${employee.id}:${year - 1}:11`),
    );
    row.getCell(10).value = excelDuration(
      totals.get(`${employee.id}:${year - 1}:12`),
    );
    for (let month = 1; month <= 12; month += 1) {
      const column = currentMonthColumns.get(month)!;
      sheet.getCell(`${column}${rowNumber}`).value = excelDuration(
        totals.get(`${employee.id}:${year}:${month}`),
      );
    }
    const quarterPeriods = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    const quarterColumns = ["N", "R", "V", "Z"];
    quarterPeriods.forEach((months, quarterIndex) => {
      const result = sumMinutes(
        totals,
        employee.id,
        months.map((month) => [year, month]),
      );
      const startColumn = monthlyColumns[quarterIndex * 3];
      const endColumn = monthlyColumns[quarterIndex * 3 + 2];
      sheet.getCell(`${quarterColumns[quarterIndex]}${rowNumber}`).value = {
        formula: `SUM(${startColumn}${rowNumber}:${endColumn}${rowNumber})`,
        result: result / 1440,
      };
    });
    const yearMinutes = sumMinutes(
      totals,
      employee.id,
      Array.from({ length: 12 }, (_, month) => [year, month + 1]),
    );
    sheet.getCell(`AA${rowNumber}`).value = {
      formula: `SUM(K${rowNumber}:M${rowNumber},O${rowNumber}:Q${rowNumber},S${rowNumber}:U${rowNumber},W${rowNumber}:Y${rowNumber})`,
      result: yearMinutes / 1440,
    };
    const qualifyingPeriods = [
      [year - 1, 11],
      [year - 1, 12],
      ...Array.from({ length: 10 }, (_, month) => [year, month + 1]),
    ] as Array<[number, number]>;
    const previousPeriods = [
      [year - 2, 11],
      [year - 2, 12],
      ...Array.from({ length: 10 }, (_, month) => [year - 1, month + 1]),
    ] as Array<[number, number]>;
    sheet.getCell(`AB${rowNumber}`).value = {
      formula: `SUM(I${rowNumber}:M${rowNumber},O${rowNumber}:Q${rowNumber},S${rowNumber}:U${rowNumber},W${rowNumber})`,
      result: sumMinutes(totals, employee.id, qualifyingPeriods) / 1440,
    };
    sheet.getCell(`AC${rowNumber}`).value =
      sumMinutes(totals, employee.id, previousPeriods) / 1440;

    for (let column = 2; column <= 29; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = {
        horizontal: column >= 6 ? "center" : "left",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = thinBorder;
      if (column >= 9) cell.numFmt = durationFormat;
    }
    row.getCell(6).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD6CCE0" },
    };
    row.getCell(7).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF5E0D2" },
    };
    row.getCell(8).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF200" },
    };
    for (const column of [14, 18, 22, 26, 27])
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDCE8C5" },
      };
    for (const column of [28, 29])
      row.getCell(column).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE7B4B4" },
      };
  });

  for (const column of [2, 3]) {
    let start = 0;
    while (start < rowMetadata.length) {
      const key =
        column === 2
          ? rowMetadata[start].topLevel
          : rowMetadata[start].subdivision;
      let end = start;
      while (
        end + 1 < rowMetadata.length &&
        (column === 2
          ? rowMetadata[end + 1].topLevel
          : rowMetadata[end + 1].subdivision) === key &&
        (column === 2 ||
          rowMetadata[end + 1].topLevel === rowMetadata[start].topLevel)
      )
        end += 1;
      if (key && end > start)
        sheet.mergeCells(
          rowMetadata[start].row,
          column,
          rowMetadata[end].row,
          column,
        );
      start = end + 1;
    }
  }
  return workbook;
}
