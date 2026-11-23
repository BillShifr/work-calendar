"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
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

function personLabels(fullNames: string[]) {
  const parsed = fullNames.map((fullName) => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      fullName,
      surname: parts[0] ?? fullName,
      given: parts[1] ?? "",
    };
  });
  const surnameCount = new Map<string, number>();
  for (const person of parsed) {
    surnameCount.set(
      person.surname,
      (surnameCount.get(person.surname) ?? 0) + 1,
    );
  }
  return parsed.map((person) => ({
    fullName: person.fullName,
    label:
      (surnameCount.get(person.surname) ?? 0) > 1 && person.given
        ? `${person.surname} ${person.given}`
        : person.surname,
  }));
}

function boardHref(risk: AbsenceRisk) {
  const year = Number(risk.startsOn.slice(0, 4));
  const month = Number(risk.startsOn.slice(5, 7));
  const search = new URLSearchParams({
    year: String(year),
    month: String(month),
    department: risk.departmentId,
    date: risk.startsOn,
  });
  return `/vacations/board?${search}`;
}

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
          {filtered.map((risk) => {
            const people = personLabels(risk.employeeNames);
            return (
              <Link
                className={styles.overlap}
                href={boardHref(risk)}
                key={`${risk.departmentId}-${risk.startsOn}`}
              >
                <span className={styles.overlapBody}>
                  <span className={styles.overlapTop}>
                    <span className={styles.overlapNames}>
                      {people.map((person) => (
                        <strong key={person.fullName} title={person.fullName}>
                          {person.label}
                        </strong>
                      ))}
                    </span>
                    <time dateTime={risk.startsOn}>
                      {formatRange(risk.startsOn, risk.endsOn)}
                    </time>
                  </span>
                  <span className={styles.overlapDept}>
                    {risk.departmentName}
                  </span>
                  <span className={styles.overlapMeta}>
                    {risk.criticalAbsent ? <span>Критичная роль</span> : null}
                    <span>{risk.peakAbsent} одновременно</span>
                    <span>{risk.days.length} дн.</span>
                    <span>штат {risk.headcount}</span>
                  </span>
                </span>
                <span className={styles.overlapGo}>
                  График
                  <ChevronRight aria-hidden="true" size={18} />
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className={styles.overlapFilteredEmpty}>
          В выбранных подразделениях пересечений нет.
        </p>
      )}
    </>
  );
}
