import { verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { relativeRedirect } from "@/lib/http";

const inputSchema = z.object({
  login: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const input = inputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return relativeRedirect("/login?error=1");
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.login, input.data.login))
    .limit(1);
  if (
    !user?.isActive ||
    !(await verify(user.passwordHash, input.data.password))
  )
    return relativeRedirect("/login?error=1");
  await createSession(user.id);
  return relativeRedirect(user.role === "employee" ? "/overtime" : "/hr");
}
