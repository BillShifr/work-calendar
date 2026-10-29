"use client";

import { useState } from "react";
import { daysInMonth } from "@/domain/overtime";
import {
  normalizePeriod,
  periodDays,
  totalPeriodDays,
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
    (mode === "hr" &&
      ["submitted", "reopened", "hr_proposed"].includes(status)) ||
    (mode === "employee" &&
      (status === "draft" || (status === "hr_proposed" && editingResponse)));
  const total = totalPeriodDays(periods);
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
    const nextTotal = total + periodDays(next);
    if (nextTotal > initial.allowanceDays) {
      setMessage(
        `Нельзя добавить период: останется ${Math.max(0, initial.allowanceDays - total)} из ${initial.allowanceDays} дней.`,
      );
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
  async function approve() {
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
    setMessage(
      mode === "hr" ? "План утверждён" : "Предложение кадровика утверждено",
    );
  }
  return (
    <section className={styles.workspace}>
      <div className={styles.commandBar} aria-label="Действия с планом">
        <div className={styles.yearControl}>
          <button aria-label="Предыдущий год" onClick={() => changeYear(-1)}>
            ←
          </button>
          <strong>{year}</strong>
          <button aria-label="Следующий год" onClick={() => changeYear(1)}>
            →
          </button>
        </div>
        <div
          className={`${styles.total} ${total > initial.allowanceDays ? styles.totalExceeded : ""}`}
        >
          <strong>{total}</strong>
          <span>из {initial.allowanceDays} дней</span>
        </div>
        <span className={styles.message} role="status">
          {message}
        </span>
        <div className={`actions ${styles.actions}`}>
          <button
            className="secondaryButton"
            disabled={!start}
            onClick={() => setStart(null)}
          >
            Отменить выбор
          </button>
          {mode === "hr" && canEdit && (
            <>
              {status !== "hr_proposed" && (
                <button
                  className="secondaryButton"
                  disabled={saving || total > initial.allowanceDays}
                  onClick={approve}
                >
                  Утвердить без изменений
                </button>
              )}
              <button
                className="primaryButton"
                disabled={
                  saving || !reason.trim() || total > initial.allowanceDays
                }
                onClick={save}
              >
                Предложить изменения
              </button>
            </>
          )}
          {mode === "employee" && (status === "draft" || editingResponse) && (
            <button
              className="secondaryButton"
              disabled={saving || total > initial.allowanceDays}
              onClick={save}
            >
              {editingResponse
                ? "Отправить свой вариант"
                : "Сохранить черновик"}
            </button>
          )}
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
                  onClick={approve}
                >
                  Подтвердить правку
                </button>
              </>
            )}
        </div>
      </div>

      {mode === "hr" && canEdit && (
        <label className={styles.reason}>
          Причина изменений
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Укажите причину изменения"
          />
        </label>
      )}

      <div className={styles.periodBar} aria-live="polite">
        <div className={styles.selection}>
          <strong>{start ? `Начало: ${formatDate(start)}` : "Периоды"}</strong>
          {start && <span>Выберите дату окончания</span>}
        </div>
        {periods.length ? (
          <ul className={styles.periods}>
            {periods.map((period) => (
              <li className={styles.period} key={period.id}>
                <span>
                  <strong>
                    {formatDate(period.startsOn)} — {formatDate(period.endsOn)}
                  </strong>
                  <small>
                    {period.source === "hr" ? "Правка HR" : "Ваш период"} ·{" "}
                    {periodDays(period)} дн.
                  </small>
                </span>
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
          <span className={styles.empty}>Не выбраны</span>
        )}
        <div className={styles.legend} aria-label="Обозначения">
          <span>
            <i className={styles.dot} /> Выбор
          </span>
          <span>
            <i className={`${styles.dot} ${styles.dotHr}`} /> HR
          </span>
          <span>
            <i className={`${styles.dot} ${styles.dotApproved}`} /> Утверждено
          </span>
        </div>
      </div>

      <div
        className={styles.scroll}
        tabIndex={0}
        aria-label="Матрица отпускных дней; прокручивается горизонтально"
      >
        <div className={styles.matrix}>
          <span className={styles.corner} />
          {Array.from({ length: 31 }, (_, index) => (
            <span className={styles.dayHead} key={index}>
              {index + 1}
            </span>
          ))}
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
                      !valid ? styles.invalid : !canEdit ? styles.readonly : "",
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
  );
}
