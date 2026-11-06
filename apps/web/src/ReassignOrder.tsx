import { useRef, useState, type FormEvent } from 'react';
import type { User, WorkOrder } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { UserSwitchIcon } from '@phosphor-icons/react/dist/csr/UserSwitch';
import { Form } from './components/ui/form';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import { Label } from './components/ui/label';
import { FieldError } from './components/ui/field';
import { client, message } from './lib';
import { managerReviewCopy } from './manager-review-copy';
import type { LocalizedNotice } from './useLocalizedNotice';
import './reschedule.css';

export default function ReassignOrder({
  order,
  workers,
  online,
  locale,
  onSaved,
  onNotice,
}: {
  order: WorkOrder;
  workers: User[];
  online: boolean;
  locale: Locale;
  onSaved: (order: WorkOrder) => Promise<void>;
  onNotice: (notice: LocalizedNotice) => void;
}) {
  const copy = managerReviewCopy[locale].handover;
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
      const {
        reference,
        assignee: { name },
      } = updated;
      onNotice((language) => managerReviewCopy[language].handover.saved(reference, name));
      setEditing(false);
      document.getElementById('main')?.focus();
    } catch (error) {
      setError(`${locale === 'en' ? message(error) : copy.failed} ${copy.reloadHint}`);
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
      const {
        reference,
        assignee: { name },
      } = updated;
      onNotice((language) => managerReviewCopy[language].handover.reloaded(reference, name));
      setNeedsReload(false);
      document.getElementById('main')?.focus();
    } catch (error) {
      setError(locale === 'en' ? message(error) : copy.reloadFailed);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="schedule" aria-label={copy.region}>
      <IconButton
        label={copy.change}
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls="assignee-form"
        disabled={!online || Boolean(busy) || !hasReplacement}
        onClick={() => (editing ? cancel() : setEditing(true))}
      >
        <UserSwitchIcon aria-hidden="true" />
      </IconButton>
      {!online ? (
        <p className="muted">{copy.connect}</p>
      ) : !hasReplacement ? (
        <p className="muted">{copy.noReplacement}</p>
      ) : null}
      {editing && (
        <Form
          noValidate
          id="assignee-form"
          aria-label={copy.change}
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <p className="muted" id="assignee-handover">
            {copy.intro(order.assignee.name)}
          </p>
          <Label>
            {copy.newWorker}
            <Select
              autoFocus
              required
              aria-label={copy.newWorker}
              aria-describedby="assignee-handover"
              value={assigneeId}
              disabled={Boolean(busy)}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              {!choices.some((worker) => worker.id === order.assignee.id) && (
                <Option value={order.assignee.id}>
                  {order.assignee.name} ({copy.current})
                </Option>
              )}
              {choices.map((worker) => (
                <Option value={worker.id} key={worker.id}>
                  {worker.name}
                  {worker.id === order.assignee.id ? ` (${copy.current})` : ''}
                </Option>
              ))}
            </Select>
          </Label>
          {error && <FieldError>{error}</FieldError>}
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
              {busy === 'saving' ? copy.saving : copy.save}
            </Button>
            <Button type="button" className="quiet" disabled={Boolean(busy)} onClick={cancel}>
              {copy.cancel}
            </Button>
            {needsReload && (
              <Button
                type="button"
                className="quiet"
                disabled={!online || Boolean(busy)}
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
