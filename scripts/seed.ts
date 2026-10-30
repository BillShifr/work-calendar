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
const [hrJobTitle] =
  await sql`INSERT INTO job_titles(organization_id,name) VALUES (${orgId},'Начальник отдела кадров') ON CONFLICT(organization_id,name) DO UPDATE SET is_active=true RETURNING id`;
const [employeeJobTitle] =
  await sql`INSERT INTO job_titles(organization_id,name) VALUES (${orgId},'Главный специалист') ON CONFLICT(organization_id,name) DO UPDATE SET is_active=true RETURNING id`;
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
await sql`
  UPDATE departments
  SET head_user_id=${hr.id}, approver_user_id=${hr.id}, updated_at=now()
  WHERE id=${department.id}
`;
for (const user of [
  { id: hr.id, title: "Начальник отдела кадров", titleId: hrJobTitle.id },
  {
    id: employee.id,
    title: "Главный специалист",
    titleId: employeeJobTitle.id,
  },
]) {
  await sql`INSERT INTO department_assignments(user_id,department_id,job_title_id,valid_from,job_title)
    SELECT ${user.id},${department.id},${user.titleId},'2026-01-01',${user.title}
    WHERE NOT EXISTS (SELECT 1 FROM department_assignments WHERE user_id=${user.id} AND valid_to IS NULL)`;
  await sql`UPDATE department_assignments SET job_title_id=${user.titleId}, job_title=${user.title}
    WHERE user_id=${user.id} AND valid_to IS NULL`;
}
for (const report of [
  { userId: hr.id, month: 10 },
  { userId: hr.id, month: 11 },
  { userId: hr.id, month: 12 },
  { userId: employee.id, month: 11 },
  { userId: employee.id, month: 12 },
])
  await sql`
    INSERT INTO overtime_reports(
      organization_id,user_id,department_id,year,month,status,zero_confirmed,submitted_at
    ) VALUES (
      ${orgId},${report.userId},${department.id},2026,${report.month},'submitted',true,now()
    )
    ON CONFLICT(user_id,year,month) DO NOTHING
  `;
console.info(
  "Seed complete. employee / Employee-2026!, hr / configured password",
);
await sql.end();
