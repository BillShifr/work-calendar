"use client";

import { useMemo, useState } from "react";
import { daysInMonth, OVERTIME_MINUTES } from "@/domain/overtime";
import styles from "./OvertimeCalendar.module.css";

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
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function OvertimeCalendar({
  initial,
}: {
  initial: {
    year: number;
    month: number;
    version: number;
    entries: Record<string, number>;
    zeroConfirmed: boolean;
    status: string;
  };
}) {
  const [period, setPeriod] = useState({
    year: initial.year,
    month: initial.month,
  });
  const [version, setVersion] = useState(initial.version);
  const [entries, setEntries] = useState(initial.entries);
  const [zeroConfirmed, setZeroConfirmed] = useState(initial.zeroConfirmed);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState(
    (initial as typeof initial & { id: string }).id,
  );
  const [status, setStatus] = useState(initial.status);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const count = daysInMonth(period.year, period.month);
  const offset =
    (new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay() + 6) % 7;
  const total = Object.values(entries).reduce((sum, value) => sum + value, 0);
  const cells = useMemo(
    () =>
      Array.from({ length: offset + count }, (_, index) =>
        index < offset ? null : index - offset + 1,
      ),
    [offset, count],
  );

  async function changeMonth(delta: number) {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    const next = { year: date.getFullYear(), month: date.getMonth() + 1 };
    const response = await fetch(
      `/api/overtime?year=${next.year}&month=${next.month}`,
    );
    const data = await response.json();
    setPeriod(next);
    setEntries(data.entries);
    setVersion(data.version);
    setReportId(data.id);
    setStatus(data.status);
    setZeroConfirmed(data.zeroConfirmed);
    setSelected(null);
    setMessage("");
  }

  function chooseMinutes(minutes: number) {
    if (!selected) return;
    setEntries((current) => ({ ...current, [selected]: minutes }));
    setZeroConfirmed(false);
    setMessage("Изменение пока не сохранено");
  }
  function clearSelected() {
    if (!selected) return;
    setEntries((current) => {
      const copy = { ...current };
      delete copy[selected];
      return copy;
    });
    setMessage("Изменение пока не сохранено");
  }
  function onDayKey(event: React.KeyboardEvent, day: number) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key === "Escape") {
      setSelected(null);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const target = day + move;
    if (target >= 1 && target <= count)
      document
        .querySelector<HTMLButtonElement>(`[data-calendar-day="${target}"]`)
        ?.focus();
  }
  async function save() {
    setSaving(true);
    setMessage("Сохраняем…");
    const response = await fetch("/api/overtime", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...period, version, entries, zeroConfirmed }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось сохранить");
      return;
    }
    setVersion(data.version);
    setMessage("Сохранено");
  }
  async function submit() {
    setSaving(true);
    setMessage("Отправляем…");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregate: "overtime_report",
        id: reportId,
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
    setMessage("Отправлено кадровой службе");
  }

  return (
    <>
      <div className={styles.layout}>
        <section
          className={`card ${styles.calendar}`}
          aria-label="Календарь внеурочного времени"
        >
          <div className={styles.calendarTop}>
            <div>
              <p className="eyebrow">Отчётный месяц</p>
              <h2>
                {months[period.month - 1]} {period.year}
              </h2>
            </div>
            <div className={styles.monthNav}>
              <button
                onClick={() => changeMonth(-1)}
                aria-label="Предыдущий месяц"
              >
                ←
              </button>
              <button
                onClick={() => changeMonth(1)}
                aria-label="Следующий месяц"
              >
                →
              </button>
            </div>
          </div>
          <div className={styles.weekdays} aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className={styles.grid}>
            {cells.map((day, index) =>
              day === null ? (
                <span className={styles.empty} key={`e-${index}`} />
              ) : (
                (() => {
                  const date = iso(period.year, period.month, day);
                  const weekday = (offset + day - 1) % 7;
                  const future = date > today;
                  return (
                    <button
                      data-calendar-day={day}
                      key={date}
                      className={[
                        styles.day,
                        weekday >= 5 ? styles.weekend : "",
                        selected === date ? styles.selected : "",
                        entries[date] ? styles.filled : "",
                      ].join(" ")}
                      disabled={future}
                      aria-pressed={selected === date}
                      aria-label={`${day} ${months[period.month - 1]}, ${entries[date] ? `${entries[date]} минут` : "не заполнено"}${future ? ", будущая дата" : ""}`}
                      onKeyDown={(event) => onDayKey(event, day)}
                      onClick={() => setSelected(date)}
                    >
                      <span className={styles.dayNumber}>{day}</span>
                      {entries[date] && (
                        <span className={styles.minutes}>
                          {entries[date]} мин
                        </span>
                      )}
                    </button>
                  );
                })()
              ),
            )}
          </div>
        </section>
        <aside className={`card ${styles.editor}`} aria-live="polite">
          <p className="eyebrow">Быстрое действие</p>
          <h2>
            {selected
              ? `${Number(selected.slice(-2))} ${months[period.month - 1].toLowerCase()}`
              : "Выберите день"}
          </h2>
          <p className={styles.editorHint}>
            {selected
              ? "Сколько времени вы работали сверх нормы?"
              : "Нажмите крупную ячейку дня в календаре. Доступны и будни, и выходные."}
          </p>
          <div className={styles.minuteButtons}>
            {OVERTIME_MINUTES.map((minutes) => (
              <button
                key={minutes}
                disabled={!selected}
                className={
                  selected && entries[selected] === minutes ? styles.active : ""
                }
                onClick={() => chooseMinutes(minutes)}
              >
                {minutes === 60 ? "1 час" : `${minutes} мин`}
              </button>
            ))}
          </div>
          <button
            className={styles.clear}
            disabled={!selected || !entries[selected]}
            onClick={clearSelected}
          >
            Очистить этот день
          </button>
          <div className={styles.summary}>
            <strong>
              {Math.floor(total / 60)} ч {total % 60} мин
            </strong>
            <span>Итого за месяц · {Object.keys(entries).length} дней</span>
          </div>
        </aside>
      </div>
      <section className={`card ${styles.saveRow}`}>
        <label className={styles.zero}>
          <input
            type="checkbox"
            checked={zeroConfirmed}
            disabled={Object.keys(entries).length > 0 || status !== "draft"}
            onChange={(event) => setZeroConfirmed(event.target.checked)}
          />
          В этом месяце внеурочного времени не было
        </label>
        <div className="actions">
          <span className={styles.message} role="status">
            {message}
          </span>
          <button
            className="secondaryButton"
            disabled={
              saving ||
              status !== "draft" ||
              (!Object.keys(entries).length && !zeroConfirmed)
            }
            onClick={save}
          >
            Сохранить черновик
          </button>
          <button
            className="primaryButton"
            disabled={
              saving ||
              status !== "draft" ||
              (!Object.keys(entries).length && !zeroConfirmed)
            }
            onClick={submit}
          >
            Отправить кадровику
          </button>
        </div>
      </section>
    </>
  );
}
