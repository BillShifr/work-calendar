"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { daysInMonth } from "@/domain/overtime";
import {
  classifyProductionDay,
  weekdayShortLabel,
} from "@/domain/production-calendar";
import {
  allDepartmentIds,
  defaultDepartmentIds,
  employeeAbsentDates,
  filterBoardPeople,
  firstOverlapOrBusyMonth,
  orgOccupancyByDate,
  peakOccupancyByMonth,
  peopleInDepartments,
  type OrgVacationMatrixDepartment,
} from "@/domain/org-vacation-matrix-shared";
import { IconButton, SearchControl } from "./FormControls";
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

function OptionPicker({
  label,
  items,
  selected,
  onToggle,
  onToggleAll,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = query.trim()
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;
  const allOn =
    items.length > 0 && items.every((item) => selected.has(item.id));
  return (
    <details className={styles.picker}>
      <summary>
        {label} · {selected.size}
      </summary>
      <div className={styles.pickerPanel}>
        {items.length > 8 ? (
          <SearchControl
            value={query}
            onChange={setQuery}
            placeholder="Найти"
          />
        ) : null}
        <button
          type="button"
          className={styles.option}
          aria-pressed={allOn}
          onClick={() => onToggleAll(!allOn)}
        >
          {allOn ? <Check aria-hidden="true" size={18} /> : <span />}
          Все
        </button>
        {visible.map((item) => {
          const on = selected.has(item.id);
          return (
            <button
              type="button"
              className={styles.option}
              aria-pressed={on}
              key={item.id}
              onClick={() => onToggle(item.id, !on)}
            >
              {on ? <Check aria-hidden="true" size={18} /> : <span />}
              {item.label}
            </button>
          );
        })}
      </div>
    </details>
  );
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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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
  const monthLength = daysInMonth(year, month);
  const selectedNames = selectedDay ? (occupancy.get(selectedDay) ?? []) : [];
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
  useLayoutEffect(() => {
    const cell = scrollerRef.current?.querySelector(
      `[data-date="${focusDate}"]`,
    );
    cell?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [focusDate]);

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
  }

  function dayTone(date: string) {
    const kind = classifyProductionDay(date);
    if (kind === "holiday") return styles.holiday;
    if (kind === "weekend") return styles.weekend;
    if (kind === "short") return styles.shortDay;
    return "";
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
          }}
          onToggleAll={(on) => {
            setUserIds(
              new Set(
                on ? peopleOptions.map((employee) => employee.userId) : [],
              ),
            );
          }}
        />
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
              onClick={() => setMonth(current)}
            >
              <span>{label}</span>
              <strong>{peak > 0 ? peak : ""}</strong>
            </button>
          );
        })}
      </div>

      <p className={styles.legend} aria-label="Обозначения">
        <span>
          <i className={styles.swatchAlone} /> один
        </span>
        <span>
          <i className={styles.swatchOverlap} /> пересечение
        </span>
      </p>

      {departments.length === 0 ? (
        <p className={styles.empty}>Нет сотрудников.</p>
      ) : people.length === 0 ? (
        <p className={styles.empty}>Выберите подразделение или сотрудников.</p>
      ) : (
        <div
          className={styles.board}
          role="region"
          aria-label="Календарь отпусков организации"
        >
          {selectedDay ? (
            <p
              className={styles.dayDetail}
              data-overlap={selectedNames.length > 1}
            >
              {dateLabel.format(new Date(`${selectedDay}T00:00:00Z`))}
              {selectedNames.length
                ? `: ${selectedNames.map((item) => item.fullName).join(", ")}`
                : ": никто не в отпуске"}
            </p>
          ) : null}
          <div className={styles.scroll} ref={scrollerRef}>
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
                      className={`${styles.dayHead} ${dayTone(date)}`}
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
              <div className={styles.row} role="row">
                <div className={styles.nameHead}>Наложение</div>
                {Array.from({ length: monthLength }, (_, index) => {
                  const day = index + 1;
                  const date = iso(year, month, day);
                  const count = occupancy.get(date)?.length ?? 0;
                  return (
                    <button
                      className={[
                        styles.cell,
                        dayTone(date),
                        count === 1 ? styles.alone : "",
                        count > 1 ? styles.overlap : "",
                        selectedDay === date ? styles.selected : "",
                      ].join(" ")}
                      type="button"
                      data-date={date}
                      aria-label={`${day} ${MONTHS[month - 1]}: ${count || "никто"}`}
                      key={day}
                      onClick={() => setSelectedDay(date)}
                    >
                      {count > 0 ? count : ""}
                    </button>
                  );
                })}
              </div>
              {people.map((person) => {
                const dates = absentByPerson.get(person.userId) ?? new Set();
                return (
                  <div
                    className={styles.row}
                    data-self={person.userId === actorUserId}
                    role="row"
                    key={person.userId}
                  >
                    <div className={styles.personName} title={person.fullName}>
                      {person.fullName}
                      {showDepartment ? (
                        <small>{person.departmentName}</small>
                      ) : null}
                    </div>
                    {Array.from({ length: monthLength }, (_, index) => {
                      const day = index + 1;
                      const date = iso(year, month, day);
                      const absent = dates.has(date);
                      const count = occupancy.get(date)?.length ?? 0;
                      return (
                        <button
                          className={[
                            styles.cell,
                            dayTone(date),
                            absent && count === 1 ? styles.alone : "",
                            absent && count > 1 ? styles.overlap : "",
                            selectedDay === date ? styles.selected : "",
                          ].join(" ")}
                          type="button"
                          aria-label={`${person.fullName}, ${day} ${MONTHS[month - 1]}${
                            absent ? ", отпуск" : ""
                          }`}
                          key={`${person.userId}-${day}`}
                          onClick={() => setSelectedDay(date)}
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
    </>
  );
}
