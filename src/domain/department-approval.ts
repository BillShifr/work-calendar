export function quarterForMonth(month: number) {
  return Math.ceil(month / 3);
}

export function monthsForQuarter(quarter: number) {
  const first = (quarter - 1) * 3 + 1;
  return [first, first + 1, first + 2];
}
