import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
} from './components/ui/dialog';
import { FieldError } from './components/ui/field';
import { useRef, useState, type FormEvent } from 'react';
import type { Catalog, WorkOrder } from '@fieldwork/contracts';
import { client, message } from './lib';
import AssignmentFields from './AssignmentFields';
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
        <Form noValidate onSubmit={submit}>
          <DialogHeader>
            <div>
              <DialogTitle>Assign a work order</DialogTitle>
              <DialogDescription>
                Give the field team a clear brief and a checklist.
              </DialogDescription>
            </div>
            <Button type="button" className="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </DialogHeader>
          <AssignmentFields catalog={catalog} initial={{ dueDate: initialDueDate }} />
          {error && <FieldError>{error}</FieldError>}
          <Button className="primary full" disabled={busy}>
            {busy ? 'Assigning…' : 'Assign work order'}
          </Button>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
