import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { Form } from './components/ui/form';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import { FieldError } from './components/ui/field';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { client, dateLabel, message } from './lib';
import './reschedule.css';

export default function RescheduleOrder({
  order,
  online,
  onSaved,
  onNotice,
  batch,
}: {
  order: WorkOrder;
  online: boolean;
  onSaved: (order: WorkOrder) => Promise<void>;
  onNotice: (notice: string) => void;
  batch?: {
    locked: boolean;
    onBusyChange: (busy: boolean) => void;
    onRestoreFocus: () => void;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [busy, setBusy] = useState<'saving' | 'reloading' | null>(null);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const locked = Boolean(busy || batch?.locked);

  function focusAfterUpdate() {
    if (!batch) {
      document.getElementById('main')?.focus();
      return;
    }
    requestAnimationFrame(() => {
      if (trigger.current && !trigger.current.disabled) trigger.current.focus();
      else batch.onRestoreFocus();
    });
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
      onNotice(`${order.reference} is now due ${dateLabel(updated.dueDate)}.`);
      setEditing(false);
      focusAfterUpdate();
    } catch (error) {
      setError(`${message(error)} Reload this order before trying again.`);
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
      onNotice(`${order.reference} reloaded. Current due date: ${dateLabel(updated.dueDate)}.`);
      setNeedsReload(false);
      focusAfterUpdate();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
      batch?.onBusyChange(false);
    }
  }
  return (
    <section className="schedule" aria-label="Assignment schedule">
      <IconButton
        label={batch ? `Change due date for ${order.reference}` : 'Change due date'}
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls={editing ? formId : undefined}
        disabled={!online || locked}
        onClick={() => (editing ? cancel() : setEditing(true))}
      >
        <CalendarBlankIcon aria-hidden="true" />
      </IconButton>
      {!online && !batch && <p className="muted">Connect to change the due date.</p>}
      {editing && (
        <Form
          noValidate
          id={formId}
          aria-label="Change due date"
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !locked) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          {!batch && (
            <p className="muted">
              Current due date: {dateLabel(order.dueDate)}. Saved reports stay unchanged.
            </p>
          )}
          <Label>
            New due date
            <DatePicker
              calendarLabel="Choose new due date"
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
              {busy === 'saving' ? 'Saving…' : 'Save due date'}
            </Button>
            <Button type="button" className="quiet" disabled={locked} onClick={cancel}>
              Cancel
            </Button>
            {needsReload && (
              <Button
                type="button"
                className="quiet"
                disabled={!online || locked}
                onClick={() => void reload()}
              >
                {busy === 'reloading' ? 'Reloading…' : 'Reload order'}
              </Button>
            )}
          </div>
        </Form>
      )}
    </section>
  );
}
