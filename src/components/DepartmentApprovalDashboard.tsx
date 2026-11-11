"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Send,
  Undo2,
} from "lucide-react";
import {
  vacationBoardStatusLabel,
  type VacationBoardRow,
} from "@/domain/department-vacation-board-shared";
import { ActionButton } from "./FormControls";
import styles from "./DepartmentApprovalDashboard.module.css";

type Department = {
  id: string;
  name: string;
  quarters: Array<{
    quarter: number;
    employeeCount: number;
    expectedReports: number;
    readyReports: number;
    status: string;
    reports: Array<{
      id: string;
      fullName: string;
      month: number;
      status: string;
      totalMinutes: number;
    }>;
  }>;
};

type VacationDepartment = {
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

export function DepartmentApprovalDashboard({
  departments,
  vacationDepartments,
  year,
}: {
  departments: Department[];
  vacationDepartments: VacationDepartment[];
  year: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);

  async function approve(departmentId: string, quarter: number) {
    const key = `${departmentId}:${quarter}`;
    setSaving(key);
    setMessage("");
    const response = await fetch("/api/approvals/quarter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ departmentId, year, quarter }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось согласовать");
    setMessage(`Согласован ${quarter} квартал`);
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

  return (
    <div className={styles.workspace}>
      <div className={styles.yearBar}>
        <Link aria-label={`Открыть ${year - 1} год`} href={`?year=${year - 1}`}>
          <ChevronLeft aria-hidden="true" size={20} />
        </Link>
        <strong>{year}</strong>
        <Link aria-label={`Открыть ${year + 1} год`} href={`?year=${year + 1}`}>
          <ChevronRight aria-hidden="true" size={20} />
        </Link>
        <span role="status">{message}</span>
      </div>

      {vacationDepartments.map((department) => (
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
          <div className={styles.vacationRows}>
            {department.rows.map((row) => {
              const key = `${department.id}:${row.userId}`;
              const expanded = openRow === key;
              return (
                <article className={styles.vacationRow} key={row.userId}>
                  <button
                    type="button"
                    className={styles.vacationMain}
                    aria-expanded={expanded}
                    onClick={() => setOpenRow(expanded ? null : key)}
                  >
                    <span className={styles.vacationName}>{row.fullName}</span>
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
                              <span>
                                {formatPeriod(period.startsOn, period.endsOn)}
                              </span>
                              <strong>{period.days} дн.</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>Периоды ещё не выбраны</p>
                      )}
                      {row.status === "manager_review" && row.planId ? (
                        <div className={styles.vacationActions}>
                          <ActionButton
                            variant="quiet"
                            icon={Undo2}
                            disabled={saving === row.planId}
                            onClick={() =>
                              transitionVacation(
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
                              transitionVacation(
                                row.planId!,
                                "submitted",
                                "План передан в кадры",
                              )
                            }
                          >
                            В кадры
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {departments.map((department) => (
        <section className={styles.department} key={department.id}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Внеурочное время</p>
              <h2>{department.name}</h2>
            </div>
          </div>
          <div className={styles.quarters}>
            {department.quarters.map((quarter) => {
              const complete =
                quarter.expectedReports > 0 &&
                quarter.readyReports === quarter.expectedReports;
              return (
                <article className={styles.quarter} key={quarter.quarter}>
                  <div className={styles.quarterHead}>
                    <div>
                      <strong>{quarter.quarter} квартал</strong>
                      <span>
                        {quarter.readyReports} из {quarter.expectedReports}{" "}
                        отчётов
                      </span>
                    </div>
                    <span
                      className={
                        quarter.status === "approved"
                          ? styles.approved
                          : styles.pending
                      }
                    >
                      {quarter.status === "approved"
                        ? "Согласовано"
                        : complete
                          ? "Готово к согласованию"
                          : "Сбор данных"}
                    </span>
                  </div>
                  <div className={styles.reports}>
                    {quarter.reports.map((report) => (
                      <Link
                        href={`/approvals/overtime/${report.id}`}
                        key={report.id}
                      >
                        <span>{report.fullName}</span>
                        <span>{String(report.month).padStart(2, "0")}</span>
                        <strong>{report.totalMinutes} мин.</strong>
                      </Link>
                    ))}
                  </div>
                  {quarter.status !== "approved" ? (
                    <ActionButton
                      variant="primary"
                      icon={Check}
                      disabled={
                        !complete ||
                        saving === `${department.id}:${quarter.quarter}`
                      }
                      onClick={() => approve(department.id, quarter.quarter)}
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
    </div>
  );
}
