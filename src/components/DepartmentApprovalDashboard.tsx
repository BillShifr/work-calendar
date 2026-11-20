"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  vacationBoardStatusLabel,
  type VacationBoardRow,
} from "@/domain/department-vacation-board-shared";
import { ActionButton } from "./FormControls";
import styles from "./DepartmentApprovalDashboard.module.css";

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export type OvertimeReportRow = {
  id: string;
  fullName: string;
  userId?: string;
  month: number;
  status: string;
  totalMinutes: number;
};

export type OvertimeMonth = {
  month: number;
  employeeCount: number;
  expectedReports: number;
  readyReports: number;
  status: string;
  reports: OvertimeReportRow[];
};

export type OvertimeDepartment = {
  id: string;
  name: string;
  months: OvertimeMonth[];
};

export type VacationDepartment = {
  id: string;
  name: string;
  year: number;
  awaitingManager: number;
  sent: number;
  total: number;
  rows: VacationBoardRow[];
};

const formatDay = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00Z`));
const formatPeriod = (startsOn: string, endsOn: string) =>
  `${formatDay(startsOn)} — ${formatDay(endsOn)}`;

function matchesQuery(needle: string, name: string, department: string) {
  if (!needle) return true;
  return (
    name.toLocaleLowerCase("ru").includes(needle) ||
    department.toLocaleLowerCase("ru").includes(needle)
  );
}

function attentionRank(status: string) {
  if (["submitted", "reopened", "manager_review"].includes(status)) return 0;
  if (status === "hr_proposed") return 1;
  if (status === "approved") return 3;
  return 2;
}

function compareRows(
  sort: "name" | "department" | "attention",
  left: { name: string; department: string; rank: number; month: number },
  right: { name: string; department: string; rank: number; month: number },
) {
  const byName =
    left.name.localeCompare(right.name, "ru") || left.month - right.month;
  if (sort === "department") {
    return left.department.localeCompare(right.department, "ru") || byName;
  }
  if (sort === "attention") return left.rank - right.rank || byName;
  return byName;
}

function overtimeHref(reportId: string, audience: "manager" | "hr") {
  return audience === "hr"
    ? `/hr/overtime/${reportId}`
    : `/approvals/overtime/${reportId}`;
}

export function DepartmentApprovalDashboard({
  departments,
  vacationDepartments,
  year,
  audience = "manager",
  group = "department",
  canDelete = false,
}: {
  departments: OvertimeDepartment[];
  vacationDepartments: VacationDepartment[];
  year: number;
  audience?: "manager" | "hr";
  group?: "department" | "employee" | "all";
  canDelete?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hrefForYear = (nextYear: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(nextYear));
    const query = params.toString();
    return query ? `${pathname}?${query}` : `${pathname}?year=${nextYear}`;
  };
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "department" | "attention">("name");
  const [openSections, setOpenSections] = useState({
    vacation: true,
    overtime: true,
  });

  async function approve(departmentId: string, month: number) {
    const key = `${departmentId}:${month}`;
    setSaving(key);
    setMessage("");
    const response = await fetch("/api/approvals/month", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId, year, month }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось согласовать");
    setMessage(`Согласован ${monthNames[month - 1]}`);
    router.refresh();
  }

  async function removeReport(reportId: string) {
    setSaving(reportId);
    setMessage("");
    const response = await fetch(`/api/overtime/${reportId}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось удалить");
    setMessage("Период удалён");
    router.refresh();
  }

  async function transitionVacation(
    planId: string,
    to: "submitted" | "draft",
    label: string,
  ) {
    setSaving(planId);
    setMessage("");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregate: "vacation_plan",
        id: planId,
        to,
        comment: to === "draft" ? "Возврат руководителем" : undefined,
      }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось выполнить");
    setMessage(label);
    router.refresh();
  }

  const overtimeDepartments = useMemo(
    () =>
      departments
        .map((department) => ({
          ...department,
          months:
            audience === "hr"
              ? department.months.filter((month) => month.reports.length > 0)
              : department.months,
        }))
        .filter((department) => department.months.length > 0),
    [audience, departments],
  );
  const vacationBoards = useMemo(
    () =>
      vacationDepartments.filter((department) => department.rows.length > 0),
    [vacationDepartments],
  );

  const employeeGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        fullName: string;
        overtime: Array<OvertimeReportRow & { departmentName: string }>;
        vacations: Array<VacationBoardRow & { departmentName: string }>;
      }
    >();
    for (const department of overtimeDepartments) {
      for (const month of department.months) {
        for (const report of month.reports) {
          const key = report.userId ?? report.id;
          const current = map.get(key) ?? {
            userId: key,
            fullName: report.fullName,
            overtime: [],
            vacations: [],
          };
          current.overtime.push({
            ...report,
            departmentName: department.name,
          });
          map.set(key, current);
        }
      }
    }
    for (const department of vacationBoards) {
      for (const row of department.rows) {
        const current = map.get(row.userId) ?? {
          userId: row.userId,
          fullName: row.fullName,
          overtime: [],
          vacations: [],
        };
        current.fullName = row.fullName;
        current.vacations.push({ ...row, departmentName: department.name });
        map.set(row.userId, current);
      }
    }
    return [...map.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "ru"),
    );
  }, [overtimeDepartments, vacationBoards]);

  const allVacations = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return vacationBoards
      .flatMap((department) =>
        department.rows.map((row) => ({
          ...row,
          departmentId: department.id,
          departmentName: department.name,
        })),
      )
      .filter((row) => matchesQuery(needle, row.fullName, row.departmentName))
      .sort((left, right) =>
        compareRows(
          sort,
          {
            name: left.fullName,
            department: left.departmentName,
            rank: attentionRank(left.status),
            month: 0,
          },
          {
            name: right.fullName,
            department: right.departmentName,
            rank: attentionRank(right.status),
            month: 0,
          },
        ),
      );
  }, [query, sort, vacationBoards]);

  const allOvertime = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return overtimeDepartments
      .flatMap((department) =>
        department.months.flatMap((month) =>
          month.reports.map((report) => ({
            ...report,
            departmentName: department.name,
          })),
        ),
      )
      .filter((report) =>
        matchesQuery(needle, report.fullName, report.departmentName),
      )
      .sort((left, right) =>
        compareRows(
          sort,
          {
            name: left.fullName,
            department: left.departmentName,
            rank: attentionRank(left.status),
            month: left.month,
          },
          {
            name: right.fullName,
            department: right.departmentName,
            rank: attentionRank(right.status),
            month: right.month,
          },
        ),
      );
  }, [overtimeDepartments, query, sort]);

  return (
    <div className={styles.workspace}>
      <div className={styles.yearBar}>
        <Link
          aria-label={`Открыть ${year - 1} год`}
          href={hrefForYear(year - 1)}
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </Link>
        <strong>{year}</strong>
        <Link
          aria-label={`Открыть ${year + 1} год`}
          href={hrefForYear(year + 1)}
        >
          <ChevronRight aria-hidden="true" size={20} />
        </Link>
        <span role="status">{message}</span>
      </div>

      {vacationBoards.length + overtimeDepartments.length === 0 ? (
        <p className={styles.empty}>Нет данных за {year} год</p>
      ) : null}

      {group === "employee"
        ? employeeGroups.map((person) => (
            <section className={styles.department} key={person.userId}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.eyebrow}>Сотрудник</p>
                  <h2>{person.fullName}</h2>
                </div>
              </div>
              <div className={styles.rows}>
                {person.vacations.map((row) => (
                  <VacationRow
                    key={`${row.departmentName}:${row.userId}`}
                    row={row}
                    expanded={openRow === `${row.departmentName}:${row.userId}`}
                    onToggle={() =>
                      setOpenRow((current) =>
                        current === `${row.departmentName}:${row.userId}`
                          ? null
                          : `${row.departmentName}:${row.userId}`,
                      )
                    }
                    saving={saving}
                    audience={audience}
                    onTransition={transitionVacation}
                    subtitle={row.departmentName}
                  />
                ))}
                {person.overtime.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    href={overtimeHref(report.id, audience)}
                    extra={report.departmentName}
                    canDelete={canDelete}
                    saving={saving === report.id}
                    onDelete={() => removeReport(report.id)}
                  />
                ))}
              </div>
            </section>
          ))
        : null}

      {group === "all" ? (
        <section className={styles.department}>
          <div className={styles.boardTools}>
            <input
              value={query}
              aria-label="Фильтр по фамилии или отделу"
              placeholder="ФИО или отдел"
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Сортировка"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="name">По фамилии</option>
              <option value="department">По отделу</option>
              <option value="attention">Сначала ждут решения</option>
            </select>
          </div>
          {vacationBoards.length ? (
            <section>
              <button
                type="button"
                className={styles.sectionToggle}
                aria-expanded={openSections.vacation}
                onClick={() =>
                  setOpenSections((current) => ({
                    ...current,
                    vacation: !current.vacation,
                  }))
                }
              >
                <span>Отпуска</span>
                <small>{allVacations.length}</small>
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  className={
                    openSections.vacation ? styles.chevronOpen : undefined
                  }
                />
              </button>
              {openSections.vacation ? (
                <div className={styles.rows}>
                  {allVacations.length ? (
                    allVacations.map((row) => (
                      <VacationRow
                        key={`${row.departmentId}:${row.userId}`}
                        row={row}
                        expanded={
                          openRow === `${row.departmentId}:${row.userId}`
                        }
                        onToggle={() =>
                          setOpenRow((current) =>
                            current === `${row.departmentId}:${row.userId}`
                              ? null
                              : `${row.departmentId}:${row.userId}`,
                          )
                        }
                        saving={saving}
                        audience={audience}
                        onTransition={transitionVacation}
                        subtitle={row.departmentName}
                      />
                    ))
                  ) : (
                    <p className={styles.emptyInline}>Ничего не найдено</p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
          {overtimeDepartments.length ? (
            <section className={styles.split}>
              <button
                type="button"
                className={styles.sectionToggle}
                aria-expanded={openSections.overtime}
                onClick={() =>
                  setOpenSections((current) => ({
                    ...current,
                    overtime: !current.overtime,
                  }))
                }
              >
                <span>Внеурочное время</span>
                <small>{allOvertime.length}</small>
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  className={
                    openSections.overtime ? styles.chevronOpen : undefined
                  }
                />
              </button>
              {openSections.overtime ? (
                <div className={styles.rows}>
                  {allOvertime.length ? (
                    allOvertime.map((report) => (
                      <ReportRow
                        key={report.id}
                        report={report}
                        href={overtimeHref(report.id, audience)}
                        extra={report.departmentName}
                        canDelete={canDelete}
                        saving={saving === report.id}
                        onDelete={() => removeReport(report.id)}
                      />
                    ))
                  ) : (
                    <p className={styles.emptyInline}>Ничего не найдено</p>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {group === "department" ? (
        <>
          {vacationBoards.map((department) => (
            <section
              className={styles.department}
              key={`vacation-${department.id}`}
            >
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.eyebrow}>Отпуска · {department.year}</p>
                  <h2>{department.name}</h2>
                </div>
                <span className={styles.pending}>
                  {department.awaitingManager} на проверке · {department.sent}/
                  {department.total} отправлено
                </span>
              </div>
              <div className={styles.rows}>
                {department.rows.map((row) => (
                  <VacationRow
                    key={row.userId}
                    row={row}
                    expanded={openRow === `${department.id}:${row.userId}`}
                    onToggle={() =>
                      setOpenRow((current) =>
                        current === `${department.id}:${row.userId}`
                          ? null
                          : `${department.id}:${row.userId}`,
                      )
                    }
                    saving={saving}
                    audience={audience}
                    onTransition={transitionVacation}
                  />
                ))}
              </div>
            </section>
          ))}

          {overtimeDepartments.map((department) => (
            <section className={styles.department} key={department.id}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.eyebrow}>Внеурочное время</p>
                  <h2>{department.name}</h2>
                </div>
              </div>
              <div className={styles.months}>
                {department.months.map((month) => {
                  const complete =
                    month.expectedReports > 0 &&
                    month.readyReports === month.expectedReports;
                  return (
                    <article className={styles.month} key={month.month}>
                      <div className={styles.monthHead}>
                        <div>
                          <strong>{monthNames[month.month - 1]}</strong>
                          <span>
                            {month.readyReports} из {month.expectedReports}{" "}
                            отчётов
                          </span>
                        </div>
                        <span
                          className={
                            month.status === "approved"
                              ? styles.approved
                              : styles.pending
                          }
                        >
                          {month.status === "approved"
                            ? "Согласовано"
                            : complete
                              ? "Готово к согласованию"
                              : "Сбор данных"}
                        </span>
                      </div>
                      <div className={styles.rows}>
                        {month.reports.map((report) => (
                          <ReportRow
                            key={report.id}
                            report={report}
                            href={overtimeHref(report.id, audience)}
                            canDelete={canDelete}
                            saving={saving === report.id}
                            onDelete={() => removeReport(report.id)}
                          />
                        ))}
                      </div>
                      {month.status !== "approved" ? (
                        <ActionButton
                          variant="primary"
                          icon={Check}
                          disabled={
                            !complete ||
                            saving === `${department.id}:${month.month}`
                          }
                          onClick={() => approve(department.id, month.month)}
                        >
                          Согласовано
                        </ActionButton>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}

function VacationRow({
  row,
  expanded,
  onToggle,
  saving,
  audience,
  onTransition,
  subtitle,
}: {
  row: VacationBoardRow;
  expanded: boolean;
  onToggle: () => void;
  saving: string | null;
  audience: "manager" | "hr";
  onTransition: (
    planId: string,
    to: "submitted" | "draft",
    label: string,
  ) => void;
  subtitle?: string;
}) {
  return (
    <article className={styles.vacationRow}>
      <button
        type="button"
        className={styles.vacationMain}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={styles.vacationName}>
          {row.fullName}
          {subtitle ? <small> · {subtitle}</small> : null}
        </span>
        <span>
          {row.usedDays}/{row.allowanceDays || "—"} дн.
        </span>
        <span>{row.periodCount} пер.</span>
        <strong
          className={
            row.status === "manager_review"
              ? styles.pending
              : row.status === "approved"
                ? styles.approved
                : undefined
          }
        >
          {vacationBoardStatusLabel(row.status)}
        </strong>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={expanded ? styles.chevronOpen : undefined}
        />
      </button>
      {expanded ? (
        <div className={styles.vacationDetail}>
          {row.periods.length ? (
            <ul>
              {row.periods.map((period) => (
                <li key={`${period.startsOn}-${period.endsOn}`}>
                  <span>{formatPeriod(period.startsOn, period.endsOn)}</span>
                  <strong>{period.days} дн.</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>Периоды ещё не выбраны</p>
          )}
          {row.status === "manager_review" &&
          row.planId &&
          audience === "manager" ? (
            <div className={styles.vacationActions}>
              <ActionButton
                variant="quiet"
                icon={Undo2}
                disabled={saving === row.planId}
                onClick={() =>
                  onTransition(
                    row.planId!,
                    "draft",
                    "План возвращён сотруднику",
                  )
                }
              >
                Вернуть
              </ActionButton>
              <ActionButton
                variant="primary"
                icon={Send}
                disabled={saving === row.planId}
                onClick={() =>
                  onTransition(row.planId!, "submitted", "План передан в кадры")
                }
              >
                В кадры
              </ActionButton>
            </div>
          ) : null}
          {audience === "hr" && row.planId ? (
            <div className={styles.vacationActions}>
              <Link
                className={styles.openLink}
                href={`/hr/vacations/${row.planId}`}
              >
                Открыть
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ReportRow({
  report,
  href,
  extra,
  canDelete,
  saving,
  onDelete,
}: {
  report: OvertimeReportRow;
  href: string;
  extra?: string;
  canDelete: boolean;
  saving: boolean;
  onDelete: () => void;
}) {
  return (
    <div className={styles.reportRow}>
      <Link href={href}>
        <span className={styles.rowName}>{report.fullName}</span>
        <span>
          {monthNames[report.month - 1]}
          {extra ? ` · ${extra}` : ""}
        </span>
        <strong>{report.totalMinutes} мин.</strong>
      </Link>
      {canDelete ? (
        <ActionButton
          variant="quiet"
          icon={Trash2}
          disabled={saving}
          onClick={onDelete}
        >
          Удалить
        </ActionButton>
      ) : null}
    </div>
  );
}
