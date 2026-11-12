function formatDayMonth(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
}

export function formatVacationPeriodCell(startsOn: string, endsOn: string) {
  const start = formatDayMonth(startsOn);
  const end = formatDayMonth(endsOn);
  const sameMonth = startsOn.slice(5, 7) === endsOn.slice(5, 7);
  if (!sameMonth) return `${start}-${end}`;
  if (startsOn.slice(8, 10) === "01") return `${start}.-${end}`;
  return `${start}-${end}`;
}

export function isoToExcelDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
