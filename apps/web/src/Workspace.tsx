import { Button } from './components/ui/button';
import DraftExport from './DraftExport';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import SmoothTab from './components/kokonutui/smooth-tab';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { SignInIcon } from '@phosphor-icons/react/dist/csr/SignIn';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { ListDashesIcon } from '@phosphor-icons/react/dist/csr/ListDashes';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { CalendarXIcon } from '@phosphor-icons/react/dist/csr/CalendarX';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { GlobeIcon } from '@phosphor-icons/react/dist/csr/Globe';
import { IconButton } from './components/ui/icon-button';
import { SearchField } from './components/ui/search-field';
import { Label } from './components/ui/label';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  awaitsInspection,
  compareOrdersByDueDate,
  compactWorkReference,
  hasDraftContent,
  isOpenDueBetween,
  isUrgentOpenOrder,
  nextSevenDaysEnd,
  type User,
  type Catalog,
  type OrderSeriesDetail,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { emptyState, searchQueuedReports, type State } from '@fieldwork/offline';
import {
  inspectionCopy,
  languageNames,
  languageTags,
  notebookCopy,
  type Locale,
} from '@fieldwork/strings';
import { repositoryFor } from './storage';
import { client, message, dateLabel } from './lib';
import { PageHeading, Empty, ActionGroup } from './components';
import Resources from './Resources';
import CreateOrder from './CreateOrderDialog';
import RecurringDispatch from './RecurringDispatch';
import SeriesOverview from './SeriesOverview';
import OrderDetail from './OrderDetail';
import { isInDueRange, isOverdue, isScheduledOnClosure, isValidDueRange } from './dates';
import { useLocalDate } from './useLocalDate';
import WorkspaceExports from './WorkspaceExports';
import DueDateRange from './DueDateRange';
import WeekPlanner from './WeekPlanner';
import MonthPlanner from './MonthPlanner';
import { monthDates, weekDates } from './calendar';
import WorkFinder from './WorkFinder';
import ServerSearch from './ServerSearch';
import { workerWorkspaceCopy } from './worker-workspace-copy';
import { managerDispatchCopy } from './manager-dispatch-copy';
import { useInspectionNavigation } from './useInspectionNavigation';
import { useLocalizedNotice } from './useLocalizedNotice';

export default function Workspace({
  user,
  logout,
  signInAgain,
  language,
  onLanguageChange,
}: {
  user: User;
  logout: () => void;
  signInAgain: () => void;
  language: Locale;
  onLanguageChange: (language: Locale) => void;
}) {
  const locale = language;
  const alternate = locale === 'id' ? 'en' : 'id';
  const copy = workerWorkspaceCopy[locale];
  const dispatch = managerDispatchCopy[locale];
  const notebook = notebookCopy[locale];
  const dateLocale = languageTags[locale];
  const repo = useMemo(() => repositoryFor(user.id, client), [user.id]);
  const [state, setState] = useState<State>(emptyState);
  const [catalog, setCatalog] = useState<Catalog>({ users: [], sites: [], templates: [] });
  const catalogGeneration = useRef(0);
  const { destination, navigate, openInspection, closeInspection } = useInspectionNavigation(
    user.id,
  );
  const { view, orderId, returnFocus } = destination;
  const navigation = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState('ALL');
  const statusFilterToolbar = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [outboxSearch, setOutboxSearch] = useState('');
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const queuedReports = useMemo(
    () => searchQueuedReports(state.orders, state.outbox, outboxSearch, onlyBlocked),
    [state.orders, state.outbox, outboxSearch, onlyBlocked],
  );
  const noBlockedReports = onlyBlocked && state.outbox.every((item) => item.state !== 'blocked');
  const [dueFrom, setDueFrom] = useState('');
  const [dueThrough, setDueThrough] = useState('');
  const [datesOpen, setDatesOpen] = useState(false);
  const [closureOnly, setClosureOnly] = useState(false);
  const today = useLocalDate();
  const [plannerView, setPlannerView] = useState<'list' | 'week' | 'month'>('list');
  const planner = plannerView !== 'list';
  const [plannerAnchor, setPlannerAnchor] = useState(today);
  const [plannerDay, setPlannerDay] = useState('');
  const invalidRange = !planner && !isValidDueRange(dueFrom, dueThrough);
  const [creating, setCreating] = useState(false);
  const [batchToReuse, setBatchToReuse] = useState<OrderSeriesDetail | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<{ kind: 'sync' | 'workspace'; detail: string | null } | null>(
    null,
  );
  const syncAction = useRef<HTMLButtonElement>(null);
  const retryAction = useRef<HTMLButtonElement>(null);
  const restoreRetryFocus = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { message: notice, pendingMutationId, show: setNotice } = useLocalizedNotice(locale);
  const noticeIsCurrent =
    !pendingMutationId ||
    state.outbox.some(
      (item) => item.input.mutationId === pendingMutationId && item.state === 'pending',
    );
  const showPendingReportError = online && !sessionExpired && error?.kind !== 'sync';
  function updateCatalog(update: SetStateAction<Catalog>) {
    catalogGeneration.current++;
    setCatalog(update);
  }
  async function refresh(reconnecting = false) {
    setBusy(true);
    setError((current) => (current?.kind === 'sync' ? current : null));
    try {
      await repo.flush({ afterCurrent: reconnecting });
      const catalogRead = ++catalogGeneration.current;
      const [first, catalog] = await Promise.all([client.orders(), client.catalog()]);
      const orders = [...first.data];
      for (let offset = first.limit; offset < first.total; offset += first.limit)
        orders.push(...(await client.orders(offset)).data);
      // An acknowledged edit can arrive while this refresh is still paging orders.
      if (catalogRead === catalogGeneration.current) setCatalog(catalog);
      await repo.cacheOrders(orders);
      setError((current) => (current?.kind === 'sync' ? null : current));
      setSessionExpired(false);
    } catch (error) {
      if (user.role === 'worker' && error instanceof ApiError && error.status === 401) {
        setSessionExpired(true);
      } else {
        setError({ kind: 'sync', detail: error instanceof ApiError ? error.message : null });
      }
    } finally {
      setState(await repo.read());
      setBusy(false);
      setLoaded(true);
    }
  }
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void repo
        .read()
        .then((state) => {
          if (mounted) setState(state);
        })
        .catch((error) => setError({ kind: 'workspace', detail: message(error) }));
    };
    load();
    const unsubscribe = repo.subscribe(load);
    void refresh();
    const connected = () => {
      setOnline(true);
      void refresh(true);
    };
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      mounted = false;
      unsubscribe();
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, [repo]);
  useLayoutEffect(() => {
    if (busy || !restoreRetryFocus.current) return;
    restoreRetryFocus.current = false;
    if (document.activeElement !== document.body) return;
    const target =
      error?.kind === 'sync' && !sessionExpired ? retryAction.current : syncAction.current;
    if (target && !target.disabled) target.focus();
    else document.getElementById('main')?.focus();
  }, [busy, error, sessionExpired]);
  const order = state.orders.find((order) => order.id === orderId);
  const inspectionId = order?.id;
  useLayoutEffect(() => {
    if (inspectionId) document.getElementById('inspection-title')?.focus();
    else if (returnFocus) {
      const target = document.querySelector<HTMLElement>(returnFocus);
      if (target && !target.matches(':disabled')) target.focus();
      else document.getElementById('main')?.focus();
    }
  }, [inspectionId, returnFocus]);
  const overdueEmpty = search
    ? {
        title: copy.noMatchingOverdue,
        description: copy.trySearch,
      }
    : {
        title: copy.noOverdue,
        description: copy.overdueHint,
      };
  const nextWeek = filter === 'NEXT_SEVEN_DAYS';
  const dateWindow = nextWeek || filter === 'DUE_TODAY';
  const windowEnd = nextWeek ? nextSevenDaysEnd(today) : today;
  const dateFilterEmpty =
    filter === 'OVERDUE'
      ? overdueEmpty
      : dateWindow
        ? {
            title: search ? copy.noMatch : nextWeek ? copy.noDueNextWeek : copy.noDueToday,
            description: search
              ? copy.trySearch
              : nextWeek
                ? copy.dueNextWeekHint
                : copy.dueTodayHint,
          }
        : null;
  const filterLabels = {
    ALL: copy.all,
    OVERDUE: copy.overdue,
    DUE_TODAY: notebook.dueToday,
    NEXT_SEVEN_DAYS: notebook.nextSevenDays,
    URGENT: notebook.urgentWork,
    TO_DO: notebook.toDo,
    DRAFTS: notebook.drafts,
    ...notebook.status,
  };
  const hasSiteClosures =
    user.role === 'manager' && catalog.sites.some((site) => site.closureDates?.length);
  const closureVisits = useMemo(() => {
    const visits = new Set<string>();
    if (!hasSiteClosures) return visits;
    const closures = new Map(catalog.sites.map((site) => [site.id, site.closureDates]));
    for (const order of state.orders) {
      if (isScheduledOnClosure(order, closures.get(order.site.id))) visits.add(order.id);
    }
    return visits;
  }, [catalog.sites, hasSiteClosures, state.orders]);
  const queuedOrders = useMemo(
    () => new Set(state.outbox.map((item) => item.orderId)),
    [state.outbox],
  );
  const savedDrafts = useMemo(
    () =>
      new Set(
        state.orders
          .filter(
            (order) =>
              user.role === 'worker' &&
              awaitsInspection(order) &&
              !queuedOrders.has(order.id) &&
              hasDraftContent(state.drafts[order.id]),
          )
          .map((order) => order.id),
      ),
    [state.orders, state.drafts, queuedOrders, user.role],
  );
  const draftLabel = inspectionCopy[locale].draftSaved;
  const query = search.toLowerCase();
  const matching = state.orders.filter((order) => {
    const matchesSearch =
      `${order.title} ${order.site.name} ${order.reference} ${order.assignee.name}`
        .toLowerCase()
        .includes(query) || compactWorkReference(order.reference).toLowerCase().includes(query);
    if (!matchesSearch || (closureOnly && !closureVisits.has(order.id))) return false;
    switch (filter) {
      case 'ALL':
        return true;
      case 'OVERDUE':
        return isOverdue(order, today);
      case 'URGENT':
        return isUrgentOpenOrder(order);
      case 'TO_DO':
        return awaitsInspection(order) && !queuedOrders.has(order.id);
      case 'DRAFTS':
        return savedDrafts.has(order.id);
      case 'DUE_TODAY':
      case 'NEXT_SEVEN_DAYS':
        return isOpenDueBetween(order, today, windowEnd);
      default:
        return order.status === filter;
    }
  });
  const period = plannerView === 'month' ? monthDates(plannerAnchor) : weekDates(plannerAnchor);
  const closedDays = new Set(
    matching
      .filter((order) => closureVisits.has(order.id) && period.includes(order.dueDate))
      .map((order) => order.dueDate),
  );
  const visible = matching.filter((order) =>
    isInDueRange(
      order.dueDate,
      planner ? plannerDay || period[0] : dueFrom,
      planner ? plannerDay || period[period.length - 1] : dueThrough,
    ),
  );
  if (planner || nextWeek) visible.sort(compareOrdersByDueDate);
  const reviewCount = state.orders.filter((order) => order.status === 'SUBMITTED').length;
  const assignedCount = state.orders.filter(awaitsInspection).length;
  useEffect(() => {
    const title =
      view === 'resources'
        ? dispatch.resources
        : view === 'outbox'
          ? notebook.outbox
          : order
            ? order.reference
            : user.role === 'manager'
              ? copy.orders
              : notebook.assignments;
    document.title = `${title} · Fieldwork`;
  }, [view, order?.reference, user.role, copy.orders, notebook, dispatch.resources]);
  const sessionRecovery = sessionExpired ? (
    <Alert role="region" aria-label={notebook.syncSignIn} className="banner feedback-with-action">
      <div role="alert">
        <strong>{notebook.syncSignIn}</strong>
        <p>{notebook.sessionDrafts}</p>
      </div>
      <Button variant="outline" disabled={busy || !online} onClick={signInAgain}>
        <SignInIcon aria-hidden="true" />
        {notebook.signInAgain}
      </Button>
    </Alert>
  ) : null;
  const recoveryInReport =
    view === 'orders' &&
    order &&
    state.outbox.some((item) => item.orderId === order.id && item.state === 'pending');
  const workspaceFeedback = (
    <>
      {!recoveryInReport && sessionRecovery}
      {!sessionExpired &&
        error &&
        (error.kind === 'sync' ? (
          <Alert
            role="region"
            aria-label={notebook.syncError}
            className="banner error feedback-with-action"
            lang={locale}
          >
            <p role="alert">
              {locale === 'id' ? copy.unavailable : (error.detail ?? copy.unavailable)}
            </p>
            <Button
              ref={retryAction}
              variant="outline"
              disabled={busy || !online}
              onClick={(event) => {
                restoreRetryFocus.current = document.activeElement === event.currentTarget;
                void refresh();
              }}
            >
              <ArrowClockwiseIcon aria-hidden="true" />
              {notebook.retrySync}
            </Button>
          </Alert>
        ) : (
          <Alert className="banner error" lang={locale}>
            {locale === 'id' && user.role === 'manager'
              ? copy.unavailable
              : (error.detail ?? copy.unavailable)}
          </Alert>
        ))}
      {!sessionExpired && noticeIsCurrent && notice && (
        <Alert role="status" className="banner notice" lang={locale}>
          {notice}
          <IconButton
            label={copy.dismiss}
            variant="ghost"
            onClick={() => {
              setNotice(null);
              document.getElementById('main')?.focus({ preventScroll: true });
            }}
          >
            <XIcon aria-hidden="true" />
          </IconButton>
        </Alert>
      )}
    </>
  );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        lang={locale}
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {copy.skip}
      </a>
      <header className="sidebar" lang={locale}>
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <p className="workspace-label">{copy.notebook}</p>
        <nav ref={navigation} aria-label={copy.workspace}>
          <Button
            variant="ghost"
            aria-current={view === 'orders' ? 'page' : undefined}
            className={view === 'orders' ? 'nav-active' : ''}
            onClick={() => navigate('orders')}
          >
            <ClipboardTextIcon aria-hidden="true" />
            <span className="nav-label">
              {copy.orders} <span className="nav-count">{state.orders.length}</span>
            </span>
          </Button>
          <Button
            variant="ghost"
            aria-current={view === 'outbox' ? 'page' : undefined}
            className={view === 'outbox' ? 'nav-active' : ''}
            onClick={() => navigate('outbox')}
          >
            <TrayIcon aria-hidden="true" />
            <span className="nav-label">
              {notebook.outbox} <span className="nav-count">{state.outbox.length}</span>
            </span>
          </Button>
          {user.role === 'manager' && (
            <Button
              variant="ghost"
              aria-current={view === 'resources' ? 'page' : undefined}
              className={view === 'resources' ? 'nav-active' : ''}
              onClick={() => navigate('resources')}
            >
              <BuildingsIcon aria-hidden="true" />{' '}
              <span className="nav-label">{dispatch.resources}</span>
            </Button>
          )}
        </nav>
        <Card className="identity">
          <Avatar className="avatar" aria-hidden="true">
            <AvatarFallback>
              {user.name
                .split(' ')
                .map((name) => name[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === 'manager' ? dispatch.manager : notebook.worker}</small>
          </div>
          <IconButton
            className="quiet"
            label={notebook.signOut}
            onClick={logout}
            tooltip={copy.signOutHint}
          >
            <SignOutIcon aria-hidden="true" />
          </IconButton>
        </Card>
      </header>
      <div
        className="main-column"
        onFocus={({ target, currentTarget }) => {
          const nav = navigation.current;
          if (
            !nav ||
            !currentTarget.contains(target) ||
            !target.matches(':focus-visible') ||
            getComputedStyle(nav).position !== 'fixed'
          )
            return;
          requestAnimationFrame(() => {
            if (document.activeElement !== target) return;
            // The browser can consider a control visible even when the fixed bar covers it.
            const overlap = target.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
            if (overlap > 0) window.scrollBy(0, overlap + 8);
          });
        }}
      >
        <div className="topbar" lang={locale}>
          <span className="workspace-context">
            {user.role === 'manager' ? dispatch.desk : copy.context}
          </span>
          <div className="connection">
            <span className={online ? 'signal' : 'signal offline'} />
            <span role="status">{online ? copy.connected : copy.offline}</span>
            <IconButton
              ref={syncAction}
              className="quiet sync-action"
              label={busy ? notebook.syncing : notebook.sync}
              onClick={() => void refresh()}
              disabled={busy || !online}
            >
              <ArrowClockwiseIcon aria-hidden="true" />
            </IconButton>
          </div>
          <div className="topbar-tools">
            <IconButton
              className="quiet"
              label={languageNames[alternate]}
              lang={alternate}
              onClick={() => onLanguageChange(alternate)}
            >
              <GlobeIcon aria-hidden="true" />
            </IconButton>
            <WorkFinder
              locale={locale}
              user={user}
              orders={state.orders}
              onNavigate={navigate}
              onOrder={(id, origin) =>
                openInspection(id, origin?.id ? `#${CSS.escape(origin.id)}` : '.command-launcher')
              }
            />
            <ServerSearch
              user={user}
              locale={locale}
              workers={catalog.users}
              online={online}
              today={today}
              onCache={async (order) => {
                await repo.cacheOrder(order);
                setState(await repo.read());
              }}
              onOpened={(id) => openInspection(id, '.server-search-launcher')}
            />
          </div>
        </div>
        <main id="main" tabIndex={-1} lang={locale}>
          {!order && workspaceFeedback}
          {view === 'resources' ? (
            <Resources
              catalog={catalog}
              locale={locale}
              refresh={refresh}
              online={online}
              onCatalog={updateCatalog}
              onWorkerUpdated={(account) =>
                updateCatalog((current) => ({
                  ...current,
                  users: [
                    ...current.users.filter((user) => user.id !== account.user.id),
                    ...(account.enabled ? [account.user] : []),
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                }))
              }
              onSiteUpdated={(updated) =>
                updateCatalog((current) => ({
                  ...current,
                  sites: current.sites.map((site) =>
                    site.id === updated.id ? { ...site, coordinates: updated.coordinates } : site,
                  ),
                }))
              }
              onSiteClosuresUpdated={(updated) =>
                updateCatalog((current) => ({
                  ...current,
                  sites: current.sites.map((site) =>
                    site.id === updated.id ? { ...site, closureDates: updated.closureDates } : site,
                  ),
                }))
              }
            />
          ) : view === 'outbox' ? (
            <>
              <PageHeading title={notebook.outbox} description={copy.outboxIntro} />
              <div className="outbox-list">
                {(state.outbox.length > 0 || outboxSearch || onlyBlocked) && (
                  <div className="outbox-search">
                    <SearchField
                      aria-label={notebook.searchOutbox}
                      clearLabel={notebook.clearSearch}
                      value={outboxSearch}
                      onValueChange={setOutboxSearch}
                      placeholder={notebook.searchOutboxHint}
                    />
                    <IconButton
                      label={notebook.filterBlockedReports}
                      variant="outline"
                      className="outbox-filter"
                      aria-pressed={onlyBlocked}
                      onClick={() => setOnlyBlocked((current) => !current)}
                    >
                      <WarningCircleIcon aria-hidden="true" />
                    </IconButton>
                  </div>
                )}
                {state.outbox.length === 0 ? (
                  <Empty title={notebook.upToDate} description={copy.outboxEmpty} />
                ) : queuedReports.length === 0 ? (
                  <div role="status">
                    <Empty
                      title={noBlockedReports ? notebook.noBlockedReports : notebook.noQueuedMatch}
                      description={
                        noBlockedReports
                          ? notebook.noBlockedReportsHint
                          : notebook.noQueuedMatchHint
                      }
                    />
                  </div>
                ) : (
                  queuedReports.map(({ item, order }) => (
                    <Card className="outbox-item" key={item.input.mutationId}>
                      <div className="outbox-meta">
                        {order && <span className="reference">{order.reference}</span>}
                        <span className="eyebrow outbox-status" data-state={item.state}>
                          {item.state === 'blocked' ? (
                            <WarningCircleIcon size={16} aria-hidden="true" />
                          ) : (
                            <ClockIcon size={16} aria-hidden="true" />
                          )}
                          {item.state === 'blocked' ? copy.blocked : copy.waiting}
                        </span>
                      </div>
                      <h2 id={`outbox-title-${item.input.mutationId}`}>
                        {order?.title ?? item.orderId}
                      </h2>
                      <p>{item.input.summary}</p>
                      {item.error && (item.state === 'blocked' || showPendingReportError) && (
                        <p className="error">{item.error}</p>
                      )}
                      <p className="muted">
                        {notebook.photoCount(item.input.photos.length)} · {notebook.savedAt}{' '}
                        {new Date(item.createdAt).toLocaleString(dateLocale)}
                      </p>
                      {item.state === 'pending' && order && (
                        <Button
                          id={`outbox-open-${item.input.mutationId}`}
                          className="outbox-open"
                          aria-describedby={`outbox-title-${item.input.mutationId}`}
                          variant="outline"
                          onClick={(event) =>
                            openInspection(order.id, `#${event.currentTarget.id}`)
                          }
                        >
                          <ClipboardTextIcon aria-hidden="true" />
                          {notebook.openSaved}
                        </Button>
                      )}
                      <DraftExport orderId={item.orderId} repo={repo} locale={locale} />
                      {item.state === 'blocked' && (
                        <Button
                          className="quiet outbox-recover"
                          disabled={busy || !online}
                          onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                              const latest = await client.order(item.orderId);
                              await repo.cacheOrder(latest);
                              await repo.discard(item.orderId);
                              openInspection(item.orderId);
                              setNotice((language) => workerWorkspaceCopy[language].retainedDraft);
                            } catch (error) {
                              if (
                                user.role === 'worker' &&
                                error instanceof ApiError &&
                                error.status === 401
                              ) {
                                setSessionExpired(true);
                              } else {
                                setError({
                                  kind: 'workspace',
                                  detail:
                                    error instanceof ApiError && error.status === 404
                                      ? copy.unavailableOrder
                                      : `${message(error)} ${copy.retainedReport}`,
                                });
                              }
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {copy.openLatest}
                        </Button>
                      )}
                    </Card>
                  ))
                )}
              </div>
            </>
          ) : order ? (
            <OrderDetail
              key={`${order.id}:${order.version}`}
              user={user}
              order={order}
              workers={catalog.users}
              closureDates={catalog.sites.find((site) => site.id === order.site.id)?.closureDates}
              repo={repo}
              state={state}
              online={online}
              locale={locale}
              workspaceFeedback={workspaceFeedback}
              queuedRecovery={recoveryInReport ? sessionRecovery : null}
              returnLabel={
                destination.returnView === 'outbox'
                  ? inspectionCopy[locale].backToOutbox
                  : destination.returnView === 'resources'
                    ? dispatch.backToResources
                    : undefined
              }
              onBack={closeInspection}
              onRefresh={refresh}
              onNotice={setNotice}
            />
          ) : (
            <>
              <div className="heading-row">
                <PageHeading title={user.role === 'manager' ? copy.orders : notebook.assignments} />
                {user.role === 'manager' && (
                  <ActionGroup className="assignment-actions">
                    <Button
                      id="assign-work-order"
                      className="primary"
                      aria-label={planner && plannerDay ? dispatch.assignDay : dispatch.assignLabel}
                      onClick={(event) => {
                        event.currentTarget.focus();
                        setCreating(true);
                      }}
                      disabled={
                        !online ||
                        catalog.sites.length === 0 ||
                        catalog.templates.length === 0 ||
                        !catalog.users.some((user) => user.role === 'worker')
                      }
                    >
                      <PlusIcon aria-hidden="true" />
                      {planner && plannerDay ? dispatch.assignDay : dispatch.assign}
                    </Button>
                    <SeriesOverview
                      online={online}
                      sites={catalog.sites}
                      locale={locale}
                      today={today}
                      onCache={async (order) => {
                        await repo.cacheOrder(order);
                        setState(await repo.read());
                      }}
                      onOpened={(id) => openInspection(id, '.series-overview-launcher')}
                      onReuse={setBatchToReuse}
                    />
                    <RecurringDispatch
                      userId={user.id}
                      catalog={catalog}
                      locale={locale}
                      online={online}
                      initialDueDate={planner && plannerDay ? plannerDay : undefined}
                      batchToReuse={batchToReuse}
                      onReuseDismissed={() => setBatchToReuse(null)}
                      onCreated={async (receipt) => {
                        await refresh();
                        openInspection(receipt.orders[0].id, '#assign-recurring-work');
                        const count = receipt.orders.length;
                        setNotice((language) =>
                          managerDispatchCopy[language].recurringAssigned(count),
                        );
                      }}
                    />
                  </ActionGroup>
                )}
              </div>
              <div className="ledger-summary">
                <Card>
                  <span className="summary-number">{assignedCount}</span>
                  <div>
                    <strong>{copy.inField}</strong>
                    <small className="summary-help">{copy.inFieldHelp}</small>
                  </div>
                </Card>
                <Card>
                  <span className={`summary-number${reviewCount > 0 ? ' amber' : ''}`}>
                    {reviewCount}
                  </span>
                  <div>
                    <strong>{copy.ready}</strong>
                    <small className="summary-help">{copy.readyHelp}</small>
                  </div>
                </Card>
                <div className="last-sync">
                  <span className="muted">{copy.lastSync}</span>
                  <strong>
                    {state.lastSynced
                      ? new Date(state.lastSynced).toLocaleTimeString(dateLocale, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : notebook.neverSynced}
                  </strong>
                </div>
              </div>
              <Card className="work-board">
                <div className="board-heading">
                  <SmoothTab
                    className="work-view-toggle"
                    label={copy.view}
                    value={plannerView}
                    onChange={(value) => {
                      if (value !== 'list' && value !== 'week' && value !== 'month') return;
                      if (value === plannerView) return;
                      if (plannerDay) setPlannerAnchor(plannerDay);
                      setPlannerDay('');
                      setPlannerView(value);
                    }}
                    items={[
                      { id: 'list', title: copy.list, icon: <ListDashesIcon aria-hidden="true" /> },
                      {
                        id: 'week',
                        title: copy.week,
                        label: copy.weekPlanner,
                        icon: <CalendarBlankIcon aria-hidden="true" />,
                      },
                      {
                        id: 'month',
                        title: copy.month,
                        label: copy.monthPlanner,
                        icon: <CalendarDotsIcon aria-hidden="true" />,
                      },
                    ]}
                  />
                  <Label className="search">
                    <span className="sr-only">{copy.search}</span>
                    <SearchField
                      id="workspace-order-search"
                      aria-label={copy.search}
                      clearLabel={copy.clearSearch}
                      value={search}
                      onValueChange={setSearch}
                      placeholder={copy.searchHint}
                    />
                  </Label>
                </div>
                <div className="board-filters">
                  <div className="list-toolbar" ref={statusFilterToolbar}>
                    <SmoothTab
                      className="status-filters"
                      label={copy.filter}
                      value={filter}
                      onChange={setFilter}
                      items={(
                        [
                          'ALL',
                          'OVERDUE',
                          'DUE_TODAY',
                          'NEXT_SEVEN_DAYS',
                          'URGENT',
                          'TO_DO',
                          'DRAFTS',
                          'ASSIGNED',
                          'SUBMITTED',
                          'APPROVED',
                          'CHANGES_REQUESTED',
                        ] as const
                      )
                        .filter(
                          (id) => user.role === 'worker' || (id !== 'TO_DO' && id !== 'DRAFTS'),
                        )
                        .map((id) => ({
                          id,
                          title: filterLabels[id],
                          icon:
                            id === 'DRAFTS' ? <PencilSimpleIcon aria-hidden="true" /> : undefined,
                        }))}
                    />
                    {filter !== 'ALL' && (
                      <IconButton
                        className="clear-status-filter"
                        label={copy.clearFilter}
                        variant="ghost"
                        onClick={() => {
                          setFilter('ALL');
                          statusFilterToolbar.current
                            ?.querySelector<HTMLButtonElement>('.status-filters button')
                            ?.focus();
                        }}
                      >
                        <XIcon aria-hidden="true" />
                      </IconButton>
                    )}
                    <p className="status-scroll-hint">{copy.moreStatuses}</p>
                  </div>
                  {(hasSiteClosures || closureOnly) && (
                    <Button
                      type="button"
                      variant="outline"
                      className="closure-visit-filter"
                      aria-pressed={closureOnly}
                      onClick={() => setClosureOnly((selected) => !selected)}
                    >
                      <CalendarXIcon aria-hidden="true" />
                      {dispatch.closureVisits}
                    </Button>
                  )}
                  {!planner && (
                    <DueDateRange
                      open={datesOpen}
                      locale={locale}
                      onOpenChange={setDatesOpen}
                      from={dueFrom}
                      through={dueThrough}
                      onFrom={setDueFrom}
                      onThrough={setDueThrough}
                      onClear={() => {
                        setDueFrom('');
                        setDueThrough('');
                      }}
                    />
                  )}
                </div>
                {plannerView === 'month' ? (
                  <MonthPlanner
                    locale={locale}
                    anchor={plannerAnchor}
                    today={today}
                    day={plannerDay}
                    orders={matching}
                    closedDays={closedDays}
                    onMonth={(date) => {
                      setPlannerAnchor(date);
                      setPlannerDay('');
                    }}
                    onDay={setPlannerDay}
                  />
                ) : planner ? (
                  <WeekPlanner
                    locale={locale}
                    anchor={plannerAnchor}
                    today={today}
                    day={plannerDay}
                    orders={matching}
                    closedDays={closedDays}
                    onWeek={(date) => {
                      setPlannerAnchor(date);
                      setPlannerDay('');
                    }}
                    onDay={setPlannerDay}
                  />
                ) : null}
                {planner && closedDays.size > 0 && (
                  <p id="planner-closure-description" className="planner-closure-legend">
                    <CalendarXIcon aria-hidden="true" />
                    {dispatch.plannerClosure}
                  </p>
                )}
                <div className="list-header" aria-hidden="true">
                  <span>{copy.orderSite}</span>
                  <span>{copy.assignee}</span>
                  <span>{notebook.due}</span>
                  <span>{copy.status}</span>
                </div>
                <ul className="order-list">
                  {visible.map((order) => (
                    <li key={order.id}>
                      <Button
                        variant="unstyled"
                        className="order-row"
                        id={`work-order-${order.id}`}
                        onClick={(event) =>
                          openInspection(order.id, `#${CSS.escape(event.currentTarget.id)}`)
                        }
                        aria-label={`${notebook.open} ${order.reference}: ${order.title}`}
                        aria-describedby={
                          closureVisits.has(order.id)
                            ? `closure-${order.id}`
                            : savedDrafts.has(order.id)
                              ? `draft-${order.id}`
                              : undefined
                        }
                      >
                        <div>
                          <div className="reference">
                            <span>{order.reference}</span>
                            {order.priority === 'urgent' && (
                              <span className="urgent">{notebook.urgent}</span>
                            )}
                            {queuedOrders.has(order.id) && (
                              <span className="urgent">{notebook.queued}</span>
                            )}
                            {savedDrafts.has(order.id) && (
                              <span className="draft-mark" title={draftLabel}>
                                <PencilSimpleIcon size={16} aria-hidden="true" />
                                <span id={`draft-${order.id}`} className="sr-only">
                                  {draftLabel}
                                </span>
                              </span>
                            )}
                          </div>
                          <strong className="order-title">{order.title}</strong>
                          <span className="muted site-name">{order.site.name}</span>
                        </div>
                        <span className="assignee">
                          <span className="row-label">{copy.assignee} </span>
                          {order.assignee.name}
                        </span>
                        <span className={`due${isOverdue(order, today) ? ' is-overdue' : ''}`}>
                          <span>
                            <span className="row-label">{notebook.due} </span>
                            <time dateTime={order.dueDate}>
                              {dateLabel(order.dueDate, dateLocale)}
                            </time>
                            {closureVisits.has(order.id) && (
                              <span className="closure-visit-icon" title={dispatch.siteClosed}>
                                <CalendarXIcon aria-hidden="true" />
                                <span id={`closure-${order.id}`} className="sr-only">
                                  {dispatch.siteClosed}
                                </span>
                              </span>
                            )}
                          </span>
                          {isOverdue(order, today) && (
                            <span className="overdue-label">{copy.overdue}</span>
                          )}
                        </span>
                        <Badge className={`status status-${order.status.toLowerCase()}`}>
                          {notebook.status[order.status]}
                        </Badge>
                      </Button>
                    </li>
                  ))}
                </ul>
                {visible.length === 0 && !invalidRange && (
                  <Empty
                    title={
                      !loaded
                        ? copy.loading
                        : closureOnly
                          ? dispatch.noClosureVisits
                          : planner
                            ? plannerDay
                              ? copy.noDay
                              : plannerView === 'month'
                                ? copy.noMonth
                                : copy.noWeek
                            : dueFrom || dueThrough
                              ? copy.noDate
                              : dateFilterEmpty
                                ? dateFilterEmpty.title
                                : search || filter !== 'ALL'
                                  ? copy.noMatch
                                  : copy.empty
                    }
                    description={
                      !loaded
                        ? copy.loadingHint
                        : closureOnly
                          ? dispatch.changeClosureFilters
                          : planner
                            ? copy.plannerHint(plannerView === 'month' ? 'month' : 'week')
                            : dueFrom || dueThrough
                              ? copy.dateHint
                              : dateFilterEmpty
                                ? dateFilterEmpty.description
                                : user.role === 'manager'
                                  ? dispatch.emptyHint
                                  : locale === 'id' && (search || filter !== 'ALL')
                                    ? copy.trySearch
                                    : copy.emptyHint
                    }
                  />
                )}
                <footer className="list-footer">
                  <span>{copy.orderCount(visible.length, state.orders.length)}</span>
                  <span>{copy.queuedCount(state.outbox.length)}</span>
                </footer>
                {(user.role === 'manager' || planner) && (
                  <WorkspaceExports
                    orders={visible}
                    locale={locale}
                    includeCsv={user.role === 'manager'}
                    onNotice={setNotice}
                  />
                )}
              </Card>
            </>
          )}
          {creating && (
            <CreateOrder
              catalog={catalog}
              locale={locale}
              initialDueDate={planner && plannerDay ? plannerDay : undefined}
              onClose={() => setCreating(false)}
              onCreated={async (order) => {
                setCreating(false);
                await refresh();
                openInspection(order.id, '#assign-work-order');
                const {
                  reference,
                  assignee: { name },
                } = order;
                setNotice((language) => managerDispatchCopy[language].assigned(reference, name));
              }}
            />
          )}
        </main>
        <footer className="workspace-footer" lang={locale}>
          <a href="https://github.com/tedy69/fieldwork">{copy.project}</a>
        </footer>
      </div>
    </div>
  );
}
