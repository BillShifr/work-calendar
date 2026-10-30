import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, sessions, users } from "@/db/schema";

const COOKIE_NAME = "hr_session";
const SESSION_DAYS = 14;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db
    .insert(sessions)
    .values({ userId, tokenHash: tokenHash(token), expiresAt });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token)
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash(token)));
  store.delete(COOKIE_NAME);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const [result] = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      fullName: users.fullName,
      login: users.login,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return result ?? null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireHr() {
  const user = await requireUser();
  if (!(["hr", "hr_lead"] as string[]).includes(user.role))
    redirect("/overtime");
  return user;
}

export async function approverDepartmentIds(user: {
  id: string;
  organizationId: string;
}) {
  const rows = await db
    .select({ id: departments.id })
    .from(departments)
    .where(
      and(
        eq(departments.organizationId, user.organizationId),
        eq(departments.approverUserId, user.id),
        eq(departments.isActive, true),
      ),
    );
  return rows.map((row) => row.id);
}

export async function requireDepartmentApprover() {
  const user = await requireUser();
  const departmentIds = await approverDepartmentIds(user);
  if (!departmentIds.length) redirect("/overtime");
  return { ...user, departmentIds };
}
