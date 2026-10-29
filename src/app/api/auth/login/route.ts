import { verify } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";

const inputSchema = z.object({
  login: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const formData = await request.formData();
  const input = inputSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.login, input.data.login))
    .limit(1);
  if (
    !user?.isActive ||
    !(await verify(user.passwordHash, input.data.password))
  )
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  await createSession(user.id);
  return NextResponse.redirect(
    new URL(user.role === "employee" ? "/overtime" : "/hr", request.url),
    303,
  );
}
