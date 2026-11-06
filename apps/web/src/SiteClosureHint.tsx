import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CalendarXIcon } from '@phosphor-icons/react/dist/csr/CalendarX';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { languageTags, type Locale } from '@fieldwork/strings';
import { addDays, calendarLabel } from './calendar';
import { Button } from './components/ui/button';
import './site-closure-hint.css';

function nextOpenDate(date: string, closures: readonly string[]) {
  while (closures.includes(date)) {
    if (date === '9999-12-31') return;
    date = addDays(date, 1);
  }
  return date;
}

export default function SiteClosureHint({
  id,
  dueDate,
  closureDates = [],
  locale,
  disabled,
  inputRef,
  onDateChange,
}: {
  id: string;
  dueDate: string;
  closureDates?: readonly string[];
  locale: Locale;
  disabled?: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onDateChange: (date: string) => void;
}) {
  const closed = closureDates.includes(dueDate);
  const suggestedDate = closed ? nextOpenDate(dueDate, closureDates) : undefined;
  const suggestion = suggestedDate && calendarLabel(suggestedDate, true, languageTags[locale]);
  const restoreFocus = useRef(false);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    inputRef.current?.focus();
  }, [dueDate, inputRef]);

  return (
    <>
      <p id={id} className="site-closure-hint" aria-live="polite">
        {closed && (
          <>
            <CalendarXIcon aria-hidden="true" />
            {locale === 'id'
              ? 'Lokasi tutup pada tanggal ini.'
              : 'This site is closed on the selected date.'}
          </>
        )}
      </p>
      {suggestedDate && (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            restoreFocus.current = true;
            onDateChange(suggestedDate);
          }}
        >
          <ArrowRightIcon aria-hidden="true" />
          {locale === 'id' ? `Gunakan ${suggestion}` : `Use ${suggestion}`}
        </Button>
      )}
    </>
  );
}
