import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { db } from "@/db/client";
import { overtimeReports, users, vacationPlans } from "@/db/schema";
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

export default async function HrPage() {
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
    })
    .from(overtimeReports)
    .innerJoin(users, eq(users.id, overtimeReports.userId))
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
    })
    .from(vacationPlans)
    .innerJoin(users, eq(users.id, vacationPlans.userId))
    .where(
      inArray(vacationPlans.status, ["submitted", "hr_proposed", "reopened"]),
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
  const items = [
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
  return (
    <AppShell>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Кадровая служба</p>
          <h1>Что требует решения</h1>
          <p className="lead">
            Очередь объединяет отчёты и отпускные планы. Сначала показаны
            просроченные записи, кадровые предложения и конфликты.
          </p>
        </div>
        <button className="primaryButton">Напомнить сотрудникам</button>
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
          <span>Отпуска с конфликтом</span>
          <strong>{absenceRisks.length}</strong>
          <em>
            {absenceRisks.length
              ? `${new Set(absenceRisks.map((risk) => risk.departmentId)).size} отделов требуют внимания`
              : "превышений правил нет"}
          </em>
        </article>
        <article className={`card ${styles.metric}`}>
          <span>Согласовано за месяц</span>
          <strong>
            {items.filter((item) => item.status === "approved").length}
          </strong>
        </article>
      </section>
      <div className={styles.dashboard}>
        <section className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h2>Очередь согласования</h2>
            <div className={styles.filters}>
              <button className={`${styles.filter} ${styles.filterActive}`}>
                Все
              </button>
              <button className={styles.filter}>Сверхурочные</button>
              <button className={styles.filter}>Отпуска</button>
            </div>
          </div>
          <div className={styles.queue}>
            {items.map((item) => (
              <article className={styles.item} key={item.id}>
                <div className={styles.person}>
                  <strong>{item.fullName}</strong>
                  <span>Информационные технологии</span>
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
            <h2>Пересечения</h2>
          </div>
          {absenceRisks.length ? (
            <div className={styles.overlapList}>
              {absenceRisks.slice(0, 3).map((risk) => (
                <article
                  className={styles.overlap}
                  key={`${risk.departmentId}-${risk.startsOn}`}
                >
                  <div className={styles.overlapHead}>
                    <strong>
                      {risk.criticalAbsent
                        ? "Критический риск"
                        : "Превышен лимит"}
                    </strong>
                    <span>{formatRange(risk.startsOn, risk.endsOn)}</span>
                  </div>
                  <h3>{risk.departmentName}</h3>
                  <p>
                    {risk.reason}. Всего в отделе: {risk.headcount}.
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
                Отправленные и утверждённые планы укладываются в правила
                отделов.
              </p>
            </div>
          )}
          <p className={styles.note}>
            Расчёт выполняется по реальным периодам, назначениям сотрудников и
            последнему правилу каждого отдела.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
