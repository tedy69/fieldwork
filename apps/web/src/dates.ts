import type { WorkOrder } from '@fieldwork/contracts';

export function localDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Parse date-only values locally, without UTC conversion or Date's overflow normalization. */
export function parseLocalDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return localDate(date) === value ? date : undefined;
}

export function isValidDueRange(from: string, through: string) {
  return (
    (!from || Boolean(parseLocalDate(from))) &&
    (!through || Boolean(parseLocalDate(through))) &&
    (!from || !through || from <= through)
  );
}

export function isOverdue(order: Pick<WorkOrder, 'dueDate' | 'status'>, today: string) {
  return order.status !== 'APPROVED' && order.dueDate < today;
}

export function isInDueRange(dueDate: string, from: string, through: string) {
  return (
    isValidDueRange(from, through) && (!from || dueDate >= from) && (!through || dueDate <= through)
  );
}
