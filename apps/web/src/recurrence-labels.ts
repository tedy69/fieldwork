import type { Recurrence } from '@fieldwork/contracts';

export const recurrenceLabels: Record<Recurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  weekdays: 'Weekdays (Mon–Fri)',
};
