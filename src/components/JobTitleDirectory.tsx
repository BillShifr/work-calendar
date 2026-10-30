"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberControl, ToggleControl } from "./FormControls";
import styles from "./JobTitleDirectory.module.css";

type JobTitle = {
  id: string;
  name: string;
  isActive: boolean;
  employeeCount: number;
  irregularLeaveMaxDays: number;
};

export function JobTitleDirectory({ jobTitles }: { jobTitles: JobTitle[] }) {
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

  async function createJobTitle() {
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
    router.refresh();
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
        <button
          className="primaryButton"
          disabled={savingId === "new" || newName.trim().length < 2}
          onClick={createJobTitle}
        >
          Добавить должность
        </button>
      </section>

      <div className={styles.heading}>
        <h2>Должности</h2>
        <span role="status">{message}</span>
      </div>
      <section className={styles.list} aria-label="Справочник должностей">
        {jobTitles.map((title) => {
          const draft = drafts[title.id];
          return (
            <article className={styles.row} key={title.id}>
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
              <button
                className="secondaryButton"
                disabled={savingId === title.id}
                onClick={() => saveJobTitle(title)}
              >
                Сохранить
              </button>
            </article>
          );
        })}
        {!jobTitles.length && (
          <p className={styles.empty}>Добавьте первую должность.</p>
        )}
      </section>
    </div>
  );
}
