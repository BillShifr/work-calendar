import { randomUUID } from "node:crypto";
import { verify } from "@node-rs/argon2";
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ORGANIZATION_NAME } from "../../scripts/directory-data";
import { resetUserPassword } from "../../scripts/lib/reset-user-password";
import { seedReferenceData } from "../../scripts/lib/seed-reference-data";

const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

afterAll(async () => {
  await sql?.end();
});

describe.skipIf(!sql)("console password reset", () => {
  it("changes the hash, revokes sessions and records an audit event", async () => {
    const { organizationId } = await seedReferenceData(sql!);
    const login = `reset-${randomUUID()}`;
    const [user] = await sql!`
      INSERT INTO users(organization_id, login, full_name, password_hash, role)
      VALUES (${organizationId}, ${login}, 'Reset Test', 'old-hash', 'hr')
      RETURNING id
    `;
    await sql!`
      INSERT INTO sessions(user_id, token_hash, expires_at)
      VALUES (${user.id}, ${randomUUID()}, now() + interval '1 day')
    `;

    try {
      const password = "New-production-password-2026!";
      await resetUserPassword(sql!, {
        login,
        organizationName: ORGANIZATION_NAME,
        password,
      });

      const [updated] =
        await sql!`SELECT password_hash FROM users WHERE id=${user.id}`;
      expect(await verify(updated.password_hash, password)).toBe(true);
      const [session] =
        await sql!`SELECT revoked_at FROM sessions WHERE user_id=${user.id}`;
      expect(session.revoked_at).not.toBeNull();
      const [audit] = await sql!`
        SELECT actor_id, action, metadata
        FROM audit_events
        WHERE object_type='user' AND object_id=${user.id}
        ORDER BY occurred_at DESC
        LIMIT 1
      `;
      expect(audit).toMatchObject({
        actor_id: null,
        action: "user.password.reset_console",
        metadata: { login },
      });
    } finally {
      await sql!`DELETE FROM audit_events WHERE object_type='user' AND object_id=${user.id}`;
      await sql!`DELETE FROM sessions WHERE user_id=${user.id}`;
      await sql!`DELETE FROM users WHERE id=${user.id}`;
    }
  });

  it("does not change data when the password is too short", async () => {
    await expect(
      resetUserPassword(sql!, {
        login: "hr",
        organizationName: ORGANIZATION_NAME,
        password: "short",
      }),
    ).rejects.toThrow("PASSWORD_LENGTH");
  });
});
