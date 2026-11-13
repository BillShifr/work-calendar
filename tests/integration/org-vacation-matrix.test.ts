import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getOrgVacationMatrix } from "@/domain/org-vacation-matrix";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

afterAll(async () => {
  await sql?.end();
});

describe.skipIf(!sql)("org vacation matrix", () => {
  it("groups active employees by department for the organization", async () => {
    const [organization] =
      await sql!`SELECT id FROM organizations ORDER BY created_at LIMIT 1`;
    const [seeded] =
      await sql!`SELECT id FROM users WHERE login = 'employee' LIMIT 1`;
    if (!seeded) return;
    const departments = await getOrgVacationMatrix(
      { organizationId: organization.id },
      new Date().getFullYear() + 1,
    );
    expect(departments.length).toBeGreaterThan(0);
    const people = departments.flatMap((department) => department.employees);
    expect(
      people.some((employee) => employee.fullName === "Алексей Морозов"),
    ).toBe(true);
  });
});
