import { useEffect, useState, type FormEvent } from 'react';
import type { Catalog, WorkOrder } from '@fieldwork/contracts';
import { client, message } from './lib';
export default function CreateOrder({
  catalog,
  onClose,
  onCreated,
}: {
  catalog: Catalog;
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
          <button type="button" className="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
        <h2 id="create-title">Assign a work order</h2>
        <p className="muted">Give the field team a clear brief and a checklist.</p>
        <label>
          Work order title
          <input
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
          <select name="siteId" aria-label="Site" required>
            {catalog.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Assign to
            <select name="assigneeId" aria-label="Assign to" required>
              {catalog.users
                .filter((user) => user.role === 'worker')
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Due date
            <input
              name="dueDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Checklist
            <select name="templateId" aria-label="Checklist" required>
              {catalog.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" aria-label="Priority">
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>
        <label>
          Instructions
          <textarea
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
        <button className="primary full" disabled={busy}>
          {busy ? 'Assigning…' : 'Assign work order'}
        </button>
      </form>
    </dialog>
  );
}
