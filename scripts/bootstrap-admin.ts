import { hash } from "@node-rs/argon2";
import postgres from "postgres";
import { ORGANIZATION_NAME } from "./directory-data";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });

const [organization] =
  await sql`SELECT id FROM organizations WHERE name=${ORGANIZATION_NAME} ORDER BY created_at LIMIT 1`;
if (!organization)
  throw new Error("Run db:seed:reference before bootstrap-admin");

const [existingUser] =
  await sql`SELECT id FROM users WHERE organization_id=${organization.id} LIMIT 1`;
if (existingUser) {
  console.info("Bootstrap skipped: organization already has users");
  await sql.end();
  process.exit(0);
}

const login = process.env.INITIAL_ADMIN_LOGIN?.trim();
const fullName = process.env.INITIAL_ADMIN_NAME?.trim();
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (!login || !fullName || !password || password.length < 16)
  throw new Error(
    "INITIAL_ADMIN_LOGIN, INITIAL_ADMIN_NAME and a 16+ character INITIAL_ADMIN_PASSWORD are required for first deployment",
  );

const passwordHash = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const [admin] = await sql`
  INSERT INTO users(
    organization_id, login, full_name, password_hash, role, is_active
  ) VALUES (
    ${organization.id}, ${login}, ${fullName}, ${passwordHash}, 'hr_lead', true
  )
  RETURNING id
`;
await sql`
  INSERT INTO audit_events(
    organization_id, actor_id, action, object_type, object_id, metadata
  ) VALUES (
    ${organization.id}, ${admin.id}, 'user.bootstrap.created', 'user', ${admin.id},
    ${sql.json({ role: "hr_lead" })}
  )
`;
console.info("Initial HR administrator created");
await sql.end();
