"use client";

import { useState } from "react";
import { daysInMonth } from "@/domain/overtime";
import {
  normalizePeriod,
  periodDays,
  type DatePeriod,
} from "@/domain/vacation";
import styles from "./VacationMatrix.module.css";

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
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function VacationMatrix({
  initial,
  mode = "employee",
}: {
  initial: {
    id: string;
    year: number;
    version: number;
    allowanceDays: number;
    status: string;
    periods: DatePeriod[];
  };
  mode?: "employee" | "hr";
}) {
  const [year, setYear] = useState(initial.year);
  const [version, setVersion] = useState(initial.version);
  const [periods, setPeriods] = useState(initial.periods);
  const [start, setStart] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [planId, setPlanId] = useState(initial.id);
  const [status, setStatus] = useState(initial.status);
  const [reason, setReason] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const canEdit =
    mode === "hr" ||
    status === "draft" ||
    (status === "hr_proposed" && editingResponse);
  const total = periods.reduce((sum, period) => sum + periodDays(period), 0);
  function periodFor(date: string) {
    return periods.find(
      (period) => period.startsOn <= date && period.endsOn >= date,
    );
  }
  function select(date: string) {
    if (!canEdit) return;
    if (!start) {
      setStart(date);
      setMessage("Начало выбрано. Теперь укажите последний день.");
      return;
    }
    const normalized = normalizePeriod(start, date);
    const next: DatePeriod = {
      id: crypto.randomUUID(),
      ...normalized,
      source: mode,
    };
    if (
      periods.some(
        (period) =>
          period.startsOn <= next.endsOn && next.startsOn <= period.endsOn,
      )
    ) {
      setMessage("Этот период пересекается с уже выбранным.");
      setStart(null);
      return;
    }
    setPeriods((current) =>
      [...current, next].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    );
    setStart(null);
    setMessage("Период добавлен и пока не сохранён.");
  }
  async function changeYear(delta: number) {
    const nextYear = year + delta;
    const response = await fetch(`/api/vacations?year=${nextYear}`);
    const data = await response.json();
    setYear(nextYear);
    setVersion(data.version);
    setPeriods(data.periods);
    setPlanId(data.id);
    setStatus(data.status);
    setStart(null);
    setMessage("");
  }
  async function save() {
    setSaving(true);
    setMessage("Сохраняем…");
    const response = await fetch(
      mode === "hr" ? `/api/hr/vacations/${planId}` : "/api/vacations",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year, version, periods, reason }),
      },
    );
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось сохранить");
      return;
    }
    setVersion(data.version);
    if (data.status) setStatus(data.status);
    if (data.periods) setPeriods(data.periods);
    setEditingResponse(false);
    setMessage("Сохранено");
  }
  async function submit() {
    setSaving(true);
    setMessage("Отправляем…");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregate: "vacation_plan",
        id: planId,
        to: "submitted",
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось отправить");
      return;
    }
    setStatus(data.status);
    setVersion(data.version);
    setMessage("План отправлен кадровой службе");
  }
  async function acceptHrProposal() {
    setSaving(true);
    setMessage("Подтверждаем…");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregate: "vacation_plan",
        id: planId,
        to: "approved",
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось подтвердить");
      return;
    }
    setStatus(data.status);
    setVersion(data.version);
    setPeriods((current) =>
      current.map((period) => ({ ...period, status: "approved" })),
    );
    setMessage("Предложение кадровика утверждено");
  }
  return (
    <>
      <div className={styles.layout}>
        <section className={`card ${styles.matrixCard}`}>
          <div className={styles.matrixToolbar}>
            <div>
              <p className="eyebrow">Годовая матрица</p>
              <h2>{year} год</h2>
            </div>
            <div className={styles.yearButtons}>
              <button
                aria-label="Предыдущий год"
                onClick={() => changeYear(-1)}
              >
                ←
              </button>
              <button aria-label="Следующий год" onClick={() => changeYear(1)}>
                →
              </button>
            </div>
          </div>
          <div
            className={styles.scroll}
            tabIndex={0}
            aria-label="Матрица отпускных дней; прокручивается горизонтально"
          >
            <div className={styles.matrix}>
              <span />
              <>
                {Array.from({ length: 31 }, (_, index) => (
                  <span className={styles.dayHead} key={index}>
                    {index + 1}
                  </span>
                ))}
              </>
              {months.map((monthName, monthIndex) => (
                <div style={{ display: "contents" }} key={monthName}>
                  <span className={styles.month}>{monthName}</span>
                  {Array.from({ length: 31 }, (_, index) => {
                    const day = index + 1;
                    const valid = day <= daysInMonth(year, monthIndex + 1);
                    const date = iso(year, monthIndex + 1, day);
                    const period = valid ? periodFor(date) : undefined;
                    return (
                      <button
                        key={date}
                        disabled={!valid || !canEdit}
                        onClick={() => select(date)}
                        aria-label={
                          valid
                            ? `${day} ${monthName.toLowerCase()}${period ? ", входит в период" : ""}`
                            : undefined
                        }
                        className={[
                          styles.day,
                          !valid
                            ? styles.invalid
                            : !canEdit
                              ? styles.readonly
                              : "",
                          period
                            ? period.source === "hr"
                              ? styles.hrRange
                              : styles.range
                            : "",
                          period?.status === "approved" ? styles.approved : "",
                          start === date ? styles.start : "",
                        ].join(" ")}
                      >
                        {valid ? day : ""}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className={`card ${styles.panel}`} aria-live="polite">
          <p className="eyebrow">План на {year}</p>
          <h2>{start ? `Начало: ${formatDate(start)}` : "Выберите период"}</h2>
          <p className={styles.panelText}>
            {start
              ? "Начальная ячейка уже отмечена тёмным контуром. Выберите последний день — можно раньше или позже."
              : "Первое нажатие задаёт начало, второе — конец. Никаких всплывающих календарей."}
          </p>
          {mode === "hr" && (
            <label className={styles.reason}>
              Причина кадровой правки
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Например: пересечение с отпуском дежурного специалиста"
              />
            </label>
          )}
          <div className={styles.legend}>
            <span>
              <i className={styles.dot} />
              Ваш выбор
            </span>
            <span>
              <i className={`${styles.dot} ${styles.dotHr}`} />
              Предложение кадровика
            </span>
            <span>
              <i className={`${styles.dot} ${styles.dotApproved}`} />
              Утверждено
            </span>
          </div>
          {periods.length ? (
            <ul className={styles.periods}>
              {periods.map((period) => (
                <li className={styles.period} key={period.id}>
                  <strong>
                    {formatDate(period.startsOn)} — {formatDate(period.endsOn)}
                  </strong>
                  <small>
                    {periodDays(period)} дней ·{" "}
                    {period.source === "hr"
                      ? "предложено кадровиком"
                      : "ваш выбор"}
                  </small>
                  <button
                    disabled={!canEdit}
                    aria-label={`Удалить период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}`}
                    onClick={() => {
                      setPeriods((current) =>
                        current.filter((item) => item.id !== period.id),
                      );
                      setMessage("Период удалён и пока не сохранён.");
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Периодов пока нет</p>
          )}
          <p className={styles.total}>
            <span>{total}</span> из {initial.allowanceDays} дней запланировано
          </p>
        </aside>
      </div>
      <section className={`card ${styles.saveRow}`}>
        <span className={styles.message} role="status">
          {message}
        </span>
        <div className="actions">
          <button
            className="secondaryButton"
            disabled={!start}
            onClick={() => setStart(null)}
          >
            Отменить выбор
          </button>
          <button
            className="secondaryButton"
            disabled={
              saving ||
              (mode === "employee" && status !== "draft" && !editingResponse) ||
              (mode === "hr" && !reason.trim()) ||
              total > initial.allowanceDays
            }
            onClick={save}
          >
            {mode === "hr"
              ? "Предложить сотруднику"
              : editingResponse
                ? "Отправить свой вариант"
                : "Сохранить черновик"}
          </button>
          {mode === "employee" && status === "draft" && (
            <button
              className="primaryButton"
              disabled={
                saving ||
                status !== "draft" ||
                !periods.length ||
                total > initial.allowanceDays
              }
              onClick={submit}
            >
              Отправить кадровику
            </button>
          )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            !editingResponse && (
              <>
                <button
                  className="secondaryButton"
                  onClick={() => {
                    setEditingResponse(true);
                    setMessage("Измените периоды и отправьте свой вариант.");
                  }}
                >
                  Изменить снова
                </button>
                <button
                  className="primaryButton"
                  disabled={saving}
                  onClick={acceptHrProposal}
                >
                  Подтвердить правку
                </button>
              </>
            )}
        </div>
      </section>
    </>
  );
}
