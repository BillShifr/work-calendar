import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });
const directory = path.join(process.cwd(), "db/migrations");

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
for (const name of (await readdir(directory))
  .filter((file) => file.endsWith(".sql"))
  .sort()) {
  const [applied] =
    await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
  if (applied) continue;
  const source = await readFile(path.join(directory, name), "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(source);
    await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
  });
  console.info(`Applied ${name}`);
}
await sql.end();
