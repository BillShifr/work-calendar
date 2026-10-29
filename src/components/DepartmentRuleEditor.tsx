"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NumberControl, ToggleControl } from "./FormControls";
import styles from "./DepartmentRuleEditor.module.css";

type Department = {
  id: string;
  name: string;
  headcount: number;
  isActive: boolean;
  assignedCount: number;
  updatedAt: string;
};

export function DepartmentRuleEditor({
  departments,
}: {
  departments: Department[];
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
  });

  function change(id: string, field: "name" | "headcount", value: string) {
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
    setNewDepartment({ name: "", headcount: "" });
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
              <span role="status">{messages[department.id]}</span>
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
                <NumberControl
                  label={`Штатная численность: ${department.name}`}
                  value={draft.headcount}
                  onChange={(value) =>
                    change(department.id, "headcount", value)
                  }
                />
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
              <button
                className="primaryButton"
                disabled={savingId === department.id || !draft.headcount}
                onClick={() => save(department)}
              >
                Сохранить
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
