import { sql } from "@/db/client";

export async function GET() {
  await sql`SELECT 1`;
  return Response.json({ status: "ok" });
}
