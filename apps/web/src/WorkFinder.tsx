import { Button } from './components/ui/button';
import CommandButton from './components/kokonutui/command-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
} from './components/ui/dialog';
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
  const dialog = useRef<HTMLDivElement>(null);
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
    if (document.querySelector('dialog:modal, [data-slot="dialog-content"][data-state="open"]'))
      return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    navigated.current = false;
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }
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
      const modal = document.querySelector(
        'dialog:modal, [data-slot="dialog-content"][data-state="open"]',
      );
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
    <Dialog open={open} onOpenChange={setOpen}>
      <CommandButton
        className="quiet command-launcher"
        shortcut="mod+k"
        onClick={show}
        aria-keyshortcuts="Meta+K Control+K"
        title="Find work (Cmd+K or Ctrl+K)"
      >
        Find work
      </CommandButton>
      <DialogContent
        size="finder"
        aria-modal="true"
        ref={dialog}
        className="command-dialog"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dialog.current?.querySelector('input')?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = navigated.current
            ? document.getElementById('main')
            : previousFocus.current;
          target?.focus();
        }}
      >
        {open && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>Find saved work</DialogTitle>
                <DialogDescription>
                  Search saved references, titles, sites, or people. Open with Cmd+K or Ctrl+K.
                </DialogDescription>
              </div>
              <Button className="quiet" onClick={close}>
                Close finder
              </Button>
            </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
