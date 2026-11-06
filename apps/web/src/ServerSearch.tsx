import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  OrderSearchQuerySchema,
  type OrderSearchQuery,
  type User,
  type WorkOrder,
} from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { inspectionCopy, languageTags, notebookCopy, type Locale } from '@fieldwork/strings';
import { client, labels, dateLabel, message } from './lib';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { DatabaseIcon } from '@phosphor-icons/react/dist/csr/Database';
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
import { serverSearchCopy } from './server-search-copy';
import { workerWorkspaceCopy } from './worker-workspace-copy';
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
  locale,
  workers,
  online,
  today,
  onCache,
  onOpened,
}: {
  user: User;
  locale: Locale;
  workers: User[];
  online: boolean;
  today: string;
  onCache: (order: WorkOrder) => Promise<void>;
  onOpened: (id: string) => void;
}) {
  const copy = serverSearchCopy[locale];
  const statuses = locale === 'id' ? notebookCopy.id.status : labels;
  const priorities = inspectionCopy[locale].priority;
  const dateLocale = languageTags[locale];
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
        const cursorChanged = error instanceof ApiError && error.code === 'INVALID_CURSOR';
        setInvalidCursor(cursorChanged);
        setError(locale === 'en' ? message(error) : cursorChanged ? copy.cursor : copy.failed);
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
      const issue = query.error.issues[0];
      const dates = workerWorkspaceCopy[locale].dates;
      let validation = copy.invalidFilters;
      if (issue.code === 'custom') validation = dates.invalidRange;
      else if (['dueFrom', 'dueThrough', 'overdueBefore'].includes(String(issue.path[0])))
        validation = dates.invalidDate;
      setError(locale === 'en' ? issue.message : validation);
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
      if (current === generation.current) {
        setError(locale === 'en' ? `${message(error)} ${copy.draftKept}` : copy.openFailed);
      }
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
        <IconButton
          label={copy.title}
          lang={locale}
          ref={trigger}
          className="quiet server-search-launcher"
          disabled={!online}
          tooltip={online ? copy.title : copy.connect}
        >
          <DatabaseIcon aria-hidden="true" />
        </IconButton>
      </DialogTrigger>
      <DialogContent
        size="compare"
        lang={locale}
        closeLabel={copy.close}
        className="server-search-dialog"
        aria-modal="true"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (navigated.current)
            (
              document.getElementById('inspection-title') ?? document.getElementById('main')
            )?.focus();
          else if (!trigger.current?.isConnected || trigger.current.disabled)
            document.getElementById('main')?.focus();
          else trigger.current.focus();
        }}
      >
        <DialogHeader className="server-search-heading">
          <div>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </div>
        </DialogHeader>
        <Form noValidate aria-label={copy.form} onSubmit={search}>
          <FieldSet className="server-search-fields" disabled={Boolean(opening)}>
            <Label className="server-search-text">
              {copy.query}
              <SearchField
                aria-label={copy.query}
                clearLabel={copy.clearQuery}
                inputRef={searchInput}
                maxLength={200}
                value={filters.q}
                onValueChange={(q) => change({ q })}
                placeholder={copy.placeholder}
              />
            </Label>
            <Label>
              {copy.status}
              <Select
                value={filters.status}
                onChange={(event) => change({ status: event.target.value })}
              >
                <Option value="">{copy.anyStatus}</Option>
                {Object.entries(statuses).map(([value, label]) => (
                  <Option key={value} value={value}>
                    {label}
                  </Option>
                ))}
              </Select>
            </Label>
            <Label>
              {copy.priority}
              <Select
                value={filters.priority}
                onChange={(event) => change({ priority: event.target.value })}
              >
                <Option value="">{copy.anyPriority}</Option>
                <Option value="routine">{copy.routine}</Option>
                <Option value="urgent">{copy.urgent}</Option>
              </Select>
            </Label>
            {user.role === 'manager' && (
              <Label>
                {copy.worker}
                <Select
                  value={filters.assigneeId}
                  onChange={(event) => change({ assigneeId: event.target.value })}
                >
                  <Option value="">{copy.anyWorker}</Option>
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
              {copy.from}
              <DatePicker
                calendarLabel={copy.chooseFrom}
                locale={locale}
                value={filters.dueFrom}
                onValueChange={(value) => change({ dueFrom: value })}
              />
            </Label>
            <Label>
              {copy.through}
              <DatePicker
                calendarLabel={copy.chooseThrough}
                locale={locale}
                value={filters.dueThrough}
                onValueChange={(value) => change({ dueThrough: value })}
              />
            </Label>
            <Label>
              {copy.dueState}
              <Select
                value={filters.dueState}
                onChange={(event) => change({ dueState: event.target.value })}
              >
                <Option value="">{copy.anyDate}</Option>
                <Option value="overdue">{copy.overdue}</Option>
              </Select>
            </Label>
          </FieldSet>
          <div className="server-search-actions">
            <Button className="primary" disabled={!online || busy}>
              {copy.submit}
            </Button>
            <Button
              type="button"
              className="quiet"
              disabled={Boolean(opening)}
              onClick={() => change(emptyFilters())}
            >
              {copy.clearFilters}
            </Button>
          </div>
        </Form>
        {!online && (
          <Alert role="status" className="banner notice">
            {copy.offline}
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
                {invalidCursor ? copy.restart : copy.retry}
              </Button>
            )}
          </Alert>
        )}
        {busy && (
          <p className="muted" role="status">
            {opening ? copy.opening : copy.searching}
          </p>
        )}
        {page ? (
          <>
            <p className="muted server-search-count" role="status">
              {copy.count(page.data.length, page.total)}
            </p>
            {!page.data.length && <Empty title={copy.empty} description={copy.emptyHint} />}
            <ul className="server-search-results">
              {page.data.map((order) => (
                <li key={order.id}>
                  <Button
                    variant="unstyled"
                    className="server-search-result"
                    disabled={!online || busy}
                    aria-label={copy.openOrder(order.reference, order.title)}
                    aria-describedby={`server-result-meta-${order.id}`}
                    onClick={() => void openOrder(order.id)}
                  >
                    <span className="reference">
                      {order.reference} · {priorities[order.priority]}
                    </span>
                    <strong>{order.title}</strong>
                    <span className="muted" id={`server-result-meta-${order.id}`}>
                      {order.site.name} · {order.assignee.name} · {copy.due}{' '}
                      {dateLabel(order.dueDate, dateLocale)}
                    </span>
                    <Badge className={`status status-${order.status.toLowerCase()}`}>
                      {statuses[order.status]}
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
                {copy.more}
              </Button>
            )}
          </>
        ) : (
          !busy && !error && <Empty title={copy.ready} description={copy.readyHint} />
        )}
      </DialogContent>
    </Dialog>
  );
}
