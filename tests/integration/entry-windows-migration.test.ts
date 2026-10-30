import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `entry_windows_upgrade_${process.pid}`;

async function migration(name: string) {
  return readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
}

describe.skipIf(!sql)("entry windows upgrade", () => {
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
    await sql!`
      INSERT INTO vacation_plans(organization_id,user_id,year,status)
      VALUES
        (${organization.id},${employee.id},2026,'draft'),
        (${organization.id},${employee.id},2027,'submitted')
    `;
    await sql!`
      INSERT INTO overtime_reports(organization_id,user_id,year,month,status)
      VALUES
        (${organization.id},${employee.id},2026,9,'draft'),
        (${organization.id},${employee.id},2026,10,'submitted')
    `;
    await sql!.unsafe(await migration("0004_entry_windows.sql"));
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("preserves access for every legacy period regardless of workflow status", async () => {
    const rows = await sql!`
      SELECT kind, year, month, is_open
      FROM entry_windows
      ORDER BY kind, year, month
    `;
    expect(rows).toEqual([
      { kind: "overtime", year: 2026, month: 9, is_open: true },
      { kind: "overtime", year: 2026, month: 10, is_open: true },
      { kind: "vacation", year: 2026, month: 0, is_open: true },
      { kind: "vacation", year: 2027, month: 0, is_open: true },
    ]);
  });

  it("keeps HR choices on reapply and rejects mismatched period shapes", async () => {
    await sql!`UPDATE entry_windows SET is_open=false WHERE kind='vacation' AND year=2027`;
    await expect(
      sql!.unsafe(await migration("0004_entry_windows.sql")),
    ).resolves.toBeDefined();
    const [window] =
      await sql!`SELECT is_open FROM entry_windows WHERE kind='vacation' AND year=2027`;
    expect(window.is_open).toBe(false);

    const [{ organization_id: organizationId }] =
      await sql!`SELECT organization_id FROM entry_windows LIMIT 1`;
    await expect(
      sql!`INSERT INTO entry_windows(organization_id,kind,year,month) VALUES (${organizationId},'vacation',2028,2)`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql!`INSERT INTO entry_windows(organization_id,kind,year,month) VALUES (${organizationId},'overtime',2028,0)`,
    ).rejects.toMatchObject({ code: "23514" });
  });
});
