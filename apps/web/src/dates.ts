import type { WorkOrder } from '@fieldwork/contracts';

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isOverdue(order: Pick<WorkOrder, 'dueDate' | 'status'>, today: string) {
  return order.status !== 'APPROVED' && order.dueDate < today;
}

export function isInDueRange(dueDate: string, from: string, through: string) {
  return (!from || dueDate >= from) && (!through || dueDate <= through);
}
