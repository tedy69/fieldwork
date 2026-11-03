import { useId, useState } from 'react';
import { RecurrenceSchema } from '@fieldwork/contracts';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { calendarLabel } from './calendar';
import { Button } from './components/ui/button';
import { DatePicker } from './components/ui/date-picker';
import { FieldError } from './components/ui/field';
import { IconButton } from './components/ui/icon-button';
import { Label } from './components/ui/label';
import './recurrence-exceptions.css';

export function SkippedDates({
  dates,
  onRemove,
  disabled,
}: {
  dates?: string[];
  onRemove?: (date: string) => void;
  disabled?: boolean;
}) {
  if (!dates?.length) return null;
  return (
    <section aria-label="Skipped dates">
      <h3>Dates to skip</h3>
      <ul className="recurrence-skip-list">
        {dates.map((date) => (
          <li key={date}>
            <time dateTime={date}>{calendarLabel(date, true)}</time>
            {onRemove && (
              <IconButton
                label={`Remove skipped date ${date}`}
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
  candidate,
  dueDate,
  disabled,
  onCandidate,
  onChange,
}: {
  dates: string[];
  candidate: string;
  dueDate: string;
  disabled: boolean;
  onCandidate: (date: string) => void;
  onChange: (dates: string[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(dates.length > 0);
  const validDate = RecurrenceSchema.shape.dueDate.safeParse(candidate).success;
  const error =
    validDate && candidate <= dueDate
      ? 'Choose a skipped date after the first due date.'
      : validDate && dates.includes(candidate)
        ? 'This date is already in the list.'
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
        Skip dates{dates.length ? ` (${dates.length})` : ' (optional)'}
        {candidate && <span className="muted"> · Date not added</span>}
      </summary>
      <p className="muted">
        Add holidays or site closures. The batch still creates the chosen number of orders,
        extending the schedule when needed.
      </p>
      <Label htmlFor={id}>Date to skip</Label>
      <DatePicker
        id={id}
        value={candidate}
        onValueChange={onCandidate}
        calendarLabel="Choose a date to skip"
        disabled={disabled || dates.length >= 52}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          [candidate && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
        }
      />
      {candidate && (
        <p id={`${id}-hint`} className="muted">
          Add this date or clear it before assigning.
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      {dates.length >= 52 && (
        <p role="status">Up to 52 dates can be skipped. Remove one to add another.</p>
      )}
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
        <PlusIcon aria-hidden="true" /> Add date
      </Button>
      <SkippedDates
        dates={dates}
        disabled={disabled}
        onRemove={(date) => {
          onChange(dates.filter((item) => item !== date));
          focusDate();
        }}
      />
    </details>
  );
}
