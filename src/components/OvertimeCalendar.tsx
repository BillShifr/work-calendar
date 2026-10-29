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
type Source = "employee" | "hr";
type InitialReport = {
  id: string;
  year: number;
  month: number;
  version: number;
  entries: Record<string, number>;
  sources?: Record<string, Source>;
  zeroConfirmed: boolean;
  status: string;
};

export function OvertimeCalendar({
  initial,
  mode = "employee",
}: {
  initial: InitialReport;
  mode?: Source;
}) {
  const [period, setPeriod] = useState({
    year: initial.year,
    month: initial.month,
  });
  const [version, setVersion] = useState(initial.version);
  const [entries, setEntries] = useState(initial.entries);
  const [sources, setSources] = useState<Record<string, Source>>(
    initial.sources ?? {},
  );
  const [zeroConfirmed, setZeroConfirmed] = useState(initial.zeroConfirmed);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reportId, setReportId] = useState(initial.id);
  const [status, setStatus] = useState(initial.status);
  const [reason, setReason] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const canEdit =
    (mode === "hr" &&
      ["submitted", "reopened", "hr_proposed"].includes(status)) ||
    status === "draft" ||
    (mode === "employee" && status === "hr_proposed" && editingResponse);
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
    if (mode === "hr") return;
    const date = new Date(period.year, period.month - 1 + delta, 1);
    const next = { year: date.getFullYear(), month: date.getMonth() + 1 };
    const response = await fetch(
      `/api/overtime?year=${next.year}&month=${next.month}`,
    );
    const data = await response.json();
    setPeriod(next);
    setEntries(data.entries);
    setSources(data.sources ?? {});
    setVersion(data.version);
    setReportId(data.id);
    setStatus(data.status);
    setZeroConfirmed(data.zeroConfirmed);
    setSelected(null);
    setMessage("");
  }
  function chooseMinutes(minutes: number) {
    if (!selected || !canEdit) return;
    setEntries((current) => ({ ...current, [selected]: minutes }));
    setSources((current) => ({ ...current, [selected]: mode }));
    setZeroConfirmed(false);
    setMessage("Изменение пока не сохранено");
  }
  function clearSelected() {
    if (!selected || !canEdit) return;
    setEntries((current) => {
      const copy = { ...current };
      delete copy[selected];
      return copy;
    });
    setSources((current) => {
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
    if (event.key === "Escape") return setSelected(null);
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
    const response = await fetch(
      mode === "hr" ? `/api/hr/overtime/${reportId}` : "/api/overtime",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...period,
          version,
          entries,
          zeroConfirmed,
          reason,
        }),
      },
    );
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось сохранить");
      return false;
    }
    setVersion(data.version);
    setStatus(data.status ?? status);
    setEntries(data.entries ?? entries);
    setSources(data.sources ?? sources);
    setZeroConfirmed(data.zeroConfirmed ?? zeroConfirmed);
    setEditingResponse(false);
    setMessage(
      mode === "hr" ? "Предложение отправлено сотруднику" : "Сохранено",
    );
    return true;
  }
  async function transition(to: "submitted" | "approved") {
    setSaving(true);
    setMessage(to === "approved" ? "Подтверждаем…" : "Отправляем…");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aggregate: "overtime_report", id: reportId, to }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok)
      return setMessage(data.error ?? "Не удалось выполнить действие");
    setStatus(data.status);
    setVersion(data.version);
    setMessage(
      to === "approved"
        ? "Предложение кадровика утверждено"
        : "Отправлено кадровой службе",
    );
  }
  async function saveAndSubmit() {
    if (await save()) await transition("submitted");
  }

  return (
    <section className={styles.workspace}>
      {mode === "employee" && status === "hr_proposed" && (
        <div className={styles.proposalNotice} role="status">
          <strong>Кадровая служба предложила корректировку</strong>
        </div>
      )}
      <div className={styles.commandBar} aria-label="Действия с отчётом">
        <div className={styles.monthControl}>
          {mode === "employee" && (
            <button
              onClick={() => changeMonth(-1)}
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
          )}
          <strong>
            {months[period.month - 1]} {period.year}
          </strong>
          {mode === "employee" && (
            <button onClick={() => changeMonth(1)} aria-label="Следующий месяц">
              →
            </button>
          )}
        </div>
        <div className={styles.summary}>
          <strong>
            {Math.floor(total / 60)} ч {total % 60} мин
          </strong>
          <span>{Object.keys(entries).length} дней</span>
        </div>
        <span className={styles.message} role="status">
          {message}
        </span>
        <div className={`actions ${styles.actions}`}>
          {mode === "hr" && (
            <button
              className="primaryButton"
              disabled={
                saving ||
                !canEdit ||
                !reason.trim() ||
                (!Object.keys(entries).length && !zeroConfirmed)
              }
              onClick={save}
            >
              Предложить сотруднику
            </button>
          )}
          {mode === "employee" && status === "draft" && (
            <>
              <button
                className="secondaryButton"
                disabled={
                  saving || (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={save}
              >
                Сохранить черновик
              </button>
              <button
                className="primaryButton"
                disabled={
                  saving || (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={saveAndSubmit}
              >
                Отправить кадровику
              </button>
            </>
          )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            !editingResponse && (
              <>
                <button
                  className="secondaryButton"
                  disabled={saving}
                  onClick={() => setEditingResponse(true)}
                >
                  Изменить снова
                </button>
                <button
                  className="primaryButton"
                  disabled={saving}
                  onClick={() => transition("approved")}
                >
                  Подтвердить правку
                </button>
              </>
            )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            editingResponse && (
              <button
                className="primaryButton"
                disabled={
                  saving || (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={save}
              >
                Отправить свой вариант
              </button>
            )}
        </div>
      </div>

      <div className={styles.editor} aria-live="polite">
        <div className={styles.selectedDate}>
          <span>{canEdit ? "Выбранный день" : "Просмотр"}</span>
          <strong>
            {selected
              ? `${Number(selected.slice(-2))} ${months[period.month - 1].toLowerCase()}`
              : "—"}
          </strong>
        </div>
        <div className={styles.minuteButtons}>
          {OVERTIME_MINUTES.map((minutes) => (
            <button
              key={minutes}
              disabled={!selected || !canEdit}
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
          disabled={!selected || !entries[selected] || !canEdit}
          onClick={clearSelected}
        >
          Очистить
        </button>
        <label className={styles.zero}>
          <input
            type="checkbox"
            checked={zeroConfirmed}
            disabled={Object.keys(entries).length > 0 || !canEdit}
            onChange={(event) => setZeroConfirmed(event.target.checked)}
          />
          Внеурочного времени не было
        </label>
      </div>

      {mode === "hr" && (
        <label className={styles.reason}>
          Причина кадровой правки
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Укажите причину изменения"
          />
        </label>
      )}

      <div className={styles.legend} aria-label="Обозначения">
        <span>
          <i className={styles.dot} /> Сотрудник
        </span>
        <span>
          <i className={`${styles.dot} ${styles.dotHr}`} /> HR
        </span>
        <span>
          <i className={`${styles.dot} ${styles.dotApproved}`} /> Утверждено
        </span>
      </div>

      <div
        className={styles.calendar}
        aria-label="Календарь внеурочного времени"
      >
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
                      entries[date]
                        ? sources[date] === "hr"
                          ? styles.hrFilled
                          : styles.filled
                        : "",
                      status === "approved" && entries[date]
                        ? styles.approved
                        : "",
                      !canEdit ? styles.readonly : "",
                    ].join(" ")}
                    disabled={future || !canEdit}
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
      </div>
    </section>
  );
}
