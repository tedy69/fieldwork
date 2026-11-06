import { useId, useState } from 'react';
import { RecurrenceSchema } from '@fieldwork/contracts';
import { languageTags, type Locale } from '@fieldwork/strings';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { calendarLabel } from './calendar';
import { Button } from './components/ui/button';
import { DatePicker } from './components/ui/date-picker';
import { FieldError } from './components/ui/field';
import { IconButton } from './components/ui/icon-button';
import { Label } from './components/ui/label';
import { recurringDispatchCopy } from './recurring-dispatch-copy';
import './recurrence-exceptions.css';

export function SkippedDates({
  dates,
  locale = 'en',
  onRemove,
  disabled,
}: {
  dates?: string[];
  locale?: Locale;
  onRemove?: (date: string) => void;
  disabled?: boolean;
}) {
  if (!dates?.length) return null;
  const copy = recurringDispatchCopy[locale].exceptions;
  return (
    <section aria-label={copy.region}>
      <h3>{copy.title}</h3>
      <ul className="recurrence-skip-list">
        {dates.map((date) => (
          <li key={date}>
            <time dateTime={date}>{calendarLabel(date, true, languageTags[locale])}</time>
            {onRemove && (
              <IconButton
                label={copy.remove(date)}
                disabled={disabled}
                onClick={() => onRemove(date)}
              >
                <TrashIcon aria-hidden="true" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function RecurrenceExceptions({
  dates,
  locale,
  candidate,
  dueDate,
  closureDates,
  byDate,
  disabled,
  onCandidate,
  onChange,
}: {
  dates: string[];
  locale: Locale;
  candidate: string;
  dueDate: string;
  closureDates?: string[];
  byDate: boolean;
  disabled: boolean;
  onCandidate: (date: string) => void;
  onChange: (dates: string[]) => void;
}) {
  const copy = recurringDispatchCopy[locale].exceptions;
  const id = useId();
  const [open, setOpen] = useState(dates.length > 0);
  const validDate = RecurrenceSchema.shape.dueDate.safeParse(candidate).success;
  const laterClosures =
    closureDates?.filter((date) => date > dueDate && !dates.includes(date)) ?? [];
  const tooMany = dates.length + laterClosures.length > 52;
  const error =
    validDate && candidate <= dueDate
      ? copy.afterFirst
      : validDate && dates.includes(candidate)
        ? copy.duplicate
        : '';
  function focusDate() {
    document.getElementById(id)?.focus();
  }
  return (
    <details
      className="recurrence-exceptions"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {copy.summary(dates.length)}
        {candidate && <span className="muted"> · {copy.unadded}</span>}
      </summary>
      <p className="muted">{byDate ? copy.dateHint : copy.countHint}</p>
      {closureDates?.length ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || tooMany || laterClosures.length === 0}
            onClick={() => {
              onChange([...dates, ...laterClosures].sort());
              focusDate();
            }}
          >
            {copy.copyClosures}
          </Button>
          {closureDates.includes(dueDate) && <p className="muted">{copy.firstClosed}</p>}
          {tooMany && <p className="muted">{copy.tooMany}</p>}
          {!tooMany && laterClosures.length === 0 && <p className="muted">{copy.noneToCopy}</p>}
        </>
      ) : null}
      <Label htmlFor={id}>{copy.date}</Label>
      <DatePicker
        id={id}
        value={candidate}
        onValueChange={onCandidate}
        calendarLabel={copy.calendar}
        locale={locale}
        disabled={disabled || dates.length >= 52}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [candidate && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
        }
      />
      {candidate && (
        <p id={`${id}-hint`} className="muted">
          {copy.addOrClear}
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      {dates.length >= 52 && <p role="status">{copy.maximum}</p>}
      <Button
        type="button"
        className="quiet"
        disabled={disabled || !validDate || Boolean(error) || dates.length >= 52}
        onClick={() => {
          onChange([...dates, candidate].sort());
          onCandidate('');
          focusDate();
        }}
      >
        <PlusIcon aria-hidden="true" /> {copy.add}
      </Button>
      <SkippedDates
        dates={dates}
        locale={locale}
        disabled={disabled}
        onRemove={(date) => {
          onChange(dates.filter((item) => item !== date));
          focusDate();
        }}
      />
    </details>
  );
}
