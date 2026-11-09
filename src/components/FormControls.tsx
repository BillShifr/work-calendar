"use client";

import {
  Children,
  isValidElement,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  Check,
  ChevronDown,
  FileCheck2,
  Minus,
  Plus,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Select, Switch, ToggleGroup } from "radix-ui";
import styles from "./FormControls.module.css";

export function ActionButton({
  children,
  className = "",
  icon: Icon,
  variant = "secondary",
  ...props
}: Omit<React.ComponentProps<typeof motion.button>, "children"> & {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      {...props}
      className={`${styles.actionButton} ${styles[variant]} ${className}`}
      whileTap={reduced || props.disabled ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
    >
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={2} /> : null}
      <span>{children}</span>
    </motion.button>
  );
}

export function IconButton({
  label,
  icon: Icon,
  className = "",
  ...props
}: Omit<React.ComponentProps<typeof motion.button>, "children"> & {
  label: string;
  icon: LucideIcon;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      {...props}
      type={props.type ?? "button"}
      aria-label={label}
      title={label}
      className={`${styles.iconButton} ${className}`}
      whileTap={reduced || props.disabled ? undefined : { scale: 0.92 }}
      transition={{ type: "spring", stiffness: 560, damping: 30 }}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={2} />
    </motion.button>
  );
}

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
      <motion.button
        type="button"
        aria-label={`Уменьшить: ${label}`}
        onClick={() => adjust(-1)}
        disabled={Number(value || min) <= min}
        whileTap={{ scale: 0.9 }}
      >
        <Minus aria-hidden="true" size={18} />
      </motion.button>
      <input
        aria-label={label}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={input}
      />
      <motion.button
        type="button"
        aria-label={`Увеличить: ${label}`}
        onClick={() => adjust(1)}
        disabled={max !== undefined && Number(value || min) >= max}
        whileTap={{ scale: 0.9 }}
      >
        <Plus aria-hidden="true" size={18} />
      </motion.button>
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
    <label className={styles.toggleLabel}>
      <Switch.Root
        disabled={disabled}
        className={styles.toggle}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
      >
        <Switch.Thumb className={styles.toggleThumb} />
      </Switch.Root>
      <strong>{label}</strong>
    </label>
  );
}

export function SelectControl({
  label,
  children,
  value,
  defaultValue,
  disabled,
  onChange,
  name,
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const emptyValue = "__tfoms_empty__";
  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((option) => {
      const props = option.props as {
        value?: string | number;
        children?: ReactNode;
        disabled?: boolean;
      };
      return {
        value: String(props.value ?? "") || emptyValue,
        label: props.children,
        disabled: props.disabled,
      };
    });
  const current = value === undefined ? undefined : String(value) || emptyValue;
  const initial =
    defaultValue === undefined ? undefined : String(defaultValue) || emptyValue;
  return (
    <Select.Root
      name={name}
      value={current}
      defaultValue={initial}
      disabled={disabled}
      onValueChange={(next) =>
        onChange?.({
          target: { value: next === emptyValue ? "" : next },
          currentTarget: { value: next === emptyValue ? "" : next },
        } as ChangeEvent<HTMLSelectElement>)
      }
    >
      <Select.Trigger className={styles.selectTrigger} aria-label={label}>
        <Select.Value />
        <Select.Icon>
          <ChevronDown aria-hidden="true" size={18} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={styles.selectContent} position="popper">
          <Select.Viewport className={styles.selectViewport}>
            {options.map((option) => (
              <Select.Item
                className={styles.selectItem}
                disabled={option.disabled}
                value={option.value}
                key={option.value}
              >
                <Select.ItemIndicator className={styles.selectIndicator}>
                  <Check aria-hidden="true" size={16} />
                </Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function SegmentedControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
}) {
  return (
    <ToggleGroup.Root
      className={styles.segmented}
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => next && onChange(next)}
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <ToggleGroup.Item value={option.value} key={option.value}>
            {Icon ? <Icon aria-hidden="true" size={17} /> : null}
            {option.label}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}

export function SearchControl({
  value,
  onChange,
  placeholder = "Поиск",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.search}>
      <Search aria-hidden="true" size={19} />
      <span className="srOnly">{placeholder}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => onChange("")}
        >
          <X aria-hidden="true" size={17} />
        </button>
      ) : null}
    </label>
  );
}

export type FlightState = {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
} | null;

export function SubmissionFlight({
  flight,
  onComplete,
}: {
  flight: FlightState;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {flight ? (
        <motion.div
          className={styles.flight}
          style={{ left: flight.x, top: flight.y }}
          initial={{ opacity: 0, scale: 0.72, rotate: 8 }}
          animate={
            reduced
              ? { opacity: [0, 1, 0], scale: [0.9, 1, 1] }
              : {
                  opacity: [0, 1, 1, 0],
                  scale: [0.72, 1, 0.82, 0.5],
                  rotate: [8, -8, -18, -25],
                  x: [0, 24, flight.targetX - flight.x],
                  y: [0, -32, flight.targetY - flight.y],
                }
          }
          transition={{
            duration: reduced ? 0.45 : 0.9,
            ease: [0.22, 1, 0.36, 1],
          }}
          onAnimationComplete={onComplete}
          aria-hidden="true"
        >
          <span />
          <FileCheck2 size={20} strokeWidth={2.3} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
