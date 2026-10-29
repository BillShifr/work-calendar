export type AbsenceDay = {
  departmentId: string;
  departmentName: string;
  headcount: number;
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
  employeeNames: string[];
  criticalAbsent: boolean;
  reason: string;
};

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function riskReason(day: AbsenceDay): string | null {
  if (day.criticalAbsent) return "Отсутствует критически важный сотрудник";
  if (day.absentCount > 1)
    return `Одновременно отсутствуют ${day.absentCount} сотрудников`;
  return null;
}

export function buildAbsenceRisks(days: AbsenceDay[]): AbsenceRisk[] {
  const risky = days
    .map((day) => {
      const reason = riskReason(day);
      return reason ? { day, reason } : null;
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
