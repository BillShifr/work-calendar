import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
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
const labels: Record<string, string> = {
  draft: "Черновик",
  submitted: "Ожидает проверки",
  hr_proposed: "Ожидает сотрудника",
  approved: "Утверждено",
  rejected: "Отклонено",
  reopened: "Открыто повторно",
  withdrawn: "Отозвано",
};
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
  const [employees] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.organizationId, hr.organizationId));
  const overtime = await db
    .select({
      id: overtimeReports.id,
      status: overtimeReports.status,
      year: overtimeReports.year,
      month: overtimeReports.month,
      updatedAt: overtimeReports.updatedAt,
      fullName: users.fullName,
      departmentName: departments.name,
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
        inArray(overtimeReports.status, [
          "submitted",
          "hr_proposed",
          "reopened",
        ]),
      ),
    )
    .limit(8);
  const vacations = await db
    .select({
      id: vacationPlans.id,
      status: vacationPlans.status,
      year: vacationPlans.year,
      updatedAt: vacationPlans.updatedAt,
      fullName: users.fullName,
      departmentName: departments.name,
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
        inArray(vacationPlans.status, ["submitted", "hr_proposed", "reopened"]),
      ),
    )
    .limit(8);
  const awaiting = overtime.length + vacations.length;
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
      href: `/hr/vacations/${item.id}`,
    })),
    ...overtime.map((item) => ({
      ...item,
      kind: "overtime" as const,
      title: `Внеурочное время · ${String(item.month).padStart(2, "0")}.${item.year}`,
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
          <em>сначала просроченные</em>
        </article>
        <article className={`card ${styles.metric}`}>
          <span>Сотрудников</span>
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
          <span>Согласовано за месяц</span>
          <strong>
            {allItems.filter((item) => item.status === "approved").length}
          </strong>
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
                  Изменено {item.updatedAt.toLocaleDateString("ru-RU")}
                </div>
                <span
                  className={`${styles.state} ${item.status === "approved" ? styles.stateGreen : ""}`}
                >
                  {labels[item.status]}
                </span>
                <Link className={styles.open} href={item.href}>
                  Открыть
                </Link>
              </article>
            ))}
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
