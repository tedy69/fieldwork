import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import { FieldSet, FieldLegend, FieldError } from './components/ui/field';
import { parseLocalDate } from './dates';
import { useId, useRef } from 'react';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './components/ui/collapsible';
import type { Locale } from '@fieldwork/strings';
import { workerWorkspaceCopy } from './worker-workspace-copy';
export default function DueDateRange({
  from,
  through,
  onFrom,
  onThrough,
  onClear,
  open,
  onOpenChange,
  locale = 'en',
}: {
  from: string;
  through: string;
  onFrom: (value: string) => void;
  onThrough: (value: string) => void;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale?: Locale;
}) {
  const copy = workerWorkspaceCopy[locale].dates;
  const invalid = Boolean(parseLocalDate(from) && parseLocalDate(through) && from > through);
  const summaryId = useId();
  const hasDates = Boolean(from || through);
  const invalidDate = Boolean(
    (from && !parseLocalDate(from)) || (through && !parseLocalDate(through)),
  );
  const trigger = useRef<HTMLButtonElement>(null);
  const summary = hasDates ? copy.summary(from, through) : copy.any;
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
          aria-label={copy.range}
          aria-describedby={summaryId}
          className="date-filter-trigger"
        >
          <CalendarBlankIcon aria-hidden="true" />
          {copy.range}
          <CaretDownIcon aria-hidden="true" className="date-filter-caret" />
        </CollapsibleTrigger>
        <div className="date-filter-value">
          <span id={summaryId} className="date-filter-summary">
            {summary}
          </span>
          {hasDates && !open && (
            <IconButton label={copy.clear} variant="ghost" onClick={clear}>
              <XIcon aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>
      {!open && (invalid || invalidDate) && (
        <FieldError>
          {invalid ? copy.invalidRange : copy.invalidDate} {copy.reopen}
        </FieldError>
      )}
      <CollapsibleContent>
        <FieldSet className="due-range">
          <FieldLegend className="sr-only">{copy.dates}</FieldLegend>
          <div className="due-range-fields">
            <Label>
              {copy.from}
              <DatePicker
                calendarLabel={copy.chooseFrom}
                locale={locale}
                value={from}
                onValueChange={onFrom}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
              />
            </Label>
            <Label>
              {copy.through}
              <DatePicker
                calendarLabel={copy.chooseThrough}
                locale={locale}
                value={through}
                onValueChange={onThrough}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'due-range-error' : 'due-range-help'}
              />
            </Label>
            <Button className="quiet" onClick={clear} disabled={!from && !through}>
              {copy.clear}
            </Button>
          </div>
          {invalid ? (
            <FieldError id="due-range-error">
              {copy.invalidRange} {copy.repair}
            </FieldError>
          ) : (
            <p id="due-range-help" className="muted">
              {copy.hint}
            </p>
          )}
        </FieldSet>
      </CollapsibleContent>
    </Collapsible>
  );
}
