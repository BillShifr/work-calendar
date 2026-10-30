import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { buildOvertimeSummaryWorkbook } from "@/domain/overtime-export";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

afterAll(async () => {
  await sql?.end();
});

describe.skipIf(!sql)("overtime workbook export", () => {
  it("keeps the approved template structure and produces a valid XLSX", async () => {
    const [organization] =
      await sql!`SELECT id, name FROM organizations ORDER BY created_at LIMIT 1`;
    const workbook = await buildOvertimeSummaryWorkbook(organization.id, 2026);
    const sheet = workbook.getWorksheet("Лист1 (свод по кварталам)");
    expect(sheet).toBeDefined();
    expect(sheet!.getCell("B3").value).toBe("Структурное подразделение");
    expect(sheet!.getCell("B5").value).toBe(organization.name);
    expect(sheet!.getCell("H3").value).toBe("Предложения на 2027 год");
    expect(sheet!.getCell("I3").value).toBeInstanceOf(Date);
    expect(sheet!.getCell("AB3").value).toContain("01.11.25");
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5_000);
    expect(Buffer.from(buffer).subarray(0, 2).toString()).toBe("PK");
  });
});
