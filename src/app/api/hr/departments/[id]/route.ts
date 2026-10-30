import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, departments, users } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const bodySchema = z.object({
  updatedAt: z.iso.datetime(),
  name: z.string().trim().min(2).max(160),
  isActive: z.boolean(),
  headcount: z.number().int().min(0).max(100_000),
  parentId: z.uuid().nullable(),
  headUserId: z.uuid().nullable(),
  approverUserId: z.uuid().nullable(),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/hr/departments/[id]">,
) {
  const actor = await requireHr();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте название и численность" },
      { status: 400 },
    );
  const input = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const [department] = await tx.execute<{
        id: string;
        name: string;
        updatedAt: Date | string;
      }>(sql`
        SELECT id, name, updated_at AS "updatedAt"
        FROM departments
        WHERE id = ${id} AND organization_id = ${actor.organizationId}
        FOR UPDATE
      `);
      if (!department) throw new Error("NOT_FOUND");
      if (
        new Date(department.updatedAt).getTime() !==
        new Date(input.updatedAt).getTime()
      )
        throw new Error("VERSION_CONFLICT");
      if (input.parentId === id) throw new Error("INVALID_PARENT");
      if (input.parentId) {
        const [cycle] = await tx.execute<{ cycle: boolean }>(sql`
          WITH RECURSIVE descendants AS (
            SELECT child.id FROM departments child WHERE child.parent_id = ${id}
            UNION ALL
            SELECT child.id FROM departments child
            INNER JOIN descendants parent ON child.parent_id = parent.id
          )
          SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ${input.parentId}) AS cycle
        `);
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
        if (!parent || cycle?.cycle) throw new Error("INVALID_PARENT");
      }
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
      if (!input.isActive) {
        const [assigned] = await tx.execute<{ count: number }>(sql`
          SELECT COUNT(*)::int AS count FROM department_assignments
          WHERE department_id = ${id} AND valid_to IS NULL
        `);
        if ((assigned?.count ?? 0) > 0)
          throw new Error("DEPARTMENT_HAS_EMPLOYEES");
      }

      const now = new Date();
      const [updated] = await tx
        .update(departments)
        .set({
          name: input.name,
          headcount: input.headcount,
          isActive: input.isActive,
          parentId: input.parentId,
          headUserId: input.headUserId,
          approverUserId: input.approverUserId ?? input.headUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(departments.id, id),
            eq(departments.organizationId, actor.organizationId),
          ),
        )
        .returning({ updatedAt: departments.updatedAt });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "department.updated",
        objectType: "department",
        objectId: id,
        metadata: {
          headcount: input.headcount,
          name: input.name,
          isActive: input.isActive,
          parentId: input.parentId,
          headUserId: input.headUserId,
          approverUserId: input.approverUserId ?? input.headUserId,
        },
      });
      const responsibleIds = [
        input.headUserId,
        input.approverUserId ?? input.headUserId,
      ].filter(Boolean) as string[];
      if (responsibleIds.length)
        await tx
          .update(users)
          .set({ role: "department_head", updatedAt: now })
          .where(
            and(
              eq(users.organizationId, actor.organizationId),
              eq(users.role, "employee"),
              inArray(users.id, responsibleIds),
            ),
          );
      await tx.execute(sql`
        UPDATE users employee
        SET role = 'employee', updated_at = ${now}
        WHERE employee.organization_id = ${actor.organizationId}
          AND employee.role = 'department_head'
          AND NOT EXISTS (
            SELECT 1 FROM departments owned
            WHERE owned.organization_id = ${actor.organizationId}
              AND (owned.head_user_id = employee.id OR owned.approver_user_id = employee.id)
          )
      `);
      return { ...input, updatedAt: updated.updatedAt.toISOString() };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "NOT_FOUND"
            ? "Подразделение не найдено"
            : message === "USER_NOT_FOUND"
              ? "Ответственный сотрудник не найден"
              : message === "INVALID_PARENT"
                ? "Нельзя создать циклическую структуру подразделений"
                : message === "DEPARTMENT_HAS_EMPLOYEES"
                  ? "Сначала переведите сотрудников в другое подразделение"
                  : "Настройки уже изменились. Обновите страницу.",
      },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
