"use client";

import type { ChangeEvent, SelectHTMLAttributes } from "react";
import styles from "./FormControls.module.css";

export function NumberControl({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  function adjust(delta: number) {
    const current = Number(value === "" ? min : value);
    const next = Math.max(
      min,
      Math.min(max ?? Number.MAX_SAFE_INTEGER, current + delta),
    );
    onChange(String(next));
  }
  function input(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value.replace(/\D/g, "");
    if (next === "") return onChange("");
    onChange(
      String(
        Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, Number(next))),
      ),
    );
  }
  return (
    <div className={styles.number}>
      <button
        type="button"
        aria-label={`Уменьшить: ${label}`}
        onClick={() => adjust(-1)}
        disabled={Number(value || min) <= min}
      >
        −
      </button>
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={input}
      />
      <button
        type="button"
        aria-label={`Увеличить: ${label}`}
        onClick={() => adjust(1)}
        disabled={max !== undefined && Number(value || min) >= max}
      >
        +
      </button>
    </div>
  );
}

export function ToggleControl({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true">
        <i />
      </span>
      <strong>{label}</strong>
    </button>
  );
}

export function SelectControl({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <span className={styles.select}>
      <select aria-label={label} {...props}>
        {children}
      </select>
      <i aria-hidden="true">⌄</i>
    </span>
  );
}
