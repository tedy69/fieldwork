import { Button } from './components/ui/button';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import { FieldSet, FieldLegend, FieldError } from './components/ui/field';
import { parseLocalDate } from './dates';
import { useId, useRef } from 'react';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './components/ui/collapsible';
export default function DueDateRange({
  from,
  through,
  onFrom,
  onThrough,
  onClear,
  open,
  onOpenChange,
}: {
  from: string;
  through: string;
  onFrom: (value: string) => void;
  onThrough: (value: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invalid = Boolean(parseLocalDate(from) && parseLocalDate(through) && from > through);
  const summaryId = useId();
  const hasDates = Boolean(from || through);
  const invalidDate = Boolean(
    (from && !parseLocalDate(from)) || (through && !parseLocalDate(through)),
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = hasDates ? `${from || 'Any start'} to ${through || 'Any end'}` : 'Any due date';
  function clear() {
    onClear();
    trigger.current?.focus();
  }
  return (
    <Collapsible className="date-filter" open={open} onOpenChange={onOpenChange}>
      <div className="date-filter-heading">
        <CollapsibleTrigger
          ref={trigger}
          type="button"
          variant="ghost"
          aria-label="Date range"
          aria-describedby={summaryId}
          className="date-filter-trigger"
        >
          <CalendarBlankIcon aria-hidden="true" />
          Date range
          <CaretDownIcon aria-hidden="true" className="date-filter-caret" />
        </CollapsibleTrigger>
        <span id={summaryId} className="date-filter-summary">
          {summary}
        </span>
        {hasDates && !open && (
          <Button type="button" variant="ghost" onClick={clear}>
            Clear dates
          </Button>
        )}
      </div>
      {!open && (invalid || invalidDate) && (
        <FieldError>
          {invalid
            ? 'Due through must be on or after Due from.'
            : 'Enter a real date as YYYY-MM-DD.'}{' '}
          Open Date range to correct it, or clear the dates.
        </FieldError>
      )}
      <CollapsibleContent>
        <FieldSet className="due-range">
          <FieldLegend className="sr-only">Due dates</FieldLegend>
          <div className="due-range-fields">
            <Label>
              Due from
              <DatePicker
                calendarLabel="Choose due from"
                value={from}
                onValueChange={onFrom}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
              />
            </Label>
            <Label>
              Due through
              <DatePicker
                calendarLabel="Choose due through"
                value={through}
                onValueChange={onThrough}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
              />
            </Label>
            <Button className="quiet" onClick={clear} disabled={!from && !through}>
              Clear dates
            </Button>
          </div>
          {invalid ? (
            <FieldError id="due-range-error">
              Due through must be on or after Due from. Change a date or clear the range.
            </FieldError>
          ) : (
            <p id="due-range-help" className="muted">
              Includes both dates. Leave either end open.
            </p>
          )}
        </FieldSet>
      </CollapsibleContent>
    </Collapsible>
  );
}
