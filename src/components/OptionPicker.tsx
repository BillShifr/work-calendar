"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { SearchControl } from "./FormControls";
import styles from "./OptionPicker.module.css";

export function OptionPicker({
  label,
  items,
  selected,
  onToggle,
  onToggleAll,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const visible = query.trim()
    ? items.filter((item) =>
        item.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;
  const allOn =
    items.length > 0 && items.every((item) => selected.has(item.id));

  useLayoutEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.picker}>
      <button
        type="button"
        className={styles.pickerTrigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        {label} · {selected.size}
      </button>
      {open ? (
        <div className={styles.pickerPanel} role="listbox" aria-label={label}>
          {items.length > 8 ? (
            <SearchControl
              value={query}
              onChange={setQuery}
              placeholder="Найти"
            />
          ) : null}
          <button
            type="button"
            className={styles.option}
            aria-pressed={allOn}
            onClick={() => onToggleAll(!allOn)}
          >
            {allOn ? <Check aria-hidden="true" size={18} /> : <span />}
            Все
          </button>
          {visible.map((item) => {
            const on = selected.has(item.id);
            return (
              <button
                type="button"
                className={styles.option}
                aria-pressed={on}
                key={item.id}
                onClick={() => onToggle(item.id, !on)}
              >
                {on ? <Check aria-hidden="true" size={18} /> : <span />}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}