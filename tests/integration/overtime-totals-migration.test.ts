import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `overtime_totals_upgrade_${process.pid}`;

async function migration(name: string) {
  return readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
}

describe.skipIf(!sql)("overtime totals upgrade", () => {
  beforeAll(async () => {
    await sql!.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql!.unsafe(`SET search_path TO ${schemaName}`);
    await sql!.unsafe(await migration("0001_initial.sql"));
    await sql!.unsafe(await migration("0002_job_titles.sql"));

    const [organization] =
      await sql!`INSERT INTO organizations(name) VALUES ('Migration test') RETURNING id`;
    const [employee] = await sql!`
      INSERT INTO users(organization_id,login,full_name,password_hash)
      VALUES (${organization.id},'legacy-employee','Legacy Employee','hash')
      RETURNING id
    `;
    const [report] = await sql!`
      INSERT INTO overtime_reports(organization_id,user_id,year,month)
      VALUES (${organization.id},${employee.id},2026,9)
      RETURNING id
    `;
    await sql!`
      INSERT INTO overtime_entries(report_id,work_date,minutes,source)
      VALUES
        (${report.id},'2026-09-10',5,'employee'),
        (${report.id},'2026-09-11',60,'employee')
    `;
    await sql!.unsafe(await migration("0003_overtime_totals.sql"));
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("preserves legacy rows and accepts accumulated five-minute totals", async () => {
    const rows = await sql!`
      SELECT work_date::text AS work_date, minutes
      FROM overtime_entries
      ORDER BY work_date
    `;
    expect(rows).toEqual([
      { work_date: "2026-09-10", minutes: 5 },
      { work_date: "2026-09-11", minutes: 60 },
    ]);

    const [{ report_id: reportId }] =
      await sql!`SELECT report_id FROM overtime_entries LIMIT 1`;
    await expect(
      sql!`INSERT INTO overtime_entries(report_id,work_date,minutes,source) VALUES (${reportId},'2026-09-12',70,'employee')`,
    ).resolves.toBeDefined();
    await expect(
      sql!`INSERT INTO overtime_entries(report_id,work_date,minutes,source) VALUES (${reportId},'2026-09-13',1440,'employee')`,
    ).resolves.toBeDefined();
  });

  it("rejects invalid totals and is safe to reapply", async () => {
    const [{ report_id: reportId }] =
      await sql!`SELECT report_id FROM overtime_entries LIMIT 1`;
    for (const [date, minutes] of [
      ["2026-09-14", 0],
      ["2026-09-15", 71],
      ["2026-09-16", 1445],
    ] as const) {
      await expect(
        sql!`INSERT INTO overtime_entries(report_id,work_date,minutes,source) VALUES (${reportId},${date},${minutes},'employee')`,
      ).rejects.toMatchObject({ code: "23514" });
    }
    await expect(
      sql!.unsafe(await migration("0003_overtime_totals.sql")),
    ).resolves.toBeDefined();
  });
});
