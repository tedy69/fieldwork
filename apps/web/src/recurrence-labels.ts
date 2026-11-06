import { RepeatDaySchema, type Recurrence, type RepeatDay } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';

const recurrenceLabels: Record<Recurrence['frequency'], string> = {
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

const repeatDayLabels: Record<RepeatDay, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export const frequencyLabels: Record<Locale, typeof recurrenceLabels> = {
  en: recurrenceLabels,
  id: {
    daily: 'Harian',
    weekly: 'Mingguan',
    biweekly: 'Setiap dua minggu',
    weekdays: 'Hari kerja (Sen–Jum)',
    weekends: 'Akhir pekan (Sab–Min)',
    'selected-days': 'Hari terpilih',
    monthly: 'Bulanan',
    'month-end': 'Hari terakhir tiap bulan',
    'month-end-weekday': 'Hari kerja terakhir tiap bulan',
    quarterly: 'Setiap tiga bulan',
  },
};

export const weekdayLabels: Record<Locale, typeof repeatDayLabels> = {
  en: repeatDayLabels,
  id: {
    mon: 'Senin',
    tue: 'Selasa',
    wed: 'Rabu',
    thu: 'Kamis',
    fri: 'Jumat',
    sat: 'Sabtu',
    sun: 'Minggu',
  },
};

export function recurrenceSummary(
  { frequency, repeatDays }: Pick<Recurrence, 'frequency' | 'repeatDays'>,
  locale: Locale = 'en',
) {
  if (!repeatDays) return frequencyLabels[locale][frequency];
  return RepeatDaySchema.options
    .filter((day) => repeatDays.includes(day))
    .map((day) => weekdayLabels[locale][day].slice(0, 3))
    .join(', ');
}
