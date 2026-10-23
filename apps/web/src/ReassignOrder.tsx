import { useRef, useState, type FormEvent } from 'react';
import type { User, WorkOrder } from '@fieldwork/contracts';
import { Button } from './components/ui/button';
import { Select } from './components/ui/input';
import { client, message } from './lib';
import './reschedule.css';

export default function ReassignOrder({
  order,
  workers,
  online,
  onSaved,
  onNotice,
}: {
  order: WorkOrder;
  workers: User[];
  online: boolean;
  onSaved: (order: WorkOrder) => Promise<void>;
  onNotice: (notice: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [assigneeId, setAssigneeId] = useState(order.assignee.id);
  const [busy, setBusy] = useState<'saving' | 'reloading' | null>(null);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const choices = workers.filter((worker) => worker.role === 'worker');
  const hasReplacement = choices.some((worker) => worker.id !== order.assignee.id);

  function cancel() {
    setEditing(false);
    setAssigneeId(order.assignee.id);
    if (!needsReload) setError('');
    if (trigger.current?.disabled) document.getElementById('main')?.focus();
    else trigger.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!online || busy || needsReload || !assigneeId || assigneeId === order.assignee.id) return;
    setBusy('saving');
    setError('');
    try {
      const updated = await client.reassignOrder(order.id, {
        baseVersion: order.version,
        assigneeId,
      });
      await onSaved(updated);
      onNotice(`${order.reference} is now assigned to ${updated.assignee.name}.`);
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
      onNotice(`${order.reference} reloaded. Current worker: ${updated.assignee.name}.`);
      setNeedsReload(false);
      document.getElementById('main')?.focus();
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="schedule" aria-label="Assignment worker">
      <Button
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls="assignee-form"
        disabled={!online || Boolean(busy) || !hasReplacement}
        onClick={() => (editing ? cancel() : setEditing(true))}
      >
        Change worker
      </Button>
      {!online ? (
        <p className="muted">Connect to change the worker.</p>
      ) : !hasReplacement ? (
        <p className="muted">
          Sync the workspace to load workers. Another field worker is required.
        </p>
      ) : null}
      {editing && (
        <form
          id="assignee-form"
          aria-label="Change worker"
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <p className="muted" id="assignee-handover">
            Current worker: {order.assignee.name}. Saved reports and review notes stay with this
            order. Unsent drafts stay on the original worker's device. Coordinate the handover
            before saving.
          </p>
          <label>
            New field worker
            <Select
              autoFocus
              required
              aria-label="New field worker"
              aria-describedby="assignee-handover"
              value={assigneeId}
              disabled={Boolean(busy)}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              {!choices.some((worker) => worker.id === order.assignee.id) && (
                <option value={order.assignee.id}>{order.assignee.name} (current)</option>
              )}
              {choices.map((worker) => (
                <option value={worker.id} key={worker.id}>
                  {worker.name}
                  {worker.id === order.assignee.id ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="schedule-actions">
            <Button
              className="primary"
              disabled={
                !online ||
                Boolean(busy) ||
                needsReload ||
                !assigneeId ||
                assigneeId === order.assignee.id
              }
            >
              {busy === 'saving' ? 'Saving…' : 'Save worker'}
            </Button>
            <Button type="button" className="quiet" disabled={Boolean(busy)} onClick={cancel}>
              Cancel
            </Button>
            {needsReload && (
              <Button
                type="button"
                className="quiet"
                disabled={!online || Boolean(busy)}
                onClick={() => void reload()}
              >
                {busy === 'reloading' ? 'Reloading…' : 'Reload order'}
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
