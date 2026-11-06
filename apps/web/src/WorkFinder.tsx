import { Button } from './components/ui/button';
import { ActionTooltip } from './components/ui/icon-button';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText';
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
import { notebookCopy, type Locale } from '@fieldwork/strings';
import ActionSearchBar, { type CommandItem } from './components/kokonutui/action-search-bar';
import { workerWorkspaceCopy } from './worker-workspace-copy';
import { managerDispatchCopy } from './manager-dispatch-copy';
import { workerFinderCopy } from './worker-finder-copy';
import './kokonut.css';

export default function WorkFinder({
  user,
  orders,
  locale = 'en',
  onNavigate,
  onOrder,
}: {
  user: User;
  orders: WorkOrder[];
  locale?: Locale;
  onNavigate: (view: 'orders' | 'outbox' | 'resources') => void;
  onOrder: (id: string, origin: HTMLElement | null) => void;
}) {
  const copy = workerFinderCopy[locale];
  const workspace = workerWorkspaceCopy[locale];
  const notebook = notebookCopy[locale];
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const navigated = useRef(false);
  const items = useMemo<CommandItem[]>(
    () => [
      {
        id: 'orders',
        label: workspace.orders,
        group: workspace.workspace,
        icon: <ClipboardTextIcon />,
        keywords:
          locale === 'id' ? ['daftar tugas', 'assignments', 'list'] : ['assignments', 'list'],
      },
      {
        id: 'outbox',
        label: notebook.outbox,
        group: workspace.workspace,
        icon: <TrayIcon />,
        keywords: locale === 'id' ? ['laporan', 'queued', 'reports'] : ['queued', 'reports'],
      },
      ...(user.role === 'manager'
        ? [
            {
              id: 'resources',
              label: managerDispatchCopy[locale].resources,
              group: workspace.workspace,
              icon: <BuildingsIcon />,
              keywords: locale === 'id' ? ['katalog', 'templat'] : ['catalog', 'templates'],
            },
          ]
        : []),
      ...orders.map((order) => ({
        id: `order:${order.id}`,
        label: `${order.reference} ${order.title} · ${order.site.name}`,
        group: copy.saved,
        icon: <FileTextIcon />,
        keywords: [order.assignee.name],
      })),
    ],
    [user.role, orders, locale, copy.saved, workspace, notebook.outbox],
  );

  function show(trigger?: HTMLButtonElement) {
    if (document.querySelector('dialog:modal, [data-slot="dialog-content"][data-state="open"]'))
      return;
    previousFocus.current =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
    if (item.id.startsWith('order:')) onOrder(item.id.slice(6), previousFocus.current);
    else if (item.id === 'orders' || item.id === 'outbox' || item.id === 'resources')
      onNavigate(item.id);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ActionTooltip label={copy.shortcut}>
        <CommandButton
          className="quiet command-launcher ui-icon-button"
          compact
          aria-label={copy.open}
          lang={locale}
          shortcut="mod+k"
          onClick={(event) => show(event.currentTarget)}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <MagnifyingGlassIcon aria-hidden="true" />
        </CommandButton>
      </ActionTooltip>
      <DialogContent
        size="finder"
        aria-modal="true"
        lang={locale}
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
            ? (document.getElementById('inspection-title') ?? document.getElementById('main'))
            : previousFocus.current;
          target?.focus();
        }}
      >
        {open && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>{copy.heading}</DialogTitle>
                <DialogDescription>{copy.intro}</DialogDescription>
              </div>
              <Button className="quiet" onClick={close}>
                {copy.close}
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
              label={copy.search}
              placeholder={copy.placeholder}
              locale={locale}
              className="kokonut-search dark"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
