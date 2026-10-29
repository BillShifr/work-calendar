import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, users, vacationPlans } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  year: z.number().int().min(2020).max(2100),
  allowanceDays: z.number().int().min(0).max(366),
});

export async function PUT(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте год и количество дней" },
      { status: 400 },
    );
  const input = parsed.data;
  try {
    const count = await db.transaction(async (tx) => {
      const conflicts = await tx.execute<{ fullName: string }>(sql`
        SELECT employee.full_name AS "fullName"
        FROM users employee
        JOIN vacation_plans plan ON plan.user_id = employee.id AND plan.year = ${input.year}
        JOIN vacation_periods period ON period.plan_id = plan.id
        WHERE employee.organization_id = ${actor.organizationId} AND employee.is_active = true
        GROUP BY employee.id, employee.full_name
        HAVING SUM((period.ends_on - period.starts_on) + 1) > ${input.allowanceDays}
        LIMIT 5
      `);
      if (conflicts.length)
        throw new Error(
          `CONFLICT:${conflicts.map((row) => row.fullName).join(", ")}`,
        );
      const employees = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.organizationId, actor.organizationId),
            eq(users.isActive, true),
          ),
        );
      for (const employee of employees) {
        await tx
          .insert(vacationPlans)
          .values({
            organizationId: actor.organizationId,
            userId: employee.id,
            year: input.year,
            allowanceDays: input.allowanceDays,
          })
          .onConflictDoUpdate({
            target: [vacationPlans.userId, vacationPlans.year],
            set: { allowanceDays: input.allowanceDays, updatedAt: new Date() },
          });
      }
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "vacation.allowance_bulk_updated",
        objectType: "organization",
        objectId: actor.organizationId,
        metadata: input,
      });
      return employees.length;
    });
    return NextResponse.json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: message.startsWith("CONFLICT:")
          ? `Лимит ниже уже выбранных дней: ${message.slice(9)}`
          : "Не удалось изменить лимит",
      },
      { status: 409 },
    );
  }
}
