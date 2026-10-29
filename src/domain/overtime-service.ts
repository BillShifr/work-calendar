import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  overtimeEntries,
  overtimeReports,
  revisions,
} from "@/db/schema";
import { isOvertimeMinutes } from "./overtime";

export async function getOvertimeReport(
  user: { id: string; organizationId: string },
  year: number,
  month: number,
) {
  let [report] = await db
    .select()
    .from(overtimeReports)
    .where(
      and(
        eq(overtimeReports.userId, user.id),
        eq(overtimeReports.year, year),
        eq(overtimeReports.month, month),
      ),
    )
    .limit(1);
  if (!report) {
    const [created] = await db
      .insert(overtimeReports)
      .values({
        organizationId: user.organizationId,
        userId: user.id,
        year,
        month,
      })
      .onConflictDoNothing({
        target: [
          overtimeReports.userId,
          overtimeReports.year,
          overtimeReports.month,
        ],
      })
      .returning();
    if (created) report = created;
    else
      [report] = await db
        .select()
        .from(overtimeReports)
        .where(
          and(
            eq(overtimeReports.userId, user.id),
            eq(overtimeReports.year, year),
            eq(overtimeReports.month, month),
          ),
        )
        .limit(1);
  }
  const entries = await db
    .select()
    .from(overtimeEntries)
    .where(eq(overtimeEntries.reportId, report.id));
  return {
    ...report,
    entries: Object.fromEntries(
      entries.map((entry) => [entry.workDate, entry.minutes]),
    ),
  };
}

export async function saveOvertimeReport(input: {
  user: { id: string; organizationId: string };
  year: number;
  month: number;
  version: number;
  entries: Record<string, number>;
  zeroConfirmed: boolean;
}) {
  return db.transaction(async (tx) => {
    const [locked] = await tx.execute<{
      id: string;
      version: number;
      status: string;
    }>(
      sql`SELECT id, version, status FROM overtime_reports WHERE user_id = ${input.user.id} AND year = ${input.year} AND month = ${input.month} FOR UPDATE`,
    );
    if (!locked) throw new Error("REPORT_NOT_FOUND");
    if (locked.version !== input.version) throw new Error("VERSION_CONFLICT");
    if (!["draft", "reopened", "rejected", "withdrawn"].includes(locked.status))
      throw new Error("REPORT_READ_ONLY");
    const validEntries = Object.entries(input.entries).filter(([, minutes]) =>
      isOvertimeMinutes(minutes),
    );
    await tx
      .delete(overtimeEntries)
      .where(eq(overtimeEntries.reportId, locked.id));
    if (validEntries.length)
      await tx.insert(overtimeEntries).values(
        validEntries.map(([workDate, minutes]) => ({
          reportId: locked.id,
          workDate,
          minutes,
          source: "employee" as const,
        })),
      );
    const nextVersion = locked.version + 1;
    const [report] = await tx
      .update(overtimeReports)
      .set({
        version: nextVersion,
        zeroConfirmed: validEntries.length ? false : input.zeroConfirmed,
        updatedAt: new Date(),
      })
      .where(eq(overtimeReports.id, locked.id))
      .returning();
    const snapshot = {
      entries: Object.fromEntries(validEntries),
      zeroConfirmed: report.zeroConfirmed,
    };
    await tx.insert(revisions).values({
      aggregateType: "overtime_report",
      aggregateId: locked.id,
      version: nextVersion,
      actorId: input.user.id,
      actorRole: "employee",
      snapshot,
    });
    await tx.insert(auditEvents).values({
      organizationId: input.user.organizationId,
      actorId: input.user.id,
      action: "overtime.saved",
      objectType: "overtime_report",
      objectId: locked.id,
      metadata: { version: nextVersion },
    });
    return {
      version: nextVersion,
      entries: snapshot.entries,
      zeroConfirmed: report.zeroConfirmed,
    };
  });
}
