import { RepeatDaySchema, type Recurrence, type RepeatDay } from '@fieldwork/contracts';

export const recurrenceLabels: Record<Recurrence['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  weekdays: 'Weekdays (Mon–Fri)',
  weekends: 'Weekends (Sat–Sun)',
  'selected-days': 'Selected days',
  monthly: 'Monthly',
  'month-end': 'Last day of month',
  'month-end-weekday': 'Last weekday of month',
  quarterly: 'Every three months',
};

export const repeatDayLabels: Record<RepeatDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function recurrenceSummary({
  frequency,
  repeatDays,
}: Pick<Recurrence, 'frequency' | 'repeatDays'>) {
  if (!repeatDays) return recurrenceLabels[frequency];
  return RepeatDaySchema.options
    .filter((day) => repeatDays.includes(day))
    .map((day) => repeatDayLabels[day].slice(0, 3))
    .join(', ');
}
