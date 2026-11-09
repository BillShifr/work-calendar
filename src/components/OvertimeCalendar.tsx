"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eraser,
  Plus,
  Save,
  Send,
} from "lucide-react";
import {
  addOvertimeMinutes,
  daysInMonth,
  MAX_OVERTIME_MINUTES_PER_DAY,
  OVERTIME_MINUTES,
} from "@/domain/overtime";
import {
  ActionButton,
  IconButton,
  SubmissionFlight,
  ToggleControl,
  type FlightState,
} from "./FormControls";
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
const formatSelectedDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${value}T00:00:00Z`),
  );
type Source = "employee" | "hr";
type Mode = Source | "review";
type InitialReport = {
  id: string;
  year: number;
  month: number;
  version: number;
  entries: Record<string, number>;
  sources?: Record<string, Source>;
  zeroConfirmed: boolean;
  status: string;
  entryWindowOpen?: boolean;
};

export function OvertimeCalendar({
  initial,
  mode = "employee",
}: {
  initial: InitialReport;
  mode?: Mode;
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
  const [entryWindowOpen, setEntryWindowOpen] = useState(
    initial.entryWindowOpen ?? true,
  );
  const [flight, setFlight] = useState<FlightState>(null);
  const canEdit =
    (mode === "hr" &&
      ["submitted", "reopened", "hr_proposed"].includes(status)) ||
    (mode === "employee" &&
      entryWindowOpen &&
      (["draft", "reopened"].includes(status) ||
        (status === "hr_proposed" && editingResponse)));
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
  const selectedMinutes = selected ? (entries[selected] ?? 0) : 0;
  const selectedRemaining = MAX_OVERTIME_MINUTES_PER_DAY - selectedMinutes;
  const legacyExcessDates = Object.entries(entries)
    .filter(([, minutes]) => minutes > MAX_OVERTIME_MINUTES_PER_DAY)
    .map(([date]) => date);
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
    setEntryWindowOpen(data.entryWindowOpen);
    setZeroConfirmed(data.zeroConfirmed);
    setSelected(null);
    setMessage("");
  }
  function chooseMinutes(minutes: number) {
    if (!selected || !canEdit) return;
    setEntries((current) => ({
      ...current,
      [selected]: addOvertimeMinutes(current[selected] ?? 0, minutes),
    }));
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
    if (legacyExcessDates.length) {
      setMessage(
        "Есть дни свыше 4 часов. Откройте отмеченный день и уменьшите время перед сохранением.",
      );
      return false;
    }
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
        ? mode === "hr"
          ? "Отчёт утверждён"
          : "Предложение кадровика утверждено"
        : "Отправлено на согласование",
    );
    if (to === "submitted") {
      const button = document.querySelector<HTMLElement>(
        "[data-overtime-submit]",
      );
      const target = document.querySelector<HTMLElement>(
        "[data-overtime-status]",
      );
      const box = button?.getBoundingClientRect();
      const targetBox = target?.getBoundingClientRect();
      if (box && targetBox)
        setFlight({
          id: Date.now(),
          x: box.left + box.width / 2,
          y: box.top,
          targetX: targetBox.left + targetBox.width / 2,
          targetY: targetBox.top + targetBox.height / 2,
        });
    }
  }
  async function saveAndSubmit() {
    if (await save()) await transition("submitted");
  }

  return (
    <section className={styles.workspace}>
      {mode === "employee" && !entryWindowOpen ? (
        <div className={styles.accessNotice} role="status">
          Заполнение этого месяца закрыто кадровой службой
        </div>
      ) : null}
      {mode === "employee" &&
      entryWindowOpen &&
      ["submitted", "approved"].includes(status) ? (
        <div className={styles.accessNotice} role="status">
          {status === "submitted"
            ? "Отчёт отправлен на согласование и доступен только для просмотра"
            : "Утверждённый отчёт доступен только для просмотра"}
        </div>
      ) : null}
      {mode === "employee" && status === "hr_proposed" && (
        <div className={styles.proposalNotice} role="status">
          <strong>Кадровая служба предложила корректировку</strong>
        </div>
      )}
      <div className={styles.commandBar} aria-label="Действия с отчётом">
        <div className={styles.monthControl}>
          {mode === "employee" && (
            <IconButton
              icon={ChevronLeft}
              label="Предыдущий месяц"
              onClick={() => changeMonth(-1)}
            />
          )}
          <strong>
            {months[period.month - 1]} {period.year}
          </strong>
          {mode === "employee" && (
            <IconButton
              icon={ChevronRight}
              label="Следующий месяц"
              onClick={() => changeMonth(1)}
            />
          )}
        </div>
        <div className={styles.summary}>
          <strong>
            {Math.floor(total / 60)} ч {total % 60} мин
          </strong>
          <span>{Object.keys(entries).length} дней</span>
        </div>
        <span className={styles.message} role="status" data-overtime-status>
          {message}
        </span>
        <div className={`actions ${styles.actions}`}>
          {mode === "hr" && canEdit && (
            <>
              {status !== "hr_proposed" && (
                <ActionButton
                  disabled={saving}
                  onClick={() => transition("approved")}
                >
                  Утвердить без изменений
                </ActionButton>
              )}
              <ActionButton
                variant="primary"
                disabled={
                  saving ||
                  !reason.trim() ||
                  (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={save}
              >
                Предложить изменения
              </ActionButton>
            </>
          )}
          {mode === "employee" && ["draft", "reopened"].includes(status) && (
            <>
              <ActionButton
                disabled={
                  saving ||
                  !entryWindowOpen ||
                  (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={save}
                icon={Save}
              >
                Сохранить черновик
              </ActionButton>
              <ActionButton
                data-overtime-submit
                variant="primary"
                icon={Send}
                disabled={
                  saving ||
                  !entryWindowOpen ||
                  (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={saveAndSubmit}
              >
                Отправить на согласование
              </ActionButton>
            </>
          )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            !editingResponse && (
              <>
                <ActionButton
                  disabled={saving || !entryWindowOpen}
                  onClick={() => setEditingResponse(true)}
                >
                  Изменить снова
                </ActionButton>
                <ActionButton
                  variant="primary"
                  disabled={saving}
                  onClick={() => transition("approved")}
                >
                  Подтвердить правку
                </ActionButton>
              </>
            )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            editingResponse && (
              <ActionButton
                variant="primary"
                disabled={
                  saving ||
                  !entryWindowOpen ||
                  (!Object.keys(entries).length && !zeroConfirmed)
                }
                onClick={save}
              >
                Отправить свой вариант
              </ActionButton>
            )}
        </div>
      </div>

      {legacyExcessDates.length ? (
        <div className={styles.limitAlert} role="alert">
          <AlertTriangle aria-hidden="true" size={20} />
          <span>
            <strong>Нужно исправить превышение лимита</strong>
            {legacyExcessDates.length} дн. содержат больше 4 часов. Исторические
            данные сохранены, но новые изменения нельзя отправить до
            исправления.
          </span>
        </div>
      ) : null}

      <div className={styles.editor} aria-live="polite">
        <div className={styles.selectedDate}>
          <span>
            <Clock3 aria-hidden="true" size={17} />{" "}
            {canEdit ? "Выбранный день" : "Просмотр"}
          </span>
          <strong>{selected ? formatSelectedDate(selected) : "—"}</strong>
          <span>
            {selected
              ? "Нажимайте значения справа — время суммируется"
              : "Сначала выберите день в календаре"}
          </span>
          {selected ? (
            <IconButton
              className={styles.clearButton}
              label="Очистить время выбранного дня"
              icon={Eraser}
              disabled={!entries[selected] || !canEdit}
              onClick={clearSelected}
            />
          ) : null}
        </div>
        <div className={styles.timeTotal}>
          <span>За выбранный день</span>
          <strong>
            {Math.floor(selectedMinutes / 60)} ч {selectedMinutes % 60} мин
          </strong>
          <div
            className={styles.limitTrack}
            role="progressbar"
            aria-label="Заполнение лимита 4 часа"
            aria-valuemin={0}
            aria-valuemax={MAX_OVERTIME_MINUTES_PER_DAY}
            aria-valuenow={Math.min(
              selectedMinutes,
              MAX_OVERTIME_MINUTES_PER_DAY,
            )}
          >
            <i
              style={{
                width: `${Math.min(100, (selectedMinutes / MAX_OVERTIME_MINUTES_PER_DAY) * 100)}%`,
              }}
            />
          </div>
          <small>
            {selected
              ? selectedRemaining >= 0
                ? `Осталось ${selectedRemaining} мин из 4 часов`
                : `Превышение на ${Math.abs(selectedRemaining)} мин`
              : "Лимит — 4 часа в день"}
          </small>
        </div>
        <div className={styles.incrementPanel}>
          <span>Добавить время</span>
          <div className={styles.minuteButtons}>
            {OVERTIME_MINUTES.map((minutes) => (
              <ActionButton
                className={styles.increment}
                variant="secondary"
                icon={Plus}
                key={minutes}
                disabled={
                  !selected ||
                  !canEdit ||
                  selectedMinutes + minutes > MAX_OVERTIME_MINUTES_PER_DAY
                }
                aria-label={`Добавить ${minutes === 60 ? "1 час" : `${minutes} минут`}`}
                title="Можно нажать несколько раз"
                onClick={() => chooseMinutes(minutes)}
              >
                {minutes === 60 ? "1 час" : `${minutes} мин`}
              </ActionButton>
            ))}
          </div>
        </div>
        <div className={styles.zero}>
          <ToggleControl
            label="Внеурочного времени не было"
            checked={zeroConfirmed}
            disabled={Object.keys(entries).length > 0 || !canEdit}
            onChange={setZeroConfirmed}
          />
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

      <div className={styles.legend} aria-label="Обозначения">
        <strong>Статусы дней</strong>
        <span className={styles.legendEmployee}>
          <i /> <b>Ваши данные</b>
        </span>
        <span className={styles.legendHr}>
          <i /> <b>Изменено кадровиком</b>
        </span>
        <span className={styles.legendApproved}>
          <i /> <b>Утверждено</b>
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
      <SubmissionFlight flight={flight} onComplete={() => setFlight(null)} />
    </section>
  );
}
