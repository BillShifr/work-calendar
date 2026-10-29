"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./DepartmentRuleEditor.module.css";

type DepartmentRule = {
  id: string;
  name: string;
  headcount: number;
  maxAbsent: number | null;
  minPresent: number | null;
  isActive: boolean;
  assignedCount: number;
  updatedAt: string;
};

function optionalNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

export function DepartmentRuleEditor({
  departments,
}: {
  departments: DepartmentRule[];
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
          maxAbsent: department.maxAbsent?.toString() ?? "",
          minPresent: department.minPresent?.toString() ?? "",
        },
      ]),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [newDepartment, setNewDepartment] = useState({
    name: "",
    headcount: "",
    maxAbsent: "",
    minPresent: "",
  });

  function change(id: string, field: string, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
    setMessages((current) => ({
      ...current,
      [id]: "Есть несохранённые изменения",
    }));
  }

  async function save(department: DepartmentRule) {
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
        maxAbsent: optionalNumber(draft.maxAbsent),
        minPresent: optionalNumber(draft.minPresent),
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
    setCreating(true);
    const response = await fetch("/api/hr/departments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newDepartment.name,
        headcount: Number(newDepartment.headcount),
        maxAbsent: optionalNumber(newDepartment.maxAbsent),
        minPresent: optionalNumber(newDepartment.minPresent),
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
      maxAbsent: "",
      minPresent: "",
    });
    setMessages((current) => ({ ...current, create: "Подразделение создано" }));
    router.refresh();
  }

  return (
    <div className={styles.list}>
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
          <input
            type="number"
            min="0"
            value={newDepartment.headcount}
            onChange={(event) =>
              setNewDepartment({
                ...newDepartment,
                headcount: event.target.value,
              })
            }
          />
        </label>
        <label>
          Макс. отсутствующих
          <input
            type="number"
            min="0"
            placeholder="авто"
            value={newDepartment.maxAbsent}
            onChange={(event) =>
              setNewDepartment({
                ...newDepartment,
                maxAbsent: event.target.value,
              })
            }
          />
        </label>
        <label>
          Мин. присутствующих
          <input
            type="number"
            min="0"
            placeholder="не задан"
            value={newDepartment.minPresent}
            onChange={(event) =>
              setNewDepartment({
                ...newDepartment,
                minPresent: event.target.value,
              })
            }
          />
        </label>
        <button
          className="primaryButton"
          disabled={creating || !newDepartment.name || !newDepartment.headcount}
          onClick={createDepartment}
        >
          Создать
        </button>
        <span role="status">{messages.create}</span>
      </section>
      {departments.map((department) => {
        const draft = drafts[department.id];
        const fallbackLimit = Math.max(
          1,
          Math.floor(Number(draft.headcount || 0) * 0.25),
        );
        return (
          <article className={`card ${styles.department}`} key={department.id}>
            <div className={styles.heading}>
              <div>
                <p className="eyebrow">
                  {draft.isActive ? "Активно" : "Отключено"} ·{" "}
                  {department.assignedCount} сотрудников
                </p>
                <h2>{draft.name}</h2>
              </div>
              <span className={styles.ruleState} aria-label="Режим правила">
                {draft.maxAbsent || draft.minPresent
                  ? "Режим: собственное правило"
                  : `Автоматически: до ${fallbackLimit}`}
              </span>
            </div>
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
                <input
                  type="number"
                  min="0"
                  value={draft.headcount}
                  onChange={(event) =>
                    change(department.id, "headcount", event.target.value)
                  }
                />
              </label>
              <label>
                Максимум отсутствующих
                <input
                  type="number"
                  min="0"
                  placeholder="авто"
                  value={draft.maxAbsent}
                  onChange={(event) =>
                    change(department.id, "maxAbsent", event.target.value)
                  }
                />
              </label>
              <label>
                Минимум присутствующих
                <input
                  type="number"
                  min="0"
                  placeholder="не задан"
                  value={draft.minPresent}
                  onChange={(event) =>
                    change(department.id, "minPresent", event.target.value)
                  }
                />
              </label>
            </div>
            <div className={styles.footer}>
              <p>
                Если заполнены оба ограничения, применяется более строгое.
                Пустые поля включают автоматический лимит 25% штата.
              </p>
              <span role="status">{messages[department.id]}</span>
              <label className={styles.active}>
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [department.id]: {
                        ...current[department.id],
                        isActive: event.target.checked,
                      },
                    }))
                  }
                />
                Подразделение активно
              </label>
              <button
                className="primaryButton"
                disabled={savingId === department.id || !draft.headcount}
                onClick={() => save(department)}
              >
                Сохранить правило
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
