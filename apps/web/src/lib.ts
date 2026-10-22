import { createClient } from '@fieldwork/sdk';
export const client = createClient();
export const labels: Record<string, string> = {
  ASSIGNED: 'Assigned',
  SUBMITTED: 'To review',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
};
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Try again.';
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
