import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;
afterAll(async () => {
  await sql?.end();
});
describe.skipIf(!sql)("database constraints", () => {
  it("has versioned aggregate and audit tables", async () => {
    const rows =
      await sql!`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('revisions','audit_events','outbox_events')`;
    expect(rows.map((row) => row.table_name).sort()).toEqual([
      "audit_events",
      "outbox_events",
      "revisions",
    ]);
  });
  it("keeps accumulated overtime totals on the five-minute grid", async () => {
    const checks =
      await sql!`SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='overtime_entries'::regclass`;
    expect(
      checks.some(
        (row) =>
          row.definition.includes("minutes") &&
          row.definition.includes("1440") &&
          row.definition.includes("% 5"),
      ),
    ).toBe(true);
  });
});
