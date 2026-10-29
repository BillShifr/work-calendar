import { hash } from "@node-rs/argon2";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });
const password = process.env.INITIAL_ADMIN_PASSWORD ?? "Tfoms-Time-2026!";
const employeePassword =
  process.env.INITIAL_EMPLOYEE_PASSWORD ?? "Employee-2026!";

const [organization] =
  await sql`INSERT INTO organizations(name) VALUES ('ТФОМС') ON CONFLICT DO NOTHING RETURNING id`;
const [existingOrganization] = organization
  ? [organization]
  : await sql`SELECT id FROM organizations ORDER BY created_at LIMIT 1`;
const orgId = existingOrganization.id;
const [department] =
  await sql`INSERT INTO departments(organization_id,name,headcount) VALUES (${orgId},'Информационные технологии',12) ON CONFLICT(organization_id,name) DO UPDATE SET headcount=EXCLUDED.headcount RETURNING id`;
const hrHash = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const employeeHash = await hash(employeePassword, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const [hr] =
  await sql`INSERT INTO users(organization_id,login,full_name,password_hash,role) VALUES (${orgId},'hr','Елена Соколова',${hrHash},'hr_lead') ON CONFLICT(organization_id,login) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`;
const [employee] =
  await sql`INSERT INTO users(organization_id,login,full_name,password_hash,role) VALUES (${orgId},'employee','Алексей Морозов',${employeeHash},'employee') ON CONFLICT(organization_id,login) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`;
for (const userId of [hr.id, employee.id]) {
  await sql`INSERT INTO department_assignments(user_id,department_id,valid_from,job_title) SELECT ${userId},${department.id},'2026-01-01',${userId === hr.id ? "Начальник отдела кадров" : "Главный специалист"} WHERE NOT EXISTS (SELECT 1 FROM department_assignments WHERE user_id=${userId} AND valid_to IS NULL)`;
}
console.info(
  "Seed complete. employee / Employee-2026!, hr / configured password",
);
await sql.end();
