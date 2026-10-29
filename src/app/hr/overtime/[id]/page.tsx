import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OvertimeCalendar } from "@/components/OvertimeCalendar";
import { db } from "@/db/client";
import {
  approvalEvents,
  overtimeEntries,
  overtimeReports,
  users,
} from "@/db/schema";
import { requireHr } from "@/lib/auth";
import styles from "./review.module.css";

const statusLabels: Record<string, string> = {
  submitted: "Ожидает проверки",
  hr_proposed: "Ожидает сотрудника",
  reopened: "Открыто повторно",
  approved: "Утверждено",
};

export default async function HrOvertimePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireHr();
  const { id } = await params;
  const [report] = await db
    .select({
      id: overtimeReports.id,
      year: overtimeReports.year,
      month: overtimeReports.month,
      version: overtimeReports.version,
      status: overtimeReports.status,
      zeroConfirmed: overtimeReports.zeroConfirmed,
      fullName: users.fullName,
    })
    .from(overtimeReports)
    .innerJoin(users, eq(users.id, overtimeReports.userId))
    .where(
      and(
        eq(overtimeReports.id, id),
        eq(overtimeReports.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  if (!report) notFound();
  const [rows, history] = await Promise.all([
    db.select().from(overtimeEntries).where(eq(overtimeEntries.reportId, id)),
    db
      .select({
        id: approvalEvents.id,
        fromStatus: approvalEvents.fromStatus,
        toStatus: approvalEvents.toStatus,
        comment: approvalEvents.comment,
        createdAt: approvalEvents.createdAt,
        actorName: users.fullName,
      })
      .from(approvalEvents)
      .innerJoin(users, eq(users.id, approvalEvents.actorId))
      .where(
        and(
          eq(approvalEvents.aggregateType, "overtime_report"),
          eq(approvalEvents.aggregateId, id),
        ),
      )
      .orderBy(desc(approvalEvents.createdAt))
      .limit(10),
  ]);
  const initial = {
    ...report,
    entries: Object.fromEntries(rows.map((row) => [row.workDate, row.minutes])),
    sources: Object.fromEntries(
      rows.map((row) => [
        row.workDate,
        row.source === "employee" ? "employee" : "hr",
      ]),
    ) as Record<string, "hr" | "employee">,
  };
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">
            Кадровая проверка · {String(report.month).padStart(2, "0")}.
            {report.year}
          </p>
          <h1>{report.fullName}</h1>
          <p className="lead">
            Уточните отдельные дни прямо в крупном календаре и объясните
            причину. Сотрудник увидит изменённые значения янтарным цветом.
          </p>
        </div>
        <span className="statusPill">
          {statusLabels[report.status] ?? report.status} · версия{" "}
          {report.version}
        </span>
      </header>
      <OvertimeCalendar initial={initial} mode="hr" />
      <section className={`card ${styles.history}`}>
        <div>
          <p className="eyebrow">Прозрачное согласование</p>
          <h2>История решений</h2>
        </div>
        {history.length ? (
          <ol>
            {history.map((event) => (
              <li key={event.id}>
                <span>{event.createdAt.toLocaleString("ru-RU")}</span>
                <strong>{event.actorName}</strong>
                <p>
                  {statusLabels[event.fromStatus] ?? event.fromStatus} →{" "}
                  {statusLabels[event.toStatus] ?? event.toStatus}
                </p>
                {event.comment && <blockquote>{event.comment}</blockquote>}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.empty}>Это первая кадровая проверка отчёта.</p>
        )}
      </section>
    </AppShell>
  );
}
