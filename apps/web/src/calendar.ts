export function addDays(date: string, days: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function weekDates(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = addDays(date, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function calendarLabel(date: string, full = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    ...(full ? { year: 'numeric' as const } : { weekday: 'short' as const }),
    month: 'short',
    day: 'numeric',
  });
}

export function shiftMonth(date: string, months: number) {
  const first = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + months);
  return first.toISOString().slice(0, 10);
}

export function monthDates(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const last = new Date(`${first}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return Array.from({ length: last.getUTCDate() }, (_, index) => addDays(first, index));
}

export function monthLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  });
}
