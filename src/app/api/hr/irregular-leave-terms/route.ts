import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, employeeIrregularLeaveTerms, users } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const nullableDays = z.number().int().min(0).max(30).nullable();
const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("individual"),
    userId: z.uuid(),
    year: z.number().int().min(2020).max(2100),
    maxDaysOverride: nullableDays,
    actualDays: nullableDays,
    proposedNextYearDays: nullableDays,
  }),
  z.object({
    mode: z.literal("bulk"),
    year: z.number().int().min(2020).max(2100),
    maxDaysOverride: nullableDays,
  }),
]);

export async function PUT(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Количество дней должно быть от 0 до 30" },
      { status: 400 },
    );
  const input = parsed.data;
  try {
    const count = await db.transaction(async (tx) => {
      if (input.mode === "individual") {
        const [employee] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.userId),
              eq(users.organizationId, actor.organizationId),
            ),
          )
          .limit(1);
        if (!employee) throw new Error("NOT_FOUND");
        await tx
          .insert(employeeIrregularLeaveTerms)
          .values({
            organizationId: actor.organizationId,
            userId: input.userId,
            year: input.year,
            maxDaysOverride: input.maxDaysOverride,
            actualDays: input.actualDays,
            proposedNextYearDays: input.proposedNextYearDays,
          })
          .onConflictDoUpdate({
            target: [
              employeeIrregularLeaveTerms.userId,
              employeeIrregularLeaveTerms.year,
            ],
            set: {
              maxDaysOverride: input.maxDaysOverride,
              actualDays: input.actualDays,
              proposedNextYearDays: input.proposedNextYearDays,
              updatedAt: new Date(),
            },
          });
        await tx.insert(auditEvents).values({
          organizationId: actor.organizationId,
          actorId: actor.id,
          action: "irregular_leave_terms.updated",
          objectType: "user",
          objectId: input.userId,
          metadata: input,
        });
        return 1;
      }
      const employees = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.organizationId, actor.organizationId),
            eq(users.isActive, true),
          ),
        );
      if (employees.length)
        await tx
          .insert(employeeIrregularLeaveTerms)
          .values(
            employees.map((employee) => ({
              organizationId: actor.organizationId,
              userId: employee.id,
              year: input.year,
              maxDaysOverride: input.maxDaysOverride,
            })),
          )
          .onConflictDoUpdate({
            target: [
              employeeIrregularLeaveTerms.userId,
              employeeIrregularLeaveTerms.year,
            ],
            set: {
              maxDaysOverride: input.maxDaysOverride,
              updatedAt: new Date(),
            },
          });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "irregular_leave_terms.bulk_max_updated",
        objectType: "organization",
        objectId: actor.organizationId,
        metadata: { year: input.year, maxDaysOverride: input.maxDaysOverride },
      });
      return employees.length;
    });
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message === "NOT_FOUND"
            ? "Сотрудник не найден"
            : "Не удалось сохранить",
      },
      {
        status:
          error instanceof Error && error.message === "NOT_FOUND" ? 404 : 409,
      },
    );
  }
}
