"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isWeekdayDisplayMode,
  type WeekdayDisplayMode,
} from "@/domain/production-calendar";

const STORAGE_KEY = "hr.weekdayDisplayMode";
const DEFAULT_MODE: WeekdayDisplayMode = "simple";

let memoryMode: WeekdayDisplayMode = DEFAULT_MODE;
const listeners = new Set<() => void>();

function readStoredMode(): WeekdayDisplayMode {
  if (typeof window === "undefined") return memoryMode;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isWeekdayDisplayMode(raw)) {
      memoryMode = raw;
      return raw;
    }
  } catch {
    // localStorage может быть недоступен — остаёмся на in-memory значении.
  }
  return memoryMode;
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

export function useWeekdayDisplayMode(): [
  WeekdayDisplayMode,
  (mode: WeekdayDisplayMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribe,
    readStoredMode,
    () => DEFAULT_MODE,
  );

  const setMode = useCallback((next: WeekdayDisplayMode) => {
    memoryMode = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / private mode
    }
    emit();
  }, []);

  return [mode, setMode];
}
