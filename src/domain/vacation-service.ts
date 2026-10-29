import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  revisions,
  vacationPeriods,
  vacationPlans,
} from "@/db/schema";
import { periodDays, periodsOverlap, type DatePeriod } from "./vacation";

export async function getVacationPlan(
  user: { id: string; organizationId: string },
  year: number,
) {
  let [plan] = await db
    .select()
    .from(vacationPlans)
    .where(and(eq(vacationPlans.userId, user.id), eq(vacationPlans.year, year)))
    .limit(1);
  if (!plan) {
    const [created] = await db
      .insert(vacationPlans)
      .values({ organizationId: user.organizationId, userId: user.id, year })
      .onConflictDoNothing({
        target: [vacationPlans.userId, vacationPlans.year],
      })
      .returning();
    if (created) plan = created;
    else
      [plan] = await db
        .select()
        .from(vacationPlans)
        .where(
          and(eq(vacationPlans.userId, user.id), eq(vacationPlans.year, year)),
        )
        .limit(1);
  }
  const periods = await db
    .select()
    .from(vacationPeriods)
    .where(eq(vacationPeriods.planId, plan.id));
  return {
    ...plan,
    periods: periods.map((period) => ({
      id: period.id,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      source:
        period.source === "hr" || period.source === "hr_lead"
          ? ("hr" as const)
          : ("employee" as const),
    })),
  };
}

export async function saveVacationPlan(input: {
  user: { id: string; organizationId: string };
  year: number;
  version: number;
  periods: DatePeriod[];
}) {
  for (let index = 0; index < input.periods.length; index += 1) {
    const period = input.periods[index];
    if (
      !period.startsOn.startsWith(`${input.year}-`) ||
      !period.endsOn.startsWith(`${input.year}-`)
    )
      throw new Error("PERIOD_OUTSIDE_YEAR");
    if (period.endsOn < period.startsOn) throw new Error("INVALID_PERIOD");
    if (
      input.periods.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index && periodsOverlap(period, candidate),
      )
    )
      throw new Error("PERIODS_OVERLAP");
  }
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      id: string;
      version: number;
      status: string;
    }>(
      sql`SELECT id, version, status FROM vacation_plans WHERE user_id = ${input.user.id} AND year = ${input.year} FOR UPDATE`,
    );
    const locked = rows[0];
    if (!locked) throw new Error("PLAN_NOT_FOUND");
    if (locked.version !== input.version) throw new Error("VERSION_CONFLICT");
    if (
      !["draft", "reopened", "rejected", "withdrawn", "hr_proposed"].includes(
        locked.status,
      )
    )
      throw new Error("PLAN_READ_ONLY");
    await tx
      .delete(vacationPeriods)
      .where(eq(vacationPeriods.planId, locked.id));
    const normalizedPeriods = input.periods.map((period) => ({
      ...period,
      source: "employee" as const,
    }));
    if (normalizedPeriods.length)
      await tx.insert(vacationPeriods).values(
        normalizedPeriods.map((period) => ({
          planId: locked.id,
          startsOn: period.startsOn,
          endsOn: period.endsOn,
          source: "employee" as const,
        })),
      );
    const nextVersion = locked.version + 1;
    const nextStatus =
      locked.status === "hr_proposed" ? "submitted" : locked.status;
    await tx
      .update(vacationPlans)
      .set({
        version: nextVersion,
        status: nextStatus as
          "submitted" | "draft" | "reopened" | "rejected" | "withdrawn",
        updatedAt: new Date(),
      })
      .where(eq(vacationPlans.id, locked.id));
    const snapshot = {
      periods: normalizedPeriods,
      totalDays: input.periods.reduce(
        (sum, period) => sum + periodDays(period),
        0,
      ),
    };
    await tx.insert(revisions).values({
      aggregateType: "vacation_plan",
      aggregateId: locked.id,
      version: nextVersion,
      actorId: input.user.id,
      actorRole: "employee",
      snapshot,
    });
    await tx.insert(auditEvents).values({
      organizationId: input.user.organizationId,
      actorId: input.user.id,
      action: "vacation.saved",
      objectType: "vacation_plan",
      objectId: locked.id,
      metadata: { version: nextVersion },
    });
    return {
      version: nextVersion,
      status: nextStatus,
      periods: normalizedPeriods,
    };
  });
}
