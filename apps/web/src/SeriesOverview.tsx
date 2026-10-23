import { useEffect, useRef, useState } from 'react';
import type { OrderSeriesDetail, WorkOrder } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, labels, message } from './lib';
import { calendarLabel } from './calendar';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Empty } from './components';
import './series-overview.css';

type Page = Awaited<ReturnType<typeof client.orderSeries>>;
export default function SeriesOverview({
  online,
  onCache,
  onOpened,
}: {
  online: boolean;
  onCache: (order: WorkOrder) => Promise<void>;
  onOpened: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [detail, setDetail] = useState<OrderSeriesDetail | null>(null);
  const [selected, setSelected] = useState('');
  const [listBusy, setListBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [openError, setOpenError] = useState('');
  const [opening, setOpening] = useState('');
  const [invalidCursor, setInvalidCursor] = useState(false);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const navigationGeneration = useRef(0);
  const attemptedCursor = useRef<string | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  function changeOpen(next: boolean) {
    listGeneration.current++;
    detailGeneration.current++;
    navigationGeneration.current++;
    if (next) navigated.current = false;
    setOpen(next);
  }
  async function loadList(cursor?: string) {
    const current = ++listGeneration.current;
    attemptedCursor.current = cursor;
    setListBusy(true);
    setListError('');
    setInvalidCursor(false);
    if (!cursor) {
      setPage(null);
      setDetail(null);
      setSelected('');
      setDetailError('');
      setOpenError('');
      detailGeneration.current++;
      navigationGeneration.current++;
      setDetailBusy(false);
    }
    try {
      const next = await client.orderSeries({ limit: 20, cursor });
      if (current !== listGeneration.current) return;
      setPage((previous) =>
        cursor && previous
          ? {
              ...next,
              data: [
                ...previous.data,
                ...next.data.filter((batch) => !previous.data.some((old) => old.id === batch.id)),
              ],
            }
          : next,
      );
    } catch (error) {
      if (current === listGeneration.current) {
        setListError(message(error));
        setInvalidCursor(error instanceof ApiError && error.code === 'INVALID_CURSOR');
      }
    } finally {
      if (current === listGeneration.current) setListBusy(false);
    }
  }
  async function loadDetail(id: string) {
    const current = ++detailGeneration.current;
    navigationGeneration.current++;
    setOpening('');
    setOpenError('');
    setSelected(id);
    setDetail(null);
    setDetailBusy(true);
    setDetailError('');
    try {
      const next = await client.orderSeriesDetail(id);
      if (current === detailGeneration.current) setDetail(next);
    } catch (error) {
      if (current === detailGeneration.current) setDetailError(message(error));
    } finally {
      if (current === detailGeneration.current) setDetailBusy(false);
    }
  }
  useEffect(() => {
    setPage(null);
    setDetail(null);
    setSelected('');
    setOpening('');
    setListError('');
    setDetailError('');
    setOpenError('');
    setListBusy(false);
    setDetailBusy(false);
    if (open) void loadList();
    return () => {
      listGeneration.current++;
      detailGeneration.current++;
      navigationGeneration.current++;
    };
  }, [open]);
  async function openOrder(id: string) {
    if (!online || opening) return;
    const current = ++navigationGeneration.current;
    setOpening(id);
    setOpenError('');
    try {
      const order = await client.order(id);
      if (current !== navigationGeneration.current) return;
      await onCache(order);
      if (current !== navigationGeneration.current) return;
      navigated.current = true;
      changeOpen(false);
      onOpened(order.id);
    } catch (error) {
      if (current === navigationGeneration.current)
        setOpenError(`${message(error)} Your saved work is kept.`);
    } finally {
      if (current === navigationGeneration.current) setOpening('');
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button ref={trigger} className="quiet" disabled={!online}>
          Recurring batches
        </Button>
      </DialogTrigger>
      <DialogContent
        className="series-dialog"
        aria-modal="true"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (navigated.current || !trigger.current?.isConnected || trigger.current.disabled)
            document.getElementById('main')?.focus();
          else trigger.current.focus();
        }}
      >
        <DialogTitle ref={heading} tabIndex={-1}>
          Recurring batches
        </DialogTitle>
        <DialogDescription>
          Compare original schedules with current orders. Opening an order fetches its latest
          details and keeps your drafts.
        </DialogDescription>
        <div className="series-actions">
          <Button
            className="quiet"
            disabled={!online || listBusy || Boolean(opening)}
            onClick={() => void loadList()}
          >
            Refresh batches
          </Button>
        </div>
        {!online && (
          <Alert role="status" className="banner notice">
            You’re offline. Loaded batches stay visible. Reconnect to refresh or open an order.
          </Alert>
        )}
        {listError && (
          <Alert className="banner error">
            <p>{listError}</p>
            <Button
              className="quiet"
              disabled={!online || listBusy}
              onClick={() => void loadList(invalidCursor ? undefined : attemptedCursor.current)}
            >
              {invalidCursor ? 'Restart batch list' : 'Retry batch list'}
            </Button>
          </Alert>
        )}
        <div className="series-layout">
          <section aria-label="Saved recurring batches" className="series-ledger">
            {listBusy && (
              <p role="status" className="muted">
                Loading batches…
              </p>
            )}
            {page && (
              <>
                <p role="status" className="muted">
                  {page.data.length} loaded · {page.total} batches
                </p>
                {page.data.length === 0 && (
                  <Empty
                    title="No recurring batches yet"
                    description="Use Assign recurring work in dispatch to schedule a batch."
                  />
                )}
                <ul className="series-list">
                  {page.data.map((batch) => (
                    <li key={batch.id}>
                      <Button
                        variant="unstyled"
                        className="series-option"
                        aria-pressed={batch.id === selected}
                        aria-label={`View batch ${batch.id}: ${batch.title}`}
                        disabled={!online || Boolean(opening)}
                        onClick={() => void loadDetail(batch.id)}
                      >
                        <span className="reference">Batch {batch.id.slice(0, 8)}</span>
                        <strong>{batch.title}</strong>
                        <span className="muted">
                          {batch.frequency === 'daily' ? 'Daily' : 'Weekly'} · {batch.occurrences}{' '}
                          orders · {batch.assignee.name}
                        </span>
                        <span className="muted">
                          {calendarLabel(batch.firstDueDate, true)} to{' '}
                          {calendarLabel(batch.lastDueDate, true)}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
                {page.nextCursor && (
                  <Button
                    className="quiet full"
                    disabled={!online || listBusy || Boolean(opening)}
                    onClick={() => void loadList(page.nextCursor!)}
                  >
                    Load more batches
                  </Button>
                )}
              </>
            )}
          </section>
          <section aria-label="Selected recurring batch" className="series-detail">
            {detailBusy && (
              <p role="status" className="muted">
                Loading current batch orders…
              </p>
            )}
            {detailError && (
              <Alert className="banner error">
                <p>{detailError}</p>
                <Button
                  className="quiet"
                  disabled={!online || detailBusy}
                  onClick={() => void loadDetail(selected)}
                >
                  Retry batch details
                </Button>
              </Alert>
            )}
            {detail && (
              <>
                <h3>{detail.title}</h3>
                <p className="muted">
                  Created by {detail.createdBy.name} on{' '}
                  {new Date(detail.createdAt).toLocaleString()}. Original worker:{' '}
                  {detail.assignee.name}.
                </p>
                <p className="muted">Current at load time. Open an order to fetch it again.</p>
                <Button
                  className="quiet"
                  disabled={!online || detailBusy || Boolean(opening)}
                  onClick={() => void loadDetail(detail.id)}
                >
                  Refresh batch details
                </Button>
                {openError && <Alert className="banner error">{openError}</Alert>}
                {opening && (
                  <p role="status" className="muted">
                    Opening current order…
                  </p>
                )}
                <ol className="series-orders">
                  {detail.orders.map(({ occurrence, plannedDueDate, order }) => (
                    <li key={order.id}>
                      <span className="reference">
                        {occurrence}. {order.reference}
                      </span>
                      <strong>{order.title}</strong>
                      <dl>
                        <div>
                          <dt>Planned due date</dt>
                          <dd>
                            <time dateTime={plannedDueDate}>
                              {calendarLabel(plannedDueDate, true)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>Current due date</dt>
                          <dd>
                            <time dateTime={order.dueDate}>
                              {calendarLabel(order.dueDate, true)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>Current worker</dt>
                          <dd>{order.assignee.name}</dd>
                        </div>
                      </dl>
                      <Badge className={`status status-${order.status.toLowerCase()}`}>
                        {labels[order.status]}
                      </Badge>
                      <Button
                        className="quiet"
                        aria-label={`Open batch order ${order.reference}: ${order.title}`}
                        disabled={!online || Boolean(opening)}
                        onClick={() => void openOrder(order.id)}
                      >
                        Open order
                      </Button>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {!selected && page && page.data.length > 0 && (
              <Empty
                title="Choose a batch"
                description="Select a saved schedule to compare its planned and current assignments."
              />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
