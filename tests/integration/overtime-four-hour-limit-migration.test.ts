import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `overtime_four_hour_upgrade_${process.pid}`;

async function migration(name: string) {
  return readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
}

describe.skipIf(!sql)("four-hour overtime limit upgrade", () => {
  beforeAll(async () => {
    await sql!.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql!.unsafe(`SET search_path TO ${schemaName}`);
    for (const name of [
      "0001_initial.sql",
      "0002_job_titles.sql",
      "0003_overtime_totals.sql",
    ])
      await sql!.unsafe(await migration(name));

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
        (${report.id},'2026-09-10',240,'employee'),
        (${report.id},'2026-09-11',245,'employee')
    `;
    await sql!.unsafe(await migration("0007_overtime_four_hour_limit.sql"));
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("preserves historical excess values and rejects new values over four hours", async () => {
    const rows = await sql!`
      SELECT work_date::text AS work_date, minutes
      FROM overtime_entries
      ORDER BY work_date
    `;
    expect(rows).toEqual([
      { work_date: "2026-09-10", minutes: 240 },
      { work_date: "2026-09-11", minutes: 245 },
    ]);

    const [{ report_id: reportId }] =
      await sql!`SELECT report_id FROM overtime_entries LIMIT 1`;
    await expect(
      sql!`INSERT INTO overtime_entries(report_id,work_date,minutes,source) VALUES (${reportId},'2026-09-12',240,'employee')`,
    ).resolves.toBeDefined();
    await expect(
      sql!`INSERT INTO overtime_entries(report_id,work_date,minutes,source) VALUES (${reportId},'2026-09-13',245,'employee')`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps the constraint unvalidated only while a legacy exception exists and is safe to reapply", async () => {
    const [constraint] = await sql!`
      SELECT convalidated
      FROM pg_constraint
      WHERE conname = 'overtime_entries_minutes_check'
        AND conrelid = 'overtime_entries'::regclass
    `;
    expect(constraint.convalidated).toBe(false);
    await expect(
      sql!.unsafe(await migration("0007_overtime_four_hour_limit.sql")),
    ).resolves.toBeDefined();

    await sql!`DELETE FROM overtime_entries WHERE minutes > 240`;
    await sql!.unsafe(await migration("0007_overtime_four_hour_limit.sql"));
    const [validated] = await sql!`
      SELECT convalidated
      FROM pg_constraint
      WHERE conname = 'overtime_entries_minutes_check'
        AND conrelid = 'overtime_entries'::regclass
    `;
    expect(validated.convalidated).toBe(true);
  });
});
