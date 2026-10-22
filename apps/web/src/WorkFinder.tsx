import { Button } from './components/ui/button';
import CommandButton from './components/kokonutui/command-button';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { User, WorkOrder } from '@fieldwork/contracts';
import ActionSearchBar, { type CommandItem } from './components/kokonutui/action-search-bar';
import './kokonut.css';

export default function WorkFinder({
  user,
  orders,
  onNavigate,
  onOrder,
}: {
  user: User;
  orders: WorkOrder[];
  onNavigate: (view: 'orders' | 'outbox' | 'resources') => void;
  onOrder: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const navigated = useRef(false);
  const items = useMemo<CommandItem[]>(
    () => [
      { id: 'orders', label: 'Work orders', group: 'Workspace', keywords: ['assignments', 'list'] },
      { id: 'outbox', label: 'Sync outbox', group: 'Workspace', keywords: ['queued', 'reports'] },
      ...(user.role === 'manager'
        ? [
            {
              id: 'resources',
              label: 'Sites & checklists',
              group: 'Workspace',
              keywords: ['catalog', 'templates'],
            },
          ]
        : []),
      ...orders.map((order) => ({
        id: `order:${order.id}`,
        label: `${order.reference} ${order.title} · ${order.site.name}`,
        group: 'Saved work',
        keywords: [order.assignee.name],
      })),
    ],
    [user.role, orders],
  );

  function show() {
    if (document.querySelector('dialog:modal')) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    navigated.current = false;
    setOpen(true);
  }
  function close() {
    setOpen(false);
    dialog.current?.close();
    const target = navigated.current ? document.getElementById('main') : previousFocus.current;
    target?.focus();
  }
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector('input')?.focus();
    }
  }, [open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      const modal = document.querySelector('dialog:modal');
      if (modal && modal !== dialog.current) return;
      event.preventDefault();
      if (open) close();
      else show();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  function select(item: CommandItem) {
    navigated.current = true;
    if (item.id.startsWith('order:')) onOrder(item.id.slice(6));
    else if (item.id === 'orders' || item.id === 'outbox' || item.id === 'resources')
      onNavigate(item.id);
  }

  return (
    <>
      <CommandButton
        className="quiet command-launcher"
        shortcut="mod+k"
        onClick={show}
        aria-keyshortcuts="Meta+K Control+K"
        title="Find work (Cmd+K or Ctrl+K)"
      >
        Find work
      </CommandButton>
      <dialog
        ref={dialog}
        className="command-dialog"
        aria-modal="true"
        aria-labelledby="finder-heading"
        aria-describedby="finder-description"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          // An earlier close event can arrive after the dialog has reopened.
          if (!dialog.current?.open) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])',
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {open && (
          <>
            <div className="command-dialog-heading">
              <h2 id="finder-heading">Find saved work</h2>
              <Button className="quiet" onClick={close}>
                Close finder
              </Button>
            </div>
            <p id="finder-description" className="muted">
              Search saved references, titles, sites, or people. Open with Cmd+K or Ctrl+K.
            </p>
            <ActionSearchBar
              items={items}
              onSelect={select}
              onOpenChange={(next) => {
                if (!next) close();
              }}
              defaultOpen
              closeOnBlur={false}
              label="Search saved work and pages"
              placeholder="Reference, title, site, or person"
              className="kokonut-search dark"
            />
          </>
        )}
      </dialog>
    </>
  );
}
