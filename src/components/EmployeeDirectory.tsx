"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Save,
  UserCog,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  ActionButton,
  NumberControl,
  SearchControl,
  SegmentedControl,
  SelectControl,
  ToggleControl,
} from "./FormControls";
import styles from "./EmployeeDirectory.module.css";

type Department = { id: string; name: string };
type JobTitle = { id: string; name: string };
type Role = "employee" | "department_head" | "hr";
type Employee = {
  id: string;
  fullName: string;
  login: string;
  role: "employee" | "department_head" | "hr" | "hr_lead" | "admin";
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  jobTitleId: string | null;
  jobTitle: string | null;
  isCritical: boolean | null;
  allowanceDays: number;
};

function RoleChoice({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Role;
  onChange: (value: Role) => void;
}) {
  return (
    <div className={styles.roleChoice}>
      <span>{label}</span>
      <SegmentedControl
        label={label}
        value={value}
        onChange={(next) => onChange(next as Role)}
        options={[
          { value: "employee", label: "Сотрудник", icon: UserRound },
          { value: "department_head", label: "Руководитель", icon: UsersRound },
          { value: "hr", label: "Кадры", icon: UserCog },
        ]}
      />
      {value === "department_head" ? (
        <p className={styles.roleHint}>
          После сохранения станет согласующим выбранного подразделения
        </p>
      ) : null}
    </div>
  );
}

export function EmployeeDirectory({
  employees,
  departments,
  jobTitles,
  year,
  focusId,
}: {
  employees: Employee[];
  departments: Department[];
  jobTitles: JobTitle[];
  year: number;
  focusId?: string;
}) {
  const router = useRouter();
  const [bulkDays, setBulkDays] = useState("28");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(() => {
    const index = employees.findIndex((item) => item.id === focusId);
    return index < 0 ? 1 : Math.floor(index / 7) + 1;
  });
  const [create, setCreate] = useState({
    fullName: "",
    login: "",
    temporaryPassword: "",
    departmentId: departments[0]?.id ?? "",
    jobTitleId: jobTitles[0]?.id ?? "",
    role: "employee" as Role,
    isCritical: false,
    allowanceDays: 28,
  });
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      employees.map((employee) => [
        employee.id,
        {
          fullName: employee.fullName,
          departmentId: employee.departmentId ?? "",
          jobTitleId: employee.jobTitleId ?? "",
          role:
            employee.role === "hr_lead" || employee.role === "admin"
              ? "hr"
              : employee.role,
          isCritical: Boolean(employee.isCritical),
          isActive: employee.isActive,
          allowanceDays: employee.allowanceDays,
          newPassword: "",
        },
      ]),
    ),
  );

  const canCreate =
    create.fullName.trim().length >= 3 &&
    create.login.trim().length >= 3 &&
    create.temporaryPassword.length >= 12 &&
    Boolean(create.departmentId) &&
    Boolean(create.jobTitleId);
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ru");
  const visibleEmployees = employees.filter(
    (employee) =>
      (!departmentFilter || employee.departmentId === departmentFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "active" ? employee.isActive : !employee.isActive)) &&
      (!normalizedQuery ||
        `${employee.fullName} ${employee.login} ${employee.jobTitle ?? ""} ${employee.departmentName ?? ""}`
          .toLocaleLowerCase("ru")
          .includes(normalizedQuery)),
  );
  const pageSize = 7;
  const pageCount = Math.max(1, Math.ceil(visibleEmployees.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedEmployees = visibleEmployees.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function createEmployee() {
    const createdName = create.fullName.trim();
    setSavingId("new");
    setMessage("Создаём сотрудника…");
    const response = await fetch("/api/hr/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...create, year }),
    });
    const data = await response.json();
    setSavingId(null);
    if (!response.ok)
      return setMessage(data.error ?? "Не удалось создать сотрудника");
    setMessage("Сотрудник создан");
    setShowCreate(false);
    setQuery(createdName);
    setPage(1);
    setCreate({
      fullName: "",
      login: "",
      temporaryPassword: "",
      departmentId: departments[0]?.id ?? "",
      jobTitleId: jobTitles[0]?.id ?? "",
      role: "employee",
      isCritical: false,
      allowanceDays: 28,
    });
    router.replace(`/hr/employees?year=${year}&focus=${data.id}`);
  }

  async function saveEmployee(employee: Employee) {
    setSavingId(employee.id);
    setMessage(`Сохраняем: ${employee.fullName}`);
    const response = await fetch(`/api/hr/employees/${employee.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...drafts[employee.id], year }),
    });
    const data = await response.json();
    setSavingId(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось сохранить");
    setMessage("Изменения сотрудника сохранены");
    setEditingId(null);
    router.refresh();
  }

  async function applyToAll() {
    setMessage("Обновляем лимит для всех…");
    const response = await fetch("/api/hr/vacation-allowances", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ year, allowanceDays: Number(bulkDays) }),
    });
    const data = await response.json();
    if (!response.ok)
      return setMessage(data.error ?? "Не удалось обновить лимит");
    setMessage(`Лимит обновлён для ${data.count} сотрудников`);
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.commandBar} aria-label="Действия со штатом">
        <div className={styles.yearControl}>
          <span>Отпускной год</span>
          <div>
            <a
              aria-label={`Открыть ${year - 1} год`}
              href={`/hr/employees?year=${year - 1}`}
            >
              <ChevronLeft aria-hidden="true" size={20} />
            </a>
            <strong>{year}</strong>
            <a
              aria-label={`Открыть ${year + 1} год`}
              href={`/hr/employees?year=${year + 1}`}
            >
              <ChevronRight aria-hidden="true" size={20} />
            </a>
          </div>
        </div>
        <div className={styles.bulkAllowance}>
          <label>Дней отпуска для всех</label>
          <NumberControl
            label="Дней отпуска для всех"
            min={0}
            max={366}
            value={bulkDays}
            onChange={setBulkDays}
          />
          <ActionButton onClick={applyToAll}>Применить ко всем</ActionButton>
        </div>
        <ActionButton
          variant="primary"
          icon={Plus}
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Закрыть форму" : "Добавить сотрудника"}
        </ActionButton>
      </section>

      {showCreate && (
        <section className={styles.create} aria-labelledby="create-employee">
          <div className={styles.sectionHeading}>
            <div>
              <h2 id="create-employee">Новый сотрудник</h2>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label>
              ФИО
              <input
                autoComplete="name"
                value={create.fullName}
                onChange={(event) =>
                  setCreate({ ...create, fullName: event.target.value })
                }
              />
            </label>
            <label>
              Логин
              <input
                autoComplete="username"
                value={create.login}
                onChange={(event) =>
                  setCreate({ ...create, login: event.target.value })
                }
              />
            </label>
            <label>
              Временный пароль
              <input
                type="password"
                autoComplete="new-password"
                value={create.temporaryPassword}
                onChange={(event) =>
                  setCreate({
                    ...create,
                    temporaryPassword: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Подразделение
              <SelectControl
                label="Подразделение нового сотрудника"
                value={create.departmentId}
                onChange={(event) =>
                  setCreate({ ...create, departmentId: event.target.value })
                }
              >
                {departments.map((department) => (
                  <option value={department.id} key={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectControl>
            </label>
            <label>
              Должность
              <SelectControl
                label="Должность нового сотрудника"
                value={create.jobTitleId}
                onChange={(event) =>
                  setCreate({ ...create, jobTitleId: event.target.value })
                }
              >
                {jobTitles.map((title) => (
                  <option value={title.id} key={title.id}>
                    {title.name}
                  </option>
                ))}
              </SelectControl>
            </label>
            <div className={styles.allowanceField}>
              <label>Дней отпуска</label>
              <NumberControl
                label="Дней отпуска нового сотрудника"
                min={0}
                max={366}
                value={create.allowanceDays}
                onChange={(value) =>
                  setCreate({ ...create, allowanceDays: Number(value) })
                }
              />
            </div>
            <RoleChoice
              label="Доступ к системе"
              value={create.role}
              onChange={(role) => setCreate({ ...create, role })}
            />
            <div className={styles.toggleField}>
              <span>Особые условия</span>
              <ToggleControl
                label="Критичная должность"
                checked={create.isCritical}
                onChange={(isCritical) => setCreate({ ...create, isCritical })}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <ActionButton variant="quiet" onClick={() => setShowCreate(false)}>
              Отмена
            </ActionButton>
            <ActionButton
              variant="primary"
              icon={Plus}
              disabled={!canCreate || savingId === "new"}
              onClick={createEmployee}
            >
              Создать сотрудника
            </ActionButton>
          </div>
        </section>
      )}

      <div className={styles.sectionHeading}>
        <div>
          <h2>Штат</h2>
          <p>
            {visibleEmployees.length} из {employees.length} сотрудников
          </p>
        </div>
        <span role="status">{message}</span>
      </div>
      <div className={styles.filters}>
        <SearchControl
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="ФИО, логин, должность"
        />
        <SelectControl
          label="Фильтр по подразделению"
          value={departmentFilter}
          onChange={(event) => {
            setDepartmentFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все подразделения</option>
          {departments.map((department) => (
            <option value={department.id} key={department.id}>
              {department.name}
            </option>
          ))}
        </SelectControl>
        <SegmentedControl
          label="Статус сотрудников"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          options={[
            { value: "active", label: "Активные" },
            { value: "inactive", label: "Отключённые" },
            { value: "all", label: "Все" },
          ]}
        />
      </div>
      <section className={styles.list} aria-label="Список сотрудников">
        {pagedEmployees.map((employee) => {
          const draft = drafts[employee.id];
          const editing = editingId === employee.id;
          return (
            <article className={styles.employee} key={employee.id}>
              <div className={styles.employeeSummary}>
                <div className={styles.identity}>
                  <strong>{employee.fullName}</strong>
                  <span>@{employee.login}</span>
                </div>
                <div className={styles.assignment}>
                  <strong>
                    {employee.jobTitle ?? "Должность не назначена"}
                  </strong>
                  <span>{employee.departmentName ?? "Без подразделения"}</span>
                </div>
                <div className={styles.allowanceSummary}>
                  <strong>{employee.allowanceDays}</strong>
                  <span>дней отпуска</span>
                </div>
                <span
                  className={
                    employee.isActive ? styles.active : styles.inactive
                  }
                >
                  {employee.isActive ? "Активен" : "Отключён"}
                </span>
                <ActionButton
                  icon={UserCog}
                  onClick={() => setEditingId(editing ? null : employee.id)}
                >
                  {editing ? "Закрыть" : "Редактировать"}
                </ActionButton>
              </div>
              {editing && (
                <div className={styles.editPanel}>
                  <div className={styles.formGrid}>
                    <label>
                      ФИО
                      <input
                        value={draft.fullName}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: {
                              ...draft,
                              fullName: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Подразделение
                      <SelectControl
                        label={`Подразделение: ${employee.fullName}`}
                        value={draft.departmentId}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: {
                              ...draft,
                              departmentId: event.target.value,
                            },
                          })
                        }
                      >
                        {departments.map((department) => (
                          <option value={department.id} key={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                    <label>
                      Должность
                      <SelectControl
                        label={`Должность: ${employee.fullName}`}
                        value={draft.jobTitleId}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: {
                              ...draft,
                              jobTitleId: event.target.value,
                            },
                          })
                        }
                      >
                        {jobTitles.map((title) => (
                          <option value={title.id} key={title.id}>
                            {title.name}
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                    <div className={styles.allowanceField}>
                      <label>Дней отпуска</label>
                      <NumberControl
                        label={`Дней отпуска: ${employee.fullName}`}
                        min={0}
                        max={366}
                        value={draft.allowanceDays}
                        onChange={(value) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: {
                              ...draft,
                              allowanceDays: Number(value),
                            },
                          })
                        }
                      />
                    </div>
                    <label>
                      Новый временный пароль
                      <input
                        type="password"
                        autoComplete="new-password"
                        placeholder="Оставьте пустым, чтобы не менять"
                        value={draft.newPassword}
                        onChange={(event) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: {
                              ...draft,
                              newPassword: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <RoleChoice
                      label="Доступ к системе"
                      value={draft.role}
                      onChange={(role) =>
                        setDrafts({
                          ...drafts,
                          [employee.id]: { ...draft, role },
                        })
                      }
                    />
                    <div className={styles.toggleField}>
                      <span>Статус и условия</span>
                      <ToggleControl
                        label="Критичная должность"
                        checked={draft.isCritical}
                        onChange={(isCritical) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: { ...draft, isCritical },
                          })
                        }
                      />
                      <ToggleControl
                        label="Учётная запись активна"
                        checked={draft.isActive}
                        onChange={(isActive) =>
                          setDrafts({
                            ...drafts,
                            [employee.id]: { ...draft, isActive },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.formActions}>
                    <ActionButton
                      variant="quiet"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </ActionButton>
                    <ActionButton
                      variant="primary"
                      icon={Save}
                      disabled={savingId === employee.id || !draft.jobTitleId}
                      onClick={() => saveEmployee(employee)}
                    >
                      Сохранить изменения
                    </ActionButton>
                  </div>
                </div>
              )}
            </article>
          );
        })}
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
            {currentPage} из {pageCount}
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
