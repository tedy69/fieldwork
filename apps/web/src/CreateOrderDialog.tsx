import { Button } from './components/ui/button';
import { Input, Textarea, Select } from './components/ui/input';
import { useEffect, useState, type FormEvent } from 'react';
import type { Catalog, WorkOrder } from '@fieldwork/contracts';
import { client, message } from './lib';
import { localDate } from './dates';
export default function CreateOrder({
  catalog,
  initialDueDate,
  onClose,
  onCreated,
}: {
  catalog: Catalog;
  initialDueDate?: string;
  onClose: () => void;
  onCreated: (order: WorkOrder) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [busy, onClose]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const order = await client.createOrder({
        title: String(data.get('title')),
        instructions: String(data.get('instructions')),
        siteId: String(data.get('siteId')),
        assigneeId: String(data.get('assigneeId')),
        templateId: String(data.get('templateId')),
        dueDate: String(data.get('dueDate')),
        priority: data.get('priority') as 'routine' | 'urgent',
      });
      await onCreated(order);
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  }
  return (
    <dialog
      open
      className="dialog"
      aria-labelledby="create-title"
      ref={(dialog) => {
        if (dialog && !dialog.matches(':modal')) {
          dialog.close();
          dialog.showModal();
        }
      }}
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <span className="eyebrow">DISPATCH</span>
          <Button type="button" className="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
        <h2 id="create-title">Assign a work order</h2>
        <p className="muted">Give the field team a clear brief and a checklist.</p>
        <label>
          Work order title
          <Input
            name="title"
            autoFocus
            required
            minLength={3}
            maxLength={140}
            placeholder="e.g. Inspect the north access gate"
          />
        </label>
        <label>
          Site
          <Select name="siteId" aria-label="Site" required>
            {catalog.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="form-grid">
          <label>
            Assign to
            <Select name="assigneeId" aria-label="Assign to" required>
              {catalog.users
                .filter((user) => user.role === 'worker')
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            Due date
            <Input
              name="dueDate"
              type="date"
              required
              defaultValue={initialDueDate ?? localDate()}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Checklist
            <Select name="templateId" aria-label="Checklist" required>
              {catalog.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Priority
            <Select name="priority" aria-label="Priority">
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
            </Select>
          </label>
        </div>
        <label>
          Instructions
          <Textarea
            name="instructions"
            rows={3}
            maxLength={4000}
            placeholder="What should the worker check?"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Button className="primary full" disabled={busy}>
          {busy ? 'Assigning…' : 'Assign work order'}
        </Button>
      </form>
    </dialog>
  );
}
