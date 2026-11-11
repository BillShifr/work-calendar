import {
  normalizePeriod,
  periodClientId,
  periodDays,
  periodsOverlap,
  totalPeriodDays,
  type DatePeriod,
} from "./vacation";

export type RangeDraft = {
  anchor: string;
  hover: string | null;
  editing: DatePeriod | null;
};

export type CommitRangeResult =
  | { status: "committed"; period: DatePeriod }
  | { status: "overlap" }
  | { status: "allowance"; draft: RangeDraft };

export function beginRange(
  anchor: string,
  editing: DatePeriod | null = null,
): RangeDraft {
  return {
    anchor,
    hover: editing?.endsOn ?? null,
    editing,
  };
}

export function previewRange(draft: RangeDraft, hover: string): RangeDraft {
  return { ...draft, hover };
}

export function draftPeriod(
  draft: RangeDraft,
  end = draft.hover ?? draft.anchor,
): Pick<DatePeriod, "startsOn" | "endsOn"> {
  return normalizePeriod(draft.anchor, end);
}

export function commitRange(
  draft: RangeDraft,
  end: string,
  periods: DatePeriod[],
  allowanceDays: number,
  source: DatePeriod["source"],
): CommitRangeResult {
  const normalized = normalizePeriod(draft.anchor, end);
  const period: DatePeriod = {
    id: periodClientId(normalized.startsOn, normalized.endsOn),
    ...normalized,
    source,
  };
  if (periods.some((candidate) => periodsOverlap(candidate, period)))
    return { status: "overlap" };
  if (totalPeriodDays(periods) + periodDays(period) > allowanceDays)
    return { status: "allowance", draft: { ...draft, hover: end } };
  return { status: "committed", period };
}

export function cancelRange(draft: RangeDraft | null): DatePeriod | null {
  return draft?.editing ?? null;
}

export function insertPeriod(
  periods: DatePeriod[],
  period: DatePeriod,
): DatePeriod[] {
  return [...periods, period].sort((left, right) =>
    left.startsOn.localeCompare(right.startsOn),
  );
}

export function rangeExceedsAllowance(
  range: Pick<DatePeriod, "startsOn" | "endsOn">,
  periods: DatePeriod[],
  allowanceDays: number,
): boolean {
  return totalPeriodDays(periods) + periodDays(range) > allowanceDays;
}
