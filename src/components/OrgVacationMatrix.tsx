"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton, SelectControl } from "./FormControls";
import {
  monthStarts,
  periodTrack,
  type OrgVacationMatrixDepartment,
} from "@/domain/org-vacation-matrix-shared";
import styles from "./OrgVacationMatrix.module.css";

const MONTHS = [
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

const dateLabel = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function periodTitle(startsOn: string, endsOn: string) {
  return `${dateLabel.format(new Date(`${startsOn}T00:00:00Z`))} – ${dateLabel.format(new Date(`${endsOn}T00:00:00Z`))}`;
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
  const [departmentId, setDepartmentId] = useState("all");
  const visible = useMemo(
    () =>
      departmentId === "all"
        ? departments
        : departments.filter((department) => department.id === departmentId),
    [departmentId, departments],
  );
  const months = monthStarts(year);
  const people = visible.reduce(
    (sum, department) => sum + department.employees.length,
    0,
  );

  return (
    <>
      <header className="pageHeader">
        <h1>График отпусков</h1>
        <div className={styles.toolbar}>
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
          <SelectControl
            label="Подразделение"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="all">Все подразделения</option>
            {departments.map((department) => (
              <option value={department.id} key={department.id}>
                {department.name}
              </option>
            ))}
          </SelectControl>
        </div>
      </header>
      <p className={styles.hint}>
        {people} сотрудников · {visible.length} подразделений. На шкале —
        периоды после передачи руководителю или в кадры.
      </p>
      {departments.length === 0 ? (
        <p className={styles.empty}>Нет сотрудников.</p>
      ) : visible.length === 0 ? (
        <p className={styles.empty}>
          Нет сотрудников в выбранном подразделении.
        </p>
      ) : (
        <div
          className={styles.board}
          role="region"
          aria-label="Календарь отпусков организации"
        >
          <div className={styles.axis}>
            <div className={styles.axisLabel}>Сотрудник</div>
            <div className={styles.track} aria-hidden="true">
              {months.map((month) => (
                <span
                  className={styles.month}
                  key={month.month}
                  style={{ left: `${month.leftPct}%` }}
                >
                  {MONTHS[month.month - 1]}
                </span>
              ))}
            </div>
          </div>
          {visible.map((department) => (
            <section key={department.id}>
              <h2 className={styles.dept}>
                {department.name}
                <span> · {department.employees.length}</span>
              </h2>
              {department.employees.map((employee) => {
                const self = employee.userId === actorUserId;
                const tracks = employee.periods
                  .map((period) => periodTrack(period, year))
                  .filter((track) => track !== null);
                const summary = tracks
                  .map((track) => periodTitle(track.startsOn, track.endsOn))
                  .join(", ");
                return (
                  <div
                    className={styles.row}
                    data-self={self}
                    key={employee.userId}
                    aria-label={
                      summary
                        ? `${employee.fullName}: ${summary}`
                        : `${employee.fullName}: нет опубликованных периодов`
                    }
                  >
                    <div className={styles.name} title={employee.fullName}>
                      {employee.fullName}
                    </div>
                    <div className={styles.track}>
                      {tracks.map((track) => (
                        <span
                          className={styles.bar}
                          data-self={self}
                          key={`${track.startsOn}_${track.endsOn}`}
                          title={periodTitle(track.startsOn, track.endsOn)}
                          style={{
                            left: `${track.leftPct}%`,
                            width: `${track.widthPct}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
