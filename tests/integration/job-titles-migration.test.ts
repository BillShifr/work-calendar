import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `job_titles_upgrade_${process.pid}`;

describe.skipIf(!sql)("job titles upgrade", () => {
  beforeAll(async () => {
    await sql!.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql!.unsafe(`SET search_path TO ${schemaName}`);
    const initial = await readFile(
      path.join(process.cwd(), "db/migrations/0001_initial.sql"),
      "utf8",
    );
    await sql!.unsafe(initial);
    const [organization] =
      await sql!`INSERT INTO organizations(name) VALUES ('Migration test') RETURNING id`;
    const [department] =
      await sql!`INSERT INTO departments(organization_id,name) VALUES (${organization.id},'Test department') RETURNING id`;
    const users = await sql!`
      INSERT INTO users(organization_id,login,full_name,password_hash)
      VALUES
        (${organization.id},'legacy-one','Legacy One','hash'),
        (${organization.id},'legacy-two','Legacy Two','hash'),
        (${organization.id},'legacy-three','Legacy Three','hash')
      RETURNING id
    `;
    await sql!`
      INSERT INTO department_assignments(user_id,department_id,valid_from,job_title)
      VALUES
        (${users[0].id},${department.id},'2025-01-01','Главный специалист'),
        (${users[1].id},${department.id},'2025-01-01','  Главный специалист  '),
        (${users[2].id},${department.id},'2025-01-01',NULL)
    `;
    const migration = await readFile(
      path.join(process.cwd(), "db/migrations/0002_job_titles.sql"),
      "utf8",
    );
    await sql!.unsafe(migration);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("preserves legacy values and maps equal trimmed titles", async () => {
    const titles = await sql!`SELECT name FROM job_titles ORDER BY name`;
    expect(titles).toEqual([{ name: "Главный специалист" }]);
    const assignments = await sql!`
      SELECT job_title, job_title_id IS NOT NULL AS mapped
      FROM department_assignments ORDER BY created_at, id
    `;
    expect(assignments.filter((row) => row.job_title !== null)).toHaveLength(2);
    expect(
      assignments
        .filter((row) => row.job_title !== null)
        .every((row) => row.mapped),
    ).toBe(true);
    expect(assignments.find((row) => row.job_title === null)?.mapped).toBe(
      false,
    );
  });

  it("is safe to reapply and enforces the new foreign key", async () => {
    const migration = await readFile(
      path.join(process.cwd(), "db/migrations/0002_job_titles.sql"),
      "utf8",
    );
    await expect(sql!.unsafe(migration)).resolves.toBeDefined();
    await expect(
      sql!.unsafe(
        "UPDATE department_assignments SET job_title_id = '00000000-0000-0000-0000-000000000001'",
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
