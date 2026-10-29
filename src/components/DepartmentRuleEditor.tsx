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
          maxAbsent: department.maxAbsent?.toString() ?? "",
          minPresent: department.minPresent?.toString() ?? "",
        },
      ]),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

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

  return (
    <div className={styles.list}>
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
                <p className="eyebrow">Активный отдел</p>
                <h2>{department.name}</h2>
              </div>
              <span className={styles.ruleState}>
                {draft.maxAbsent || draft.minPresent
                  ? "Собственное правило"
                  : `Автоматически: до ${fallbackLimit}`}
              </span>
            </div>
            <div className={styles.fields}>
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
