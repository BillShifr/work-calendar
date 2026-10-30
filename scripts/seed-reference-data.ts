import postgres from "postgres";
import { seedReferenceData } from "./lib/seed-reference-data";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 1 });
const result = await seedReferenceData(sql);
console.info(
  `Reference data synced: ${result.departments} departments, ${result.jobTitles} job titles`,
);
await sql.end();
