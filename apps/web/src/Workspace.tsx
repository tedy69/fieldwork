import { Button } from './components/ui/button';
import DraftExport from './DraftExport';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import SmoothTab from './components/kokonutui/smooth-tab';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise';
import { SignOutIcon } from '@phosphor-icons/react/dist/csr/SignOut';
import { SignInIcon } from '@phosphor-icons/react/dist/csr/SignIn';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { ListDashesIcon } from '@phosphor-icons/react/dist/csr/ListDashes';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { GlobeIcon } from '@phosphor-icons/react/dist/csr/Globe';
import { IconButton } from './components/ui/icon-button';
import { SearchField } from './components/ui/search-field';
import { Label } from './components/ui/label';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { useEffect, useMemo, useState } from 'react';
import {
  compareOrdersByDueDate,
  isOpenDueBetween,
  nextSevenDaysEnd,
  type User,
  type Catalog,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { emptyState, type State } from '@fieldwork/offline';
import { languageNames, notebookCopy, type Locale } from '@fieldwork/strings';
import { repositoryFor } from './storage';
import { client, message, dateLabel } from './lib';
import { PageHeading, Empty, ActionGroup } from './components';
import Resources from './Resources';
import CreateOrder from './CreateOrderDialog';
import RecurringDispatch from './RecurringDispatch';
import SeriesOverview from './SeriesOverview';
import OrderDetail from './OrderDetail';
import { isInDueRange, isOverdue, isValidDueRange } from './dates';
import { useLocalDate } from './useLocalDate';
import ReportExport from './ReportExport';
import DueDateRange from './DueDateRange';
import WeekPlanner from './WeekPlanner';
import MonthPlanner from './MonthPlanner';
import { monthDates, weekDates } from './calendar';
import WorkFinder from './WorkFinder';
import ServerSearch from './ServerSearch';
import { workerWorkspaceCopy } from './worker-workspace-copy';

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
  const locale = user.role === 'worker' ? language : 'en';
  const alternate = locale === 'id' ? 'en' : 'id';
  const copy = workerWorkspaceCopy[locale];
  const notebook = notebookCopy[locale];
  const dateLocale = locale === 'id' ? 'id-ID' : undefined;
  const repo = useMemo(() => repositoryFor(user.id, client), [user.id]);
  const [state, setState] = useState<State>(emptyState);
  const [catalog, setCatalog] = useState<Catalog>({ users: [], sites: [], templates: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'orders' | 'outbox' | 'resources'>('orders');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueThrough, setDueThrough] = useState('');
  const [datesOpen, setDatesOpen] = useState(false);
  const today = useLocalDate();
  const [plannerView, setPlannerView] = useState<'list' | 'week' | 'month'>('list');
  const planner = plannerView !== 'list';
  const [plannerAnchor, setPlannerAnchor] = useState(today);
  const [plannerDay, setPlannerDay] = useState('');
  const invalidRange = !planner && !isValidDueRange(dueFrom, dueThrough);
  const [creating, setCreating] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState('');
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await repo.flush();
      const [first, catalog] = await Promise.all([client.orders(), client.catalog()]);
      const orders = [...first.data];
      for (let offset = first.limit; offset < first.total; offset += first.limit)
        orders.push(...(await client.orders(offset)).data);
      setCatalog(catalog);
      await repo.cacheOrders(orders);
      setSessionExpired(false);
    } catch (error) {
      if (user.role === 'worker' && error instanceof ApiError && error.status === 401) {
        setSessionExpired(true);
      } else {
        setError(error instanceof ApiError ? error.message : null);
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
        .catch((error) => setError(message(error)));
    };
    load();
    const unsubscribe = repo.subscribe(load);
    void refresh();
    const connected = () => {
      setOnline(true);
      void refresh();
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
  const order = state.orders.find((order) => order.id === selected);
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
    ...notebook.status,
  };
  const matching = state.orders.filter(
    (order) =>
      (filter === 'ALL' ||
        (filter === 'OVERDUE'
          ? isOverdue(order, today)
          : dateWindow
            ? isOpenDueBetween(order, today, windowEnd)
            : order.status === filter)) &&
      `${order.title} ${order.site.name} ${order.reference} ${order.assignee.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const period = plannerView === 'month' ? monthDates(plannerAnchor) : weekDates(plannerAnchor);
  const visible = matching.filter((order) =>
    isInDueRange(
      order.dueDate,
      planner ? plannerDay || period[0] : dueFrom,
      planner ? plannerDay || period[period.length - 1] : dueThrough,
    ),
  );
  if (planner || nextWeek) visible.sort(compareOrdersByDueDate);
  const reviewCount = state.orders.filter((order) => order.status === 'SUBMITTED').length;
  const assignedCount = state.orders.filter(
    (order) => order.status === 'ASSIGNED' || order.status === 'CHANGES_REQUESTED',
  ).length;
  useEffect(() => {
    const title =
      view === 'resources'
        ? 'Sites & checklists'
        : view === 'outbox'
          ? notebook.outbox
          : order
            ? order.reference
            : user.role === 'manager'
              ? copy.orders
              : notebook.assignments;
    document.title = `${title} · Fieldwork`;
  }, [view, order?.reference, user.role, copy.orders, notebook]);
  const sessionRecovery = sessionExpired ? (
    <Alert role="region" aria-label={notebook.syncSignIn} className="banner session-recovery">
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
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main" lang={locale}>
        {copy.skip}
      </a>
      <header className="sidebar" lang={locale}>
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <p className="workspace-label">{copy.notebook}</p>
        <nav aria-label={copy.workspace}>
          <Button
            variant="ghost"
            aria-current={view === 'orders' ? 'page' : undefined}
            className={view === 'orders' ? 'nav-active' : ''}
            onClick={() => {
              setView('orders');
              setSelected(null);
            }}
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
            onClick={() => {
              setView('outbox');
              setSelected(null);
            }}
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
              onClick={() => {
                setView('resources');
                setSelected(null);
              }}
            >
              <BuildingsIcon aria-hidden="true" />{' '}
              <span className="nav-label">Sites &amp; checklists</span>
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
            <small>{user.role === 'manager' ? 'Dispatch manager' : notebook.worker}</small>
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
      <div className="main-column">
        <div className="topbar" lang={locale}>
          <span className="workspace-context">
            {user.role === 'manager' ? 'Dispatch desk' : copy.context}
          </span>
          <div className="connection">
            <span className={online ? 'signal' : 'signal offline'} />
            <span role="status">{online ? copy.connected : copy.offline}</span>
            <IconButton
              className="quiet sync-action"
              label={busy ? notebook.syncing : notebook.sync}
              onClick={() => void refresh()}
              disabled={busy || !online}
            >
              <ArrowClockwiseIcon aria-hidden="true" />
            </IconButton>
          </div>
          <div className="topbar-tools" lang="en">
            {user.role === 'worker' && (
              <IconButton
                className="quiet"
                label={languageNames[alternate]}
                lang={alternate}
                onClick={() => onLanguageChange(alternate)}
              >
                <GlobeIcon aria-hidden="true" />
              </IconButton>
            )}
            <WorkFinder
              locale={locale}
              user={user}
              orders={state.orders}
              onNavigate={(view) => {
                setView(view);
                setSelected(null);
              }}
              onOrder={(id) => {
                setView('orders');
                setSelected(id);
              }}
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
              onOpened={(id) => {
                setView('orders');
                setSelected(id);
              }}
            />
          </div>
        </div>
        <main id="main" tabIndex={-1} lang={locale}>
          {!recoveryInReport && sessionRecovery}
          {!sessionExpired && error !== '' && (
            <Alert className="banner error">{error ?? copy.unavailable}</Alert>
          )}
          {!sessionExpired && notice && (
            <Alert role="status" className="banner notice">
              {notice}
              <IconButton label={copy.dismiss} variant="ghost" onClick={() => setNotice('')}>
                <XIcon aria-hidden="true" />
              </IconButton>
            </Alert>
          )}
          {view === 'resources' ? (
            <Resources
              catalog={catalog}
              refresh={refresh}
              online={online}
              onCatalog={setCatalog}
              onWorkerUpdated={(account) =>
                setCatalog((current) => ({
                  ...current,
                  users: [
                    ...current.users.filter((user) => user.id !== account.user.id),
                    ...(account.enabled ? [account.user] : []),
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                }))
              }
              onSiteUpdated={(updated) =>
                setCatalog((current) => ({
                  ...current,
                  sites: current.sites.map((site) =>
                    site.id === updated.id ? { ...site, coordinates: updated.coordinates } : site,
                  ),
                }))
              }
              onSiteClosuresUpdated={(updated) =>
                setCatalog((current) => ({
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
                {state.outbox.length === 0 ? (
                  <Empty title={notebook.upToDate} description={copy.outboxEmpty} />
                ) : (
                  state.outbox.map((item) => (
                    <Card className="outbox-item" key={item.input.mutationId}>
                      <span className="eyebrow">
                        {item.state === 'blocked' ? copy.blocked : copy.waiting}
                      </span>
                      <h2>
                        {state.orders.find((order) => order.id === item.orderId)?.title ??
                          item.orderId}
                      </h2>
                      <p>{item.input.summary}</p>
                      {item.error && (!sessionExpired || item.state === 'blocked') && (
                        <p className="error">{item.error}</p>
                      )}
                      <p className="muted">
                        {notebook.photoCount(item.input.photos.length)} · {notebook.savedAt}{' '}
                        {new Date(item.createdAt).toLocaleString(dateLocale)}
                      </p>
                      <DraftExport orderId={item.orderId} repo={repo} locale={locale} />
                      {item.state === 'blocked' && (
                        <Button
                          className="quiet"
                          disabled={busy || !online}
                          onClick={async () => {
                            setBusy(true);
                            setError('');
                            try {
                              const latest = await client.order(item.orderId);
                              await repo.cacheOrder(latest);
                              await repo.discard(item.orderId);
                              setSelected(item.orderId);
                              setView('orders');
                              setNotice(copy.retainedDraft);
                            } catch (error) {
                              if (
                                user.role === 'worker' &&
                                error instanceof ApiError &&
                                error.status === 401
                              ) {
                                setSessionExpired(true);
                              } else {
                                setError(
                                  error instanceof ApiError && error.status === 404
                                    ? copy.unavailableOrder
                                    : `${message(error)} ${copy.retainedReport}`,
                                );
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
              repo={repo}
              state={state}
              online={online}
              locale={locale}
              queuedRecovery={recoveryInReport ? sessionRecovery : null}
              onBack={() => setSelected(null)}
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
                      className="primary"
                      aria-label={
                        planner && plannerDay ? 'Assign for selected day' : 'Assign work order'
                      }
                      onClick={() => setCreating(true)}
                      disabled={
                        !online ||
                        catalog.sites.length === 0 ||
                        catalog.templates.length === 0 ||
                        !catalog.users.some((user) => user.role === 'worker')
                      }
                    >
                      <PlusIcon aria-hidden="true" />
                      {planner && plannerDay ? 'Assign for selected day' : 'Assign work'}
                    </Button>
                    <SeriesOverview
                      online={online}
                      today={today}
                      onCache={async (order) => {
                        await repo.cacheOrder(order);
                        setState(await repo.read());
                      }}
                      onOpened={(id) => setSelected(id)}
                    />
                    <RecurringDispatch
                      userId={user.id}
                      catalog={catalog}
                      online={online}
                      initialDueDate={planner && plannerDay ? plannerDay : undefined}
                      onCreated={async (receipt) => {
                        await refresh();
                        setSelected(receipt.orders[0].id);
                        setNotice(`${receipt.orders.length} recurring work orders confirmed.`);
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
                      ? new Date(state.lastSynced).toLocaleTimeString(dateLocale ?? [], {
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
                      aria-label={copy.search}
                      clearLabel={copy.clearSearch}
                      value={search}
                      onValueChange={setSearch}
                      placeholder={copy.searchHint}
                    />
                  </Label>
                </div>
                <div className="board-filters">
                  <div className="list-toolbar">
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
                          'ASSIGNED',
                          'SUBMITTED',
                          'APPROVED',
                          'CHANGES_REQUESTED',
                        ] as const
                      ).map((id) => ({ id, title: filterLabels[id] }))}
                    />
                    <p className="status-scroll-hint">{copy.moreStatuses}</p>
                  </div>
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
                    onWeek={(date) => {
                      setPlannerAnchor(date);
                      setPlannerDay('');
                    }}
                    onDay={setPlannerDay}
                  />
                ) : null}
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
                        onClick={() => setSelected(order.id)}
                        aria-label={`${notebook.open} ${order.reference}: ${order.title}`}
                      >
                        <div>
                          <div className="reference">
                            <span>{order.reference}</span>
                            {order.priority === 'urgent' && (
                              <span className="urgent">{notebook.urgent}</span>
                            )}
                            {state.outbox.some((item) => item.orderId === order.id) && (
                              <span className="urgent">{notebook.queued}</span>
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
                        : planner
                          ? copy.plannerHint(plannerView === 'month' ? 'month' : 'week')
                          : dueFrom || dueThrough
                            ? copy.dateHint
                            : dateFilterEmpty
                              ? dateFilterEmpty.description
                              : user.role === 'manager'
                                ? 'Assign a work order to start the first inspection.'
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
                {user.role === 'manager' && <ReportExport orders={visible} onNotice={setNotice} />}
              </Card>
            </>
          )}
          {creating && (
            <CreateOrder
              catalog={catalog}
              initialDueDate={planner && plannerDay ? plannerDay : undefined}
              onClose={() => setCreating(false)}
              onCreated={async (order) => {
                setCreating(false);
                await refresh();
                setSelected(order.id);
                setNotice(`${order.reference} assigned to ${order.assignee.name}.`);
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
