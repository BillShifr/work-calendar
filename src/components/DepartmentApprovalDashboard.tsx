"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function DepartmentApprovalDashboard({
  departments,
  year,
}: {
  departments: Department[];
  year: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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

  return (
    <div className={styles.workspace}>
      <div className={styles.yearBar}>
        <Link aria-label={`Открыть ${year - 1} год`} href={`?year=${year - 1}`}>
          ←
        </Link>
        <strong>{year}</strong>
        <Link aria-label={`Открыть ${year + 1} год`} href={`?year=${year + 1}`}>
          →
        </Link>
        <span role="status">{message}</span>
      </div>
      {departments.map((department) => (
        <section className={styles.department} key={department.id}>
          <h2>{department.name}</h2>
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
                    <button
                      className="primaryButton"
                      disabled={
                        !complete ||
                        saving === `${department.id}:${quarter.quarter}`
                      }
                      onClick={() => approve(department.id, quarter.quarter)}
                    >
                      Согласовано
                    </button>
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
