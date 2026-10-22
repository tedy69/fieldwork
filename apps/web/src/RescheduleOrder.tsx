import { useRef, useState, type FormEvent } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { client, dateLabel, message } from './lib';
import './reschedule.css';

export default function RescheduleOrder({
  order,
  online,
  onSaved,
  onNotice,
}: {
  order: WorkOrder;
  online: boolean;
  onSaved: (order: WorkOrder) => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dueDate, setDueDate] = useState(order.dueDate);
  const [busy, setBusy] = useState<'saving' | 'reloading' | null>(null);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function cancel() {
    setEditing(false);
    setDueDate(order.dueDate);
    if (!needsReload) setError('');
    if (trigger.current?.disabled) document.getElementById('main')?.focus();
    else trigger.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!online || busy || needsReload || dueDate === order.dueDate) return;
    setBusy('saving');
    setError('');
    try {
      const updated = await client.rescheduleOrder(order.id, {
        baseVersion: order.version,
        dueDate,
      });
      await onSaved(updated);
      onNotice(`${order.reference} is now due ${dateLabel(updated.dueDate)}.`);
      setEditing(false);
      document.getElementById('main')?.focus();
    } catch (error) {
      setError(`${message(error)} Reload this order before trying again.`);
      setNeedsReload(true);
    } finally {
      setBusy(null);
    }
  }
  async function reload() {
    setBusy('reloading');
    setError('');
    try {
      const updated = await client.order(order.id);
      await onSaved(updated);
      onNotice(`${order.reference} reloaded. Current due date: ${dateLabel(updated.dueDate)}.`);
      setNeedsReload(false);
      document.getElementById('main')?.focus();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="schedule" aria-label="Assignment schedule">
      <button
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls="schedule-form"
        disabled={!online || Boolean(busy)}
        onClick={() => (editing ? cancel() : setEditing(true))}
      >
        Change due date
      </button>
      {!online && <p className="muted">Connect to change the due date.</p>}
      {editing && (
        <form
          id="schedule-form"
          aria-label="Change due date"
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <p className="muted">
            Current due date: {dateLabel(order.dueDate)}. Saved reports stay unchanged.
          </p>
          <label>
            New due date
            <input
              type="date"
              autoFocus
              required
              value={dueDate}
              disabled={Boolean(busy)}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="schedule-actions">
            <button
              className="primary"
              disabled={
                !online || Boolean(busy) || needsReload || !dueDate || dueDate === order.dueDate
              }
            >
              {busy === 'saving' ? 'Saving…' : 'Save due date'}
            </button>
            <button type="button" className="quiet" disabled={Boolean(busy)} onClick={cancel}>
              Cancel
            </button>
            {needsReload && (
              <button
                type="button"
                className="quiet"
                disabled={!online || Boolean(busy)}
                onClick={() => void reload()}
              >
                {busy === 'reloading' ? 'Reloading…' : 'Reload order'}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
