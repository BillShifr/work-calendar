import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  approvalEvents,
  auditEvents,
  overtimeEntries,
  overtimeReports,
  revisions,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";
import { MAX_OVERTIME_MINUTES_PER_DAY } from "@/domain/overtime";

const overtimeTotalSchema = z
  .number()
  .int()
  .min(5)
  .max(MAX_OVERTIME_MINUTES_PER_DAY)
  .multipleOf(5);

const bodySchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  version: z.number().int().positive(),
  zeroConfirmed: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
  entries: z.record(z.iso.date(), overtimeTotalSchema),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/hr/overtime/[id]">,
) {
  const actor = await requireHr();
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Укажите причину и проверьте значения" },
      { status: 400 },
    );
  const { entries, month, reason, version, year, zeroConfirmed } = parsed.data;
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  if (Object.keys(entries).some((date) => !date.startsWith(prefix)))
    return NextResponse.json(
      { error: "Все даты должны относиться к отчётному месяцу" },
      { status: 400 },
    );
  try {
    const result = await db.transaction(async (tx) => {
      const [report] = await tx.execute<{
        id: string;
        version: number;
        status: "submitted" | "reopened" | "hr_proposed";
        year: number;
        month: number;
      }>(
        sql`SELECT id, version, status, year, month FROM overtime_reports WHERE id=${id} AND organization_id=${actor.organizationId} FOR UPDATE`,
      );
      if (!report) throw new Error("NOT_FOUND");
      if (report.year !== year || report.month !== month)
        throw new Error("PERIOD_MISMATCH");
      if (report.version !== version) throw new Error("VERSION_CONFLICT");
      if (!["submitted", "reopened", "hr_proposed"].includes(report.status))
        throw new Error("READ_ONLY");

      const values = Object.entries(entries);
      await tx.delete(overtimeEntries).where(eq(overtimeEntries.reportId, id));
      if (values.length)
        await tx.insert(overtimeEntries).values(
          values.map(([workDate, minutes]) => ({
            reportId: id,
            workDate,
            minutes,
            source: actor.role,
          })),
        );
      const nextVersion = version + 1;
      await tx
        .update(overtimeReports)
        .set({
          status: "hr_proposed",
          version: nextVersion,
          zeroConfirmed: values.length ? false : zeroConfirmed,
          updatedAt: new Date(),
        })
        .where(
          and(eq(overtimeReports.id, id), eq(overtimeReports.version, version)),
        );
      const snapshot = {
        entries,
        sources: Object.fromEntries(values.map(([date]) => [date, "hr"])),
        zeroConfirmed: values.length ? false : zeroConfirmed,
      };
      await tx.insert(revisions).values({
        aggregateType: "overtime_report",
        aggregateId: id,
        version: nextVersion,
        actorId: actor.id,
        actorRole: actor.role,
        reason,
        snapshot,
      });
      await tx.insert(approvalEvents).values({
        aggregateType: "overtime_report",
        aggregateId: id,
        fromStatus: report.status,
        toStatus: "hr_proposed",
        actorId: actor.id,
        comment: reason,
      });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "overtime.hr_proposed",
        objectType: "overtime_report",
        objectId: id,
        metadata: { version: nextVersion },
      });
      return {
        version: nextVersion,
        status: "hr_proposed",
        ...snapshot,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "VERSION_CONFLICT"
            ? "Отчёт изменился. Обновите страницу."
            : message === "PERIOD_MISMATCH"
              ? "Отчётный период не совпадает"
              : message === "NOT_FOUND"
                ? "Отчёт не найден"
                : "Отчёт сейчас нельзя редактировать",
      },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
