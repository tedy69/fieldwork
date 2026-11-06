import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from './components/ui/icon-button';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { MapPinIcon } from '@phosphor-icons/react/dist/csr/MapPin';
import { StackIcon } from '@phosphor-icons/react/dist/csr/Stack';
import {
  RecurrenceFrequencySchema,
  type OrderSeriesDetail,
  type OrderSeriesQuery,
  type WorkOrder,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, labels, message } from './lib';
import { calendarLabel } from './calendar';
import { downloadCsv, formatCsv } from './csv';
import { isOverdue } from './dates';
import { recurrenceLabels, recurrenceSummary } from './recurrence-labels';
import { SkippedDates } from './RecurrenceExceptions';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import { Label } from './components/ui/label';
import { NativeSelect, NativeSelectOption } from './components/ui/native-select';
import { SearchField } from './components/ui/search-field';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Empty } from './components';
import RescheduleOrder from './RescheduleOrder';
import './series-overview.css';

type Page = Awaited<ReturnType<typeof client.orderSeries>>;
type BatchFilters = Pick<OrderSeriesQuery, 'q' | 'frequency'>;
type Visit = OrderSeriesDetail['orders'][number];
const visitLabels = {
  all: 'All visits',
  upcoming: 'Upcoming field work',
  overdue: 'Overdue',
  rescheduled: 'Rescheduled',
  review: 'Awaiting review',
  approved: 'Approved',
};
type VisitFilter = keyof typeof visitLabels;

function matchesVisit({ order, plannedDueDate }: Visit, filter: VisitFilter, today: string) {
  switch (filter) {
    case 'upcoming':
      return order.dueDate >= today && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status);
    case 'overdue':
      return isOverdue(order, today);
    case 'rescheduled':
      return order.dueDate !== plannedDueDate;
    case 'review':
      return order.status === 'SUBMITTED';
    case 'approved':
      return order.status === 'APPROVED';
    case 'all':
      return true;
  }
}

export default function SeriesOverview({
  online,
  today,
  onCache,
  onOpened,
}: {
  online: boolean;
  today: string;
  onCache: (order: WorkOrder) => Promise<void>;
  onOpened: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [search, setSearch] = useState('');
  const [frequency, setFrequency] = useState<BatchFilters['frequency']>();
  const [loadedFilters, setLoadedFilters] = useState<BatchFilters>({});
  const [detail, setDetail] = useState<OrderSeriesDetail | null>(null);
  const [selected, setSelected] = useState('');
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('all');
  const [listBusy, setListBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [openError, setOpenError] = useState('');
  const [opening, setOpening] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState('');
  const [invalidCursor, setInvalidCursor] = useState(false);
  const listGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const navigationGeneration = useRef(0);
  const attemptedList = useRef<{ cursor?: string; filters: BatchFilters }>({ filters: {} });
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const visitSelect = useRef<HTMLSelectElement>(null);
  const restoreVisitFocus = useRef(false);
  const navigated = useRef(false);
  function changeOpen(next: boolean) {
    if (scheduleBusy) return;
    listGeneration.current++;
    detailGeneration.current++;
    navigationGeneration.current++;
    if (next) navigated.current = false;
    setOpen(next);
  }
  async function loadList(cursor?: string, filters = loadedFilters) {
    const current = ++listGeneration.current;
    attemptedList.current = { cursor, filters };
    setListBusy(true);
    setListError('');
    setInvalidCursor(false);
    if (!cursor) {
      setDetail(null);
      setSelected('');
      setVisitFilter('all');
      setDetailError('');
      setOpenError('');
      setScheduleNotice('');
      detailGeneration.current++;
      navigationGeneration.current++;
      setDetailBusy(false);
    }
    try {
      const next = await client.orderSeries({ limit: 20, cursor, ...filters });
      if (current !== listGeneration.current) return;
      setLoadedFilters(filters);
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
    setScheduleNotice('');
    if (id !== selected) {
      setSelected(id);
      setDetail(null);
      setVisitFilter('all');
    }
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
    setSearch('');
    setFrequency(undefined);
    setLoadedFilters({});
    setDetail(null);
    setSelected('');
    setOpening('');
    setListError('');
    setDetailError('');
    setOpenError('');
    setScheduleNotice('');
    setListBusy(false);
    setDetailBusy(false);
    if (open) void loadList(undefined, {});
    return () => {
      listGeneration.current++;
      detailGeneration.current++;
      navigationGeneration.current++;
    };
  }, [open]);
  async function openOrder(id: string) {
    if (!online || opening || scheduleBusy) return;
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
  async function saveSchedule(order: WorkOrder) {
    await onCache(order);
    const visit = detail?.orders.find((row) => row.order.id === order.id);
    restoreVisitFocus.current = Boolean(
      visit && !matchesVisit({ ...visit, order }, visitFilter, today),
    );
    setDetail(
      (previous) =>
        previous && {
          ...previous,
          orders: previous.orders.map((row) =>
            row.order.id === order.id ? { ...row, order } : row,
          ),
        },
    );
  }
  const changingOrder = Boolean(opening) || scheduleBusy;
  const query = search.trim() || undefined;
  const { q: loadedQuery, frequency: loadedFrequency } = loadedFilters;
  const filtered = Boolean(loadedQuery || loadedFrequency);
  const searchDisabled =
    !online ||
    changingOrder ||
    (listBusy &&
      attemptedList.current.filters.q === query &&
      attemptedList.current.filters.frequency === frequency);
  useLayoutEffect(() => {
    if (changingOrder || !restoreVisitFocus.current) return;
    restoreVisitFocus.current = false;
    visitSelect.current?.focus();
  }, [changingOrder, detail]);
  const visibleVisits =
    detail?.orders.filter((visit) => matchesVisit(visit, visitFilter, today)) ?? [];
  function downloadVisits() {
    if (!detail || !visibleVisits.length) return;
    setOpenError('');
    setScheduleNotice('');
    try {
      const csv = formatCsv([
        [
          'Visit',
          'Reference',
          'Work order',
          'Site',
          'Planned due date',
          'Current due date',
          'Assigned to',
          'Status',
        ],
        ...visibleVisits.map(({ occurrence, plannedDueDate, order }) => [
          occurrence,
          order.reference,
          order.title,
          order.site.name,
          plannedDueDate,
          order.dueDate,
          order.assignee.name,
          order.status,
        ]),
      ]);
      downloadCsv(`fieldwork-batch-${detail.id.slice(0, 8)}.csv`, csv);
      const count = visibleVisits.length;
      setScheduleNotice(`CSV prepared for ${count} ${count === 1 ? 'visit' : 'visits'}.`);
    } catch {
      setOpenError('Could not create the schedule CSV. Try again.');
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <IconButton label="Recurring batches" ref={trigger} className="quiet" disabled={!online}>
          <StackIcon aria-hidden="true" />
        </IconButton>
      </DialogTrigger>
      <DialogContent
        size="compare"
        className="series-dialog"
        aria-modal="true"
        showCloseButton={!scheduleBusy}
        onEscapeKeyDown={(event) => {
          if (
            scheduleBusy ||
            (event.target instanceof Element && event.target.closest('.schedule form'))
          )
            event.preventDefault();
        }}
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
        <DialogHeader>
          <div>
            <DialogTitle ref={heading} tabIndex={-1}>
              Recurring batches
            </DialogTitle>
            <DialogDescription>Compare planned and current dates for each order.</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="series-actions"
          onSubmit={(event) => {
            event.preventDefault();
            if (!searchDisabled) void loadList(undefined, { q: query, frequency });
          }}
        >
          <Label>
            Search batches
            <SearchField
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                if (!value && attemptedList.current.filters.q)
                  void loadList(undefined, { frequency });
              }}
              clearLabel="Clear batch search"
              placeholder="Name, ID, or reference"
              maxLength={200}
              disabled={!online || changingOrder}
            />
          </Label>
          <IconButton
            type="submit"
            variant="outline"
            label="Search recurring batches"
            disabled={searchDisabled}
          >
            <MagnifyingGlassIcon aria-hidden="true" />
          </IconButton>
          <Label>
            Frequency
            <NativeSelect
              value={frequency ?? ''}
              onChange={(event) => {
                const next = RecurrenceFrequencySchema.safeParse(event.currentTarget.value).data;
                setFrequency(next);
                void loadList(undefined, { q: query, frequency: next });
              }}
              disabled={!online || changingOrder}
            >
              <NativeSelectOption value="">All frequencies</NativeSelectOption>
              {RecurrenceFrequencySchema.options.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {recurrenceLabels[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <IconButton
            type="button"
            variant="outline"
            label="Refresh batches"
            disabled={!online || listBusy || changingOrder}
            onClick={() => void loadList()}
          >
            <ArrowClockwiseIcon aria-hidden="true" />
          </IconButton>
        </form>
        {!online && (
          <Alert role="status" className="banner notice">
            You’re offline. Loaded batches stay visible. Reconnect to refresh or change an order.
          </Alert>
        )}
        {listError && (
          <Alert className="banner error">
            <p>{listError}</p>
            <Button
              className="quiet"
              disabled={!online || listBusy || changingOrder}
              onClick={() =>
                void loadList(
                  invalidCursor ? undefined : attemptedList.current.cursor,
                  attemptedList.current.filters,
                )
              }
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
                <p role="status" className="muted series-search-status">
                  {page.data.length} loaded ·{' '}
                  {loadedQuery
                    ? `${page.total} ${page.total === 1 ? 'match' : 'matches'} for “${loadedQuery}”`
                    : `${page.total} ${page.total === 1 ? 'batch' : 'batches'}`}
                  {loadedFrequency && ` · ${recurrenceLabels[loadedFrequency]}`}
                </p>
                {page.data.length === 0 && (
                  <Empty
                    title={filtered ? 'No matching batches' : 'No recurring batches yet'}
                    description={
                      loadedFrequency
                        ? 'Try another frequency or clear the search.'
                        : loadedQuery
                          ? 'Try a title, worker, site, batch ID, or work order reference.'
                          : 'Use Assign recurring work in dispatch to schedule a batch.'
                    }
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
                        aria-describedby={batch.siteName ? `batch-site-${batch.id}` : undefined}
                        disabled={!online || listBusy || changingOrder}
                        onClick={() => void loadDetail(batch.id)}
                      >
                        <span className="reference">Batch {batch.id.slice(0, 8)}</span>
                        <strong>{batch.title}</strong>
                        {batch.siteName && (
                          <span id={`batch-site-${batch.id}`} className="muted series-site">
                            <MapPinIcon aria-hidden="true" />
                            {batch.siteName}
                          </span>
                        )}
                        <span className="muted">
                          {recurrenceSummary(batch)} · {batch.occurrences} orders ·{' '}
                          {batch.assignee.name}
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
                    disabled={!online || listBusy || changingOrder}
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
                <SkippedDates dates={detail.skipDates} />
                <p className="muted">
                  Created by {detail.createdBy.name} on{' '}
                  {new Date(detail.createdAt).toLocaleString()}. Original worker:{' '}
                  {detail.assignee.name}.
                </p>
                <p className="muted">Current at load time. Open an order to fetch it again.</p>
                <div className="series-visit-tools">
                  <Label>
                    Show visits
                    <NativeSelect
                      ref={visitSelect}
                      value={visitFilter}
                      disabled={changingOrder}
                      onChange={(event) => setVisitFilter(event.currentTarget.value as VisitFilter)}
                    >
                      {Object.entries(visitLabels).map(([value, label]) => (
                        <NativeSelectOption value={value} key={value}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Label>
                  <IconButton
                    label="Refresh batch details"
                    className="quiet"
                    disabled={!online || detailBusy || changingOrder}
                    onClick={() => void loadDetail(detail.id)}
                  >
                    <ArrowClockwiseIcon aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label="Export batch visits as CSV"
                    className="quiet"
                    disabled={!visibleVisits.length || detailBusy || changingOrder}
                    onClick={downloadVisits}
                  >
                    <DownloadSimpleIcon aria-hidden="true" />
                  </IconButton>
                </div>
                {visitFilter !== 'all' && (
                  <p role="status" className="muted">
                    {visibleVisits.length} of {detail.orders.length} visits
                  </p>
                )}
                {openError && <Alert className="banner error">{openError}</Alert>}
                {scheduleNotice && (
                  <Alert role="status" className="banner notice">
                    {scheduleNotice}
                  </Alert>
                )}
                {opening && (
                  <p role="status" className="muted">
                    Opening current order…
                  </p>
                )}
                {visibleVisits.length === 0 && (
                  <Empty title="No matching visits" description="Choose another visit filter." />
                )}
                <ol className="series-orders">
                  {visibleVisits.map(({ occurrence, plannedDueDate, order }) => (
                    <li key={order.id}>
                      <span className="reference">
                        {occurrence}. {order.reference}
                      </span>
                      <strong>{order.title}</strong>
                      <dl>
                        {plannedDueDate !== order.dueDate && (
                          <div>
                            <dt>Planned due date</dt>
                            <dd>
                              <time dateTime={plannedDueDate}>
                                {calendarLabel(plannedDueDate, true)}
                              </time>
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>
                            {plannedDueDate === order.dueDate ? 'Due date' : 'Current due date'}
                          </dt>
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
                      <div className="series-order-actions">
                        <Button
                          className="quiet"
                          aria-label={`Open batch order ${order.reference}: ${order.title}`}
                          disabled={!online || detailBusy || changingOrder}
                          onClick={() => void openOrder(order.id)}
                        >
                          Open order
                        </Button>
                        {(order.status === 'ASSIGNED' || order.status === 'CHANGES_REQUESTED') && (
                          <RescheduleOrder
                            order={order}
                            online={online}
                            onSaved={saveSchedule}
                            onNotice={setScheduleNotice}
                            batch={{
                              locked: changingOrder || detailBusy,
                              onBusyChange: setScheduleBusy,
                              onRestoreFocus: () => {
                                if (visitSelect.current && !visitSelect.current.disabled)
                                  visitSelect.current.focus();
                                else heading.current?.focus();
                              },
                            }}
                          />
                        )}
                      </div>
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
