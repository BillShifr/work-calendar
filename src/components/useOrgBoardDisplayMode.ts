"use client";

import { useCallback, useSyncExternalStore } from "react";

export const ORG_BOARD_DISPLAY_MODES = ["simple", "color"] as const;
export type OrgBoardDisplayMode = (typeof ORG_BOARD_DISPLAY_MODES)[number];

const STORAGE_KEY = "hr.orgBoardDisplayMode";
const DEFAULT_MODE: OrgBoardDisplayMode = "color";

let memoryMode: OrgBoardDisplayMode = DEFAULT_MODE;
const listeners = new Set<() => void>();

function isOrgBoardDisplayMode(value: string): value is OrgBoardDisplayMode {
  return ORG_BOARD_DISPLAY_MODES.includes(value as OrgBoardDisplayMode);
}

function readStoredMode(): OrgBoardDisplayMode {
  if (typeof window === "undefined") return memoryMode;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isOrgBoardDisplayMode(raw)) {
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

export function useOrgBoardDisplayMode(): [
  OrgBoardDisplayMode,
  (mode: OrgBoardDisplayMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribe,
    readStoredMode,
    () => DEFAULT_MODE,
  );

  const setMode = useCallback((next: OrgBoardDisplayMode) => {
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
