import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, departments, users } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  headcount: z.number().int().min(0).max(100_000),
  parentId: z.uuid().nullable(),
  headUserId: z.uuid().nullable(),
  approverUserId: z.uuid().nullable(),
});

export async function POST(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте название и численность" },
      { status: 400 },
    );
  const input = parsed.data;
  try {
    const created = await db.transaction(async (tx) => {
      for (const userId of [input.headUserId, input.approverUserId].filter(
        Boolean,
      ) as string[]) {
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, userId),
              eq(users.organizationId, actor.organizationId),
              eq(users.isActive, true),
            ),
          )
          .limit(1);
        if (!user) throw new Error("USER_NOT_FOUND");
      }
      if (input.parentId) {
        const [parent] = await tx
          .select({ id: departments.id })
          .from(departments)
          .where(
            and(
              eq(departments.id, input.parentId),
              eq(departments.organizationId, actor.organizationId),
            ),
          )
          .limit(1);
        if (!parent) throw new Error("PARENT_NOT_FOUND");
      }
      const [department] = await tx
        .insert(departments)
        .values({
          organizationId: actor.organizationId,
          name: input.name,
          headcount: input.headcount,
          parentId: input.parentId,
          headUserId: input.headUserId,
          approverUserId: input.approverUserId ?? input.headUserId,
        })
        .returning();
      const responsibleIds = [
        input.headUserId,
        input.approverUserId ?? input.headUserId,
      ].filter(Boolean) as string[];
      if (responsibleIds.length)
        await tx
          .update(users)
          .set({ role: "department_head", updatedAt: new Date() })
          .where(
            and(
              eq(users.organizationId, actor.organizationId),
              eq(users.role, "employee"),
              inArray(users.id, responsibleIds),
            ),
          );
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "department.created",
        objectType: "department",
        objectId: department.id,
        metadata: input,
      });
      return department;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "USER_NOT_FOUND"
            ? "Ответственный сотрудник не найден"
            : message === "PARENT_NOT_FOUND"
              ? "Вышестоящее подразделение не найдено"
              : "Подразделение с таким названием уже существует",
      },
      { status: message.endsWith("NOT_FOUND") ? 404 : 409 },
    );
  }
}
