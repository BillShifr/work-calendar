"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./EmployeeDirectory.module.css";

type Department = { id: string; name: string };
type Employee = {
  id: string;
  fullName: string;
  login: string;
  role: "employee" | "hr" | "hr_lead";
  isActive: boolean;
  departmentId: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  isCritical: boolean | null;
  allowanceDays: number;
};

export function EmployeeDirectory({
  employees,
  departments,
  year,
}: {
  employees: Employee[];
  departments: Department[];
  year: number;
}) {
  const router = useRouter();
  const [bulkDays, setBulkDays] = useState("28");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [create, setCreate] = useState({
    fullName: "",
    login: "",
    temporaryPassword: "",
    departmentId: departments[0]?.id ?? "",
    jobTitle: "",
    role: "employee",
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
          jobTitle: employee.jobTitle ?? "",
          role: employee.role === "hr_lead" ? "hr" : employee.role,
          isCritical: Boolean(employee.isCritical),
          isActive: employee.isActive,
          allowanceDays: employee.allowanceDays,
          newPassword: "",
        },
      ]),
    ),
  );

  async function createEmployee() {
    setMessage("Создаём сотрудника…");
    const response = await fetch("/api/hr/employees", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...create, year }),
    });
    const data = await response.json();
    if (!response.ok)
      return setMessage(data.error ?? "Не удалось создать сотрудника");
    setMessage("Сотрудник создан");
    setCreate({
      fullName: "",
      login: "",
      temporaryPassword: "",
      departmentId: departments[0]?.id ?? "",
      jobTitle: "",
      role: "employee",
      isCritical: false,
      allowanceDays: 28,
    });
    router.refresh();
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
      <section className={styles.toolbar} aria-label="Общие настройки отпусков">
        <strong>Лимит отпуска на {year} год</strong>
        <input
          aria-label="Дней отпуска для всех"
          type="number"
          min="0"
          max="366"
          value={bulkDays}
          onChange={(event) => setBulkDays(event.target.value)}
        />
        <button className="primaryButton" onClick={applyToAll}>
          Установить всем
        </button>
        <a className="secondaryButton" href={`/hr/employees?year=${year - 1}`}>
          ← {year - 1}
        </a>
        <a className="secondaryButton" href={`/hr/employees?year=${year + 1}`}>
          {year + 1} →
        </a>
        <span role="status">{message}</span>
      </section>

      <section className={styles.create}>
        <h2>Новый сотрудник</h2>
        <div className={styles.createGrid}>
          <label>
            ФИО
            <input
              value={create.fullName}
              onChange={(event) =>
                setCreate({ ...create, fullName: event.target.value })
              }
            />
          </label>
          <label>
            Логин
            <input
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
              value={create.temporaryPassword}
              onChange={(event) =>
                setCreate({ ...create, temporaryPassword: event.target.value })
              }
            />
          </label>
          <label>
            Подразделение
            <select
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
            </select>
          </label>
          <label>
            Должность
            <input
              value={create.jobTitle}
              onChange={(event) =>
                setCreate({ ...create, jobTitle: event.target.value })
              }
            />
          </label>
          <label>
            Роль
            <select
              value={create.role}
              onChange={(event) =>
                setCreate({ ...create, role: event.target.value })
              }
            >
              <option value="employee">Сотрудник</option>
              <option value="hr">Кадровая служба</option>
            </select>
          </label>
          <label>
            Дней отпуска
            <input
              type="number"
              min="0"
              max="366"
              value={create.allowanceDays}
              onChange={(event) =>
                setCreate({
                  ...create,
                  allowanceDays: Number(event.target.value),
                })
              }
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={create.isCritical}
              onChange={(event) =>
                setCreate({ ...create, isCritical: event.target.checked })
              }
            />
            Критичная роль
          </label>
          <button className="primaryButton" onClick={createEmployee}>
            Добавить сотрудника
          </button>
        </div>
      </section>

      <section className={styles.list} aria-label="Список сотрудников">
        {employees.map((employee) => {
          const draft = drafts[employee.id];
          return (
            <article className={styles.employee} key={employee.id}>
              <div className={styles.identity}>
                <strong>{employee.fullName}</strong>
                <span>@{employee.login}</span>
                <em>{employee.isActive ? "Активен" : "Отключён"}</em>
              </div>
              <label>
                ФИО
                <input
                  value={draft.fullName}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [employee.id]: { ...draft, fullName: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Подразделение
                <select
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
                </select>
              </label>
              <label>
                Должность
                <input
                  value={draft.jobTitle}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [employee.id]: { ...draft, jobTitle: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Роль
                <select
                  value={draft.role}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [employee.id]: {
                        ...draft,
                        role: event.target.value as "employee" | "hr",
                      },
                    })
                  }
                >
                  <option value="employee">Сотрудник</option>
                  <option value="hr">Кадровая служба</option>
                </select>
              </label>
              <label>
                Дней отпуска
                <input
                  type="number"
                  min="0"
                  max="366"
                  value={draft.allowanceDays}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [employee.id]: {
                        ...draft,
                        allowanceDays: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                Новый пароль
                <input
                  type="password"
                  placeholder="не менять"
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
              <div className={styles.flags}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.isCritical}
                    onChange={(event) =>
                      setDrafts({
                        ...drafts,
                        [employee.id]: {
                          ...draft,
                          isCritical: event.target.checked,
                        },
                      })
                    }
                  />
                  Критичная роль
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(event) =>
                      setDrafts({
                        ...drafts,
                        [employee.id]: {
                          ...draft,
                          isActive: event.target.checked,
                        },
                      })
                    }
                  />
                  Учётная запись активна
                </label>
              </div>
              <button
                className="primaryButton"
                disabled={savingId === employee.id}
                onClick={() => saveEmployee(employee)}
              >
                Сохранить
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
