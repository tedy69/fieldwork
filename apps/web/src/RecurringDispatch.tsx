import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { IconButton } from './components/ui/icon-button';
import { CalendarPlusIcon } from '@phosphor-icons/react/dist/csr/CalendarPlus';
import {
  CreateOrderSeriesSchema,
  recurrenceDates,
  recurrenceDatesThrough,
  type Catalog,
  type CreateOrderSeries,
  type OrderSeriesReceipt,
  type Recurrence,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { pendingSeriesFor, PendingDispatchError } from './pending-series';
import { client, message } from './lib';
import { localDate } from './dates';
import { recurrenceLabels } from './recurrence-labels';
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
import { FieldError, FieldSet } from './components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from './components/ui/dialog';

function datesFor(
  dueDate: string,
  frequency: Recurrence['frequency'],
  occurrences: number,
  skipDates?: string[],
  through?: string,
) {
  try {
    const schedule = { dueDate, frequency, skipDates };
    return through === undefined
      ? recurrenceDates({ ...schedule, occurrences })
      : recurrenceDatesThrough(schedule, through);
  } catch {
    return [];
  }
}
function DatePreview({ dates, byDate = false }: { dates: string[]; byDate?: boolean }) {
  return (
    <section className="recurrence-preview" aria-label="Scheduled dates">
      <h3 aria-live="polite">
        {dates.length ? `${dates.length} scheduled dates` : 'Choose a valid schedule'}
      </h3>
      {dates.length ? (
        <ol tabIndex={0} aria-label="All scheduled dates">
          {dates.map((date) => (
            <li key={date}>
              <time dateTime={date}>
                {new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
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
        <p className="muted">
          {byDate
            ? 'Choose an end date that gives 2–52 work orders.'
            : 'Choose a first date and 2–52 occurrences within a four-digit year.'}
        </p>
      )}
    </section>
  );
}

export default function RecurringDispatch({
  userId,
  catalog,
  online,
  initialDueDate,
  onCreated,
}: {
  userId: string;
  catalog: Catalog;
  online: boolean;
  initialDueDate?: string;
  onCreated: (receipt: OrderSeriesReceipt) => Promise<void>;
}) {
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
    <div className="recurring-dispatch">
      <IconButton
        label={
          loading
            ? 'Checking saved dispatch…'
            : pending
              ? 'Recover recurring batch'
              : 'Assign recurring work'
        }
        showLabel={Boolean(pending)}
        className="quiet"
        disabled={loading || (!pending && (!online || !hasCatalog)) || Boolean(loadError)}
        onClick={() => setOpen(true)}
      >
        <CalendarPlusIcon aria-hidden="true" />
      </IconButton>
      {loadError && (
        <Alert className="error">
          <p>{loadError}</p>
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
            Reload saved dispatch
          </Button>
        </Alert>
      )}
      {open && (
        <RecurringDialog
          userId={userId}
          catalog={catalog}
          online={online}
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
  initialDueDate?: string;
  pending: CreateOrderSeries | null;
  onClose: () => void;
  onReserve: (input: CreateOrderSeries) => Promise<void>;
  onClear: (mutationId: string) => Promise<void>;
  onCreated: (receipt: OrderSeriesReceipt) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editable, setEditable] = useState(false);
  const [dueDate, setDueDate] = useState(pending?.dueDate ?? initialDueDate ?? localDate());
  const [siteId, setSiteId] = useState(pending?.siteId ?? catalog.sites[0]?.id ?? '');
  const siteClosures = catalog.sites.find((site) => site.id === siteId)?.closureDates;
  const [frequency, setFrequency] = useState<Recurrence['frequency']>(
    pending?.frequency ?? 'weekly',
  );
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
  const activeDates = pending
    ? datesFor(pending.dueDate, pending.frequency, pending.occurrences, pending.skipDates)
    : datesFor(
        dueDate,
        frequency,
        occurrences,
        skipDates,
        endMode === 'date' ? endDate : undefined,
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
      setError(message(error));
      setEditable(
        error instanceof ApiError &&
          error.status === 422 &&
          ['VALIDATION', 'INVALID_ASSIGNMENT'].includes(error.code),
      );
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (skipDate) {
      setError('Add the skipped date or clear it before assigning.');
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
    });
    if (!parsed.success) {
      setError('Check the assignment fields and choose 2–52 valid dates.');
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
              Assign recurring work
            </DialogTitle>
            <DialogDescription>
              Preview a repeat schedule. Each date becomes an independent work order.
            </DialogDescription>
          </div>
          <Button className="quiet" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogHeader>
        {(pending?.frequency ?? frequency) === 'monthly' && (
          <p className="muted">
            Repeats on the original day of the month. Shorter months use their last day.
          </p>
        )}
        {(pending?.frequency ?? frequency) === 'month-end' && (
          <p className="muted">Choose the last day of a month for the first visit.</p>
        )}
        {(pending?.frequency ?? frequency) === 'month-end-weekday' && (
          <p className="muted">Choose the last Monday through Friday of a month to start.</p>
        )}
        {(pending?.frequency ?? frequency) === 'quarterly' && (
          <p className="muted">
            Repeats every three months on the original day. Shorter months use their last day.
          </p>
        )}
        {pending ? (
          <>
            <Alert className="recurrence-recovery">
              <strong>Saved batch awaiting confirmation</strong>
              <p>
                This batch may already exist. Retry its saved request to confirm without creating
                duplicates. Closing keeps it on this device.
              </p>
            </Alert>
            <h3>{pending.title}</h3>
            <p className="muted">
              {recurrenceLabels[pending.frequency]} · {pending.occurrences} work orders
            </p>
            <DatePreview dates={activeDates} />
            <SkippedDates dates={pending.skipDates} />
            {error && <FieldError>{error}</FieldError>}
            {!online && (
              <Alert className="notice">
                Reconnect to confirm this batch. Its saved request is kept.
              </Alert>
            )}
            <Button
              ref={retry}
              className="primary full"
              disabled={busy || !online}
              onClick={() => void send(pending, false)}
            >
              {busy ? 'Confirming batch…' : 'Retry saved batch'}
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
                    setError(message(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Edit declined batch
              </Button>
            )}
          </>
        ) : (
          <Form noValidate onSubmit={submit}>
            <FieldSet disabled={busy}>
              <AssignmentFields
                catalog={catalog}
                initial={draft.current ?? { dueDate }}
                onDateChange={setDueDate}
                onSiteChange={setSiteId}
              />
              <div className="form-grid recurring-schedule-fields">
                <Label>
                  Repeat
                  <Select
                    aria-label="Repeat"
                    value={frequency}
                    onChange={(event) =>
                      setFrequency(event.target.value as Recurrence['frequency'])
                    }
                  >
                    <Option value="daily">Daily</Option>
                    <Option value="weekly">Weekly</Option>
                    <Option value="biweekly">{recurrenceLabels.biweekly}</Option>
                    <Option value="weekdays">Weekdays (Mon–Fri)</Option>
                    <Option value="monthly">{recurrenceLabels.monthly}</Option>
                    <Option value="month-end">{recurrenceLabels['month-end']}</Option>
                    <Option value="month-end-weekday">
                      {recurrenceLabels['month-end-weekday']}
                    </Option>
                    <Option value="quarterly">{recurrenceLabels.quarterly}</Option>
                  </Select>
                </Label>
                <Label>
                  Ends
                  <Select
                    value={endMode}
                    onChange={(event) =>
                      setEndMode(event.target.value === 'date' ? 'date' : 'count')
                    }
                  >
                    <Option value="count">After a count</Option>
                    <Option value="date">On a date</Option>
                  </Select>
                </Label>
                {endMode === 'date' ? (
                  <Label>
                    End date
                    <DatePicker
                      calendarLabel="Choose end date"
                      value={endDate}
                      onValueChange={setEndDate}
                      required
                    />
                  </Label>
                ) : (
                  <Label>
                    Occurrences
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
              <RecurrenceExceptions
                dates={skipDates}
                candidate={skipDate}
                dueDate={dueDate}
                closureDates={siteClosures}
                byDate={endMode === 'date'}
                disabled={busy}
                onCandidate={setSkipDate}
                onChange={setSkipDates}
              />
            </FieldSet>
            {frequency === 'weekdays' && (
              <p className="muted">
                Choose a Monday–Friday first date. Holidays stay scheduled unless you add them to
                Skip dates.
              </p>
            )}
            <DatePreview dates={activeDates} byDate={endMode === 'date'} />
            {skipDates.some((date) => date <= dueDate) && (
              <FieldError>
                Skipped dates must be after the first due date. Remove them or change the first
                date.
              </FieldError>
            )}
            <p className="muted">
              The due date is the first occurrence. All orders are assigned now.
            </p>
            {error && <FieldError>{error}</FieldError>}
            {!online && <Alert className="notice">Reconnect before assigning this batch.</Alert>}
            <Button
              className="primary full"
              disabled={busy || !online || activeDates.length === 0 || Boolean(skipDate)}
            >
              {busy ? 'Saving batch…' : `Assign ${activeDates.length || ''} work orders`}
            </Button>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
