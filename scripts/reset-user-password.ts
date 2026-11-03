import postgres from "postgres";
import { ORGANIZATION_NAME } from "./directory-data";
import { resetUserPassword } from "./lib/reset-user-password";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readPassword(): Promise<string> {
  let source = "";
  for await (const chunk of process.stdin) source += chunk.toString();
  const lines = source.replace(/\r/g, "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 1) throw new Error("PASSWORD_STDIN_REQUIRED");
  return lines[0];
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const login = argument("--login")?.trim();
const confirmedLogin = argument("--confirm-login")?.trim();
const organizationName =
  argument("--organization")?.trim() || ORGANIZATION_NAME;
if (!login || login !== confirmedLogin)
  throw new Error("--login and matching --confirm-login are required");

const password = await readPassword();
const sql = postgres(databaseUrl, { max: 1 });
try {
  await resetUserPassword(sql, { login, organizationName, password });
  console.info(
    `Password reset completed for ${login}; active sessions revoked`,
  );
} catch (error) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    LOGIN_REQUIRED: "Login is required",
    ORGANIZATION_REQUIRED: "Organization is required",
    PASSWORD_LENGTH: "Password must contain between 16 and 200 characters",
    USER_NOT_FOUND: "Active user was not found",
    USER_AMBIGUOUS: "More than one active user matched the request",
    PASSWORD_STDIN_REQUIRED:
      "Pass exactly one password line through standard input",
  };
  throw new Error(messages[code] ?? code);
} finally {
  await sql.end();
}
