import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { db } from "@/db/client";
import { overtimeReports, users, vacationPlans } from "@/db/schema";
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
          <strong>1</strong>
          <em>в одном отделе</em>
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
          <div className={styles.overlap}>
            <div className={styles.overlapHead}>
              <strong>Высокий риск</strong>
              <span>ИТ · май 2027</span>
            </div>
            <p>
              Одновременно отсутствуют 4 из 12 сотрудников. Правило отдела
              допускает не более трёх.
            </p>
            <div className={styles.calendarStrip}>
              {[12, 13, 14, 15, 16, 17, 18].map((day) => (
                <span
                  className={day >= 14 && day <= 16 ? styles.risk : ""}
                  key={day}
                >
                  {day}
                </span>
              ))}
            </div>
          </div>
          <p className={styles.note}>
            Цвет дополнен текстовой оценкой риска. Из конфликта кадровик
            перейдёт к планам конкретных сотрудников.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
