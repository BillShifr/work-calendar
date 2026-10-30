import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { db } from "@/db/client";
import {
  departmentAssignments,
  departments,
  overtimeReports,
  users,
  vacationPlans,
} from "@/db/schema";
import { getOrganizationAbsenceRisks } from "@/domain/absence-risk-service";
import { requireHr } from "@/lib/auth";
import styles from "./hr.module.css";

export const metadata: Metadata = { title: "Кабинет кадровика" };
const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const formatRange = (startsOn: string, endsOn: string) =>
  startsOn === endsOn
    ? formatShortDate(startsOn)
    : `${formatShortDate(startsOn)} — ${formatShortDate(endsOn)}`;

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const selectedType = (await searchParams).type;
  const hr = await requireHr();
  const [actionableCounts] = await db.execute<{
    overtime: number;
    vacations: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM overtime_reports
       WHERE overtime_reports.organization_id = ${hr.organizationId}
         AND overtime_reports.status IN ('submitted', 'reopened')
         AND EXISTS (
           SELECT 1 FROM department_quarter_approvals approval
           WHERE approval.department_id = overtime_reports.department_id
             AND approval.year = overtime_reports.year
             AND approval.quarter = CEIL(overtime_reports.month / 3.0)::int
             AND approval.status = 'approved'
         )) AS overtime,
      (SELECT COUNT(*)::int FROM vacation_plans
       WHERE organization_id = ${hr.organizationId}
         AND status IN ('submitted', 'reopened')) AS vacations
  `);
  const [employees] = await db
    .select({ value: count() })
    .from(users)
    .where(
      and(
        eq(users.organizationId, hr.organizationId),
        eq(users.isActive, true),
      ),
    );
  const overtime = await db
    .select({
      id: overtimeReports.id,
      status: overtimeReports.status,
      year: overtimeReports.year,
      month: overtimeReports.month,
      updatedAt: overtimeReports.updatedAt,
      fullName: users.fullName,
      departmentName: departments.name,
      totalMinutes: sql<number>`COALESCE((SELECT SUM(entry.minutes) FROM overtime_entries entry WHERE entry.report_id = ${overtimeReports.id}), 0)::int`,
    })
    .from(overtimeReports)
    .innerJoin(users, eq(users.id, overtimeReports.userId))
    .leftJoin(
      departmentAssignments,
      and(
        eq(departmentAssignments.userId, users.id),
        isNull(departmentAssignments.validTo),
      ),
    )
    .leftJoin(
      departments,
      eq(departments.id, departmentAssignments.departmentId),
    )
    .where(
      and(
        eq(overtimeReports.organizationId, hr.organizationId),
        inArray(overtimeReports.status, ["submitted", "reopened"]),
        sql`EXISTS (
          SELECT 1 FROM department_quarter_approvals approval
          WHERE approval.department_id = ${overtimeReports.departmentId}
            AND approval.year = ${overtimeReports.year}
            AND approval.quarter = CEIL(${overtimeReports.month} / 3.0)::int
            AND approval.status = 'approved'
        )`,
      ),
    )
    .orderBy(overtimeReports.updatedAt)
    .limit(8);
  const vacations = await db
    .select({
      id: vacationPlans.id,
      status: vacationPlans.status,
      year: vacationPlans.year,
      updatedAt: vacationPlans.updatedAt,
      fullName: users.fullName,
      departmentName: departments.name,
      totalDays: sql<number>`COALESCE((SELECT SUM((period.ends_on - period.starts_on) + 1) FROM vacation_periods period WHERE period.plan_id = ${vacationPlans.id}), 0)::int`,
    })
    .from(vacationPlans)
    .innerJoin(users, eq(users.id, vacationPlans.userId))
    .leftJoin(
      departmentAssignments,
      and(
        eq(departmentAssignments.userId, users.id),
        isNull(departmentAssignments.validTo),
      ),
    )
    .leftJoin(
      departments,
      eq(departments.id, departmentAssignments.departmentId),
    )
    .where(
      and(
        eq(vacationPlans.organizationId, hr.organizationId),
        inArray(vacationPlans.status, ["submitted", "reopened"]),
      ),
    )
    .orderBy(vacationPlans.updatedAt)
    .limit(8);
  const [{ value: waitingEmployee }] = await db
    .select({ value: count() })
    .from(vacationPlans)
    .where(
      and(
        eq(vacationPlans.organizationId, hr.organizationId),
        eq(vacationPlans.status, "hr_proposed"),
      ),
    );
  const [{ value: waitingOvertimeEmployee }] = await db
    .select({ value: count() })
    .from(overtimeReports)
    .where(
      and(
        eq(overtimeReports.organizationId, hr.organizationId),
        eq(overtimeReports.status, "hr_proposed"),
      ),
    );
  const awaiting = actionableCounts.overtime + actionableCounts.vacations;
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Yekaterinburg",
      year: "numeric",
    }).format(new Date()),
  );
  const absenceRisks = await getOrganizationAbsenceRisks(
    hr.organizationId,
    currentYear,
  );
  const departmentsWithOverlaps = new Set(
    absenceRisks.map((risk) => risk.departmentId),
  ).size;
  const allItems = [
    ...vacations.map((item) => ({
      ...item,
      kind: "vacation" as const,
      title: `План отпуска · ${item.year}`,
      summary: `${item.totalDays} дн. выбрано`,
      href: `/hr/vacations/${item.id}`,
    })),
    ...overtime.map((item) => ({
      ...item,
      kind: "overtime" as const,
      title: `Внеурочное время · ${String(item.month).padStart(2, "0")}.${item.year}`,
      summary: `${item.totalMinutes} мин. указано`,
      href: `/hr/overtime/${item.id}`,
    })),
  ];
  const items = allItems.filter((item) =>
    selectedType === "overtime"
      ? item.kind === "overtime"
      : selectedType === "vacation"
        ? item.kind === "vacation"
        : true,
  );
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Кабинет кадровика</h1>
      </header>
      <section className={styles.metrics} aria-label="Сводка">
        <article className={`card ${styles.metric}`}>
          <span>Требуют решения</span>
          <strong>{awaiting}</strong>
        </article>
        <article className={`card ${styles.metric}`}>
          <span>Активных сотрудников</span>
          <strong>{employees.value}</strong>
        </article>
        <article className={`card ${styles.metric}`}>
          <span>Подразделения с пересечениями</span>
          <strong>{departmentsWithOverlaps}</strong>
          <em>
            {absenceRisks.length
              ? `${absenceRisks.length} периодов пересекаются`
              : "пересечений нет"}
          </em>
        </article>
        <article className={`card ${styles.metric}`}>
          <span>Ждём ответа сотрудника</span>
          <strong>{waitingEmployee + waitingOvertimeEmployee}</strong>
        </article>
      </section>
      <div className={styles.dashboard}>
        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2>Очередь согласования</h2>
            <div className={styles.filters}>
              <Link
                href="/hr"
                className={`${styles.filter} ${!selectedType ? styles.filterActive : ""}`}
              >
                Все
              </Link>
              <Link
                href="/hr?type=overtime"
                className={`${styles.filter} ${selectedType === "overtime" ? styles.filterActive : ""}`}
              >
                Внеурочное время
              </Link>
              <Link
                href="/hr?type=vacation"
                className={`${styles.filter} ${selectedType === "vacation" ? styles.filterActive : ""}`}
              >
                Отпуска
              </Link>
            </div>
          </div>
          <div className={styles.queue}>
            {items.map((item) => (
              <article className={styles.item} key={item.id}>
                <div className={styles.person}>
                  <strong>{item.fullName}</strong>
                  <span>{item.departmentName ?? "Без подразделения"}</span>
                </div>
                <div className={styles.detail}>
                  {item.title}
                  <br />
                  {item.summary} · отправлено{" "}
                  {item.updatedAt.toLocaleDateString("ru-RU")}
                </div>
                <Link className={styles.open} href={item.href}>
                  {item.kind === "vacation"
                    ? "Проверить отпуск"
                    : "Проверить время"}
                </Link>
              </article>
            ))}
            {!items.length && (
              <p className={styles.emptyQueue}>
                Новых решений от вас не требуется.
              </p>
            )}
          </div>
        </section>
        <aside className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2>Пересечения отпусков</h2>
          </div>
          {absenceRisks.length ? (
            <div className={styles.overlapList}>
              {absenceRisks.slice(0, 6).map((risk) => (
                <article
                  className={styles.overlap}
                  key={`${risk.departmentId}-${risk.startsOn}`}
                >
                  <div className={styles.overlapHead}>
                    <strong>
                      {risk.criticalAbsent
                        ? "Критичная роль в отпуске"
                        : `${risk.peakAbsent} сотрудников одновременно`}
                    </strong>
                    <span>{formatRange(risk.startsOn, risk.endsOn)}</span>
                  </div>
                  <h3>{risk.departmentName}</h3>
                  <p>
                    {risk.reason}. Штат подразделения: {risk.headcount}.
                  </p>
                  <small>{risk.employeeNames.join(", ")}</small>
                  <div
                    className={styles.calendarStrip}
                    aria-label="Дни конфликта"
                  >
                    {risk.days.slice(0, 7).map((day) => (
                      <span className={styles.risk} key={day}>
                        {formatShortDate(day)}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.noOverlap}>
              <span aria-hidden="true">✓</span>
              <strong>Пересечений нет</strong>
              <p>
                В отправленных и утверждённых планах нет одновременных отпусков
                внутри подразделений.
              </p>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
