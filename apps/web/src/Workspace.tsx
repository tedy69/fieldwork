import { useEffect, useMemo, useState } from 'react';
import { type User, type Catalog } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { emptyState, type State } from '@fieldwork/offline';
import { repositoryFor } from './storage';
import { client, labels, message, dateLabel } from './lib';
import { PageHeading, Empty } from './components';
import Resources from './Resources';
import CreateOrder from './CreateOrderDialog';
import OrderDetail from './OrderDetail';
import { isInDueRange, isOverdue } from './dates';
import { useLocalDate } from './useLocalDate';
import ReportExport from './ReportExport';
import DueDateRange from './DueDateRange';
import WeekPlanner from './WeekPlanner';
import { weekDates } from './calendar';
import WorkFinder from './WorkFinder';
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
  const [planner, setPlanner] = useState(false);
  const [plannerWeek, setPlannerWeek] = useState(today);
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
  const week = weekDates(plannerWeek);
  const visible = matching.filter((order) =>
    isInDueRange(
      order.dueDate,
      planner ? plannerDay || week[0] : dueFrom,
      planner ? plannerDay || week[6] : dueThrough,
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
          <button
            className={view === 'orders' ? 'nav-active' : ''}
            onClick={() => {
              setView('orders');
              setSelected(null);
            }}
          >
            Work orders <span>{state.orders.length}</span>
          </button>
          <button
            className={view === 'outbox' ? 'nav-active' : ''}
            onClick={() => {
              setView('outbox');
              setSelected(null);
            }}
          >
            Sync outbox <span>{state.outbox.length}</span>
          </button>
          {user.role === 'manager' && (
            <button
              className={view === 'resources' ? 'nav-active' : ''}
              onClick={() => {
                setView('resources');
                setSelected(null);
              }}
            >
              Sites &amp; checklists
            </button>
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
        <div className="identity">
          <span className="avatar" aria-hidden="true">
            {user.name
              .split(' ')
              .map((name) => name[0])
              .join('')
              .slice(0, 2)}
          </span>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role === 'manager' ? 'Dispatch manager' : 'Field worker'}</small>
          </div>
          <button
            className="text-button"
            onClick={logout}
            title="Drafts stay on this device for your next sign-in"
          >
            Sign out
          </button>
        </div>
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
            <button className="quiet" onClick={() => void refresh()} disabled={busy || !online}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
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
        </header>
        <main id="main" tabIndex={-1}>
          {error && (
            <div role="alert" className="banner error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="banner notice">
              {notice}
              <button className="text-button" onClick={() => setNotice('')}>
                Dismiss
              </button>
            </div>
          )}
          {view === 'resources' ? (
            <Resources catalog={catalog} refresh={refresh} />
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
                    <section className="outbox-item" key={item.input.mutationId}>
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
                        <button
                          className="quiet"
                          onClick={async () => {
                            await repo.discard(item.orderId);
                            setSelected(item.orderId);
                            setView('orders');
                            await refresh();
                            setNotice(
                              'Your draft is kept. Check the latest order before submitting it again.',
                            );
                          }}
                        >
                          Keep draft and open latest order
                        </button>
                      )}
                    </section>
                  ))
                )}
              </div>
            </>
          ) : order ? (
            <OrderDetail
              key={`${order.id}:${order.version}`}
              user={user}
              order={order}
              repo={repo}
              state={state}
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
                  <button
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
                  </button>
                )}
              </div>
              <div className="ledger-summary">
                <div>
                  <span className="summary-number">
                    {assignedCount.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <strong>In the field</strong>
                    <small>Assigned &amp; changes requested</small>
                  </div>
                </div>
                <div>
                  <span className="summary-number amber">
                    {reviewCount.toString().padStart(2, '0')}
                  </span>
                  <div>
                    <strong>Ready for review</strong>
                    <small>Submitted inspection reports</small>
                  </div>
                </div>
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
              <div className="work-view-switch" role="group" aria-label="Work order view">
                <button
                  className={!planner ? 'tab active' : 'tab'}
                  aria-pressed={!planner}
                  onClick={() => setPlanner(false)}
                >
                  List
                </button>
                <button
                  className={planner ? 'tab active' : 'tab'}
                  aria-pressed={planner}
                  onClick={() => setPlanner(true)}
                >
                  Week planner
                </button>
              </div>
              <div className="list-toolbar">
                <div className="tabs" aria-label="Filter work orders">
                  {['ALL', 'OVERDUE', 'ASSIGNED', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'].map(
                    (status) => (
                      <button
                        key={status}
                        aria-pressed={filter === status}
                        className={filter === status ? 'tab active' : 'tab'}
                        onClick={() => setFilter(status)}
                      >
                        {status === 'ALL'
                          ? 'All orders'
                          : status === 'OVERDUE'
                            ? 'Overdue'
                            : labels[status]}
                      </button>
                    ),
                  )}
                </div>
                <label className="search">
                  <span className="sr-only">Search work orders</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search orders, sites, people…"
                    type="search"
                  />
                </label>
              </div>
              {planner ? (
                <WeekPlanner
                  anchor={plannerWeek}
                  today={today}
                  day={plannerDay}
                  orders={matching}
                  onWeek={(date) => {
                    setPlannerWeek(date);
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
                    <button
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
                      <span className={`status status-${order.status.toLowerCase()}`}>
                        {labels[order.status]}
                      </span>
                    </button>
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
                        ? 'Choose another day or week, or adjust your search and status filter.'
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
