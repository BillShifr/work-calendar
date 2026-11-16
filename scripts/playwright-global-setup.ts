import { execSync } from "node:child_process";

function run(command: string, env: NodeJS.ProcessEnv = process.env) {
  execSync(command, { stdio: "inherit", env });
}

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Playwright global setup");
  }
  run("npm run db:migrate");
  run("npx tsx scripts/reset-e2e-fixtures.ts");
  run("npm run db:seed", {
    ...process.env,
    INITIAL_ADMIN_PASSWORD: "CI-only-password-2026!",
  });
}