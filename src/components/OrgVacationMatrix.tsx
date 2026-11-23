"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
  overlapRunsInMonth,
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

function peopleWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "человека";
  }
  return "человек";
}

function personInitial(fullName: string) {
  const surname = fullName.trim().split(/\s+/)[0] ?? "";
  return surname.slice(0, 1).toLocaleUpperCase("ru");
}

function openingDepartmentIds(
  departments: OrgVacationMatrixDepartment[],
  actorUserId: string,
  focusDepartmentId?: string,
) {
  if (
    focusDepartmentId &&
    departments.some((department) => department.id === focusDepartmentId)
  ) {
    return [focusDepartmentId];
  }
  return defaultDepartmentIds(departments, actorUserId);
}

export function OrgVacationMatrix({
  year,
  actorUserId,
  departments,
  focusDepartmentId,
  focusMonth,
  highlightDate,
}: {
  year: number;
  actorUserId: string;
  departments: OrgVacationMatrixDepartment[];
  focusDepartmentId?: string;
  focusMonth?: number;
  highlightDate?: string;
}) {
  const router = useRouter();
  const [boardMode, setBoardMode] = useOrgBoardDisplayMode();
  const colored = boardMode === "color";
  const [departmentIds, setDepartmentIds] = useState(
    () =>
      new Set(
        openingDepartmentIds(departments, actorUserId, focusDepartmentId),
      ),
  );
  const [userIds, setUserIds] = useState(() => {
    const initial = new Set(
      openingDepartmentIds(departments, actorUserId, focusDepartmentId),
    );
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
    focusMonth && focusMonth >= 1 && focusMonth <= 12
      ? focusMonth
      : firstOverlapOrBusyMonth(occupancy, year),
  );
  const monthLength = daysInMonth(year, month);
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
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
  const runs = useMemo(
    () => overlapRunsInMonth(people, occupancy, year, month, monthLength),
    [month, monthLength, occupancy, people, year],
  );
  const overlapDates = useMemo(() => {
    const dates = new Set<string>();
    for (const run of runs) {
      for (
        let day = run.startDay;
        day < run.startDay + run.dayCount;
        day += 1
      ) {
        dates.add(iso(year, month, day));
      }
    }
    return dates;
  }, [month, runs, year]);
  const selectedRun =
    runs.find((run) => run.startsOn === selectedStart) ?? null;
  const fromCard = Boolean(
    highlightDate &&
    highlightDate.startsWith(`${year}-${String(month).padStart(2, "0")}-`),
  );

  useLayoutEffect(() => {
    const highlighted =
      highlightDate &&
      highlightDate.startsWith(`${year}-${String(month).padStart(2, "0")}-`)
        ? highlightDate
        : null;
    const anchor = highlighted ?? defaultOverlapDay ?? focusDate;
    if (!anchor) return;
    const cell = scrollerRef.current?.querySelector(`[data-date="${anchor}"]`);
    cell?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [defaultOverlapDay, focusDate, highlightDate, month, year]);

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
    setSelectedStart(null);
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
    setSelectedStart(null);
  }

  function pickDay(date: string) {
    const run = runs.find(
      (item) => item.startsOn <= date && date <= item.endsOn,
    );
    setSelectedStart(run?.startsOn ?? null);
  }

  function personPeriodClass(
    date: string,
    absent: boolean,
    prevAbsent: boolean,
    nextAbsent: boolean,
  ) {
    const classes = [styles.cell, dayTone(date)];
    if (overlapDates.has(date)) classes.push(styles.overlapShaft);
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
            setSelectedStart(null);
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
            setSelectedStart(null);
          }}
          onToggleAll={(on) => {
            setUserIds(
              new Set(
                on ? peopleOptions.map((employee) => employee.userId) : [],
              ),
            );
            setSelectedStart(null);
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
          data-arrive={fromCard ? "true" : "false"}
          role="region"
          aria-label="Календарь отпусков организации"
        >
          <div className={styles.scroll} ref={scrollerRef}>
            <div
              className={styles.table}
              style={{ gridTemplateColumns: columns }}
              role="table"
              aria-label={`Сотрудники за ${MONTHS[month - 1]}`}
            >
              <div className={`${styles.row} ${styles.bracketRow}`} role="row">
                <div className={styles.nameHead} />
                {runs.map((run) => {
                  const shown = run.people.slice(0, 3);
                  const extra = run.people.length - shown.length;
                  return (
                    <button
                      key={run.startsOn}
                      type="button"
                      className={styles.bracket}
                      data-short={run.dayCount < 3 ? "true" : "false"}
                      style={{
                        gridColumn: `${run.startDay + 1} / span ${run.dayCount}`,
                      }}
                      aria-pressed={selectedStart === run.startsOn}
                      aria-label={`${run.people.length} ${peopleWord(run.people.length)}, ${run.dayCount} ${daysWord(run.dayCount)}, ${formatRange(run.startsOn, run.endsOn)}`}
                      onClick={() => setSelectedStart(run.startsOn)}
                    >
                      <span className={styles.pile} aria-hidden="true">
                        {shown.map((person) => (
                          <span className={styles.avatar} key={person.userId}>
                            {personInitial(person.fullName)}
                          </span>
                        ))}
                        {extra > 0 ? (
                          <span className={styles.pileMore}>+{extra}</span>
                        ) : null}
                      </span>
                      <span className={styles.bracketText}>
                        {run.dayCount} {daysWord(run.dayCount)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={`${styles.row} ${styles.dayRow}`} role="row">
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
                        selectedRun &&
                        date >= selectedRun.startsOn &&
                        date <= selectedRun.endsOn
                          ? styles.activeDay
                          : "",
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

      <Dialog.Root
        open={selectedRun !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedStart(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.modalScrim} />
          <Dialog.Content className={styles.panel} data-mode={boardMode}>
            {selectedRun ? (
              <>
                <div className={styles.modalHead}>
                  <div>
                    <Dialog.Title className={styles.modalTitle}>
                      {selectedRun.people.length}{" "}
                      {peopleWord(selectedRun.people.length)} ·{" "}
                      {selectedRun.dayCount} {daysWord(selectedRun.dayCount)}
                    </Dialog.Title>
                    <Dialog.Description className={styles.modalSpan}>
                      {formatRange(selectedRun.startsOn, selectedRun.endsOn)}
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
                  {selectedRun.people.map((item) => (
                    <li key={item.userId}>
                      <span className={styles.avatar} aria-hidden="true">
                        {personInitial(item.fullName)}
                      </span>
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
