export type AbsenceDay = {
  departmentId: string;
  departmentName: string;
  headcount: number;
  maxAbsent: number | null;
  minPresent: number | null;
  day: string;
  absentCount: number;
  criticalAbsent: boolean;
  employeeNames: string[];
};

export type AbsenceRisk = {
  departmentId: string;
  departmentName: string;
  startsOn: string;
  endsOn: string;
  days: string[];
  peakAbsent: number;
  headcount: number;
  allowedAbsent: number;
  employeeNames: string[];
  criticalAbsent: boolean;
  reason: string;
};

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function allowedAbsent(day: AbsenceDay): number {
  if (day.maxAbsent !== null && day.minPresent !== null)
    return Math.min(day.maxAbsent, Math.max(0, day.headcount - day.minPresent));
  if (day.maxAbsent !== null) return day.maxAbsent;
  if (day.minPresent !== null)
    return Math.max(0, day.headcount - day.minPresent);
  return Math.max(1, Math.floor(day.headcount * 0.25));
}

function riskReason(day: AbsenceDay, limit: number): string | null {
  if (day.criticalAbsent) return "Отсутствует критически важный сотрудник";
  if (day.absentCount > limit)
    return `Одновременно отсутствуют ${day.absentCount}, допустимо не более ${limit}`;
  return null;
}

export function buildAbsenceRisks(days: AbsenceDay[]): AbsenceRisk[] {
  const risky = days
    .map((day) => {
      const limit = allowedAbsent(day);
      const reason = riskReason(day, limit);
      return reason ? { day, limit, reason } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (left, right) =>
        left.day.departmentName.localeCompare(right.day.departmentName) ||
        left.day.day.localeCompare(right.day.day),
    );

  const risks: AbsenceRisk[] = [];
  for (const item of risky) {
    const previous = risks.at(-1);
    if (
      previous &&
      previous.departmentId === item.day.departmentId &&
      nextDay(previous.endsOn) === item.day.day
    ) {
      const isNewPeak = item.day.absentCount > previous.peakAbsent;
      previous.endsOn = item.day.day;
      previous.days.push(item.day.day);
      previous.peakAbsent = Math.max(previous.peakAbsent, item.day.absentCount);
      previous.criticalAbsent ||= item.day.criticalAbsent;
      previous.employeeNames = [
        ...new Set([...previous.employeeNames, ...item.day.employeeNames]),
      ].sort();
      if (item.day.criticalAbsent || isNewPeak) previous.reason = item.reason;
      continue;
    }
    risks.push({
      departmentId: item.day.departmentId,
      departmentName: item.day.departmentName,
      startsOn: item.day.day,
      endsOn: item.day.day,
      days: [item.day.day],
      peakAbsent: item.day.absentCount,
      headcount: item.day.headcount,
      allowedAbsent: item.limit,
      employeeNames: [...item.day.employeeNames].sort(),
      criticalAbsent: item.day.criticalAbsent,
      reason: item.reason,
    });
  }
  return risks.sort(
    (left, right) =>
      Number(right.criticalAbsent) - Number(left.criticalAbsent) ||
      right.peakAbsent - left.peakAbsent ||
      left.startsOn.localeCompare(right.startsOn),
  );
}
