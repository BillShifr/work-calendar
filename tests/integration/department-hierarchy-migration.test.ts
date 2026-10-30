import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `department_hierarchy_upgrade_${process.pid}`;

async function migration(name: string) {
  return readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
}

describe.skipIf(!sql)("department hierarchy uniqueness upgrade", () => {
  beforeAll(async () => {
    await sql!.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql!.unsafe(`SET search_path TO ${schemaName}`);
    for (const name of [
      "0001_initial.sql",
      "0002_job_titles.sql",
      "0003_overtime_totals.sql",
      "0004_entry_windows.sql",
      "0005_overtime_consolidation.sql",
    ])
      await sql!.unsafe(await migration(name));

    const [organization] =
      await sql!`INSERT INTO organizations(name) VALUES ('Migration test') RETURNING id`;
    await sql!`
      INSERT INTO departments(organization_id,name,headcount)
      VALUES
        (${organization.id},'Филиал A',10),
        (${organization.id},'Филиал B',10)
    `;
    await sql!.unsafe(
      await migration("0006_department_hierarchy_uniqueness.sql"),
    );
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("allows the same child name under different parents", async () => {
    const parents = await sql!`SELECT id,name FROM departments ORDER BY name`;
    await expect(sql!`
      INSERT INTO departments(organization_id,parent_id,name,headcount)
      SELECT organization_id, ${parents[0].id}, 'Руководство', 2
      FROM departments WHERE id=${parents[0].id}
    `).resolves.toBeDefined();
    await expect(sql!`
      INSERT INTO departments(organization_id,parent_id,name,headcount)
      SELECT organization_id, ${parents[1].id}, 'Руководство', 3
      FROM departments WHERE id=${parents[1].id}
    `).resolves.toBeDefined();
  });

  it("rejects a duplicate in the same parent and is safe to reapply", async () => {
    const [child] =
      await sql!`SELECT organization_id,parent_id,name FROM departments WHERE parent_id IS NOT NULL LIMIT 1`;
    await expect(sql!`
      INSERT INTO departments(organization_id,parent_id,name)
      VALUES (${child.organization_id},${child.parent_id},${child.name})
    `).rejects.toMatchObject({ code: "23505" });
    await expect(
      sql!.unsafe(await migration("0006_department_hierarchy_uniqueness.sql")),
    ).resolves.toBeDefined();
  });
});
