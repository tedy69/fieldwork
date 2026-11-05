import type { Locale } from '@fieldwork/strings';

const options = {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
} as const;
const dates = {
  en: new Intl.DateTimeFormat('en-US', options),
  id: new Intl.DateTimeFormat('id-ID', options),
};

export function assignmentDate(date: string, locale: Locale) {
  // Keep ISO year zero instead of displaying the Gregorian year number without its era.
  return date.startsWith('0000-') ? date : dates[locale].format(new Date(date));
}
