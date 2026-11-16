"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { daysInMonth } from "@/domain/overtime";
import {
  classifyProductionDay,
  weekdayShortLabel,
} from "@/domain/production-calendar";
import {
  allDepartmentIds,
  assignBoardLayerColors,
  defaultDepartmentIds,
  employeeAbsentDates,
  filterBoardPeople,
  firstOverlapDayInMonth,
  firstOverlapOrBusyMonth,
  orgOccupancyByDate,
  overlapDetailsForDate,
  peakOccupancyByMonth,
  peopleInDepartments,
  sortBoardPeopleForMonth,
  type OrgVacationMatrixDepartment,
} from "@/domain/org-vacation-matrix-shared";
import { IconButton, SegmentedControl } from "./FormControls";
import { OptionPicker } from "./OptionPicker";
import { useOrgBoardDisplayMode } from "./useOrgBoardDisplayMode";
import styles from "./OrgVacationMatrix.module.css";

const MONTHS = [
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
const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const dateLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDay(isoDate: string) {
  return dateLabel.format(new Date(`${isoDate}T00:00:00Z`));
}

function formatRange(startsOn: string, endsOn: string) {
  if (startsOn === endsOn) return formatDay(startsOn);
  return `${shortDate.format(new Date(`${startsOn}T00:00:00Z`))} – ${shortDate.format(
    new Date(`${endsOn}T00:00:00Z`),
  )}`;
}

function daysWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

export function OrgVacationMatrix({
  year,
  actorUserId,
  departments,
}: {
  year: number;
  actorUserId: string;
  departments: OrgVacationMatrixDepartment[];
}) {
  const router = useRouter();
  const [boardMode, setBoardMode] = useOrgBoardDisplayMode();
  const colored = boardMode === "color";
  const [departmentIds, setDepartmentIds] = useState(
    () => new Set(defaultDepartmentIds(departments, actorUserId)),
  );
  const [userIds, setUserIds] = useState(() => {
    const initial = new Set(defaultDepartmentIds(departments, actorUserId));
    return new Set(
      peopleInDepartments(departments, initial).map(
        (employee) => employee.userId,
      ),
    );
  });
  const peopleOptions = useMemo(
    () => peopleInDepartments(departments, departmentIds),
    [departments, departmentIds],
  );
  const people = useMemo(
    () => filterBoardPeople(departments, departmentIds, userIds),
    [departments, departmentIds, userIds],
  );
  const occupancy = useMemo(
    () => orgOccupancyByDate(people, year),
    [people, year],
  );
  const peaks = useMemo(
    () => peakOccupancyByMonth(occupancy, year),
    [occupancy, year],
  );
  const [month, setMonth] = useState(() =>
    firstOverlapOrBusyMonth(occupancy, year),
  );
  const monthLength = daysInMonth(year, month);
  const [modalDay, setModalDay] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<{
    date: string;
    days: number;
    x: number;
    y: number;
  } | null>(null);
  const absentByPerson = useMemo(
    () =>
      new Map(
        people.map((person) => [
          person.userId,
          employeeAbsentDates(person, year),
        ]),
      ),
    [people, year],
  );
  const sortedPeople = useMemo(
    () =>
      sortBoardPeopleForMonth(
        people,
        absentByPerson,
        occupancy,
        year,
        month,
        monthLength,
      ),
    [absentByPerson, month, monthLength, occupancy, people, year],
  );
  const layerColors = useMemo(
    () => assignBoardLayerColors(people.map((person) => person.userId)),
    [people],
  );
  const defaultOverlapDay = useMemo(
    () => firstOverlapDayInMonth(occupancy, year, month, monthLength),
    [month, monthLength, occupancy, year],
  );
  const showDepartment =
    new Set(people.map((person) => person.departmentId)).size > 1;
  const columns = `minmax(220px, 260px) repeat(${monthLength}, minmax(36px, 1fr))`;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const focusDate = useMemo(() => {
    const dates = Array.from({ length: monthLength }, (_, index) =>
      iso(year, month, index + 1),
    );
    return (
      dates.find((date) => (occupancy.get(date)?.length ?? 0) > 1) ??
      dates.find((date) => (occupancy.get(date)?.length ?? 0) > 0) ??
      null
    );
  }, [month, monthLength, occupancy, year]);
  const activeDay = hoverTip?.date ?? modalDay ?? defaultOverlapDay;
  const modalDetails = modalDay
    ? overlapDetailsForDate(people, modalDay)
    : null;

  useLayoutEffect(() => {
    const anchor = defaultOverlapDay ?? focusDate;
    if (!anchor) return;
    const cell = scrollerRef.current?.querySelector(`[data-date="${anchor}"]`);
    cell?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [defaultOverlapDay, focusDate, month]);

  function toggleDepartment(id: string, on: boolean) {
    const nextDepartments = new Set(departmentIds);
    if (on) nextDepartments.add(id);
    else nextDepartments.delete(id);
    const memberIds =
      departments
        .find((department) => department.id === id)
        ?.employees.map((employee) => employee.userId) ?? [];
    const nextUsers = new Set(userIds);
    for (const userId of memberIds) {
      if (on) nextUsers.add(userId);
      else nextUsers.delete(userId);
    }
    setDepartmentIds(nextDepartments);
    setUserIds(nextUsers);
    setHoverTip(null);
    setModalDay(null);
  }

  function dayTone(date: string) {
    const kind = classifyProductionDay(date);
    if (kind === "holiday") return styles.holiday;
    if (kind === "weekend") return styles.weekend;
    if (kind === "short") return styles.shortDay;
    return "";
  }

  function pickMonth(next: number) {
    setMonth(next);
    setHoverTip(null);
    setModalDay(null);
  }

  function pickDay(date: string) {
    setHoverTip(null);
    if ((occupancy.get(date)?.length ?? 0) > 1) setModalDay(date);
  }

  function inspectDay(date: string, target: HTMLElement) {
    const details = overlapDetailsForDate(people, date);
    if (details.people.length < 2 || details.spanDays < 1) {
      setHoverTip(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setHoverTip({
      date,
      days: details.spanDays,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }

  function overlapRun(date: string, day: number) {
    const count = occupancy.get(date)?.length ?? 0;
    if (count < 2) return { overlap: false, start: false, end: false };
    const prev = day > 1 ? iso(year, month, day - 1) : "";
    const next = day < monthLength ? iso(year, month, day + 1) : "";
    return {
      overlap: true,
      start: (occupancy.get(prev)?.length ?? 0) < 2,
      end: (occupancy.get(next)?.length ?? 0) < 2,
    };
  }

  function personPeriodClass(
    date: string,
    absent: boolean,
    prevAbsent: boolean,
    nextAbsent: boolean,
  ) {
    const classes = [styles.cell, dayTone(date)];
    if (absent) {
      classes.push(styles.period);
      if (!prevAbsent) classes.push(styles.periodStart);
      if (!nextAbsent) classes.push(styles.periodEnd);
    }
    return classes.join(" ");
  }

  return (
    <>
      <header className="pageHeader">
        <h1>График отпусков</h1>
        <div className={styles.year}>
          <IconButton
            label="Предыдущий год"
            icon={ChevronLeft}
            onClick={() => router.push(`/vacations/board?year=${year - 1}`)}
          />
          <strong>{year}</strong>
          <IconButton
            label="Следующий год"
            icon={ChevronRight}
            onClick={() => router.push(`/vacations/board?year=${year + 1}`)}
          />
        </div>
      </header>

      <div className={styles.toolbar}>
        <OptionPicker
          label="Подразделения"
          items={departments.map((department) => ({
            id: department.id,
            label: `${department.name} · ${department.employees.length}`,
          }))}
          selected={departmentIds}
          onToggle={toggleDepartment}
          onToggleAll={(on) => {
            const next = new Set(on ? allDepartmentIds(departments) : []);
            setDepartmentIds(next);
            setUserIds(
              new Set(
                peopleInDepartments(departments, next).map(
                  (employee) => employee.userId,
                ),
              ),
            );
            setHoverTip(null);
            setModalDay(null);
          }}
        />
        <OptionPicker
          label="Сотрудники"
          items={peopleOptions.map((employee) => ({
            id: employee.userId,
            label: employee.fullName,
          }))}
          selected={userIds}
          onToggle={(id, on) => {
            const next = new Set(userIds);
            if (on) next.add(id);
            else next.delete(id);
            setUserIds(next);
            setHoverTip(null);
            setModalDay(null);
          }}
          onToggleAll={(on) => {
            setUserIds(
              new Set(
                on ? peopleOptions.map((employee) => employee.userId) : [],
              ),
            );
            setHoverTip(null);
            setModalDay(null);
          }}
        />
        <div className={styles.mode}>
          <SegmentedControl
            label="Вид"
            value={boardMode}
            onChange={(value) =>
              setBoardMode(value === "simple" ? "simple" : "color")
            }
            options={[
              { value: "simple", label: "Простой" },
              { value: "color", label: "Цвета" },
            ]}
          />
        </div>
      </div>

      <div className={styles.months} role="tablist" aria-label="Месяц">
        {MONTHS_SHORT.map((label, index) => {
          const current = index + 1;
          const peak = peaks[index];
          return (
            <button
              type="button"
              role="tab"
              aria-selected={month === current}
              className={styles.monthTab}
              data-overlap={peak > 1}
              key={label}
              onClick={() => pickMonth(current)}
            >
              <span>{label}</span>
              <strong>{peak > 0 ? peak : ""}</strong>
            </button>
          );
        })}
      </div>

      {departments.length === 0 ? (
        <p className={styles.empty}>Нет сотрудников.</p>
      ) : people.length === 0 ? (
        <p className={styles.empty}>Выберите подразделение или сотрудников.</p>
      ) : (
        <div
          className={styles.board}
          data-mode={boardMode}
          role="region"
          aria-label="Календарь отпусков организации"
        >
          <div
            className={styles.scroll}
            ref={scrollerRef}
            onPointerLeave={() => setHoverTip(null)}
            onScroll={() => setHoverTip(null)}
          >
            <div
              className={styles.table}
              style={{ gridTemplateColumns: columns }}
              role="table"
              aria-label={`Сотрудники за ${MONTHS[month - 1]}`}
            >
              <div className={styles.row} role="row">
                <div className={styles.nameHead}>Сотрудник</div>
                {Array.from({ length: monthLength }, (_, index) => {
                  const day = index + 1;
                  const date = iso(year, month, day);
                  const count = occupancy.get(date)?.length ?? 0;
                  return (
                    <div
                      className={[
                        styles.dayHead,
                        dayTone(date),
                        count > 1 ? styles.colOverlap : "",
                        activeDay === date ? styles.activeDay : "",
                      ].join(" ")}
                      data-overlap={count > 1}
                      role="columnheader"
                      key={day}
                    >
                      <span>{day}</span>
                      <small>{weekdayShortLabel(date)}</small>
                    </div>
                  );
                })}
              </div>
              <div className={`${styles.row} ${styles.stackRow}`} role="row">
                <div className={styles.nameHead}>Наложение</div>
                {Array.from({ length: monthLength }, (_, index) => {
                  const day = index + 1;
                  const date = iso(year, month, day);
                  const stacked = occupancy.get(date) ?? [];
                  const count = stacked.length;
                  const run = overlapRun(date, day);
                  return (
                    <button
                      className={[
                        styles.cell,
                        styles.stackCell,
                        dayTone(date),
                        run.overlap ? styles.stackOverlap : "",
                        run.start ? styles.periodStart : "",
                        run.end ? styles.periodEnd : "",
                      ].join(" ")}
                      type="button"
                      data-date={date}
                      data-count={count}
                      aria-label={
                        count > 1
                          ? `${day} ${MONTHS[month - 1]}: пересечение ${stacked
                              .map((item) => item.fullName)
                              .join(", ")}`
                          : `${day} ${MONTHS[month - 1]}: ${
                              stacked[0]?.fullName ?? "никто"
                            }`
                      }
                      key={day}
                      onClick={() => pickDay(date)}
                      onPointerEnter={(event) =>
                        inspectDay(date, event.currentTarget)
                      }
                      onFocus={(event) => inspectDay(date, event.currentTarget)}
                    >
                      {colored && run.overlap ? (
                        <span className={styles.stack} aria-hidden="true">
                          {stacked.map((item) => (
                            <i
                              className={styles.slice}
                              style={
                                {
                                  "--layer": layerColors.get(item.userId),
                                } as CSSProperties
                              }
                              key={item.userId}
                            />
                          ))}
                        </span>
                      ) : null}
                      {run.overlap ? (
                        <span className={styles.stackCount}>{count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {sortedPeople.map((person) => {
                const dates = absentByPerson.get(person.userId) ?? new Set();
                const layer = layerColors.get(person.userId);
                return (
                  <div className={styles.row} role="row" key={person.userId}>
                    <div className={styles.personName} title={person.fullName}>
                      <span className={styles.personLabel}>
                        {colored && person.periods.length > 0 ? (
                          <i
                            className={styles.personSwatch}
                            style={{ "--layer": layer } as CSSProperties}
                          />
                        ) : null}
                        {person.fullName}
                      </span>
                      {showDepartment ? (
                        <small>{person.departmentName}</small>
                      ) : null}
                    </div>
                    {Array.from({ length: monthLength }, (_, index) => {
                      const day = index + 1;
                      const date = iso(year, month, day);
                      const prev = day > 1 ? iso(year, month, day - 1) : "";
                      const next =
                        day < monthLength ? iso(year, month, day + 1) : "";
                      const absent = dates.has(date);
                      const count = occupancy.get(date)?.length ?? 0;
                      return (
                        <button
                          className={personPeriodClass(
                            date,
                            absent,
                            dates.has(prev),
                            dates.has(next),
                          )}
                          type="button"
                          data-date={date}
                          style={
                            absent && colored
                              ? ({ "--layer": layer } as CSSProperties)
                              : undefined
                          }
                          aria-label={`${person.fullName}, ${day} ${MONTHS[month - 1]}${
                            absent
                              ? count > 1
                                ? ", отпуск, пересечение"
                                : ", отпуск"
                              : count > 1
                                ? ", пересечение в отделе"
                                : ""
                          }`}
                          key={`${person.userId}-${day}`}
                          onClick={() => pickDay(date)}
                          onPointerEnter={(event) =>
                            inspectDay(date, event.currentTarget)
                          }
                          onFocus={(event) =>
                            inspectDay(date, event.currentTarget)
                          }
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {hoverTip ? (
        <div
          className={styles.tooltip}
          style={{ left: hoverTip.x, top: hoverTip.y }}
          role="tooltip"
        >
          Пересечение · {hoverTip.days} {daysWord(hoverTip.days)}
        </div>
      ) : null}

      <Dialog.Root
        open={modalDay !== null && (modalDetails?.people.length ?? 0) > 1}
        onOpenChange={(open) => {
          if (!open) setModalDay(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.modalScrim} />
          <Dialog.Content className={styles.modal} data-mode={boardMode}>
            {modalDetails && modalDetails.people.length > 1 ? (
              <>
                <div className={styles.modalHead}>
                  <div>
                    <Dialog.Title className={styles.modalTitle}>
                      Пересечение · {modalDetails.spanDays}{" "}
                      {daysWord(modalDetails.spanDays)}
                    </Dialog.Title>
                    <Dialog.Description className={styles.modalSpan}>
                      {modalDetails.span
                        ? formatRange(
                            modalDetails.span.startsOn,
                            modalDetails.span.endsOn,
                          )
                        : formatDay(modalDetails.date)}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    className={styles.modalClose}
                    aria-label="Закрыть"
                  >
                    <X aria-hidden="true" size={20} strokeWidth={2} />
                  </Dialog.Close>
                </div>
                <ul className={styles.modalList}>
                  {modalDetails.people.map((item) => (
                    <li key={item.userId}>
                      {colored ? (
                        <i
                          className={styles.personSwatch}
                          style={
                            {
                              "--layer": layerColors.get(item.userId),
                            } as CSSProperties
                          }
                        />
                      ) : null}
                      <div>
                        <strong>{item.fullName}</strong>
                        <small>
                          {item.departmentName}
                          {" · "}
                          {formatRange(
                            item.period.startsOn,
                            item.period.endsOn,
                          )}
                          {" · "}
                          {item.period.days} дн.
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
