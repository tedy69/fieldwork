import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from './components/ui/icon-button';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';
import { CalendarXIcon } from '@phosphor-icons/react/dist/csr/CalendarX';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { FunnelSimpleIcon } from '@phosphor-icons/react/dist/csr/FunnelSimple';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { MapPinIcon } from '@phosphor-icons/react/dist/csr/MapPin';
import { StackIcon } from '@phosphor-icons/react/dist/csr/Stack';
import {
  RecurrenceFrequencySchema,
  type Catalog,
  type OrderSeriesDetail,
  type OrderSeriesQuery,
  type WorkOrder,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { languageTags, notebookCopy, type Locale } from '@fieldwork/strings';
import { client, labels as orderLabels, message } from './lib';
import { calendarLabel } from './calendar';
import { downloadCsv, formatCsv } from './csv';
import { isOverdue, isScheduledOnClosure } from './dates';
import { frequencyLabels, recurrenceSummary } from './recurrence-labels';
import { seriesOverviewCopy } from './series-overview-copy';
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
type BatchFilters = Pick<OrderSeriesQuery, 'q' | 'frequency' | 'state'>;
type LoadedBatch = OrderSeriesDetail & { loadedAt: string };
type Visit = OrderSeriesDetail['orders'][number];
type VisitFilter = keyof typeof seriesOverviewCopy.en.filters;

function matchesVisit(
  { order, plannedDueDate }: Visit,
  filter: VisitFilter,
  today: string,
  closureDates: string[],
) {
  switch (filter) {
    case 'upcoming':
      return order.dueDate >= today && ['ASSIGNED', 'CHANGES_REQUESTED'].includes(order.status);
    case 'overdue':
      return isOverdue(order, today);
    case 'closures':
      return isScheduledOnClosure(order, closureDates);
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
  sites,
  locale,
  today,
  onCache,
  onOpened,
  onReuse,
}: {
  online: boolean;
  sites: Catalog['sites'];
  locale: Locale;
  today: string;
  onCache: (order: WorkOrder) => Promise<void>;
  onOpened: (id: string) => void;
  onReuse: (batch: OrderSeriesDetail) => void;
}) {
  const copy = seriesOverviewCopy[locale];
  const dateLocale = languageTags[locale];
  const frequencies = frequencyLabels[locale];
  const labels = locale === 'id' ? notebookCopy.id.status : orderLabels;
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page | null>(null);
  const [search, setSearch] = useState('');
  const [frequency, setFrequency] = useState<BatchFilters['frequency']>();
  const [batchState, setBatchState] = useState<BatchFilters['state']>();
  const [loadedFilters, setLoadedFilters] = useState<BatchFilters>({});
  const [detail, setDetail] = useState<LoadedBatch | null>(null);
  const siteId = detail?.orders[0]?.order.site.id;
  const closureDates = sites.find((site) => site.id === siteId)?.closureDates ?? [];
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
  const reuseAfterClose = useRef<OrderSeriesDetail | null>(null);
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
        const stale = error instanceof ApiError && error.code === 'INVALID_CURSOR';
        setListError(locale === 'en' ? message(error) : stale ? copy.cursor : copy.listFailed);
        setInvalidCursor(stale);
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
      if (current === detailGeneration.current)
        setDetail({ ...next, loadedAt: new Date().toISOString() });
    } catch (error) {
      if (current === detailGeneration.current)
        setDetailError(locale === 'en' ? message(error) : copy.detailsFailed);
    } finally {
      if (current === detailGeneration.current) setDetailBusy(false);
    }
  }
  useEffect(() => {
    setPage(null);
    setSearch('');
    setFrequency(undefined);
    setBatchState(undefined);
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
        setOpenError(locale === 'en' ? `${message(error)} ${copy.savedWork}` : copy.openFailed);
    } finally {
      if (current === navigationGeneration.current) setOpening('');
    }
  }
  async function saveSchedule(order: WorkOrder) {
    await onCache(order);
    const visit = detail?.orders.find((row) => row.order.id === order.id);
    restoreVisitFocus.current = Boolean(
      visit && !matchesVisit({ ...visit, order }, visitFilter, today, closureDates),
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
  const filters = { q: query, frequency, state: batchState };
  const { q: loadedQuery, frequency: loadedFrequency, state: loadedState } = loadedFilters;
  const filtered = Boolean(loadedQuery || loadedFrequency || loadedState);
  const searchDisabled =
    !online ||
    changingOrder ||
    (listBusy &&
      attemptedList.current.filters.q === query &&
      attemptedList.current.filters.frequency === frequency &&
      attemptedList.current.filters.state === batchState);
  useLayoutEffect(() => {
    if (changingOrder || !restoreVisitFocus.current) return;
    restoreVisitFocus.current = false;
    visitSelect.current?.focus();
  }, [changingOrder, detail]);
  const visibleVisits =
    detail?.orders.filter((visit) => matchesVisit(visit, visitFilter, today, closureDates)) ?? [];
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
      setScheduleNotice(copy.exported(visibleVisits.length));
    } catch {
      setOpenError(copy.exportFailed);
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <IconButton
          label={copy.title}
          lang={locale}
          ref={trigger}
          className="quiet"
          disabled={!online}
        >
          <StackIcon aria-hidden="true" />
        </IconButton>
      </DialogTrigger>
      <DialogContent
        size="compare"
        className="series-dialog"
        aria-modal="true"
        lang={locale}
        closeLabel={copy.close}
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
          const batch = reuseAfterClose.current;
          reuseAfterClose.current = null;
          if (batch) onReuse(batch);
        }}
      >
        <DialogHeader>
          <div>
            <DialogTitle ref={heading} tabIndex={-1}>
              {copy.title}
            </DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="series-actions"
          onSubmit={(event) => {
            event.preventDefault();
            if (!searchDisabled) void loadList(undefined, filters);
          }}
        >
          <Label>
            {copy.search}
            <SearchField
              value={search}
              onValueChange={(value) => {
                setSearch(value);
                if (!value && attemptedList.current.filters.q)
                  void loadList(undefined, { ...filters, q: undefined });
              }}
              clearLabel={copy.clearSearch}
              placeholder={copy.searchHint}
              maxLength={200}
              disabled={!online || changingOrder}
            />
          </Label>
          <IconButton
            type="submit"
            variant="outline"
            label={copy.searchAction}
            disabled={searchDisabled}
          >
            <MagnifyingGlassIcon aria-hidden="true" />
          </IconButton>
          <Label>
            {copy.frequency}
            <NativeSelect
              value={frequency ?? ''}
              onChange={(event) => {
                const next = RecurrenceFrequencySchema.safeParse(event.currentTarget.value).data;
                setFrequency(next);
                void loadList(undefined, { ...filters, frequency: next });
              }}
              disabled={!online || changingOrder}
            >
              <NativeSelectOption value="">{copy.allFrequencies}</NativeSelectOption>
              {RecurrenceFrequencySchema.options.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {frequencies[option]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          <IconButton
            type="button"
            variant="outline"
            label={copy.refresh}
            disabled={!online || listBusy || changingOrder}
            onClick={() => void loadList()}
          >
            <ArrowClockwiseIcon aria-hidden="true" />
          </IconButton>
        </form>
        {!online && (
          <Alert role="status" className="banner notice">
            {copy.offline}
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
              {invalidCursor ? copy.restart : copy.retryList}
            </Button>
          </Alert>
        )}
        <div className="series-layout">
          <section aria-label={copy.saved} className="series-ledger">
            {listBusy && (
              <p role="status" className="muted">
                {copy.loading}
              </p>
            )}
            <div className="series-list-summary">
              {page && (
                <p role="status" className="muted series-search-status">
                  {copy.resultCount(page.data.length, page.total, loadedQuery)}
                  {loadedFrequency && ` · ${frequencies[loadedFrequency]}`}
                  {loadedState && ` · ${copy.openWork}`}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="series-state-toggle"
                aria-label={copy.openWorkLabel}
                aria-pressed={batchState === 'open'}
                disabled={!online || changingOrder}
                onClick={() => {
                  const next = batchState === 'open' ? undefined : 'open';
                  setBatchState(next);
                  void loadList(undefined, { ...filters, state: next });
                }}
              >
                <FunnelSimpleIcon aria-hidden="true" />
                {copy.openWork}
              </Button>
            </div>
            {page && (
              <>
                {page.data.length === 0 && (
                  <Empty
                    title={filtered ? copy.noMatch : copy.empty}
                    description={
                      loadedFrequency || loadedState
                        ? copy.changeFilter
                        : loadedQuery
                          ? copy.changeSearch
                          : copy.create
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
                        aria-label={copy.viewBatch(batch.id, batch.title)}
                        aria-describedby={batch.siteName ? `batch-site-${batch.id}` : undefined}
                        disabled={!online || listBusy || changingOrder}
                        onClick={() => void loadDetail(batch.id)}
                      >
                        <span className="reference">
                          {copy.batch} {batch.id.slice(0, 8)}
                        </span>
                        <strong>{batch.title}</strong>
                        {batch.siteName && (
                          <span id={`batch-site-${batch.id}`} className="muted series-site">
                            <MapPinIcon aria-hidden="true" />
                            {batch.siteName}
                          </span>
                        )}
                        <span className="muted">
                          {recurrenceSummary(batch, locale)} · {copy.orders(batch.occurrences)} ·{' '}
                          {batch.assignee.name}
                        </span>
                        <span className="muted">
                          {copy.dateRange(
                            calendarLabel(batch.firstDueDate, true, dateLocale),
                            calendarLabel(batch.lastDueDate, true, dateLocale),
                          )}
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
                    {copy.more}
                  </Button>
                )}
              </>
            )}
          </section>
          <section aria-label={copy.selected} className="series-detail">
            {detailBusy && (
              <p role="status" className="muted">
                {copy.loadingDetails}
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
                  {copy.retryDetails}
                </Button>
              </Alert>
            )}
            {detail && (
              <>
                <div className="series-detail-heading">
                  <h3>{detail.title}</h3>
                  <IconButton
                    label={copy.reuse}
                    className="quiet"
                    disabled={!online || detailBusy || changingOrder}
                    onClick={() => {
                      reuseAfterClose.current = detail;
                      changeOpen(false);
                    }}
                  >
                    <CopyIcon aria-hidden="true" />
                  </IconButton>
                </div>
                <SkippedDates dates={detail.skipDates} locale={locale} />
                <p className="muted">
                  {copy.origin(
                    detail.createdBy.name,
                    new Date(detail.createdAt).toLocaleString(dateLocale),
                    detail.assignee.name,
                  )}
                </p>
                <p className="muted series-loaded">
                  {copy.loaded}{' '}
                  <time dateTime={detail.loadedAt}>
                    {new Date(detail.loadedAt).toLocaleString(dateLocale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </p>
                <div className="series-visit-tools">
                  <Label>
                    {copy.visits}
                    <NativeSelect
                      ref={visitSelect}
                      value={visitFilter}
                      disabled={changingOrder}
                      onChange={(event) => setVisitFilter(event.currentTarget.value as VisitFilter)}
                    >
                      {Object.entries(copy.filters).map(([value, label]) => (
                        <NativeSelectOption value={value} key={value}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Label>
                  <IconButton
                    label={copy.refreshDetails}
                    className="quiet"
                    disabled={!online || detailBusy || changingOrder}
                    onClick={() => void loadDetail(detail.id)}
                  >
                    <ArrowClockwiseIcon aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={copy.export}
                    className="quiet"
                    disabled={!visibleVisits.length || detailBusy || changingOrder}
                    onClick={downloadVisits}
                  >
                    <DownloadSimpleIcon aria-hidden="true" />
                  </IconButton>
                </div>
                {visitFilter !== 'all' && (
                  <p role="status" className="muted">
                    {copy.visitCount(visibleVisits.length, detail.orders.length)}
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
                    {copy.opening}
                  </p>
                )}
                {visibleVisits.length === 0 && (
                  <Empty title={copy.noVisits} description={copy.changeVisitFilter} />
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
                            <dt>{copy.plannedDue}</dt>
                            <dd>
                              <time dateTime={plannedDueDate}>
                                {calendarLabel(plannedDueDate, true, dateLocale)}
                              </time>
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>{plannedDueDate === order.dueDate ? copy.due : copy.currentDue}</dt>
                          <dd>
                            <time dateTime={order.dueDate}>
                              {calendarLabel(order.dueDate, true, dateLocale)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>{copy.currentWorker}</dt>
                          <dd>{order.assignee.name}</dd>
                        </div>
                      </dl>
                      <div className="series-visit-status">
                        <Badge className={`status status-${order.status.toLowerCase()}`}>
                          {labels[order.status]}
                        </Badge>
                        {isScheduledOnClosure(order, closureDates) && (
                          <Badge className="series-closure-label">
                            <CalendarXIcon aria-hidden="true" />
                            {copy.siteClosed}
                          </Badge>
                        )}
                      </div>
                      <div className="series-order-actions">
                        <IconButton
                          className="quiet"
                          label={copy.openOrderLabel(order.reference, order.title)}
                          tooltip={copy.openOrder}
                          disabled={!online || detailBusy || changingOrder}
                          onClick={() => void openOrder(order.id)}
                        >
                          <ArrowRightIcon aria-hidden="true" />
                        </IconButton>
                        {(order.status === 'ASSIGNED' || order.status === 'CHANGES_REQUESTED') && (
                          <RescheduleOrder
                            order={order}
                            closureDates={closureDates}
                            locale={locale}
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
              <Empty title={copy.choose} description={copy.chooseHint} />
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
