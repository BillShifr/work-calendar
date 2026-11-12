import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import ExcelJS from "exceljs";
import {
  buildVacationChessboardWorkbook,
  buildVacationTableWorkbook,
  loadVacationExportEmployees,
} from "@/domain/vacation-export";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

afterAll(async () => {
  await sql?.end();
});

describe.skipIf(!sql)("vacation workbook export", () => {
  it("fills appendix templates from submitted plans", async () => {
    const [organization] =
      await sql!`SELECT id FROM organizations ORDER BY created_at LIMIT 1`;
    const [yearRow] = await sql!`
      SELECT year::int AS year
      FROM vacation_plans
      WHERE organization_id = ${organization.id}
        AND status IN ('submitted', 'hr_proposed', 'approved', 'reopened', 'manager_review')
      ORDER BY year DESC
      LIMIT 1
    `;
    if (!yearRow?.year) return;

    const employees = await loadVacationExportEmployees(
      organization.id,
      yearRow.year,
    );
    expect(employees.length).toBeGreaterThan(0);

    const tableWorkbook = await buildVacationTableWorkbook(employees);
    const tableSheet = tableWorkbook.worksheets[0];
    expect(tableSheet.getCell("A1").value).toBe("Сотрудник");
    expect(tableSheet.getCell("B2").value).toBe("основной");
    expect(tableSheet.getCell("A2").value).toBeTruthy();

    const chessWorkbook = await buildVacationChessboardWorkbook(employees);
    const chessSheet = chessWorkbook.worksheets[0];
    expect(chessSheet.getCell("C3").value).toContain("Фамилия");
    expect(chessSheet.getCell("C7").value).toBeTruthy();
    expect(chessSheet.getCell("D7").value).toBeGreaterThan(0);

    const buffer = await tableWorkbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    expect(reopened.worksheets[0].rowCount).toBeGreaterThan(1);
    expect(Buffer.from(buffer).subarray(0, 2).toString()).toBe("PK");
  });
});
