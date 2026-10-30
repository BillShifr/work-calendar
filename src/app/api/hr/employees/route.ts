import { hash } from "@node-rs/argon2";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  departmentAssignments,
  departments,
  jobTitles,
  users,
  vacationPlans,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  fullName: z.string().trim().min(3).max(160),
  login: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9._-]+$/),
  temporaryPassword: z.string().min(12).max(200),
  departmentId: z.uuid(),
  jobTitleId: z.uuid(),
  role: z.enum(["employee", "department_head", "hr"]),
  isCritical: z.boolean(),
  allowanceDays: z.number().int().min(0).max(366),
  year: z.number().int().min(2020).max(2100),
});

export async function POST(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте обязательные поля и пароль не короче 12 символов" },
      { status: 400 },
    );
  const input = parsed.data;
  const passwordHash = await hash(input.temporaryPassword, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  try {
    const result = await db.transaction(async (tx) => {
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
      const [created] = await tx
        .insert(users)
        .values({
          organizationId: actor.organizationId,
          login: input.login,
          fullName: input.fullName,
          passwordHash,
          role: input.role,
        })
        .returning({ id: users.id });
      const validFrom = new Date().toISOString().slice(0, 10);
      await tx.insert(departmentAssignments).values({
        userId: created.id,
        departmentId: department.id,
        jobTitleId: jobTitle.id,
        validFrom,
        jobTitle: jobTitle.name,
        isCritical: input.isCritical,
      });
      await tx.insert(vacationPlans).values({
        organizationId: actor.organizationId,
        userId: created.id,
        year: input.year,
        allowanceDays: input.allowanceDays,
      });
      const reopenedApprovals = await tx.execute<{ id: string }>(sql`
        UPDATE department_quarter_approvals
        SET status='reopened', approved_by=NULL, approved_at=NULL,
          version=version + 1, updated_at=now()
        WHERE organization_id=${actor.organizationId}
          AND department_id=${department.id}
          AND status='approved'
          AND (make_date(year, quarter * 3, 1) + interval '1 month - 1 day')::date >= ${validFrom}
        RETURNING id
      `);
      if (reopenedApprovals.length)
        await tx.insert(auditEvents).values(
          reopenedApprovals.map((approval) => ({
            organizationId: actor.organizationId,
            actorId: actor.id,
            action: "department_quarter.reopened",
            objectType: "department_quarter_approval",
            objectId: approval.id,
            metadata: { reason: "employee_added", userId: created.id },
          })),
        );
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "employee.created",
        objectType: "user",
        objectId: created.id,
        metadata: {
          departmentId: department.id,
          jobTitleId: jobTitle.id,
          role: input.role,
          allowanceDays: input.allowanceDays,
          year: input.year,
        },
      });
      return { id: created.id };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "DEPARTMENT_NOT_FOUND"
            ? "Подразделение не найдено или неактивно"
            : message === "JOB_TITLE_NOT_FOUND"
              ? "Должность не найдена или отключена"
              : message.includes("users_org_login_uq")
                ? "Такой логин уже используется"
                : "Не удалось создать сотрудника",
      },
      {
        status:
          message === "DEPARTMENT_NOT_FOUND" ||
          message === "JOB_TITLE_NOT_FOUND"
            ? 404
            : 409,
      },
    );
  }
}
