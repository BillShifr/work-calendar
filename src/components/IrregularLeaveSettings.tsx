"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberControl } from "./FormControls";
import styles from "./IrregularLeaveSettings.module.css";

type Employee = {
  id: string;
  fullName: string;
  departmentName: string | null;
  jobTitle: string | null;
  jobTitleMaxDays: number;
  maxDaysOverride: number | null;
  actualDays: number | null;
  proposedNextYearDays: number | null;
};

export function IrregularLeaveSettings({
  employees,
  year,
  approvals,
}: {
  employees: Employee[];
  year: number;
  approvals: Array<{
    departmentName: string;
    approvedQuarters: number;
  }>;
}) {
  const router = useRouter();
  const [bulkMax, setBulkMax] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      employees.map((employee) => [
        employee.id,
        {
          maxDaysOverride: employee.maxDaysOverride?.toString() ?? "",
          actualDays: employee.actualDays?.toString() ?? "",
          proposedNextYearDays: employee.proposedNextYearDays?.toString() ?? "",
        },
      ]),
    ),
  );

  const toNullable = (value: string) => (value === "" ? null : Number(value));

  async function saveEmployee(employeeId: string) {
    setSaving(employeeId);
    setMessage("");
    const draft = drafts[employeeId];
    const response = await fetch("/api/hr/irregular-leave-terms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "individual",
        userId: employeeId,
        year,
        maxDaysOverride: toNullable(draft.maxDaysOverride),
        actualDays: toNullable(draft.actualDays),
        proposedNextYearDays: toNullable(draft.proposedNextYearDays),
      }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось сохранить");
    setMessage("Значения сохранены");
    router.refresh();
  }

  async function applyBulkMax() {
    setSaving("bulk");
    const response = await fetch("/api/hr/irregular-leave-terms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "bulk",
        year,
        maxDaysOverride: toNullable(bulkMax),
      }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось применить");
    setDrafts((current) =>
      Object.fromEntries(
        employees.map((employee) => [
          employee.id,
          { ...current[employee.id], maxDaysOverride: bulkMax },
        ]),
      ),
    );
    setMessage(`Обновлено сотрудников: ${data.count}`);
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.commandBar}>
        <div className={styles.yearControl}>
          <Link
            aria-label={`Открыть ${year - 1} год`}
            href={`?year=${year - 1}`}
          >
            ←
          </Link>
          <strong>{year}</strong>
          <Link
            aria-label={`Открыть ${year + 1} год`}
            href={`?year=${year + 1}`}
          >
            →
          </Link>
        </div>
        <div className={styles.bulk}>
          <span>Максимум дней для всех</span>
          <NumberControl
            label="Максимум дней для всех"
            min={0}
            max={30}
            value={bulkMax}
            onChange={setBulkMax}
          />
          <button
            className="secondaryButton"
            disabled={saving === "bulk" || bulkMax === ""}
            onClick={applyBulkMax}
          >
            Применить
          </button>
        </div>
        <a
          className="primaryButton"
          href={`/api/hr/export/overtime?year=${year}`}
        >
          Выгрузить Excel
        </a>
      </section>
      <span className={styles.message} role="status">
        {message}
      </span>

      <section className={styles.approvals} aria-label="Согласование кварталов">
        {approvals.map((item) => (
          <article key={item.departmentName}>
            <span>{item.departmentName}</span>
            <strong>{item.approvedQuarters} из 4 кварталов</strong>
          </article>
        ))}
      </section>

      <section className={styles.table} aria-label="Параметры сотрудников">
        <div className={styles.tableHead}>
          <span>Сотрудник</span>
          <span>Норматив должности</span>
          <span>Индивидуальный максимум</span>
          <span>По договору</span>
          <span>Предложение на {year + 1}</span>
          <span />
        </div>
        {employees.map((employee) => {
          const draft = drafts[employee.id];
          return (
            <article className={styles.row} key={employee.id}>
              <div>
                <strong>{employee.fullName}</strong>
                <span>
                  {employee.departmentName ?? "Без подразделения"} ·{" "}
                  {employee.jobTitle ?? "Без должности"}
                </span>
              </div>
              <strong className={styles.norm}>
                {employee.jobTitleMaxDays}
              </strong>
              <NumberControl
                label={`Индивидуальный максимум: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.maxDaysOverride}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: { ...draft, maxDaysOverride: value },
                  })
                }
              />
              <NumberControl
                label={`Дней по договору: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.actualDays}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: { ...draft, actualDays: value },
                  })
                }
              />
              <NumberControl
                label={`Предложение на следующий год: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.proposedNextYearDays}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: {
                      ...draft,
                      proposedNextYearDays: value,
                    },
                  })
                }
              />
              <button
                className="secondaryButton"
                disabled={saving === employee.id}
                onClick={() => saveEmployee(employee.id)}
              >
                Сохранить
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
