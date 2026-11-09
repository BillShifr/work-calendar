"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Download, Save } from "lucide-react";
import {
  ActionButton,
  NumberControl,
  SearchControl,
  SelectControl,
} from "./FormControls";
import styles from "./IrregularLeaveSettings.module.css";

type Employee = {
  id: string;
  fullName: string;
  departmentName: string | null;
  jobTitle: string | null;
  jobTitleMaxDays: number;
  maxDaysOverride: number | null;
  actualDays: number | null;
  proposedNextYearDays: number | null;
};

export function IrregularLeaveSettings({
  employees,
  year,
  approvals,
}: {
  employees: Employee[];
  year: number;
  approvals: Array<{
    departmentId: string;
    departmentName: string;
    approvedQuarterNumbers: number[];
  }>;
}) {
  const router = useRouter();
  const [bulkMax, setBulkMax] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [approvalPage, setApprovalPage] = useState(1);
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      employees.map((employee) => [
        employee.id,
        {
          maxDaysOverride: employee.maxDaysOverride?.toString() ?? "",
          actualDays: employee.actualDays?.toString() ?? "",
          proposedNextYearDays: employee.proposedNextYearDays?.toString() ?? "",
        },
      ]),
    ),
  );

  const toNullable = (value: string) => (value === "" ? null : Number(value));
  const departments = Array.from(
    new Set(
      employees.map((employee) => employee.departmentName).filter(Boolean),
    ),
  ).sort((left, right) => String(left).localeCompare(String(right), "ru"));
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ru");
  const visibleEmployees = employees.filter(
    (employee) =>
      (!department || employee.departmentName === department) &&
      (!normalizedQuery ||
        `${employee.fullName} ${employee.departmentName ?? ""} ${employee.jobTitle ?? ""}`
          .toLocaleLowerCase("ru")
          .includes(normalizedQuery)),
  );
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(visibleEmployees.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedEmployees = visibleEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const approvalPageSize = 8;
  const approvalPageCount = Math.max(
    1,
    Math.ceil(approvals.length / approvalPageSize),
  );
  const currentApprovalPage = Math.min(approvalPage, approvalPageCount);
  const pagedApprovals = approvals.slice(
    (currentApprovalPage - 1) * approvalPageSize,
    currentApprovalPage * approvalPageSize,
  );

  async function saveEmployee(employeeId: string) {
    setSaving(employeeId);
    setMessage("");
    const draft = drafts[employeeId];
    const response = await fetch("/api/hr/irregular-leave-terms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "individual",
        userId: employeeId,
        year,
        maxDaysOverride: toNullable(draft.maxDaysOverride),
        actualDays: toNullable(draft.actualDays),
        proposedNextYearDays: toNullable(draft.proposedNextYearDays),
      }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось сохранить");
    setMessage("Значения сохранены");
    router.refresh();
  }

  async function applyBulkMax() {
    setSaving("bulk");
    const response = await fetch("/api/hr/irregular-leave-terms", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "bulk",
        year,
        maxDaysOverride: toNullable(bulkMax),
      }),
    });
    const data = await response.json();
    setSaving(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось применить");
    setDrafts((current) =>
      Object.fromEntries(
        employees.map((employee) => [
          employee.id,
          { ...current[employee.id], maxDaysOverride: bulkMax },
        ]),
      ),
    );
    setMessage(`Обновлено сотрудников: ${data.count}`);
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.commandBar}>
        <div className={styles.yearControl}>
          <Link
            aria-label={`Открыть ${year - 1} год`}
            href={`?year=${year - 1}`}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </Link>
          <strong>{year}</strong>
          <Link
            aria-label={`Открыть ${year + 1} год`}
            href={`?year=${year + 1}`}
          >
            <ChevronRight aria-hidden="true" size={20} />
          </Link>
        </div>
        <div className={styles.bulk}>
          <span>Максимум дней для всех</span>
          <NumberControl
            label="Максимум дней для всех"
            min={0}
            max={30}
            value={bulkMax}
            onChange={setBulkMax}
          />
          <ActionButton
            disabled={saving === "bulk" || bulkMax === ""}
            onClick={applyBulkMax}
          >
            Применить
          </ActionButton>
        </div>
        <a
          className={styles.export}
          href={`/api/hr/export/overtime?year=${year}`}
        >
          <Download aria-hidden="true" size={19} />
          Выгрузить Excel
        </a>
      </section>
      <span className={styles.message} role="status">
        {message}
      </span>

      <section className={styles.approvals} aria-label="Согласование кварталов">
        <div className={styles.approvalHeading}>
          <strong>Готовность подразделений</strong>
          <span>
            {
              approvals.filter(
                (item) => item.approvedQuarterNumbers.length === 4,
              ).length
            }{" "}
            из {approvals.length} завершили год
          </span>
        </div>
        <div className={styles.approvalTable}>
          <div className={styles.approvalTableHead} aria-hidden="true">
            <span>Подразделение</span>
            {[1, 2, 3, 4].map((quarter) => (
              <span key={quarter}>К{quarter}</span>
            ))}
          </div>
          {pagedApprovals.map((item) => (
            <div className={styles.approvalRow} key={item.departmentId}>
              <span>{item.departmentName}</span>
              {[1, 2, 3, 4].map((quarter) => {
                const approved = item.approvedQuarterNumbers.includes(quarter);
                return (
                  <i
                    className={approved ? styles.quarterApproved : ""}
                    aria-label={`Квартал ${quarter}: ${approved ? "согласован" : "не согласован"}`}
                    key={quarter}
                  >
                    {approved ? (
                      <Check aria-hidden="true" size={15} />
                    ) : (
                      quarter
                    )}
                  </i>
                );
              })}
            </div>
          ))}
        </div>
        {approvals.length > approvalPageSize ? (
          <nav
            className={styles.approvalPagination}
            aria-label="Страницы готовности подразделений"
          >
            <ActionButton
              icon={ChevronLeft}
              variant="quiet"
              disabled={currentApprovalPage === 1}
              onClick={() => setApprovalPage((value) => Math.max(1, value - 1))}
            >
              Назад
            </ActionButton>
            <span>
              {currentApprovalPage} из {approvalPageCount}
            </span>
            <ActionButton
              icon={ChevronRight}
              variant="quiet"
              disabled={currentApprovalPage === approvalPageCount}
              onClick={() =>
                setApprovalPage((value) =>
                  Math.min(approvalPageCount, value + 1),
                )
              }
            >
              Далее
            </ActionButton>
          </nav>
        ) : null}
      </section>

      <div className={styles.filters}>
        <SearchControl
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Сотрудник, должность или подразделение"
        />
        <SelectControl
          label="Фильтр по подразделению"
          value={department}
          onChange={(event) => {
            setDepartment(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все подразделения</option>
          {departments.map((item) => (
            <option value={String(item)} key={String(item)}>
              {item}
            </option>
          ))}
        </SelectControl>
        <span>Показано: {visibleEmployees.length}</span>
      </div>

      <section className={styles.table} aria-label="Параметры сотрудников">
        <div className={styles.tableHead}>
          <span>Сотрудник</span>
          <span>Норматив должности</span>
          <span>Индивидуальный максимум</span>
          <span>По договору</span>
          <span>Предложение на {year + 1}</span>
          <span />
        </div>
        {pagedEmployees.map((employee) => {
          const draft = drafts[employee.id];
          return (
            <article className={styles.row} key={employee.id}>
              <div>
                <strong>{employee.fullName}</strong>
                <span>
                  {employee.departmentName ?? "Без подразделения"} ·{" "}
                  {employee.jobTitle ?? "Без должности"}
                </span>
              </div>
              <strong className={styles.norm}>
                {employee.jobTitleMaxDays}
              </strong>
              <NumberControl
                label={`Индивидуальный максимум: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.maxDaysOverride}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: { ...draft, maxDaysOverride: value },
                  })
                }
              />
              <NumberControl
                label={`Дней по договору: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.actualDays}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: { ...draft, actualDays: value },
                  })
                }
              />
              <NumberControl
                label={`Предложение на следующий год: ${employee.fullName}`}
                min={0}
                max={30}
                value={draft.proposedNextYearDays}
                onChange={(value) =>
                  setDrafts({
                    ...drafts,
                    [employee.id]: {
                      ...draft,
                      proposedNextYearDays: value,
                    },
                  })
                }
              />
              <ActionButton
                icon={Save}
                disabled={saving === employee.id}
                onClick={() => saveEmployee(employee.id)}
              >
                Сохранить
              </ActionButton>
            </article>
          );
        })}
        {!visibleEmployees.length ? (
          <p className={styles.empty}>
            По заданным условиям сотрудники не найдены.
          </p>
        ) : null}
      </section>
      {visibleEmployees.length > pageSize ? (
        <nav className={styles.pagination} aria-label="Страницы сотрудников">
          <ActionButton
            icon={ChevronLeft}
            variant="quiet"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Назад
          </ActionButton>
          <span>
            Страница {currentPage} из {pageCount}
          </span>
          <ActionButton
            icon={ChevronRight}
            variant="quiet"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Далее
          </ActionButton>
        </nav>
      ) : null}
    </div>
  );
}
