import { languageTags, type Locale } from '@fieldwork/strings';

const options = {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
} as const;
const dates = {
  en: new Intl.DateTimeFormat(languageTags.en, options),
  id: new Intl.DateTimeFormat(languageTags.id, options),
};

export function assignmentDate(date: string, locale: Locale) {
  // Keep ISO year zero instead of displaying the Gregorian year number without its era.
  return date.startsWith('0000-') ? date : dates[locale].format(new Date(date));
}
