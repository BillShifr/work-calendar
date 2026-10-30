import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
const schemaName = `overtime_consolidation_upgrade_${process.pid}`;

async function migration(name: string) {
  return readFile(path.join(process.cwd(), "db/migrations", name), "utf8");
}

describe.skipIf(!sql)("overtime consolidation upgrade", () => {
  beforeAll(async () => {
    await sql!.unsafe(`CREATE SCHEMA ${schemaName}`);
    await sql!.unsafe(`SET search_path TO ${schemaName}`);
    for (const name of [
      "0001_initial.sql",
      "0002_job_titles.sql",
      "0003_overtime_totals.sql",
      "0004_entry_windows.sql",
    ])
      await sql!.unsafe(await migration(name));

    const [organization] =
      await sql!`INSERT INTO organizations(name) VALUES ('Migration test') RETURNING id`;
    const [department] = await sql!`
      INSERT INTO departments(organization_id,name,headcount)
      VALUES (${organization.id},'Legacy department',2)
      RETURNING id
    `;
    const [assignedEmployee] = await sql!`
      INSERT INTO users(organization_id,login,full_name,password_hash)
      VALUES (${organization.id},'assigned','Assigned Employee','hash')
      RETURNING id
    `;
    const [unassignedEmployee] = await sql!`
      INSERT INTO users(organization_id,login,full_name,password_hash)
      VALUES (${organization.id},'unassigned','Unassigned Employee','hash')
      RETURNING id
    `;
    await sql!`
      INSERT INTO department_assignments(user_id,department_id,valid_from,valid_to,job_title)
      VALUES (${assignedEmployee.id},${department.id},'2025-12-01',NULL,'Legacy title')
    `;
    await sql!`
      INSERT INTO overtime_reports(organization_id,user_id,year,month,status)
      VALUES
        (${organization.id},${assignedEmployee.id},2026,1,'submitted'),
        (${organization.id},${unassignedEmployee.id},2026,1,'draft')
    `;

    await sql!.begin(async (tx) => {
      await tx.unsafe(await migration("0005_overtime_consolidation.sql"));
    });
  });

  afterAll(async () => {
    if (!sql) return;
    await sql.unsafe("SET search_path TO public");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await sql.end();
  });

  it("preserves reports and snapshots the matching historical department", async () => {
    const reports = await sql!`
      SELECT employee.login, report.department_id
      FROM overtime_reports report
      INNER JOIN users employee ON employee.id = report.user_id
      ORDER BY employee.login
    `;
    expect(reports).toHaveLength(2);
    expect(reports[0].login).toBe("assigned");
    expect(reports[0].department_id).not.toBeNull();
    expect(reports[1]).toMatchObject({
      login: "unassigned",
      department_id: null,
    });
  });

  it("creates constrained terms and approval state without fabricating values", async () => {
    const [{ organization_id: organizationId }] =
      await sql!`SELECT organization_id FROM users LIMIT 1`;
    const [{ id: userId }] =
      await sql!`SELECT id FROM users WHERE login='assigned'`;
    const [{ id: departmentId }] =
      await sql!`SELECT id FROM departments LIMIT 1`;

    await expect(sql!`
      INSERT INTO employee_irregular_leave_terms(
        organization_id,user_id,year,max_days_override,actual_days,proposed_next_year_days
      ) VALUES (${organizationId},${userId},2026,11,10,9)
    `).resolves.toBeDefined();
    await expect(sql!`
      INSERT INTO employee_irregular_leave_terms(
        organization_id,user_id,year,max_days_override
      ) VALUES (${organizationId},${userId},2027,31)
    `).rejects.toMatchObject({ code: "23514" });
    await expect(sql!`
      INSERT INTO department_quarter_approvals(
        organization_id,department_id,year,quarter,status
      ) VALUES (${organizationId},${departmentId},2026,5,'approved')
    `).rejects.toMatchObject({ code: "23514" });
  });

  it("is safe to reapply after an already completed upgrade", async () => {
    await expect(
      sql!.begin(async (tx) => {
        await tx.unsafe(await migration("0005_overtime_consolidation.sql"));
      }),
    ).resolves.toBeUndefined();
    const [{ count }] =
      await sql!`SELECT COUNT(*)::int AS count FROM overtime_reports`;
    expect(count).toBe(2);
  });
});
