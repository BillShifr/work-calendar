"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { daysInMonth } from "@/domain/overtime";
import {
  normalizePeriod,
  periodDays,
  totalPeriodDays,
  type DatePeriod,
} from "@/domain/vacation";
import {
  ActionButton,
  IconButton,
  SubmissionFlight,
  type FlightState,
} from "./FormControls";
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
const formatDayLabel = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(
    new Date(`${value}T00:00:00Z`),
  );
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const shiftDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

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
    entryWindowOpen?: boolean;
  };
  mode?: "employee" | "hr";
}) {
  const [year, setYear] = useState(initial.year);
  const [allowanceDays, setAllowanceDays] = useState(initial.allowanceDays);
  const [version, setVersion] = useState(initial.version);
  const [periods, setPeriods] = useState(initial.periods);
  const [start, setStart] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [planId, setPlanId] = useState(initial.id);
  const [status, setStatus] = useState(initial.status);
  const [reason, setReason] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);
  const [entryWindowOpen, setEntryWindowOpen] = useState(
    initial.entryWindowOpen ?? true,
  );
  const [mobileMonth, setMobileMonth] = useState(0);
  const [editingPeriod, setEditingPeriod] = useState<DatePeriod | null>(null);
  const [hoveredEnd, setHoveredEnd] = useState<string | null>(null);
  const [flight, setFlight] = useState<FlightState>(null);
  const canEdit =
    (mode === "hr" &&
      ["submitted", "reopened", "hr_proposed"].includes(status)) ||
    (mode === "employee" &&
      entryWindowOpen &&
      (["draft", "reopened"].includes(status) ||
        (status === "hr_proposed" && editingResponse)));
  const total = totalPeriodDays(periods);
  const excess = Math.max(0, total - allowanceDays);
  const remainingDays = Math.max(0, allowanceDays - total);
  const previewPeriod =
    start && hoveredEnd ? normalizePeriod(start, hoveredEnd) : null;
  const previewDays = previewPeriod ? periodDays(previewPeriod) : 0;
  const previewOverLimit = previewDays > remainingDays;
  function isPreviewDate(date: string) {
    return Boolean(
      previewPeriod &&
      previewPeriod.startsOn <= date &&
      previewPeriod.endsOn >= date,
    );
  }
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
      setHoveredEnd(null);
      return;
    }
    const nextTotal = total + periodDays(next);
    if (nextTotal > allowanceDays) {
      setMessage(
        `Нельзя добавить период: доступно ${Math.max(0, allowanceDays - total)} из ${allowanceDays} дней. Выберите другую дату окончания.`,
      );
      return;
    }
    setPeriods((current) =>
      [...current, next].sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    );
    setStart(null);
    setEditingPeriod(null);
    setHoveredEnd(null);
    setMessage("Период добавлен и пока не сохранён.");
  }
  function editPeriod(period: DatePeriod) {
    if (!canEdit) return;
    setEditingPeriod(period);
    setPeriods((current) => current.filter((item) => item.id !== period.id));
    setStart(period.startsOn);
    setHoveredEnd(period.endsOn);
    setMessage("Изменение периода: выберите новую дату окончания.");
  }
  function cancelSelection() {
    if (editingPeriod) {
      setPeriods((current) =>
        [...current, editingPeriod].sort((a, b) =>
          a.startsOn.localeCompare(b.startsOn),
        ),
      );
    }
    setEditingPeriod(null);
    setStart(null);
    setHoveredEnd(null);
    setMessage("");
  }
  async function changeYear(delta: number) {
    const nextYear = year + delta;
    const response = await fetch(`/api/vacations?year=${nextYear}`);
    const data = await response.json();
    setYear(nextYear);
    setVersion(data.version);
    setPeriods(data.periods);
    setAllowanceDays(data.allowanceDays);
    setPlanId(data.id);
    setStatus(data.status);
    setEntryWindowOpen(data.entryWindowOpen);
    setStart(null);
    setEditingPeriod(null);
    setHoveredEnd(null);
    setMobileMonth(0);
    setMessage("");
  }
  async function save() {
    if (start) {
      setMessage("Завершите выбор периода или отмените начальную дату.");
      return false;
    }
    if (total > allowanceDays) {
      setMessage(`Уберите ещё ${excess} дн., чтобы сохранить план.`);
      return false;
    }
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
      return false;
    }
    setVersion(data.version);
    if (data.status) setStatus(data.status);
    if (data.periods) setPeriods(data.periods);
    setEditingResponse(false);
    setMessage("Сохранено");
    return true;
  }
  async function submit() {
    if (!(await save())) return;
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
    const button = document.querySelector<HTMLElement>(
      "[data-vacation-submit]",
    );
    const target = document.querySelector<HTMLElement>(
      "[data-vacation-status]",
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
      {mode === "employee" && !entryWindowOpen ? (
        <div className={styles.accessNotice} role="status">
          Заполнение на {year} год закрыто кадровой службой
        </div>
      ) : null}
      {mode === "employee" &&
      entryWindowOpen &&
      ["submitted", "approved"].includes(status) ? (
        <div className={styles.accessNotice} role="status">
          {status === "submitted"
            ? "План отправлен кадровику и доступен только для просмотра"
            : "Утверждённый план доступен только для просмотра"}
        </div>
      ) : null}
      <div className={styles.commandBar} aria-label="Действия с планом">
        <div className={styles.yearControl}>
          <IconButton
            label="Предыдущий год"
            icon={ChevronLeft}
            onClick={() => changeYear(-1)}
          />
          <strong>{year}</strong>
          <IconButton
            label="Следующий год"
            icon={ChevronRight}
            onClick={() => changeYear(1)}
          />
        </div>
        <div
          className={`${styles.total} ${total > allowanceDays ? styles.totalExceeded : ""}`}
        >
          <strong>{total}</strong>
          <span>из {allowanceDays} дней</span>
        </div>
        <span className={styles.message} role="status" data-vacation-status>
          {message}
        </span>
        <div className={`actions ${styles.actions}`}>
          <ActionButton
            variant="quiet"
            icon={X}
            disabled={!start}
            onClick={cancelSelection}
          >
            Отменить выбор
          </ActionButton>
          {mode === "hr" && canEdit && (
            <>
              {status !== "hr_proposed" && (
                <ActionButton
                  disabled={saving || total > allowanceDays}
                  onClick={approve}
                >
                  Утвердить без изменений
                </ActionButton>
              )}
              <ActionButton
                variant="primary"
                disabled={saving || !reason.trim() || total > allowanceDays}
                onClick={save}
              >
                Предложить изменения
              </ActionButton>
            </>
          )}
          {mode === "employee" &&
            (["draft", "reopened"].includes(status) || editingResponse) && (
              <ActionButton
                icon={Save}
                disabled={saving || !entryWindowOpen}
                onClick={save}
              >
                {editingResponse
                  ? "Отправить свой вариант"
                  : "Сохранить черновик"}
              </ActionButton>
            )}
          {mode === "employee" && ["draft", "reopened"].includes(status) && (
            <ActionButton
              data-vacation-submit
              variant="primary"
              icon={Send}
              disabled={
                saving ||
                !entryWindowOpen ||
                !["draft", "reopened"].includes(status) ||
                !periods.length ||
                total > allowanceDays
              }
              onClick={submit}
            >
              Отправить кадровику
            </ActionButton>
          )}
          {mode === "employee" &&
            status === "hr_proposed" &&
            !editingResponse && (
              <>
                <ActionButton
                  disabled={!entryWindowOpen}
                  onClick={() => {
                    setEditingResponse(true);
                    setMessage("Измените периоды и отправьте свой вариант.");
                  }}
                >
                  Изменить снова
                </ActionButton>
                <ActionButton
                  variant="primary"
                  disabled={saving}
                  onClick={approve}
                >
                  Подтвердить правку
                </ActionButton>
              </>
            )}
        </div>
      </div>

      {excess > 0 ? (
        <div className={styles.correctionNotice} role="alert">
          <strong>План превышает лимит на {excess} дн.</strong>
          <span>
            Откройте один из периодов и сократите его — после этого черновик
            можно сохранить.
          </span>
        </div>
      ) : null}

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
          {start ? (
            <span>
              {hoveredEnd
                ? `${formatDate(start)} — ${formatDate(hoveredEnd)} · ${previewDays} дн.`
                : `Выберите последний день · доступно ${remainingDays} дн.`}
            </span>
          ) : (
            <span>Нажмите начальный и конечный день</span>
          )}
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
                    {period.source === "hr" ? "Правка кадровика" : "Ваш период"}{" "}
                    · {periodDays(period)} дн.
                  </small>
                </span>
                <IconButton
                  disabled={!canEdit}
                  label={`Изменить период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}`}
                  icon={Pencil}
                  onClick={() => editPeriod(period)}
                />
                <IconButton
                  disabled={!canEdit}
                  label={`Удалить период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}`}
                  icon={Trash2}
                  onClick={() => {
                    setPeriods((current) =>
                      current.filter((item) => item.id !== period.id),
                    );
                    setMessage("Период удалён и пока не сохранён.");
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <span className={styles.empty}>Не выбраны</span>
        )}
        <div className={styles.legend} aria-label="Обозначения">
          <strong>Статусы</strong>
          <span className={styles.legendEmployee}>
            <i /> <b>Ваш период</b>
          </span>
          <span className={styles.legendHr}>
            <i /> <b>Изменено кадровиком</b>
          </span>
          <span className={styles.legendApproved}>
            <i /> <b>Утверждено</b>
          </span>
        </div>
      </div>

      <div className={styles.scroll} aria-label="Матрица отпускных дней">
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
                const previousPeriod =
                  valid && period ? periodFor(shiftDate(date, -1)) : undefined;
                const segmentStart = Boolean(
                  period && (period.startsOn === date || day === 1),
                );
                const segmentEnd = Boolean(
                  period &&
                  (period.endsOn === date ||
                    day === daysInMonth(year, monthIndex + 1)),
                );
                const adjacentStart = Boolean(
                  period &&
                  period.startsOn === date &&
                  previousPeriod &&
                  previousPeriod.id !== period.id,
                );
                return (
                  <button
                    key={date}
                    disabled={!valid || !canEdit}
                    onClick={() => select(date)}
                    onPointerEnter={() => start && valid && setHoveredEnd(date)}
                    onFocus={() => start && valid && setHoveredEnd(date)}
                    aria-label={
                      valid
                        ? `${formatDayLabel(date)}${period ? `, период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}` : ""}`
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
                      segmentStart ? styles.segmentStart : "",
                      segmentEnd ? styles.segmentEnd : "",
                      adjacentStart ? styles.adjacentStart : "",
                      isPreviewDate(date)
                        ? previewOverLimit
                          ? styles.previewInvalid
                          : styles.preview
                        : "",
                      start === date ? styles.start : "",
                    ].join(" ")}
                  >
                    {valid ? (
                      <>
                        <span className={styles.dayValue}>{day}</span>
                        {period ? (
                          <span
                            className={styles.periodBracket}
                            aria-hidden="true"
                          />
                        ) : null}
                        {adjacentStart ? (
                          <span
                            className={styles.seamMark}
                            aria-hidden="true"
                          />
                        ) : null}
                      </>
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        className={styles.mobileCalendar}
        aria-label="Календарь отпускных дней"
      >
        <div className={styles.mobileMonthHead}>
          <IconButton
            label="Предыдущий месяц"
            icon={ChevronLeft}
            onClick={() => setMobileMonth((value) => Math.max(0, value - 1))}
            disabled={mobileMonth === 0}
          />
          <strong>
            <CalendarDays aria-hidden="true" size={19} /> {months[mobileMonth]}{" "}
            {year}
          </strong>
          <IconButton
            label="Следующий месяц"
            icon={ChevronRight}
            onClick={() => setMobileMonth((value) => Math.min(11, value + 1))}
            disabled={mobileMonth === 11}
          />
        </div>
        <div className={styles.mobileWeekdays}>
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className={styles.mobileDays}>
          {Array.from(
            {
              length:
                (new Date(Date.UTC(year, mobileMonth, 1)).getUTCDay() + 6) % 7,
            },
            (_, index) => (
              <span key={`empty-${index}`} />
            ),
          )}
          {Array.from(
            { length: daysInMonth(year, mobileMonth + 1) },
            (_, index) => {
              const day = index + 1;
              const date = iso(year, mobileMonth + 1, day);
              const period = periodFor(date);
              const previousPeriod = period
                ? periodFor(shiftDate(date, -1))
                : undefined;
              const segmentStart = Boolean(
                period && (period.startsOn === date || day === 1),
              );
              const segmentEnd = Boolean(
                period &&
                (period.endsOn === date ||
                  day === daysInMonth(year, mobileMonth + 1)),
              );
              const adjacentStart = Boolean(
                period &&
                period.startsOn === date &&
                previousPeriod &&
                previousPeriod.id !== period.id,
              );
              return (
                <button
                  key={date}
                  disabled={!canEdit}
                  onClick={() => select(date)}
                  onPointerEnter={() => start && setHoveredEnd(date)}
                  onFocus={() => start && setHoveredEnd(date)}
                  aria-label={`${formatDayLabel(date)}${period ? `, период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}` : ""}`}
                  className={[
                    styles.mobileDay,
                    period
                      ? period.source === "hr"
                        ? styles.hrRange
                        : styles.range
                      : "",
                    period?.status === "approved" ? styles.approved : "",
                    segmentStart ? styles.segmentStart : "",
                    segmentEnd ? styles.segmentEnd : "",
                    adjacentStart ? styles.adjacentStart : "",
                    isPreviewDate(date)
                      ? previewOverLimit
                        ? styles.previewInvalid
                        : styles.preview
                      : "",
                    start === date ? styles.start : "",
                  ].join(" ")}
                >
                  <span>{day}</span>
                  {period ? (
                    <span className={styles.periodBracket} aria-hidden="true" />
                  ) : null}
                  {adjacentStart ? (
                    <span className={styles.seamMark} aria-hidden="true" />
                  ) : null}
                </button>
              );
            },
          )}
        </div>
      </div>
      <SubmissionFlight flight={flight} onComplete={() => setFlight(null)} />
    </section>
  );
}
