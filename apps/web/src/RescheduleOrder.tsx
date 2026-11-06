import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { Form } from './components/ui/form';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import { FieldError } from './components/ui/field';
import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { languageTags, type Locale } from '@fieldwork/strings';
import { client, dateLabel, message } from './lib';
import { rescheduleCopy } from './reschedule-copy';
import './reschedule.css';

export default function RescheduleOrder({
  order,
  online,
  locale = 'en',
  onSaved,
  onNotice,
  batch,
}: {
  order: WorkOrder;
  online: boolean;
  locale?: Locale;
  onSaved: (order: WorkOrder) => Promise<void>;
  onNotice: (notice: string) => void;
  batch?: {
    locked: boolean;
    onBusyChange: (busy: boolean) => void;
    onRestoreFocus: () => void;
  };
}) {
  const copy = rescheduleCopy[locale];
  const dateLocale = languageTags[locale];
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [busy, setBusy] = useState<'saving' | 'reloading' | null>(null);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const formId = useId();
  const locked = Boolean(busy || batch?.locked);

  useLayoutEffect(() => {
    if (!batch || locked || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (trigger.current && !trigger.current.disabled) trigger.current.focus();
    else batch.onRestoreFocus();
  }, [batch, editing, locked]);

  function focusAfterUpdate() {
    if (!batch) {
      document.getElementById('main')?.focus();
      return;
    }
    restoreFocus.current = true;
  }

  function cancel() {
    setEditing(false);
    setDueDate(order.dueDate);
    if (!needsReload) setError('');
    if (trigger.current?.disabled) focusAfterUpdate();
    else trigger.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!online || locked || needsReload || !dueDate || dueDate === order.dueDate) return;
    setBusy('saving');
    batch?.onBusyChange(true);
    setError('');
    try {
      const updated = await client.rescheduleOrder(order.id, {
        baseVersion: order.version,
        dueDate,
      });
      await onSaved(updated);
      onNotice(copy.saved(order.reference, dateLabel(updated.dueDate, dateLocale)));
      setEditing(false);
      focusAfterUpdate();
    } catch (error) {
      setError(`${locale === 'en' ? message(error) : copy.saveFailed} ${copy.reloadHint}`);
      setNeedsReload(true);
    } finally {
      setBusy(null);
      batch?.onBusyChange(false);
    }
  }
  async function reload() {
    if (!online || locked) return;
    setBusy('reloading');
    batch?.onBusyChange(true);
    setError('');
    try {
      const updated = await client.order(order.id);
      await onSaved(updated);
      onNotice(copy.reloaded(order.reference, dateLabel(updated.dueDate, dateLocale)));
      setNeedsReload(false);
      focusAfterUpdate();
    } catch (error) {
      setError(locale === 'en' ? message(error) : copy.reloadFailed);
    } finally {
      setBusy(null);
      batch?.onBusyChange(false);
    }
  }
  return (
    <section className="schedule" aria-label={copy.schedule}>
      <IconButton
        label={batch ? copy.changeVisit(order.reference) : copy.change}
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls={editing ? formId : undefined}
        disabled={!online || locked}
        onClick={() => (editing ? cancel() : setEditing(true))}
      >
        <CalendarBlankIcon aria-hidden="true" />
      </IconButton>
      {!online && !batch && <p className="muted">{copy.connect}</p>}
      {editing && (
        <Form
          noValidate
          id={formId}
          aria-label={copy.change}
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !locked) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          {!batch && (
            <p className="muted">{copy.currentDue(dateLabel(order.dueDate, dateLocale))}</p>
          )}
          <Label>
            {copy.newDue}
            <DatePicker
              calendarLabel={copy.calendar}
              locale={locale}
              autoFocus
              required
              value={dueDate}
              disabled={locked}
              onValueChange={setDueDate}
            />
          </Label>
          {error && <FieldError>{error}</FieldError>}
          <div className="schedule-actions">
            <Button
              className="primary"
              disabled={!online || locked || needsReload || !dueDate || dueDate === order.dueDate}
            >
              {busy === 'saving' ? copy.saving : copy.save}
            </Button>
            <Button type="button" className="quiet" disabled={locked} onClick={cancel}>
              {copy.cancel}
            </Button>
            {needsReload && (
              <Button
                type="button"
                className="quiet"
                disabled={!online || locked}
                onClick={() => void reload()}
              >
                {busy === 'reloading' ? copy.reloading : copy.reload}
              </Button>
            )}
          </div>
        </Form>
      )}
    </section>
  );
}
