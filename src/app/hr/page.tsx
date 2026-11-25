import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Clock3,
  Download,
  UsersRound,
} from "lucide-react";
import { and, count, eq, sql } from "drizzle-orm";
import { AppShell } from "@/components/AppShell";
import { DepartmentApprovalDashboard } from "@/components/DepartmentApprovalDashboard";
import { db } from "@/db/client";
import {
  departments,
  overtimeReports,
  users,
  vacationPlans,
} from "@/db/schema";
import { getOrganizationAbsenceRisks } from "@/domain/absence-risk-service";
import { getDepartmentApprovalDashboard } from "@/domain/department-approval-service";
import { getDepartmentVacationBoard } from "@/domain/department-vacation-board";
import { HrAbsenceOverlapPanel } from "@/components/HrAbsenceOverlapPanel";
import { requireHr } from "@/lib/auth";
import styles from "./hr.module.css";

export const metadata: Metadata = { title: "Кабинет кадровика" };

const groups = [
  { id: "department", label: "По отделам" },
  { id: "employee", label: "По сотрудникам" },
  { id: "all", label: "Все скопом" },
] as const;

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; group?: string; year?: string }>;
}) {
  const params = await searchParams;
  const documentType = params.type === "overtime" ? "overtime" : "vacation";
  const selectedGroup =
    params.group === "employee" || params.group === "all"
      ? params.group
      : "department";
  const hr = await requireHr();
  const requestedYear = Number(params.year);
  const currentYear = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Yekaterinburg",
      year: "numeric",
    }).format(new Date()),
  );
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2020 &&
    requestedYear <= 2100
      ? requestedYear
      : currentYear;
  const vacationYear = year + 1;
  const [actionableCounts] = await db.execute<{
    overtime: number;
    vacations: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM overtime_reports
       WHERE overtime_reports.organization_id = ${hr.organizationId}
         AND overtime_reports.status IN ('submitted', 'reopened')) AS overtime,
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
  const [
    absenceRisks,
    organizationDepartments,
    overtimeDepartments,
    vacationDepartments,
  ] = await Promise.all([
    getOrganizationAbsenceRisks(hr.organizationId, currentYear),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(
        and(
          eq(departments.organizationId, hr.organizationId),
          eq(departments.isActive, true),
        ),
      )
      .orderBy(departments.name),
    documentType === "vacation"
      ? Promise.resolve([])
      : getDepartmentApprovalDashboard(hr, year, "organization"),
    documentType === "overtime"
      ? Promise.resolve([])
      : getDepartmentVacationBoard(hr, vacationYear, "organization"),
  ]);
  const departmentsWithOverlaps = new Set(
    absenceRisks.map((risk) => risk.departmentId),
  ).size;
  const [exportYearRow] = await db.execute<{ year: number }>(sql`
    SELECT COALESCE(MAX(plan.year), ${currentYear + 1})::int AS year
    FROM vacation_plans plan
    WHERE plan.organization_id = ${hr.organizationId}
      AND plan.status IN (
        'manager_review',
        'submitted',
        'hr_proposed',
        'approved',
        'reopened'
      )
      AND EXISTS (
        SELECT 1 FROM vacation_periods period WHERE period.plan_id = plan.id
      )
  `);
  const vacationExportYear = exportYearRow?.year ?? currentYear + 1;
  const hrefBase = (next: { type?: string; group?: string; year?: number }) => {
    const search = new URLSearchParams();
    const type = next.type ?? documentType;
    const group = next.group ?? selectedGroup;
    const nextYear = next.year ?? year;
    search.set("type", type);
    if (group !== "department") search.set("group", group);
    if (nextYear !== currentYear) search.set("year", String(nextYear));
    return `/hr?${search.toString()}`;
  };
  return (
    <AppShell>
      <header className="pageHeader">
        <h1>Кабинет кадровика</h1>
      </header>
      <dl className={styles.summaryBar} aria-label="Оперативная сводка">
        <div className={styles.summaryItem}>
          <Clock3 aria-hidden="true" size={19} />
          <dt>На рассмотрении</dt>
          <dd>{awaiting}</dd>
        </div>
        <a className={styles.summaryItem} href="/hr/employees">
          <UsersRound aria-hidden="true" size={19} />
          <dt>Сотрудников</dt>
          <dd>{employees.value}</dd>
        </a>
        <a
          className={`${styles.summaryItem} ${departmentsWithOverlaps ? styles.attention : ""}`}
          href="#vacation-overlaps"
        >
          <CalendarRange aria-hidden="true" size={19} />
          <dt>Отделов с пересечениями</dt>
          <dd>{departmentsWithOverlaps}</dd>
        </a>
        <div className={styles.summaryItem}>
          <ArrowRight aria-hidden="true" size={19} />
          <dt>Ответ сотрудника</dt>
          <dd>{waitingEmployee + waitingOvertimeEmployee}</dd>
        </div>
      </dl>
      <div className={styles.dashboard}>
        <section className={`card ${styles.section}`}>
          <div className={styles.toolbar}>
            <div className={styles.toolbarMain}>
              <h2>Согласования</h2>
              <nav className={styles.documentSwitch} aria-label="Документ">
                {(
                  [
                    ["vacation", "Отпуска"],
                    ["overtime", "Внеурочное время"],
                  ] as const
                ).map(([type, label]) => (
                  <Link
                    key={type}
                    href={hrefBase({ type })}
                    aria-current={documentType === type ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <div className={styles.exports}>
                {documentType === "vacation" ? (
                  <a
                    className={styles.export}
                    href={`/api/hr/export/vacations?year=${vacationExportYear}`}
                  >
                    <Download aria-hidden="true" size={18} />
                    Выгрузить отпуска
                  </a>
                ) : (
                  <a
                    className={styles.export}
                    href={`/api/hr/export/overtime?year=${year}`}
                  >
                    <Download aria-hidden="true" size={18} />
                    Выгрузить внеурочное время
                  </a>
                )}
              </div>
            </div>
            <div className={styles.toolbarMeta}>
              <div className={styles.segmentBlock}>
                <span>Вид</span>
                <nav className={styles.segment} aria-label="Группировка">
                  {groups.map((group) => (
                    <Link
                      key={group.id}
                      href={hrefBase({ group: group.id })}
                      aria-current={
                        selectedGroup === group.id ? "page" : undefined
                      }
                    >
                      {group.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </div>
          <DepartmentApprovalDashboard
            departments={overtimeDepartments}
            vacationDepartments={vacationDepartments}
            year={year}
            labelYear={documentType === "vacation" ? vacationYear : year}
            audience="hr"
            group={selectedGroup}
            canDelete
          />
        </section>
        <aside className={`card ${styles.section}`} id="vacation-overlaps">
          <div className={styles.sectionHeader}>
            <h2>Пересечения отпусков</h2>
          </div>
          <HrAbsenceOverlapPanel
            risks={absenceRisks}
            departments={organizationDepartments}
          />
        </aside>
      </div>
    </AppShell>
  );
}
