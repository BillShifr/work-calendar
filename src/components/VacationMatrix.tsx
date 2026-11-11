"use client";

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
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
  occupancyByDate,
  periodDays,
  shiftIsoDate,
  totalPeriodDays,
  type DatePeriod,
} from "@/domain/vacation";
import {
  beginRange,
  cancelRange,
  commitRange,
  insertPeriod,
  previewRange,
  type RangeDraft,
} from "@/domain/vacation-selection";
import {
  dateFromCalendarEvent,
  dateFromPoint,
  paintVacationPreview,
  vacationSelectionCopy,
} from "./vacation-preview";
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
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const formatDate = (value: string) =>
  shortDate.format(new Date(`${value}T00:00:00Z`));
const formatDayLabel = (value: string) =>
  longDate.format(new Date(`${value}T00:00:00Z`));
const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const compactQuery = "(max-width: 1500px)";
const DRAG_THRESHOLD_PX = 12;
const previewClasses = {
  preview: styles.preview,
  previewInvalid: styles.previewInvalid,
};

function subscribeCompact(onStoreChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function useCompactCalendar() {
  return useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(compactQuery).matches,
    () => true,
  );
}

const VacationDayButton = memo(function VacationDayButton({
  date,
  day,
  valid,
  canEdit,
  compact,
  occupiedClass,
  segmentStart,
  segmentEnd,
  adjacentStart,
  isStart,
  label,
}: {
  date: string;
  day: number;
  valid: boolean;
  canEdit: boolean;
  compact: boolean;
  occupiedClass: string;
  segmentStart: boolean;
  segmentEnd: boolean;
  adjacentStart: boolean;
  isStart: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      data-date={date}
      disabled={!valid || !canEdit}
      aria-label={valid ? label : undefined}
      className={[
        compact ? styles.mobileDay : styles.day,
        !valid ? styles.invalid : !canEdit ? styles.readonly : "",
        occupiedClass,
        segmentStart ? styles.segmentStart : "",
        segmentEnd ? styles.segmentEnd : "",
        adjacentStart ? styles.adjacentStart : "",
        isStart ? styles.start : "",
      ].join(" ")}
    >
      {valid ? (
        <>
          {compact ? (
            <span>{day}</span>
          ) : (
            <span className={styles.dayValue}>{day}</span>
          )}
          {occupiedClass ? (
            <span className={styles.periodBracket} aria-hidden="true" />
          ) : null}
          {adjacentStart ? (
            <span className={styles.seamMark} aria-hidden="true" />
          ) : null}
        </>
      ) : (
        ""
      )}
    </button>
  );
});

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
  const router = useRouter();
  const compact = useCompactCalendar();
  const [year, setYear] = useState(initial.year);
  const [allowanceDays, setAllowanceDays] = useState(initial.allowanceDays);
  const [version, setVersion] = useState(initial.version);
  const [periods, setPeriods] = useState(initial.periods);
  const [pickingAnchor, setPickingAnchor] = useState<string | null>(null);
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
  const [flight, setFlight] = useState<FlightState>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const draftRef = useRef<RangeDraft | null>(null);
  const periodsRef = useRef(periods);
  const allowanceRef = useRef(allowanceDays);
  const ignoreClickRef = useRef(false);
  const pointerRef = useRef<{
    date: string;
    x: number;
    y: number;
    dragging: boolean;
  } | null>(null);
  const canEdit =
    (mode === "hr" &&
      ["submitted", "reopened", "hr_proposed"].includes(status)) ||
    (mode === "employee" &&
      entryWindowOpen &&
      (["draft", "reopened"].includes(status) ||
        (status === "hr_proposed" && editingResponse)));
  const occupancy = useMemo(() => occupancyByDate(periods), [periods]);
  const total = totalPeriodDays(periods);
  const excess = Math.max(0, total - allowanceDays);
  const remainingDays = Math.max(0, allowanceDays - total);
  const remainingRef = useRef(remainingDays);

  const paintDraft = useCallback((draft: RangeDraft | null) => {
    paintVacationPreview(
      calendarRef.current,
      previewClasses,
      draft,
      periodsRef.current,
      allowanceRef.current,
    );
    const copy = vacationSelectionCopy(draft, remainingRef.current, formatDate);
    if (titleRef.current) titleRef.current.textContent = copy.title;
    if (detailRef.current) detailRef.current.textContent = copy.detail;
  }, []);

  useLayoutEffect(() => {
    periodsRef.current = periods;
    allowanceRef.current = allowanceDays;
    remainingRef.current = remainingDays;
    paintDraft(draftRef.current);
  }, [
    paintDraft,
    periods,
    allowanceDays,
    remainingDays,
    compact,
    year,
    mobileMonth,
  ]);

  const startDraft = useCallback(
    (anchor: string, editing: DatePeriod | null = null) => {
      const draft = beginRange(anchor, editing);
      draftRef.current = draft;
      setPickingAnchor(anchor);
      setMessage("Начало выбрано. Теперь укажите последний день.");
      paintDraft(draft);
    },
    [paintDraft],
  );

  const finishDraft = useCallback(
    (end: string) => {
      const draft = draftRef.current;
      if (!draft) return;
      const result = commitRange(
        draft,
        end,
        periodsRef.current,
        allowanceRef.current,
        mode,
      );
      if (result.status === "overlap") {
        draftRef.current = null;
        setPickingAnchor(null);
        setMessage("Этот период пересекается с уже выбранным.");
        paintDraft(null);
        return;
      }
      if (result.status === "allowance") {
        draftRef.current = result.draft;
        setMessage(
          `Нельзя добавить период: доступно ${Math.max(0, allowanceRef.current - totalPeriodDays(periodsRef.current))} из ${allowanceRef.current} дней. Выберите другую дату окончания.`,
        );
        paintDraft(result.draft);
        return;
      }
      const next = insertPeriod(periodsRef.current, result.period);
      periodsRef.current = next;
      draftRef.current = null;
      setPickingAnchor(null);
      setPeriods(next);
      setMessage("Период добавлен и пока не сохранён.");
    },
    [mode, paintDraft],
  );

  const onCalendarPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!canEdit) return;
      const date = dateFromCalendarEvent(event.target);
      if (!date) return;
      pointerRef.current = {
        date,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
      };
    },
    [canEdit],
  );

  const onCalendarPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      if (!pointer) return;
      const distance = Math.hypot(
        event.clientX - pointer.x,
        event.clientY - pointer.y,
      );
      if (!pointer.dragging && distance < DRAG_THRESHOLD_PX) return;
      pointer.dragging = true;
      if (!draftRef.current) startDraft(pointer.date);
      const date =
        dateFromPoint(event.clientX, event.clientY) ??
        dateFromCalendarEvent(event.target);
      if (!date) return;
      const draft = draftRef.current;
      if (!draft || draft.hover === date) return;
      draftRef.current = previewRange(draft, date);
      paintDraft(draftRef.current);
    },
    [paintDraft, startDraft],
  );

  const onCalendarPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current;
      pointerRef.current = null;
      if (!pointer?.dragging) return;
      const date =
        dateFromPoint(event.clientX, event.clientY) ??
        dateFromCalendarEvent(event.target) ??
        pointer.date;
      ignoreClickRef.current = true;
      finishDraft(date);
    },
    [finishDraft],
  );

  const onCalendarClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (ignoreClickRef.current) {
        ignoreClickRef.current = false;
        return;
      }
      if (!canEdit) return;
      const date = dateFromCalendarEvent(event.target);
      if (!date) return;
      if (!draftRef.current) {
        startDraft(date);
        return;
      }
      finishDraft(date);
    },
    [canEdit, finishDraft, startDraft],
  );

  function dayModel(date: string, day: number, monthLength: number) {
    const period = occupancy.get(date);
    const previousPeriod = period
      ? occupancy.get(shiftIsoDate(date, -1))
      : undefined;
    return {
      occupiedClass: [
        period ? (period.source === "hr" ? styles.hrRange : styles.range) : "",
        period?.status === "approved" ? styles.approved : "",
      ]
        .filter(Boolean)
        .join(" "),
      segmentStart: Boolean(period && (period.startsOn === date || day === 1)),
      segmentEnd: Boolean(
        period && (period.endsOn === date || day === monthLength),
      ),
      adjacentStart: Boolean(
        period &&
        period.startsOn === date &&
        previousPeriod &&
        previousPeriod.id !== period.id,
      ),
      label: `${formatDayLabel(date)}${period ? `, период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}` : ""}`,
    };
  }

  function renderDay(
    date: string,
    day: number,
    monthLength: number,
    valid: boolean,
  ) {
    const model = valid
      ? dayModel(date, day, monthLength)
      : {
          occupiedClass: "",
          segmentStart: false,
          segmentEnd: false,
          adjacentStart: false,
          label: "",
        };
    return (
      <VacationDayButton
        key={date}
        date={date}
        day={day}
        valid={valid}
        canEdit={canEdit}
        compact={compact}
        occupiedClass={model.occupiedClass}
        segmentStart={model.segmentStart}
        segmentEnd={model.segmentEnd}
        adjacentStart={model.adjacentStart}
        isStart={date === pickingAnchor}
        label={model.label}
      />
    );
  }

  function editPeriod(period: DatePeriod) {
    if (!canEdit) return;
    const next = periodsRef.current.filter((item) => item.id !== period.id);
    periodsRef.current = next;
    setPeriods(next);
    startDraft(period.startsOn, period);
    setMessage("Изменение периода: выберите новую дату окончания.");
  }

  function cancelSelection() {
    const restored = cancelRange(draftRef.current);
    draftRef.current = null;
    setPickingAnchor(null);
    if (restored) {
      const next = insertPeriod(periodsRef.current, restored);
      periodsRef.current = next;
      setPeriods(next);
    }
    setMessage("");
    paintDraft(null);
  }

  async function changeYear(delta: number) {
    const nextYear = year + delta;
    const response = await fetch(`/api/vacations?year=${nextYear}`);
    const data = await response.json();
    draftRef.current = null;
    setPickingAnchor(null);
    setYear(nextYear);
    setVersion(data.version);
    setPeriods(data.periods);
    setAllowanceDays(data.allowanceDays);
    setPlanId(data.id);
    setStatus(data.status);
    setEntryWindowOpen(data.entryWindowOpen);
    setMobileMonth(0);
    setMessage("");
  }

  async function save() {
    if (draftRef.current) {
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
    if (mode === "hr") router.refresh();
    return true;
  }

  async function submit() {
    if (!(await save())) return;
    setSaving(true);
    setConfirmSubmit(false);
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
    setMessage(
      data.status === "manager_review"
        ? "План отправлен руководителю"
        : "План отправлен кадровой службе",
    );
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

  async function supplementPlan() {
    setSaving(true);
    setMessage("Возвращаем план в черновик…");
    const response = await fetch("/api/workflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        aggregate: "vacation_plan",
        id: planId,
        to: "draft",
        comment: "Дополнение плана",
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось вернуть план");
      return;
    }
    setStatus(data.status);
    setVersion(data.version);
    setMessage(
      remainingDays > 0
        ? `Можно добрать ещё ${remainingDays} дн. и отправить снова.`
        : "План снова в черновике.",
    );
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

  const calendarEvents = {
    onPointerDown: onCalendarPointerDown,
    onPointerMove: onCalendarPointerMove,
    onPointerUp: onCalendarPointerUp,
    onPointerCancel: () => {
      pointerRef.current = null;
    },
    onClick: onCalendarClick,
  };

  return (
    <section className={styles.workspace}>
      {mode === "employee" && !entryWindowOpen ? (
        <div className={styles.accessNotice} role="status">
          Заполнение на {year} год закрыто кадровой службой
        </div>
      ) : null}
      {mode === "employee" &&
      entryWindowOpen &&
      ["manager_review", "submitted", "approved"].includes(status) ? (
        <div className={styles.accessNotice} role="status">
          {status === "manager_review"
            ? "План у руководителя. Добор дней — через «Дополнить план»."
            : status === "submitted"
              ? "План у кадровой службы. Добор дней — через «Дополнить план»."
              : "Утверждённый план доступен только для просмотра"}
        </div>
      ) : null}
      {mode === "employee" && confirmSubmit ? (
        <div
          className={styles.confirmBar}
          role="region"
          aria-label="Подтверждение отправки"
        >
          <div>
            <strong>
              {total} из {allowanceDays} дн.
              {remainingDays > 0 ? ` · останется ${remainingDays}` : ""}
            </strong>
            <span>
              Сначала проверит руководитель подразделения, затем кадровая
              служба. Пока план на проверке, даты нельзя менять без отзыва.
            </span>
          </div>
          <div className={styles.confirmActions}>
            <ActionButton
              variant="quiet"
              disabled={saving}
              onClick={() => setConfirmSubmit(false)}
            >
              Назад
            </ActionButton>
            <ActionButton
              data-vacation-submit
              variant="primary"
              icon={Send}
              disabled={saving}
              onClick={submit}
            >
              Подтвердить отправку
            </ActionButton>
          </div>
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
            disabled={!pickingAnchor}
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
          {mode === "employee" &&
            ["draft", "reopened"].includes(status) &&
            !confirmSubmit && (
              <ActionButton
                variant="primary"
                icon={Send}
                disabled={
                  saving ||
                  !entryWindowOpen ||
                  !periods.length ||
                  total > allowanceDays
                }
                onClick={() => setConfirmSubmit(true)}
              >
                Отправить
              </ActionButton>
            )}
          {mode === "employee" &&
            entryWindowOpen &&
            ["manager_review", "submitted"].includes(status) && (
              <ActionButton
                icon={Pencil}
                disabled={saving}
                onClick={supplementPlan}
              >
                Дополнить план
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
          <strong ref={titleRef} />
          <span ref={detailRef} />
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
                {canEdit ? (
                  <>
                    <IconButton
                      label={`Изменить период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}`}
                      icon={Pencil}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        editPeriod(period);
                      }}
                    />
                    <IconButton
                      label={`Удалить период ${formatDate(period.startsOn)} — ${formatDate(period.endsOn)}`}
                      icon={Trash2}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        const next = periodsRef.current.filter(
                          (item) => item.id !== period.id,
                        );
                        periodsRef.current = next;
                        setPeriods(next);
                        setMessage("Период удалён и пока не сохранён.");
                      }}
                    />
                  </>
                ) : null}
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

      {compact ? (
        <div
          ref={calendarRef}
          className={styles.mobileCalendar}
          aria-label="Календарь отпускных дней"
          {...calendarEvents}
        >
          <div className={styles.mobileMonthHead}>
            <IconButton
              label="Предыдущий месяц"
              icon={ChevronLeft}
              onClick={() => setMobileMonth((value) => Math.max(0, value - 1))}
              disabled={mobileMonth === 0}
            />
            <strong>
              <CalendarDays aria-hidden="true" size={19} />{" "}
              {months[mobileMonth]} {year}
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
                  (new Date(Date.UTC(year, mobileMonth, 1)).getUTCDay() + 6) %
                  7,
              },
              (_, index) => (
                <span key={`empty-${index}`} />
              ),
            )}
            {Array.from(
              { length: daysInMonth(year, mobileMonth + 1) },
              (_, index) => {
                const day = index + 1;
                return renderDay(
                  iso(year, mobileMonth + 1, day),
                  day,
                  daysInMonth(year, mobileMonth + 1),
                  true,
                );
              },
            )}
          </div>
        </div>
      ) : (
        <div
          ref={calendarRef}
          className={styles.scroll}
          aria-label="Матрица отпускных дней"
          {...calendarEvents}
        >
          <div className={styles.matrix}>
            <span className={styles.corner} />
            {Array.from({ length: 31 }, (_, index) => (
              <span className={styles.dayHead} key={index}>
                {index + 1}
              </span>
            ))}
            {months.map((monthName, monthIndex) => {
              const monthLength = daysInMonth(year, monthIndex + 1);
              return (
                <div style={{ display: "contents" }} key={monthName}>
                  <span className={styles.month}>{monthName}</span>
                  {Array.from({ length: 31 }, (_, index) => {
                    const day = index + 1;
                    return renderDay(
                      iso(year, monthIndex + 1, day),
                      day,
                      monthLength,
                      day <= monthLength,
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <SubmissionFlight flight={flight} onComplete={() => setFlight(null)} />
    </section>
  );
}
