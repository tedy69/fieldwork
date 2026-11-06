import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { IconButton } from './components/ui/icon-button';
import { CalendarPlusIcon } from '@phosphor-icons/react/dist/csr/CalendarPlus';
import {
  CreateOrderSeriesSchema,
  RecurrenceFrequencySchema,
  RepeatDaySchema,
  recurrenceDates,
  recurrenceDatesThrough,
  type Catalog,
  type CreateOrderSeries,
  type OrderSeriesReceipt,
  type Recurrence,
  type RepeatDay,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { languageTags, type Locale } from '@fieldwork/strings';
import { pendingSeriesFor, PendingDispatchError } from './pending-series';
import { client, message } from './lib';
import { localDate } from './dates';
import { frequencyLabels, recurrenceSummary, weekdayLabels } from './recurrence-labels';
import { recurringDispatchCopy } from './recurring-dispatch-copy';
import AssignmentFields from './AssignmentFields';
import RecurrenceExceptions, { SkippedDates } from './RecurrenceExceptions';
import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import { Input } from './components/ui/input';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import { Alert } from './components/ui/alert';
import { FieldError, FieldLegend, FieldSet } from './components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from './components/ui/dialog';

function datesFor(schedule: Recurrence, through?: string) {
  try {
    return through === undefined
      ? recurrenceDates(schedule)
      : recurrenceDatesThrough(schedule, through);
  } catch {
    return [];
  }
}
function DatePreview({
  dates,
  locale,
  byDate = false,
}: {
  dates: string[];
  locale: Locale;
  byDate?: boolean;
}) {
  const copy = recurringDispatchCopy[locale];
  return (
    <section className="recurrence-preview" aria-label={copy.scheduled}>
      <h3 aria-live="polite">
        {dates.length ? copy.scheduledCount(dates.length) : copy.validSchedule}
      </h3>
      {dates.length ? (
        <ol tabIndex={0} aria-label={copy.allScheduled}>
          {dates.map((date) => (
            <li key={date}>
              <time dateTime={date}>
                {new Date(`${date}T12:00:00Z`).toLocaleDateString(languageTags[locale], {
                  timeZone: 'UTC',
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{byDate ? copy.validEnd : copy.validCount}</p>
      )}
    </section>
  );
}

export default function RecurringDispatch({
  userId,
  catalog,
  online,
  locale,
  initialDueDate,
  onCreated,
}: {
  userId: string;
  catalog: Catalog;
  online: boolean;
  locale: Locale;
  initialDueDate?: string;
  onCreated: (receipt: OrderSeriesReceipt) => Promise<void>;
}) {
  const copy = recurringDispatchCopy[locale];
  const journal = useMemo(() => pendingSeriesFor(userId), [userId]);
  const [pending, setPending] = useState<CreateOrderSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const saved = await journal.read();
        if (active) {
          setPending(saved);
          setLoadError('');
        }
      } catch (error) {
        if (active) setLoadError(message(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const focused = () => {
      if (!openRef.current) void load();
    };
    window.addEventListener('focus', focused);
    return () => {
      active = false;
      window.removeEventListener('focus', focused);
    };
  }, [journal]);
  const hasCatalog =
    catalog.sites.length > 0 &&
    catalog.templates.length > 0 &&
    catalog.users.some((user) => user.role === 'worker');
  return (
    <div className="recurring-dispatch" lang={locale}>
      <IconButton
        label={loading ? copy.checking : pending ? copy.recover : copy.assign}
        showLabel={Boolean(pending)}
        className="quiet"
        disabled={loading || (!pending && (!online || !hasCatalog)) || Boolean(loadError)}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        <CalendarPlusIcon aria-hidden="true" />
      </IconButton>
      {loadError && (
        <Alert className="error">
          <p>{locale === 'en' ? loadError : copy.storeFailed}</p>
          <Button
            className="quiet"
            onClick={async () => {
              setLoading(true);
              try {
                setPending(await journal.read());
                setLoadError('');
              } catch (error) {
                setLoadError(message(error));
              } finally {
                setLoading(false);
              }
            }}
          >
            {copy.reloadSaved}
          </Button>
        </Alert>
      )}
      {open && (
        <RecurringDialog
          userId={userId}
          catalog={catalog}
          online={online}
          locale={locale}
          pending={pending}
          initialDueDate={initialDueDate}
          onClose={() => setOpen(false)}
          onReserve={async (input) => {
            try {
              await journal.reserve(input);
              setPending(input);
            } catch (error) {
              if (error instanceof PendingDispatchError) setPending(error.input);
              throw error;
            }
          }}
          onClear={async (mutationId) => {
            setPending(await journal.clear(mutationId));
          }}
          onCreated={async (receipt) => {
            setOpen(false);
            await onCreated(receipt);
          }}
        />
      )}
    </div>
  );
}

function RecurringDialog({
  userId,
  catalog,
  online,
  locale,
  initialDueDate,
  pending,
  onClose,
  onReserve,
  onClear,
  onCreated,
}: {
  userId: string;
  catalog: Catalog;
  online: boolean;
  locale: Locale;
  initialDueDate?: string;
  pending: CreateOrderSeries | null;
  onClose: () => void;
  onReserve: (input: CreateOrderSeries) => Promise<void>;
  onClear: (mutationId: string) => Promise<void>;
  onCreated: (receipt: OrderSeriesReceipt) => Promise<void>;
}) {
  const copy = recurringDispatchCopy[locale];
  const days = weekdayLabels[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editable, setEditable] = useState(false);
  const [dueDate, setDueDate] = useState(pending?.dueDate ?? initialDueDate ?? localDate());
  const [siteId, setSiteId] = useState(pending?.siteId ?? catalog.sites[0]?.id ?? '');
  const siteClosures = catalog.sites.find((site) => site.id === siteId)?.closureDates;
  const [frequency, setFrequency] = useState<Recurrence['frequency']>(
    pending?.frequency ?? 'weekly',
  );
  const [repeatDays, setRepeatDays] = useState<RepeatDay[]>(pending?.repeatDays ?? []);
  const [occurrences, setOccurrences] = useState(pending?.occurrences ?? 4);
  const [endMode, setEndMode] = useState<'count' | 'date'>('count');
  const [endDate, setEndDate] = useState('');
  const [skipDates, setSkipDates] = useState(pending?.skipDates ?? []);
  const [skipDate, setSkipDate] = useState('');
  const draft = useRef<CreateOrderSeries | null>(pending);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef(document.activeElement);
  const completed = useRef(false);
  useEffect(() => {
    if (error && pending && !busy) retry.current?.focus();
  }, [error, pending, busy]);
  const schedule = pending ?? {
    dueDate,
    frequency,
    occurrences,
    skipDates,
    repeatDays: frequency === 'selected-days' ? repeatDays : undefined,
  };
  const activeDates = datesFor(
    {
      dueDate: schedule.dueDate,
      frequency: schedule.frequency,
      occurrences: schedule.occurrences,
      skipDates: schedule.skipDates,
      repeatDays: schedule.repeatDays,
    },
    !pending && endMode === 'date' ? endDate : undefined,
  );
  async function send(input: CreateOrderSeries, reserve: boolean) {
    setBusy(true);
    setError('');
    setEditable(false);
    try {
      if (reserve) await onReserve(input);
      const receipt = await client.createOrderSeries({ ...input, expectedActorId: userId });
      await onClear(input.mutationId);
      completed.current = true;
      await onCreated(receipt);
    } catch (error) {
      const declined =
        error instanceof ApiError &&
        error.status === 422 &&
        ['VALIDATION', 'INVALID_ASSIGNMENT'].includes(error.code);
      setError(
        locale === 'en' && !(error instanceof TypeError)
          ? message(error)
          : declined
            ? copy.validation
            : copy.sendFailed,
      );
      setEditable(declined);
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (skipDate) {
      setError(copy.skipRequired);
      return;
    }
    const parsed = CreateOrderSeriesSchema.safeParse({
      mutationId: crypto.randomUUID(),
      title: String(data.get('title')),
      instructions: String(data.get('instructions')),
      siteId: String(data.get('siteId')),
      assigneeId: String(data.get('assigneeId')),
      templateId: String(data.get('templateId')),
      dueDate,
      priority: data.get('priority'),
      frequency,
      occurrences: activeDates.length,
      ...(skipDates.length ? { skipDates } : {}),
      ...(frequency === 'selected-days' ? { repeatDays } : {}),
    });
    if (!parsed.success) {
      setError(copy.validation);
      return;
    }
    draft.current = parsed.data;
    await send(parsed.data, true);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        lang={locale}
        ref={dialog}
        className="dialog recurring-dialog"
        aria-modal="true"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (pending) heading.current?.focus();
          else dialog.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            !completed.current &&
            previousFocus.current instanceof HTMLElement &&
            previousFocus.current.isConnected &&
            !previousFocus.current.matches(':disabled')
              ? previousFocus.current
              : document.getElementById('main');
          target?.focus();
        }}
      >
        <DialogHeader>
          <div>
            <DialogTitle ref={heading} tabIndex={-1}>
              {copy.assign}
            </DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </div>
          <Button className="quiet" onClick={onClose} disabled={busy}>
            {copy.close}
          </Button>
        </DialogHeader>
        {(pending?.frequency ?? frequency) === 'monthly' && <p className="muted">{copy.monthly}</p>}
        {(pending?.frequency ?? frequency) === 'month-end' && (
          <p className="muted">{copy.monthEnd}</p>
        )}
        {(pending?.frequency ?? frequency) === 'month-end-weekday' && (
          <p className="muted">{copy.monthEndWeekday}</p>
        )}
        {(pending?.frequency ?? frequency) === 'quarterly' && (
          <p className="muted">{copy.quarterly}</p>
        )}
        {pending ? (
          <>
            <Alert className="recurrence-recovery">
              <strong>{copy.awaiting}</strong>
              <p>{copy.recoveryHint}</p>
            </Alert>
            <h3>{pending.title}</h3>
            <p className="muted">
              {recurrenceSummary(pending, locale)} · {copy.orders(pending.occurrences)}
            </p>
            <DatePreview dates={activeDates} locale={locale} />
            <SkippedDates dates={pending.skipDates} locale={locale} />
            {error && <FieldError>{error}</FieldError>}
            {!online && <Alert className="notice">{copy.reconnectConfirm}</Alert>}
            <Button
              ref={retry}
              className="primary full"
              disabled={busy || !online}
              onClick={() => void send(pending, false)}
            >
              {busy ? copy.confirming : copy.retry}
            </Button>
            {editable && (
              <Button
                className="quiet full"
                disabled={busy || !online}
                onClick={async () => {
                  setBusy(true);
                  try {
                    draft.current = pending;
                    setDueDate(pending.dueDate);
                    setSiteId(pending.siteId);
                    setFrequency(pending.frequency);
                    setRepeatDays(pending.repeatDays ?? []);
                    setOccurrences(pending.occurrences);
                    setEndMode('count');
                    setSkipDates(pending.skipDates ?? []);
                    setSkipDate('');
                    await onClear(pending.mutationId);
                    setError('');
                    setEditable(false);
                    requestAnimationFrame(() =>
                      dialog.current
                        ?.querySelector<HTMLInputElement>('input[name="title"]')
                        ?.focus(),
                    );
                  } catch (error) {
                    setError(locale === 'en' ? message(error) : copy.storeFailed);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {copy.editDeclined}
              </Button>
            )}
          </>
        ) : (
          <Form noValidate onSubmit={submit}>
            <FieldSet disabled={busy}>
              <AssignmentFields
                catalog={catalog}
                locale={locale}
                initial={draft.current ?? { dueDate }}
                onDateChange={setDueDate}
                onSiteChange={setSiteId}
              />
              <div className="form-grid recurring-schedule-fields">
                <Label>
                  {copy.repeat}
                  <Select
                    aria-label={copy.repeat}
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as Recurrence['frequency'])
                    }
                  >
                    {RecurrenceFrequencySchema.options.map((option) => (
                      <Option key={option} value={option}>
                        {frequencyLabels[locale][option]}
                      </Option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  {copy.ends}
                  <Select
                    value={endMode}
                    onChange={(event) =>
                      setEndMode(event.target.value === 'date' ? 'date' : 'count')
                    }
                  >
                    <Option value="count">{copy.afterCount}</Option>
                    <Option value="date">{copy.onDate}</Option>
                  </Select>
                </Label>
                {endMode === 'date' ? (
                  <Label>
                    {copy.endDate}
                    <DatePicker
                      calendarLabel={copy.chooseEndDate}
                      locale={locale}
                      value={endDate}
                      onValueChange={setEndDate}
                      required
                    />
                  </Label>
                ) : (
                  <Label>
                    {copy.occurrences}
                    <Input
                      type="number"
                      required
                      min={2}
                      max={52}
                      step={1}
                      value={Number.isNaN(occurrences) ? '' : occurrences}
                      onChange={(event) => setOccurrences(event.target.valueAsNumber)}
                    />
                  </Label>
                )}
              </div>
              {frequency === 'selected-days' && (
                <FieldSet>
                  <FieldLegend>{copy.days}</FieldLegend>
                  <div className="repeat-day-options">
                    {RepeatDaySchema.options.map((day) => (
                      <Button
                        key={day}
                        type="button"
                        variant="outline"
                        aria-label={days[day]}
                        aria-pressed={repeatDays.includes(day)}
                        onClick={() =>
                          setRepeatDays((days) =>
                            days.includes(day)
                              ? days.filter((entry) => entry !== day)
                              : [...days, day],
                          )
                        }
                      >
                        {days[day].slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                  <p className="muted">{copy.dayHint}</p>
                </FieldSet>
              )}
              <RecurrenceExceptions
                dates={skipDates}
                locale={locale}
                candidate={skipDate}
                dueDate={dueDate}
                closureDates={siteClosures}
                byDate={endMode === 'date'}
                disabled={busy}
                onCandidate={setSkipDate}
                onChange={setSkipDates}
              />
            </FieldSet>
            {frequency === 'weekdays' && <p className="muted">{copy.weekdays}</p>}
            {frequency === 'weekends' && <p className="muted">{copy.weekends}</p>}
            <DatePreview dates={activeDates} locale={locale} byDate={endMode === 'date'} />
            {skipDates.some((date) => date <= dueDate) && (
              <FieldError>{copy.exceptions.beforeStart}</FieldError>
            )}
            <p className="muted">{copy.timing}</p>
            {error && <FieldError>{error}</FieldError>}
            {!online && <Alert className="notice">{copy.reconnectAssign}</Alert>}
            <Button
              className="primary full"
              disabled={busy || !online || activeDates.length === 0 || Boolean(skipDate)}
            >
              {busy ? copy.saving : copy.assignOrders(activeDates.length)}
            </Button>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
