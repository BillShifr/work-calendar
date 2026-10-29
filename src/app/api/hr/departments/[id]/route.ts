import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, departmentAbsenceRules, departments } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const bodySchema = z.object({
  updatedAt: z.iso.datetime(),
  headcount: z.number().int().min(0).max(100_000),
  maxAbsent: z.number().int().min(0).nullable(),
  minPresent: z.number().int().min(0).nullable(),
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
      { error: "Проверьте численность и ограничения" },
      { status: 400 },
    );
  const input = parsed.data;
  if (
    (input.maxAbsent !== null && input.maxAbsent > input.headcount) ||
    (input.minPresent !== null && input.minPresent > input.headcount)
  )
    return NextResponse.json(
      { error: "Ограничение не может превышать численность отдела" },
      { status: 400 },
    );

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

      const now = new Date();
      const [updated] = await tx
        .update(departments)
        .set({ headcount: input.headcount, updatedAt: now })
        .where(
          and(
            eq(departments.id, id),
            eq(departments.organizationId, actor.organizationId),
          ),
        )
        .returning({ updatedAt: departments.updatedAt });
      await tx.insert(departmentAbsenceRules).values({
        departmentId: id,
        maxAbsent: input.maxAbsent,
        minPresent: input.minPresent,
      });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "department.absence_rule_updated",
        objectType: "department",
        objectId: id,
        metadata: {
          headcount: input.headcount,
          maxAbsent: input.maxAbsent,
          minPresent: input.minPresent,
        },
      });
      return { ...input, updatedAt: updated.updatedAt.toISOString() };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "NOT_FOUND"
            ? "Отдел не найден"
            : "Настройки уже изменились. Обновите страницу.",
      },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
