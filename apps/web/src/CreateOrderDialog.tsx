import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog';
import { Label } from './components/ui/label';
import { FieldError } from './components/ui/field';
import { useRef, useState, type FormEvent } from 'react';
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
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(document.activeElement);
  const created = useRef(false);
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
      created.current = true;
      await onCreated(order);
    } catch (error) {
      setError(message(error));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        aria-modal="true"
        ref={dialog}
        className="dialog"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialog.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target =
            !created.current &&
            previousFocus.current instanceof HTMLElement &&
            previousFocus.current.isConnected
              ? previousFocus.current
              : document.getElementById('main');
          target?.focus();
        }}
      >
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <span className="eyebrow">DISPATCH</span>
            <Button type="button" className="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
          <DialogTitle>Assign a work order</DialogTitle>
          <DialogDescription>Give the field team a clear brief and a checklist.</DialogDescription>
          <Label>
            Work order title
            <Input
              name="title"
              autoFocus
              required
              minLength={3}
              maxLength={140}
              placeholder="e.g. Inspect the north access gate"
            />
          </Label>
          <Label>
            Site
            <Select name="siteId" aria-label="Site" required>
              {catalog.sites.map((site) => (
                <Option key={site.id} value={site.id}>
                  {site.name}
                </Option>
              ))}
            </Select>
          </Label>
          <div className="form-grid">
            <Label>
              Assign to
              <Select name="assigneeId" aria-label="Assign to" required>
                {catalog.users
                  .filter((user) => user.role === 'worker')
                  .map((user) => (
                    <Option key={user.id} value={user.id}>
                      {user.name}
                    </Option>
                  ))}
              </Select>
            </Label>
            <Label>
              Due date
              <Input
                name="dueDate"
                type="date"
                required
                defaultValue={initialDueDate ?? localDate()}
              />
            </Label>
          </div>
          <div className="form-grid">
            <Label>
              Checklist
              <Select name="templateId" aria-label="Checklist" required>
                {catalog.templates.map((template) => (
                  <Option key={template.id} value={template.id}>
                    {template.name}
                  </Option>
                ))}
              </Select>
            </Label>
            <Label>
              Priority
              <Select name="priority" aria-label="Priority">
                <Option value="routine">Routine</Option>
                <Option value="urgent">Urgent</Option>
              </Select>
            </Label>
          </div>
          <Label>
            Instructions
            <Textarea
              name="instructions"
              rows={3}
              maxLength={4000}
              placeholder="What should the worker check?"
            />
          </Label>
          {error && <FieldError>{error}</FieldError>}
          <Button className="primary full" disabled={busy}>
            {busy ? 'Assigning…' : 'Assign work order'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
