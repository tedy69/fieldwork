import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  OrderSearchQuerySchema,
  type OrderSearchQuery,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { client, labels, dateLabel, message } from './lib';
import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import { SearchField } from './components/ui/search-field';
import { DatePicker } from './components/ui/date-picker';
import { Label } from './components/ui/label';
import { FieldSet } from './components/ui/field';
import {
  NativeSelect as Select,
  NativeSelectOption as Option,
} from './components/ui/native-select';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { Empty } from './components';
import './server-search.css';

const emptyFilters = () => ({
  q: '',
  status: '',
  assigneeId: '',
  priority: '',
  dueFrom: '',
  dueThrough: '',
  dueState: '',
});
type Filters = ReturnType<typeof emptyFilters>;
type Page = Awaited<ReturnType<typeof client.searchOrders>>;

export default function ServerSearch({
  user,
  workers,
  online,
  today,
  onCache,
  onOpened,
}: {
  user: User;
  workers: User[];
  online: boolean;
  today: string;
  onCache: (order: WorkOrder) => Promise<void>;
  onOpened: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState<Page | null>(null);
  const [applied, setApplied] = useState<OrderSearchQuery | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState('');
  const [error, setError] = useState('');
  const [invalidCursor, setInvalidCursor] = useState(false);
  const generation = useRef(0);
  const attempt = useRef<{ query: OrderSearchQuery; append: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const navigated = useRef(false);

  function changeOpen(next: boolean) {
    generation.current++;
    if (next) navigated.current = false;
    setOpen(next);
  }
  async function load(query: OrderSearchQuery, append = false) {
    const current = ++generation.current;
    attempt.current = { query, append };
    if (!append) {
      setPage(null);
      setApplied(null);
    }
    setBusy(true);
    setError('');
    setInvalidCursor(false);
    try {
      const next = await client.searchOrders(query);
      if (current !== generation.current) return;
      setPage((previous) =>
        append && previous
          ? {
              ...next,
              data: [
                ...previous.data,
                ...next.data.filter(
                  (order) => !previous.data.some((saved) => saved.id === order.id),
                ),
              ],
            }
          : next,
      );
      setApplied({ ...query, cursor: undefined });
    } catch (error) {
      if (current === generation.current) {
        setError(message(error));
        setInvalidCursor(error instanceof ApiError && error.code === 'INVALID_CURSOR');
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    setFilters(emptyFilters());
    setPage(null);
    setApplied(null);
    setError('');
    setOpening('');
    if (open) void load({ limit: 25 });
    else {
      generation.current++;
      setBusy(false);
      attempt.current = null;
    }
    return () => {
      generation.current++;
    };
  }, [open]);
  function change(patch: Partial<Filters>) {
    generation.current++;
    setFilters((previous) => ({ ...previous, ...patch }));
    setPage(null);
    setApplied(null);
    setError('');
    setBusy(false);
    setInvalidCursor(false);
    attempt.current = null;
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (!online || busy) return;
    const query = OrderSearchQuerySchema.safeParse({
      q: filters.q,
      status: filters.status || undefined,
      assigneeId: filters.assigneeId || undefined,
      priority: filters.priority || undefined,
      dueFrom: filters.dueFrom || undefined,
      dueThrough: filters.dueThrough || undefined,
      overdueBefore: filters.dueState ? today : undefined,
      limit: 25,
    });
    if (!query.success) {
      attempt.current = null;
      setError(query.error.issues[0].message);
      return;
    }
    void load(query.data);
  }
  async function openOrder(id: string) {
    if (!online || busy) return;
    const current = ++generation.current;
    attempt.current = null;
    setOpening(id);
    setBusy(true);
    setError('');
    setInvalidCursor(false);
    try {
      const order = await client.order(id);
      if (current !== generation.current) return;
      await onCache(order);
      if (current !== generation.current) return;
      navigated.current = true;
      changeOpen(false);
      onOpened(order.id);
    } catch (error) {
      if (current === generation.current) setError(`${message(error)} Your current draft is kept.`);
    } finally {
      if (current === generation.current) {
        setBusy(false);
        setOpening('');
      }
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          ref={trigger}
          className="quiet server-search-launcher"
          disabled={!online}
          title={
            !online
              ? 'Connect to search the server. Saved work is available in Find work.'
              : undefined
          }
        >
          Search server
        </Button>
      </DialogTrigger>
      <DialogContent
        size="compare"
        className="server-search-dialog"
        aria-modal="true"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (navigated.current || !trigger.current?.isConnected || trigger.current.disabled)
            document.getElementById('main')?.focus();
          else trigger.current.focus();
        }}
      >
        <DialogHeader className="server-search-heading">
          <div>
            <DialogTitle>Search server</DialogTitle>
            <DialogDescription>
              Find current records online. Opening a result saves that order on this device. Your
              drafts and saved filters stay intact.
            </DialogDescription>
          </div>
        </DialogHeader>
        <Form noValidate aria-label="Search server records" onSubmit={search}>
          <FieldSet className="server-search-fields" disabled={Boolean(opening)}>
            <Label className="server-search-text">
              Search text
              <SearchField
                aria-label="Search text"
                inputRef={searchInput}
                maxLength={200}
                value={filters.q}
                onValueChange={(q) => change({ q })}
                placeholder="Order, reference, site, or person"
              />
            </Label>
            <Label>
              Status
              <Select
                value={filters.status}
                onChange={(event) => change({ status: event.target.value })}
              >
                <Option value="">All statuses</Option>
                {Object.entries(labels).map(([value, label]) => (
                  <Option key={value} value={value}>
                    {label}
                  </Option>
                ))}
              </Select>
            </Label>
            <Label>
              Priority
              <Select
                value={filters.priority}
                onChange={(event) => change({ priority: event.target.value })}
              >
                <Option value="">All priorities</Option>
                <Option value="routine">Routine</Option>
                <Option value="urgent">Urgent</Option>
              </Select>
            </Label>
            {user.role === 'manager' && (
              <Label>
                Field worker
                <Select
                  value={filters.assigneeId}
                  onChange={(event) => change({ assigneeId: event.target.value })}
                >
                  <Option value="">All field workers</Option>
                  {workers
                    .filter((worker) => worker.role === 'worker')
                    .map((worker) => (
                      <Option key={worker.id} value={worker.id}>
                        {worker.name}
                      </Option>
                    ))}
                </Select>
              </Label>
            )}
            <Label>
              Server due from
              <DatePicker
                calendarLabel="Choose server due from"
                value={filters.dueFrom}
                onValueChange={(value) => change({ dueFrom: value })}
              />
            </Label>
            <Label>
              Server due through
              <DatePicker
                calendarLabel="Choose server due through"
                value={filters.dueThrough}
                onValueChange={(value) => change({ dueThrough: value })}
              />
            </Label>
            <Label>
              Due state
              <Select
                value={filters.dueState}
                onChange={(event) => change({ dueState: event.target.value })}
              >
                <Option value="">All due dates</Option>
                <Option value="overdue">Overdue before today</Option>
              </Select>
            </Label>
          </FieldSet>
          <div className="server-search-actions">
            <Button className="primary" disabled={!online || busy}>
              Search records
            </Button>
            <Button
              type="button"
              className="quiet"
              disabled={Boolean(opening)}
              onClick={() => change(emptyFilters())}
            >
              Clear filters
            </Button>
          </div>
        </Form>
        {!online && (
          <Alert role="status" className="banner notice">
            You’re offline. Loaded results stay visible. Connect to search or open an order; saved
            work is available in the notebook.
          </Alert>
        )}
        {error && (
          <Alert className="banner error">
            <p>{error}</p>
            {attempt.current && (
              <Button
                className="quiet"
                disabled={!online || busy}
                onClick={() =>
                  void load(
                    invalidCursor
                      ? { ...attempt.current!.query, cursor: undefined }
                      : attempt.current!.query,
                    invalidCursor ? false : attempt.current!.append,
                  )
                }
              >
                {invalidCursor ? 'Start new search' : 'Retry search'}
              </Button>
            )}
          </Alert>
        )}
        {busy && (
          <p className="muted" role="status">
            {opening ? 'Opening current order…' : 'Searching server…'}
          </p>
        )}
        {page ? (
          <>
            <p className="muted server-search-count" role="status">
              {page.data.length} loaded · {page.total} matching on server
            </p>
            {!page.data.length && (
              <Empty
                title="No matching server records"
                description="Try different text, dates, or filters."
              />
            )}
            <ul className="server-search-results">
              {page.data.map((order) => (
                <li key={order.id}>
                  <Button
                    variant="unstyled"
                    className="server-search-result"
                    disabled={!online || busy}
                    aria-label={`Open server order ${order.reference}: ${order.title}`}
                    aria-describedby={`server-result-meta-${order.id}`}
                    onClick={() => void openOrder(order.id)}
                  >
                    <span className="reference">
                      {order.reference} · {order.priority}
                    </span>
                    <strong>{order.title}</strong>
                    <span className="muted" id={`server-result-meta-${order.id}`}>
                      {order.site.name} · {order.assignee.name} · Due {dateLabel(order.dueDate)}
                    </span>
                    <Badge className={`status status-${order.status.toLowerCase()}`}>
                      {labels[order.status]}
                    </Badge>
                  </Button>
                </li>
              ))}
            </ul>
            {page.nextCursor && (
              <Button
                className="quiet server-search-more"
                disabled={!online || busy}
                onClick={() => void load({ ...applied!, cursor: page.nextCursor! }, true)}
              >
                Load more results
              </Button>
            )}
          </>
        ) : (
          !busy &&
          !error && (
            <Empty
              title="Ready to search"
              description="Choose filters and select Search records."
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
