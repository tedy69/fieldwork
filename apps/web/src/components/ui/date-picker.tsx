/*! Composed from shadcn/ui Calendar and Radix Popover. MIT: /licenses/shadcn-ui-MIT.txt. */
import { useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { Input } from './input';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverTrigger, PopoverContent } from './popover';
import { localDate, parseLocalDate } from '@/dates';
import './date-picker.css';

type DatePickerProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'ref'
> & {
  value?: string;
  defaultValue?: string;
  onValueChange: (value: string) => void;
  calendarLabel: string;
};

export function DatePicker({
  value,
  defaultValue = '',
  onValueChange,
  calendarLabel,
  disabled,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: DatePickerProps) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const selected = parseLocalDate(current);
  const invalid = Boolean(current && !selected);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected ?? new Date());
  const input = useRef<HTMLInputElement>(null);
  const help = useId();
  useLayoutEffect(() => {
    input.current?.setCustomValidity(invalid ? 'Enter a real date as YYYY-MM-DD.' : '');
    // Form clears its previous error attributes on input; keep our own error associated.
    if (invalid) input.current?.setAttribute('aria-invalid', 'true');
  }, [current, invalid]);

  function change(next: string) {
    setInternal(next);
    onValueChange(next);
    // Calendar actions also clear the shared form's validation summary.
    input.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function choose(date: Date | undefined) {
    change(date ? localDate(date) : '');
    setOpen(false);
  }
  return (
    <div data-slot="date-picker" className="ui-date-picker">
      <div className="ui-date-control">
        <Input
          {...props}
          ref={input}
          type="text"
          className={className}
          value={current}
          disabled={disabled}
          placeholder="YYYY-MM-DD"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || ariaInvalid || undefined}
          aria-describedby={[describedBy, invalid && help].filter(Boolean).join(' ') || undefined}
          onChange={(event) => change(event.target.value)}
        />
        <Popover
          open={open && !disabled}
          onOpenChange={(next) => {
            if (next) setMonth(parseLocalDate(current) ?? new Date());
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={calendarLabel}
              className="ui-date-trigger"
            >
              <CalendarBlankIcon aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="ui-date-popover"
            role="dialog"
            aria-label={calendarLabel}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              // Focus after Radix activates this scope, including inside a Dialog.
              (event.target as HTMLElement)
                .querySelector<HTMLButtonElement>('.ui-calendar-day[tabindex="0"]')
                ?.focus();
            }}
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            <Calendar
              mode="single"
              required
              selected={selected}
              onSelect={choose}
              month={month}
              onMonthChange={setMonth}
              autoFocus
              startMonth={parseLocalDate('0001-01-01')}
              endMonth={parseLocalDate('9999-12-31')}
              disabled={{
                before: parseLocalDate('0001-01-01')!,
                after: parseLocalDate('9999-12-31')!,
              }}
            />
            <div className="ui-date-actions">
              <Button type="button" variant="ghost" onClick={() => choose(new Date())}>
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!current}
                onClick={() => choose(undefined)}
              >
                Clear date
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {invalid && (
        <p className="ui-date-error error" id={help} role="alert">
          Enter a real date as YYYY-MM-DD.
        </p>
      )}
    </div>
  );
}
