import { hash } from "@node-rs/argon2";
import type { Sql } from "postgres";

export type ResetUserPasswordInput = {
  login: string;
  organizationName: string;
  password: string;
};

export async function resetUserPassword(
  sql: Sql,
  input: ResetUserPasswordInput,
): Promise<{ userId: string }> {
  const login = input.login.trim();
  const organizationName = input.organizationName.trim();
  if (!login) throw new Error("LOGIN_REQUIRED");
  if (!organizationName) throw new Error("ORGANIZATION_REQUIRED");
  if (input.password.length < 16 || input.password.length > 200)
    throw new Error("PASSWORD_LENGTH");

  const passwordHash = await hash(input.password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  return sql.begin(async (tx) => {
    const matches = await tx`
      SELECT users.id, users.organization_id
      FROM users
      INNER JOIN organizations ON organizations.id=users.organization_id
      WHERE users.login=${login}
        AND organizations.name=${organizationName}
        AND users.is_active=true
      FOR UPDATE
    `;
    if (!matches.length) throw new Error("USER_NOT_FOUND");
    if (matches.length > 1) throw new Error("USER_AMBIGUOUS");
    const user = matches[0];

    await tx`
      UPDATE users
      SET password_hash=${passwordHash}, updated_at=now()
      WHERE id=${user.id}
    `;
    await tx`
      UPDATE sessions
      SET revoked_at=now()
      WHERE user_id=${user.id} AND revoked_at IS NULL
    `;
    await tx`
      INSERT INTO audit_events(
        organization_id, actor_id, action, object_type, object_id, metadata
      ) VALUES (
        ${user.organization_id}, NULL, 'user.password.reset_console',
        'user', ${user.id}, ${tx.json({ login })}
      )
    `;

    return { userId: user.id as string };
  });
}
