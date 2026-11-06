/*! Composed from shadcn/ui Calendar and Radix Popover. MIT: /licenses/shadcn-ui-MIT.txt. */
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type RefObject,
} from 'react';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { id as indonesian } from 'react-day-picker/locale';
import type { Locale } from '@fieldwork/strings';
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
  inputRef?: RefObject<HTMLInputElement | null>;
  calendarLabel: string;
  locale?: Locale;
};

export function DatePicker({
  value,
  defaultValue = '',
  onValueChange,
  inputRef,
  calendarLabel,
  locale = 'en',
  disabled,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  ...props
}: DatePickerProps) {
  const invalidText =
    locale === 'id'
      ? 'Masukkan tanggal yang valid dengan format YYYY-MM-DD.'
      : 'Enter a real date as YYYY-MM-DD.';
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const selected = parseLocalDate(current);
  const invalid = Boolean(current && !selected);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected ?? new Date());
  const fallback = useRef<HTMLInputElement>(null);
  const input = inputRef ?? fallback;
  const help = useId();
  useLayoutEffect(() => {
    input.current?.setCustomValidity(invalid ? invalidText : '');
    // Form clears its previous error attributes on input; keep our own error associated.
    if (invalid) input.current?.setAttribute('aria-invalid', 'true');
  }, [current, input, invalid, invalidText]);

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
            collisionPadding={4}
            role="dialog"
            lang={locale}
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
              locale={locale === 'id' ? indonesian : undefined}
              labels={
                locale === 'id'
                  ? {
                      labelNext: () => 'Bulan berikutnya',
                      labelPrevious: () => 'Bulan sebelumnya',
                    }
                  : undefined
              }
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
                {locale === 'id' ? 'Hari ini' : 'Today'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!current}
                onClick={() => choose(undefined)}
              >
                {locale === 'id' ? 'Hapus tanggal' : 'Clear date'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {invalid && (
        <p className="ui-date-error error" id={help} role="alert">
          {invalidText}
        </p>
      )}
    </div>
  );
}
