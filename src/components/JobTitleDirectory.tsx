"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus, Save, X } from "lucide-react";
import {
  ActionButton,
  NumberControl,
  SearchControl,
  ToggleControl,
} from "./FormControls";
import styles from "./JobTitleDirectory.module.css";

type JobTitle = {
  id: string;
  name: string;
  isActive: boolean;
  employeeCount: number;
  irregularLeaveMaxDays: number;
};

export function JobTitleDirectory({
  jobTitles,
  focusId,
}: {
  jobTitles: JobTitle[];
  focusId?: string;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newMaxDays, setNewMaxDays] = useState("0");
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      jobTitles.map((title) => [
        title.id,
        {
          name: title.name,
          isActive: title.isActive,
          irregularLeaveMaxDays: String(title.irregularLeaveMaxDays),
        },
      ]),
    ),
  );
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(() => {
    const index = jobTitles.findIndex((item) => item.id === focusId);
    return index < 0 ? 1 : Math.floor(index / 7) + 1;
  });
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ru");
  const visibleTitles = jobTitles.filter((title) =>
    title.name.toLocaleLowerCase("ru").includes(normalizedQuery),
  );
  const pageSize = 7;
  const pageCount = Math.max(1, Math.ceil(visibleTitles.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedTitles = visibleTitles.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function createJobTitle() {
    const createdName = newName.trim();
    setSavingId("new");
    const response = await fetch("/api/hr/job-titles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newName,
        irregularLeaveMaxDays: Number(newMaxDays),
      }),
    });
    const data = await response.json();
    setSavingId(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось создать");
    setNewName("");
    setNewMaxDays("0");
    setMessage("Должность добавлена");
    setShowCreate(false);
    setQuery(createdName);
    setPage(1);
    router.replace(`/hr/reference-data?focus=${data.id}`);
  }

  async function saveJobTitle(title: JobTitle) {
    setSavingId(title.id);
    const response = await fetch(`/api/hr/job-titles/${title.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...drafts[title.id],
        irregularLeaveMaxDays: Number(drafts[title.id].irregularLeaveMaxDays),
      }),
    });
    const data = await response.json();
    setSavingId(null);
    if (!response.ok) return setMessage(data.error ?? "Не удалось сохранить");
    setMessage("Изменения сохранены");
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <SearchControl
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(1);
          }}
          placeholder="Поиск должности"
        />
        <span>
          {visibleTitles.length} из {jobTitles.length}
        </span>
        <ActionButton
          variant="primary"
          icon={Plus}
          onClick={() => setShowCreate((value) => !value)}
        >
          {showCreate ? "Закрыть форму" : "Добавить должность"}
        </ActionButton>
      </div>
      {showCreate ? (
        <section className={styles.create} aria-labelledby="new-job-title">
          <div>
            <h2 id="new-job-title">Новая должность</h2>
          </div>
          <label>
            Название должности
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Например, ведущий специалист"
            />
          </label>
          <label>
            Максимум дней
            <NumberControl
              label="Максимум дней для новой должности"
              min={0}
              max={30}
              value={newMaxDays}
              onChange={setNewMaxDays}
            />
          </label>
          <ActionButton
            variant="primary"
            icon={Plus}
            disabled={savingId === "new" || newName.trim().length < 2}
            onClick={createJobTitle}
          >
            Добавить должность
          </ActionButton>
        </section>
      ) : null}

      <div className={styles.heading}>
        <h2>Должности</h2>
        <span role="status">{message}</span>
      </div>
      <section className={styles.list} aria-label="Справочник должностей">
        {pagedTitles.map((title) => {
          const draft = drafts[title.id];
          const editing = editingId === title.id;
          return (
            <article className={styles.row} key={title.id}>
              {!editing ? (
                <>
                  <div className={styles.summary}>
                    <strong>{title.name}</strong>
                    <span>
                      {title.employeeCount} сотрудников · максимум{" "}
                      {title.irregularLeaveMaxDays} дней
                    </span>
                  </div>
                  <span
                    className={title.isActive ? styles.active : styles.inactive}
                  >
                    {title.isActive ? "Доступна" : "Отключена"}
                  </span>
                  <ActionButton
                    icon={Pencil}
                    onClick={() => setEditingId(title.id)}
                  >
                    Редактировать
                  </ActionButton>
                </>
              ) : (
                <>
                  <label>
                    Название
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [title.id]: { ...draft, name: event.target.value },
                        })
                      }
                    />
                  </label>
                  <div className={styles.maxDays}>
                    <span>Максимум дней</span>
                    <NumberControl
                      label={`Максимум дней: ${title.name}`}
                      min={0}
                      max={30}
                      value={draft.irregularLeaveMaxDays}
                      onChange={(value) =>
                        setDrafts({
                          ...drafts,
                          [title.id]: {
                            ...draft,
                            irregularLeaveMaxDays: value,
                          },
                        })
                      }
                    />
                  </div>
                  <div className={styles.usage}>
                    <span>Сотрудников</span>
                    <strong>{title.employeeCount}</strong>
                  </div>
                  <ToggleControl
                    label="Доступна для назначения"
                    checked={draft.isActive}
                    onChange={(isActive) =>
                      setDrafts({
                        ...drafts,
                        [title.id]: { ...draft, isActive },
                      })
                    }
                  />
                  <ActionButton
                    variant="quiet"
                    icon={X}
                    onClick={() => setEditingId(null)}
                  >
                    Отмена
                  </ActionButton>
                  <ActionButton
                    icon={Save}
                    disabled={savingId === title.id}
                    onClick={() => saveJobTitle(title)}
                  >
                    Сохранить
                  </ActionButton>
                </>
              )}
            </article>
          );
        })}
        {!jobTitles.length && (
          <p className={styles.empty}>Добавьте первую должность.</p>
        )}
      </section>
      {visibleTitles.length > pageSize ? (
        <nav className={styles.pagination} aria-label="Страницы должностей">
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
