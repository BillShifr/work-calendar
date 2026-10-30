import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  approvalEvents,
  auditEvents,
  revisions,
  vacationPeriods,
  vacationPlans,
} from "@/db/schema";
import {
  assertVacationAllowance,
  periodsOverlap,
  totalPeriodDays,
} from "@/domain/vacation";
import { requireHr } from "@/lib/auth";

const periodSchema = z.object({
  id: z.string().min(1),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  source: z.enum(["employee", "hr"]),
});
const bodySchema = z.object({
  year: z.number().int(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  periods: z.array(periodSchema).max(12),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/hr/vacations/[id]">,
) {
  const actor = await requireHr();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Укажите причину и проверьте периоды" },
      { status: 400 },
    );
  const { periods, reason, version } = parsed.data;
  const overlap = periods.some(
    (period, index) =>
      period.endsOn < period.startsOn ||
      periods.some(
        (candidate, candidateIndex) =>
          index !== candidateIndex && periodsOverlap(period, candidate),
      ),
  );
  if (overlap)
    return NextResponse.json(
      { error: "Периоды не должны пересекаться" },
      { status: 400 },
    );
  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute<{
        id: string;
        version: number;
        status: "submitted" | "reopened" | "hr_proposed";
        allowanceDays: number;
      }>(
        sql`SELECT id, version, status, allowance_days AS "allowanceDays" FROM vacation_plans WHERE id=${id} AND organization_id=${actor.organizationId} FOR UPDATE`,
      );
      const plan = rows[0];
      if (!plan) throw new Error("NOT_FOUND");
      if (plan.version !== version) throw new Error("VERSION_CONFLICT");
      assertVacationAllowance(periods, plan.allowanceDays);
      if (!["submitted", "reopened", "hr_proposed"].includes(plan.status))
        throw new Error("READ_ONLY");
      await tx.delete(vacationPeriods).where(eq(vacationPeriods.planId, id));
      if (periods.length)
        await tx.insert(vacationPeriods).values(
          periods.map((period) => ({
            planId: id,
            startsOn: period.startsOn,
            endsOn: period.endsOn,
            source: "hr" as const,
          })),
        );
      const nextVersion = version + 1;
      await tx
        .update(vacationPlans)
        .set({
          status: "hr_proposed",
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(
          and(eq(vacationPlans.id, id), eq(vacationPlans.version, version)),
        );
      const snapshot = {
        periods: periods.map((period) => ({
          ...period,
          source: "hr" as const,
        })),
        totalDays: totalPeriodDays(periods),
      };
      await tx.insert(revisions).values({
        aggregateType: "vacation_plan",
        aggregateId: id,
        version: nextVersion,
        actorId: actor.id,
        actorRole: actor.role,
        reason,
        snapshot,
      });
      await tx.insert(approvalEvents).values({
        aggregateType: "vacation_plan",
        aggregateId: id,
        fromStatus: plan.status,
        toStatus: "hr_proposed",
        actorId: actor.id,
        comment: reason,
      });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "vacation.hr_proposed",
        objectType: "vacation_plan",
        objectId: id,
        metadata: { version: nextVersion },
      });
      return {
        version: nextVersion,
        status: "hr_proposed",
        periods: snapshot.periods,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "VERSION_CONFLICT"
            ? "План изменился. Обновите страницу."
            : message === "ALLOWANCE_EXCEEDED"
              ? "Количество дней превышает доступный лимит"
              : message === "NOT_FOUND"
                ? "План не найден"
                : "План сейчас нельзя редактировать",
      },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
