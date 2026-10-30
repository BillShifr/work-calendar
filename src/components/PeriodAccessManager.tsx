"use client";

import { useState } from "react";
import styles from "./PeriodAccessManager.module.css";

const months = [
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

type Settings = {
  year: number;
  vacationOpen: boolean;
  overtime: Record<number, boolean>;
};

export function PeriodAccessManager({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function changeYear(delta: number) {
    setLoading("year");
    setMessage("");
    const response = await fetch(
      `/api/hr/entry-windows?year=${settings.year + delta}`,
    );
    const data = await response.json();
    setLoading(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось загрузить");
    setSettings(data);
  }

  async function update(
    kind: "vacation" | "overtime",
    month: number,
    isOpen: boolean,
  ) {
    const key = `${kind}:${month}`;
    setLoading(key);
    setMessage("");
    const response = await fetch("/api/hr/entry-windows", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, year: settings.year, month, isOpen }),
    });
    const data = await response.json();
    setLoading(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось сохранить");
    setSettings((current) =>
      kind === "vacation"
        ? { ...current, vacationOpen: isOpen }
        : {
            ...current,
            overtime: { ...current.overtime, [month]: isOpen },
          },
    );
    setMessage(
      `${kind === "vacation" ? "Отпуска" : months[month - 1]}: ${isOpen ? "период открыт" : "период закрыт"}`,
    );
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.yearBar}>
        <button
          aria-label="Предыдущий год"
          disabled={loading !== null || settings.year <= 2020}
          onClick={() => changeYear(-1)}
        >
          ←
        </button>
        <strong>{settings.year}</strong>
        <button
          aria-label="Следующий год"
          disabled={loading !== null || settings.year >= 2100}
          onClick={() => changeYear(1)}
        >
          →
        </button>
        <span role="status">{message}</span>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Отпуска</h2>
          <PeriodState open={settings.vacationOpen} />
        </div>
        <div className={styles.singleRow} data-period-kind="vacation">
          <div>
            <strong>Планирование на {settings.year} год</strong>
            <span>Для всех сотрудников организации</span>
          </div>
          <WindowButton
            open={settings.vacationOpen}
            busy={loading === "vacation:0"}
            onClick={() => update("vacation", 0, !settings.vacationOpen)}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Внеурочное время</h2>
        </div>
        <div className={styles.months}>
          {months.map((month, index) => {
            const number = index + 1;
            const open = settings.overtime[number] ?? false;
            return (
              <div
                className={styles.monthRow}
                data-period-kind="overtime"
                data-month={number}
                key={month}
              >
                <strong>{month}</strong>
                <PeriodState open={open} />
                <WindowButton
                  open={open}
                  busy={loading === `overtime:${number}`}
                  onClick={() => update("overtime", number, !open)}
                />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PeriodState({ open }: { open: boolean }) {
  return (
    <span className={`${styles.state} ${open ? styles.open : styles.closed}`}>
      <i aria-hidden="true" />
      {open ? "Открыт" : "Закрыт"}
    </span>
  );
}

function WindowButton({
  open,
  busy,
  onClick,
}: {
  open: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={open ? "secondaryButton" : "primaryButton"}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? "Сохраняем…" : open ? "Закрыть" : "Открыть"}
    </button>
  );
}
