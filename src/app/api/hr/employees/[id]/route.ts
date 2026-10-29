import { hash } from "@node-rs/argon2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  departmentAssignments,
  departments,
  jobTitles,
  sessions,
  users,
  vacationPlans,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  fullName: z.string().trim().min(3).max(160),
  departmentId: z.uuid(),
  jobTitleId: z.uuid(),
  role: z.enum(["employee", "hr"]),
  isCritical: z.boolean(),
  isActive: z.boolean(),
  allowanceDays: z.number().int().min(0).max(366),
  year: z.number().int().min(2020).max(2100),
  newPassword: z.union([z.literal(""), z.string().min(12).max(200)]),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/hr/employees/[id]">,
) {
  const actor = await requireHr();
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте данные сотрудника" },
      { status: 400 },
    );
  if (id === actor.id && !parsed.data.isActive)
    return NextResponse.json(
      { error: "Нельзя отключить собственную учётную запись" },
      { status: 400 },
    );
  const input = parsed.data;
  const passwordHash = input.newPassword
    ? await hash(input.newPassword, {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      })
    : null;
  try {
    await db.transaction(async (tx) => {
      const [employee] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, id), eq(users.organizationId, actor.organizationId)),
        )
        .limit(1);
      if (!employee) throw new Error("NOT_FOUND");
      const [department] = await tx
        .select({ id: departments.id })
        .from(departments)
        .where(
          and(
            eq(departments.id, input.departmentId),
            eq(departments.organizationId, actor.organizationId),
            eq(departments.isActive, true),
          ),
        )
        .limit(1);
      if (!department) throw new Error("DEPARTMENT_NOT_FOUND");
      const [jobTitle] = await tx
        .select({ id: jobTitles.id, name: jobTitles.name })
        .from(jobTitles)
        .where(
          and(
            eq(jobTitles.id, input.jobTitleId),
            eq(jobTitles.organizationId, actor.organizationId),
            eq(jobTitles.isActive, true),
          ),
        )
        .limit(1);
      if (!jobTitle) throw new Error("JOB_TITLE_NOT_FOUND");
      const [usage] = await tx.execute<{ total: number }>(sql`
        SELECT COALESCE(SUM((period.ends_on - period.starts_on) + 1), 0)::int AS total
        FROM vacation_plans plan
        LEFT JOIN vacation_periods period ON period.plan_id = plan.id
        WHERE plan.user_id = ${id} AND plan.year = ${input.year}
      `);
      if ((usage?.total ?? 0) > input.allowanceDays)
        throw new Error("ALLOWANCE_BELOW_USED");

      await tx
        .update(users)
        .set({
          fullName: input.fullName,
          role: input.role,
          isActive: input.isActive,
          ...(passwordHash ? { passwordHash } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
      const [assignment] = await tx
        .select()
        .from(departmentAssignments)
        .where(
          and(
            eq(departmentAssignments.userId, id),
            isNull(departmentAssignments.validTo),
          ),
        )
        .limit(1);
      const assignmentChanged =
        !assignment || assignment.departmentId !== input.departmentId;
      if (assignmentChanged && assignment) {
        await tx
          .update(departmentAssignments)
          .set({ validTo: new Date().toISOString().slice(0, 10) })
          .where(eq(departmentAssignments.id, assignment.id));
      }
      if (assignmentChanged) {
        await tx.insert(departmentAssignments).values({
          userId: id,
          departmentId: input.departmentId,
          jobTitleId: jobTitle.id,
          validFrom: new Date().toISOString().slice(0, 10),
          jobTitle: jobTitle.name,
          isCritical: input.isCritical,
        });
      } else if (assignment) {
        await tx
          .update(departmentAssignments)
          .set({
            jobTitleId: jobTitle.id,
            jobTitle: jobTitle.name,
            isCritical: input.isCritical,
            updatedAt: new Date(),
          })
          .where(eq(departmentAssignments.id, assignment.id));
      }
      await tx
        .insert(vacationPlans)
        .values({
          organizationId: actor.organizationId,
          userId: id,
          year: input.year,
          allowanceDays: input.allowanceDays,
        })
        .onConflictDoUpdate({
          target: [vacationPlans.userId, vacationPlans.year],
          set: { allowanceDays: input.allowanceDays, updatedAt: new Date() },
        });
      if (!input.isActive || passwordHash)
        await tx
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "employee.updated",
        objectType: "user",
        objectId: id,
        metadata: {
          departmentId: input.departmentId,
          jobTitleId: jobTitle.id,
          role: input.role,
          isActive: input.isActive,
          allowanceDays: input.allowanceDays,
          year: input.year,
          passwordReset: Boolean(passwordHash),
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const errors: Record<string, string> = {
      NOT_FOUND: "Сотрудник не найден",
      DEPARTMENT_NOT_FOUND: "Подразделение не найдено или неактивно",
      JOB_TITLE_NOT_FOUND: "Должность не найдена или отключена",
      ALLOWANCE_BELOW_USED:
        "Нельзя установить дней меньше, чем уже выбрано в плане",
    };
    return NextResponse.json(
      { error: errors[message] ?? "Не удалось сохранить сотрудника" },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
