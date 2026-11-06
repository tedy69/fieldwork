import type { Recurrence } from '@fieldwork/contracts';

export const recurrenceLabels: Record<Recurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  weekdays: 'Weekdays (Mon–Fri)',
  weekends: 'Weekends (Sat–Sun)',
  monthly: 'Monthly',
  'month-end': 'Last day of month',
  'month-end-weekday': 'Last weekday of month',
  quarterly: 'Every three months',
};
