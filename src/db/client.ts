import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};
export const sql =
  globalForDb.sql ?? postgres(databaseUrl, { max: 10, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
export const db = drizzle(sql, { schema });
