"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react";
import {
  ActionButton,
  NumberControl,
  SearchControl,
  SelectControl,
  ToggleControl,
} from "./FormControls";
import styles from "./DepartmentRuleEditor.module.css";

type Department = {
  id: string;
  name: string;
  displayName: string;
  headcount: number;
  isActive: boolean;
  assignedCount: number;
  parentId: string | null;
  headUserId: string | null;
  approverUserId: string | null;
  updatedAt: string;
};

export function DepartmentRuleEditor({
  departments,
  employees,
  focusId,
}: {
  departments: Department[];
  employees: Array<{ id: string; fullName: string }>;
  focusId?: string;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      departments.map((department) => [
        department.id,
        {
          headcount: String(department.headcount),
          name: department.name,
          isActive: department.isActive,
          parentId: department.parentId ?? "",
          headUserId: department.headUserId ?? "",
          approverUserId: department.approverUserId ?? "",
        },
      ]),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(() => {
    const index = departments.findIndex((item) => item.id === focusId);
    return index < 0 ? 1 : Math.floor(index / 7) + 1;
  });
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    headcount: "",
    parentId: "",
    headUserId: "",
    approverUserId: "",
  });
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ru");
  const visibleDepartments = departments.filter((department) =>
    `${department.displayName} ${department.assignedCount}`
      .toLocaleLowerCase("ru")
      .includes(normalizedQuery),
  );
  const pageSize = 7;
  const pageCount = Math.max(
    1,
    Math.ceil(visibleDepartments.length / pageSize),
  );
  const currentPage = Math.min(page, pageCount);
  const pagedDepartments = visibleDepartments.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  function change(
    id: string,
    field: "name" | "headcount" | "parentId" | "headUserId" | "approverUserId",
    value: string,
  ) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
    setMessages((current) => ({
      ...current,
      [id]: "Есть несохранённые изменения",
    }));
  }

  async function save(department: Department) {
    const draft = drafts[department.id];
    setSavingId(department.id);
    setMessages((current) => ({ ...current, [department.id]: "Сохраняем…" }));
    const response = await fetch(`/api/hr/departments/${department.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        updatedAt: department.updatedAt,
        name: draft.name,
        isActive: draft.isActive,
        headcount: Number(draft.headcount),
        parentId: draft.parentId || null,
        headUserId: draft.headUserId || null,
        approverUserId: draft.approverUserId || null,
      }),
    });
    const data = await response.json();
    setSavingId(null);
    if (!response.ok) {
      setMessages((current) => ({
        ...current,
        [department.id]: data.error ?? "Не удалось сохранить",
      }));
      return;
    }
    setMessages((current) => ({ ...current, [department.id]: "Сохранено" }));
    router.refresh();
  }

  async function createDepartment() {
    const createdName = newDepartment.name.trim();
    setCreating(true);
    const response = await fetch("/api/hr/departments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newDepartment.name,
        headcount: Number(newDepartment.headcount),
        parentId: newDepartment.parentId || null,
        headUserId: newDepartment.headUserId || null,
        approverUserId:
          newDepartment.approverUserId || newDepartment.headUserId || null,
      }),
    });
    const data = await response.json();
    setCreating(false);
    if (!response.ok) {
      setMessages((current) => ({
        ...current,
        create: data.error ?? "Не удалось создать",
      }));
      return;
    }
    setNewDepartment({
      name: "",
      headcount: "",
      parentId: "",
      headUserId: "",
      approverUserId: "",
    });
    setMessages((current) => ({ ...current, create: "Подразделение создано" }));
    setShowCreate(false);
    setQuery(createdName);
    setPage(1);
    router.replace(`/hr/departments?focus=${data.id}`);
  }

  return (
    <div className={styles.list}>
      <div className={styles.toolbar}>
        <SearchControl
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Поиск подразделения"
        />
        <span>
          {visibleDepartments.length} из {departments.length}
        </span>
        <ActionButton
          variant="primary"
          icon={Plus}
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Закрыть форму" : "Добавить подразделение"}
        </ActionButton>
      </div>
      {showCreate ? (
        <section className={styles.create}>
          <h2>Новое подразделение</h2>
          <label>
            Название
            <input
              value={newDepartment.name}
              onChange={(event) =>
                setNewDepartment({ ...newDepartment, name: event.target.value })
              }
            />
          </label>
          <label>
            Штат
            <NumberControl
              label="Штат"
              value={newDepartment.headcount}
              onChange={(value) =>
                setNewDepartment({
                  ...newDepartment,
                  headcount: value,
                })
              }
            />
          </label>
          <label>
            Вышестоящее подразделение
            <SelectControl
              label="Вышестоящее подразделение"
              value={newDepartment.parentId}
              onChange={(event) =>
                setNewDepartment({
                  ...newDepartment,
                  parentId: event.target.value,
                })
              }
            >
              <option value="">Нет</option>
              {departments.map((department) => (
                <option value={department.id} key={department.id}>
                  {department.displayName}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Руководитель
            <SelectControl
              label="Руководитель нового подразделения"
              value={newDepartment.headUserId}
              onChange={(event) => {
                const headUserId = event.target.value;
                setNewDepartment({
                  ...newDepartment,
                  headUserId,
                  approverUserId: newDepartment.approverUserId || headUserId,
                });
              }}
            >
              <option value="">Не назначен</option>
              {employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </SelectControl>
          </label>
          <label>
            Согласующий
            <SelectControl
              label="Согласующий нового подразделения"
              value={newDepartment.approverUserId}
              onChange={(event) =>
                setNewDepartment({
                  ...newDepartment,
                  approverUserId: event.target.value,
                })
              }
            >
              <option value="">Руководитель подразделения</option>
              {employees.map((employee) => (
                <option value={employee.id} key={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </SelectControl>
          </label>
          <ActionButton
            variant="primary"
            icon={Plus}
            disabled={
              creating || !newDepartment.name || !newDepartment.headcount
            }
            onClick={createDepartment}
          >
            Создать
          </ActionButton>
          <span role="status">{messages.create}</span>
        </section>
      ) : null}

      {pagedDepartments.map((department) => {
        const draft = drafts[department.id];
        const editing = editingId === department.id;
        return (
          <article className={`card ${styles.department}`} key={department.id}>
            <div className={styles.heading}>
              <Building2 aria-hidden="true" size={21} />
              <div>
                <h2>{draft.name}</h2>
                <p>
                  {department.displayName} · {department.assignedCount}{" "}
                  сотрудников · штат {draft.headcount}
                </p>
              </div>
              <span role="status">{messages[department.id]}</span>
              <ActionButton
                icon={editing ? X : Pencil}
                onClick={() => setEditingId(editing ? null : department.id)}
              >
                {editing ? "Закрыть" : "Редактировать"}
              </ActionButton>
            </div>
            {editing ? (
              <>
                <div className={styles.fields}>
                  <label>
                    Название
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        change(department.id, "name", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Штатная численность
                    <NumberControl
                      label={`Штатная численность: ${department.name}`}
                      value={draft.headcount}
                      onChange={(value) =>
                        change(department.id, "headcount", value)
                      }
                    />
                  </label>
                  <label>
                    Вышестоящее подразделение
                    <SelectControl
                      label={`Вышестоящее подразделение: ${department.name}`}
                      value={draft.parentId}
                      onChange={(event) =>
                        change(department.id, "parentId", event.target.value)
                      }
                    >
                      <option value="">Нет</option>
                      {departments
                        .filter((item) => item.id !== department.id)
                        .map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.displayName}
                          </option>
                        ))}
                    </SelectControl>
                  </label>
                  <label>
                    Руководитель
                    <SelectControl
                      label={`Руководитель: ${department.name}`}
                      value={draft.headUserId}
                      onChange={(event) => {
                        const headUserId = event.target.value;
                        setDrafts((current) => ({
                          ...current,
                          [department.id]: {
                            ...current[department.id],
                            headUserId,
                            approverUserId:
                              current[department.id].approverUserId ||
                              headUserId,
                          },
                        }));
                      }}
                    >
                      <option value="">Не назначен</option>
                      {employees.map((employee) => (
                        <option value={employee.id} key={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                  <label>
                    Согласующий
                    <SelectControl
                      label={`Согласующий: ${department.name}`}
                      value={draft.approverUserId}
                      onChange={(event) =>
                        change(
                          department.id,
                          "approverUserId",
                          event.target.value,
                        )
                      }
                    >
                      <option value="">Руководитель подразделения</option>
                      {employees.map((employee) => (
                        <option value={employee.id} key={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                </div>
                <div className={styles.footer}>
                  <div className={styles.active}>
                    <ToggleControl
                      label="Подразделение активно"
                      checked={draft.isActive}
                      onChange={(checked) => {
                        setDrafts((current) => ({
                          ...current,
                          [department.id]: {
                            ...current[department.id],
                            isActive: checked,
                          },
                        }));
                        setMessages((current) => ({
                          ...current,
                          [department.id]: "Есть несохранённые изменения",
                        }));
                      }}
                    />
                  </div>
                  <ActionButton
                    variant="primary"
                    icon={Save}
                    disabled={savingId === department.id || !draft.headcount}
                    onClick={() => save(department)}
                  >
                    Сохранить
                  </ActionButton>
                </div>
              </>
            ) : null}
          </article>
        );
      })}
      {visibleDepartments.length > pageSize ? (
        <nav className={styles.pagination} aria-label="Страницы подразделений">
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
