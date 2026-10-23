import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import SmoothTab from './components/kokonutui/smooth-tab';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { TrayIcon } from '@phosphor-icons/react/dist/csr/Tray';
import { BuildingsIcon } from '@phosphor-icons/react/dist/csr/Buildings';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import { useEffect, useMemo, useState } from 'react';
import { type User, type Catalog } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { emptyState, type State } from '@fieldwork/offline';
import { repositoryFor } from './storage';
import { client, labels, message, dateLabel } from './lib';
import { PageHeading, Empty } from './components';
import Resources from './Resources';
import CreateOrder from './CreateOrderDialog';
import RecurringDispatch from './RecurringDispatch';
import SeriesOverview from './SeriesOverview';
import OrderDetail from './OrderDetail';
import { isInDueRange, isOverdue } from './dates';
import { useLocalDate } from './useLocalDate';
import ReportExport from './ReportExport';
import DueDateRange from './DueDateRange';
import WeekPlanner from './WeekPlanner';
import MonthPlanner from './MonthPlanner';
import { monthDates, weekDates } from './calendar';
import WorkFinder from './WorkFinder';
import ServerSearch from './ServerSearch';
export default function Workspace({ user, logout }: { user: User; logout: () => void }) {
  const repo = useMemo(() => repositoryFor(user.id, client), [user.id]);
  const [state, setState] = useState<State>(emptyState);
  const [catalog, setCatalog] = useState<Catalog>({ users: [], sites: [], templates: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'orders' | 'outbox' | 'resources'>('orders');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueThrough, setDueThrough] = useState('');
  const today = useLocalDate();
  const [plannerView, setPlannerView] = useState<'list' | 'week' | 'month'>('list');
  const planner = plannerView !== 'list';
  const [plannerAnchor, setPlannerAnchor] = useState(today);
  const [plannerDay, setPlannerDay] = useState('');
  const invalidRange = !planner && Boolean(dueFrom && dueThrough && dueFrom > dueThrough);
  const [creating, setCreating] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
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
    } catch (error) {
      setError(
        error instanceof ApiError
          ? error.message
          : 'Server unavailable. Saved work is still available on this device.',
      );
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
        title: 'No matching overdue work orders',
        description: 'Try another order, site, or person.',
      }
    : {
        title: 'No overdue work orders',
        description:
          'Unfinished work appears here after its due date, based on this device’s local date.',
      };
  const matching = state.orders.filter(
    (order) =>
      (filter === 'ALL' ||
        (filter === 'OVERDUE' ? isOverdue(order, today) : order.status === filter)) &&
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
  if (planner)
    visible.sort(
      (a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference),
    );
  const reviewCount = state.orders.filter((order) => order.status === 'SUBMITTED').length;
  const assignedCount = state.orders.filter(
    (order) => order.status === 'ASSIGNED' || order.status === 'CHANGES_REQUESTED',
  ).length;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to work orders
      </a>
      <aside className="sidebar">
        <div className="brand">
          Fieldwork<span className="version">v0.1</span>
        </div>
        <p className="workspace-label">OPERATIONS NOTEBOOK</p>
        <nav aria-label="Workspace">
          <Button
            variant="ghost"
            className={view === 'orders' ? 'nav-active' : ''}
            onClick={() => {
              setView('orders');
              setSelected(null);
            }}
          >
            <ClipboardTextIcon aria-hidden="true" /> Work orders <span>{state.orders.length}</span>
          </Button>
          <Button
            variant="ghost"
            className={view === 'outbox' ? 'nav-active' : ''}
            onClick={() => {
              setView('outbox');
              setSelected(null);
            }}
          >
            <TrayIcon aria-hidden="true" /> Sync outbox <span>{state.outbox.length}</span>
          </Button>
          {user.role === 'manager' && (
            <Button
              variant="ghost"
              className={view === 'resources' ? 'nav-active' : ''}
              onClick={() => {
                setView('resources');
                setSelected(null);
              }}
            >
              <BuildingsIcon aria-hidden="true" /> Sites &amp; checklists
            </Button>
          )}
        </nav>
        <div className="sidebar-note">
          <strong>Built for the field.</strong>
          <p>
            Open an assigned order while connected. Checklists, notes, and photos stay on this
            device until they sync.
          </p>
          <a href="https://github.com/tedy69/fieldwork/blob/main/CONTRIBUTING.md">
            Contribute to Fieldwork ↗
          </a>
        </div>
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
            <small>{user.role === 'manager' ? 'Dispatch manager' : 'Field worker'}</small>
          </div>
          <Button
            className="text-button"
            onClick={logout}
            title="Drafts stay on this device for your next sign-in"
          >
            Sign out
          </Button>
        </Card>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{' '}
            {user.role === 'manager' ? 'Dispatch desk' : 'Field notebook'}
          </span>
          <div className="connection">
            <span className={online ? 'signal' : 'signal offline'} />
            <span role="status">{online ? 'Connected' : 'Working offline'}</span>
            <Button className="quiet" onClick={() => void refresh()} disabled={busy || !online}>
              {busy ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>
          <WorkFinder
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
        </header>
        <main id="main" tabIndex={-1}>
          {error && <Alert className="banner error">{error}</Alert>}
          {notice && (
            <Alert role="status" className="banner notice">
              {notice}
              <Button className="text-button" onClick={() => setNotice('')}>
                Dismiss
              </Button>
            </Alert>
          )}
          {view === 'resources' ? (
            <Resources
              catalog={catalog}
              refresh={refresh}
              online={online}
              onSiteUpdated={(updated) =>
                setCatalog((current) => ({
                  ...current,
                  sites: current.sites.map((site) => (site.id === updated.id ? updated : site)),
                }))
              }
            />
          ) : view === 'outbox' ? (
            <>
              <PageHeading
                eyebrow="DEVICE STORAGE"
                title="Sync outbox"
                description="Queued reports stay here until the server confirms receipt."
              />
              <div className="outbox-list">
                {state.outbox.length === 0 ? (
                  <Empty
                    title="Everything is up to date"
                    description="Completed reports will appear here when they are waiting to sync."
                  />
                ) : (
                  state.outbox.map((item) => (
                    <Card className="outbox-item" key={item.input.mutationId}>
                      <span className="eyebrow">
                        {item.state === 'blocked' ? 'NEEDS YOUR ATTENTION' : 'WAITING TO SYNC'}
                      </span>
                      <h2>
                        {state.orders.find((order) => order.id === item.orderId)?.title ??
                          item.orderId}
                      </h2>
                      <p>{item.input.summary}</p>
                      {item.error && <p className="error">{item.error}</p>}
                      <p className="muted">
                        {item.input.photos.length} photos · Saved{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
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
                              setNotice(
                                'Your draft is kept. Check the latest order before submitting it again.',
                              );
                            } catch (error) {
                              setError(
                                error instanceof ApiError && error.status === 404
                                  ? 'This assignment is no longer available to your account. Your queued report is kept on this device. Contact your manager before trying again.'
                                  : `${message(error)} Your queued report is kept on this device.`,
                              );
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Keep draft and open latest order
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
              onBack={() => setSelected(null)}
              onRefresh={refresh}
              onNotice={setNotice}
            />
          ) : (
            <>
              <div className="heading-row">
                <PageHeading
                  eyebrow={user.role === 'manager' ? 'DISPATCH DESK' : 'YOUR FIELD NOTEBOOK'}
                  title={user.role === 'manager' ? 'Work orders' : 'My assignments'}
                  description={
                    user.role === 'manager'
                      ? 'Plan the work. Keep the field connected.'
                      : 'Your instructions, inspections, and reports. Available on site.'
                  }
                />
                {user.role === 'manager' && (
                  <div className="assignment-actions">
                    <SeriesOverview
                      online={online}
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
                    <Button
                      className="primary"
                      onClick={() => setCreating(true)}
                      disabled={
                        !online ||
                        catalog.sites.length === 0 ||
                        catalog.templates.length === 0 ||
                        !catalog.users.some((user) => user.role === 'worker')
                      }
                    >
                      {planner && plannerDay ? '+ Assign for selected day' : '+ Assign work order'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="ledger-summary">
                <Card>
                  <span className="summary-number">
                    {assignedCount.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <strong>In the field</strong>
                    <small>Assigned &amp; changes requested</small>
                  </div>
                </Card>
                <Card>
                  <span className="summary-number amber">
                    {reviewCount.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <strong>Ready for review</strong>
                    <small>Submitted inspection reports</small>
                  </div>
                </Card>
                <div className="last-sync">
                  <span className="eyebrow">LAST SYNC</span>
                  <strong>
                    {state.lastSynced
                      ? new Date(state.lastSynced).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Not yet synced'}
                  </strong>
                </div>
              </div>
              <SmoothTab
                className="work-view-toggle"
                label="Work order view"
                value={plannerView}
                onChange={(value) => {
                  if (value !== 'list' && value !== 'week' && value !== 'month') return;
                  if (value === plannerView) return;
                  if (plannerDay) setPlannerAnchor(plannerDay);
                  setPlannerDay('');
                  setPlannerView(value);
                }}
                items={[
                  { id: 'list', title: 'List' },
                  { id: 'week', title: 'Week planner' },
                  { id: 'month', title: 'Month planner' },
                ]}
              />
              <div className="list-toolbar">
                <SmoothTab
                  label="Filter work orders"
                  value={filter}
                  onChange={setFilter}
                  items={[
                    'ALL',
                    'OVERDUE',
                    'ASSIGNED',
                    'SUBMITTED',
                    'APPROVED',
                    'CHANGES_REQUESTED',
                  ].map((status) => ({
                    id: status,
                    title:
                      status === 'ALL'
                        ? 'All orders'
                        : status === 'OVERDUE'
                          ? 'Overdue'
                          : labels[status],
                  }))}
                />
                <Label className="search">
                  <span className="sr-only">Search work orders</span>
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search orders, sites, people…"
                    type="search"
                  />
                </Label>
              </div>
              {plannerView === 'month' ? (
                <MonthPlanner
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
              ) : (
                <DueDateRange
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
              {user.role === 'manager' && <ReportExport orders={visible} onNotice={setNotice} />}
              <div className="list-header" aria-hidden="true">
                <span>WORK ORDER / SITE</span>
                <span>ASSIGNED TO</span>
                <span>DUE</span>
                <span>STATUS</span>
              </div>
              <ul className="order-list">
                {visible.map((order) => (
                  <li key={order.id}>
                    <Button
                      variant="unstyled"
                      className="order-row"
                      onClick={() => setSelected(order.id)}
                      aria-label={`Open ${order.reference}: ${order.title}`}
                    >
                      <div>
                        <div className="reference">
                          <span>{order.reference}</span>
                          {order.priority === 'urgent' && <span className="urgent">URGENT</span>}
                          {state.outbox.some((item) => item.orderId === order.id) && (
                            <span className="urgent">QUEUED</span>
                          )}
                        </div>
                        <strong className="order-title">{order.title}</strong>
                        <span className="muted site-name">{order.site.name}</span>
                      </div>
                      <span className="assignee">{order.assignee.name}</span>
                      <span className="due">{dateLabel(order.dueDate)}</span>
                      <Badge className={`status status-${order.status.toLowerCase()}`}>
                        {labels[order.status]}
                      </Badge>
                    </Button>
                  </li>
                ))}
              </ul>
              {visible.length === 0 && !invalidRange && (
                <Empty
                  title={
                    !loaded
                      ? 'Loading your workspace…'
                      : planner
                        ? plannerDay
                          ? 'No work orders for this day'
                          : plannerView === 'month'
                            ? 'No work orders this month'
                            : 'No work orders this week'
                        : dueFrom || dueThrough
                          ? 'No work orders in this date range'
                          : filter === 'OVERDUE'
                            ? overdueEmpty.title
                            : search || filter !== 'ALL'
                              ? 'No matching work orders'
                              : 'A clean page'
                  }
                  description={
                    !loaded
                      ? 'Checking for saved assignments and recent changes.'
                      : planner
                        ? `Choose another day or ${plannerView === 'month' ? 'month' : 'week'}, or adjust your search and status filter.`
                        : dueFrom || dueThrough
                          ? 'Change or clear the dates, or adjust your search and status filter.'
                          : filter === 'OVERDUE'
                            ? overdueEmpty.description
                            : user.role === 'manager'
                              ? 'Assign a work order to start the first inspection.'
                              : 'Your manager will assign work here. Sync to check for new jobs.'
                  }
                />
              )}
              <footer className="list-footer">
                <span>
                  {visible.length} of {state.orders.length} work orders
                </span>
                <span>Saved on this device · {state.outbox.length} queued</span>
              </footer>
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
      </div>
    </div>
  );
}
