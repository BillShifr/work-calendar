import {
  draftPeriod,
  rangeExceedsAllowance,
  type RangeDraft,
} from "@/domain/vacation-selection";
import { periodDays, type DatePeriod } from "@/domain/vacation";

export type PreviewClasses = {
  preview: string;
  previewInvalid: string;
};

export function paintVacationPreview(
  root: HTMLElement | null,
  classes: PreviewClasses,
  draft: RangeDraft | null,
  periods: DatePeriod[],
  allowanceDays: number,
): void {
  if (!root) return;
  const range = draft ? draftPeriod(draft) : null;
  const invalid = Boolean(
    draft && range && rangeExceedsAllowance(range, periods, allowanceDays),
  );
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-date]",
  )) {
    const date = button.dataset.date;
    if (!date) continue;
    const inRange = Boolean(
      range && date >= range.startsOn && date <= range.endsOn,
    );
    button.classList.toggle(classes.preview, inRange && !invalid);
    button.classList.toggle(classes.previewInvalid, inRange && invalid);
  }
}

export function vacationSelectionCopy(
  draft: RangeDraft | null,
  remainingDays: number,
  formatDate: (value: string) => string,
  canEdit = true,
): { title: string; detail: string } {
  if (!draft)
    return {
      title: "Периоды",
      detail: canEdit ? "Нажмите начальный и конечный день" : "Только просмотр",
    };
  const title = `Начало: ${formatDate(draft.anchor)}`;
  if (!draft.hover)
    return {
      title,
      detail: `Выберите последний день · доступно ${remainingDays} дн.`,
    };
  const range = draftPeriod(draft);
  return {
    title,
    detail: `${formatDate(range.startsOn)} — ${formatDate(range.endsOn)} · ${periodDays(range)} дн.`,
  };
}

export function dateFromCalendarEvent(
  target: EventTarget | null,
): string | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>("button[data-date]");
  if (!button || button.disabled) return null;
  return button.dataset.date ?? null;
}

export function dateFromPoint(clientX: number, clientY: number): string | null {
  return dateFromCalendarEvent(document.elementFromPoint(clientX, clientY));
}
