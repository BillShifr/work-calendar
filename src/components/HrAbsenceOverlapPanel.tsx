"use client";

import { useMemo, useState } from "react";
import type { AbsenceRisk } from "@/domain/absence-risk";
import { OptionPicker } from "./OptionPicker";
import styles from "@/app/hr/hr.module.css";

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00Z`),
  );

const formatRange = (startsOn: string, endsOn: string) =>
  startsOn === endsOn
    ? formatShortDate(startsOn)
    : `${formatShortDate(startsOn)} — ${formatShortDate(endsOn)}`;

export function HrAbsenceOverlapPanel({
  risks,
  departments,
}: {
  risks: AbsenceRisk[];
  departments: Array<{ id: string; name: string }>;
}) {
  const departmentItems = useMemo(
    () =>
      departments.map((department) => ({
        id: department.id,
        label: department.name,
      })),
    [departments],
  );
  const [departmentIds, setDepartmentIds] = useState(
    () => new Set(departments.map((department) => department.id)),
  );

  const filtered = useMemo(
    () =>
      risks.filter((risk) => departmentIds.has(risk.departmentId)).slice(0, 12),
    [risks, departmentIds],
  );

  const toggleDepartment = (id: string, on: boolean) => {
    setDepartmentIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllDepartments = (on: boolean) => {
    setDepartmentIds(
      on ? new Set(departments.map((department) => department.id)) : new Set(),
    );
  };

  if (!risks.length) {
    return (
      <div className={styles.noOverlap}>
        <span aria-hidden="true">✓</span>
        <strong>Пересечений нет</strong>
        <p>
          В отправленных и утверждённых планах нет одновременных отпусков внутри
          подразделений.
        </p>
      </div>
    );
  }

  return (
    <>
      {departmentItems.length > 1 ? (
        <div className={styles.overlapToolbar}>
          <OptionPicker
            label="Подразделения"
            items={departmentItems}
            selected={departmentIds}
            onToggle={toggleDepartment}
            onToggleAll={toggleAllDepartments}
          />
        </div>
      ) : null}
      {filtered.length ? (
        <div className={styles.overlapList}>
          {filtered.map((risk) => (
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
              <span className={styles.riskDays}>
                {risk.days.length} дн. пересечения
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.overlapFilteredEmpty}>
          В выбранных подразделениях пересечений нет.
        </p>
      )}
    </>
  );
}
