import { useEffect, useRef, useState } from 'react';
import type { ReportRevision } from '@fieldwork/contracts';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise';
import { client, dateLabel, labels, message } from './lib';
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './components/ui/table';
import { Empty } from './components';
import './report-history.css';

type HistoryPage = Awaited<ReturnType<typeof client.reportHistory>>;
const versionLabel = (revision: ReportRevision) =>
  revision.submissionVersion === null
    ? 'Saved report'
    : `Order version ${revision.submissionVersion}`;
const timeLabel = (time: string) => new Date(time).toLocaleString();

export default function ReportHistory({ orderId, online }: { orderId: string; online: boolean }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  async function load(cursor: string | undefined, requestGeneration: number) {
    setBusy(true);
    setError('');
    try {
      const next = await client.reportHistory(orderId, cursor);
      if (requestGeneration !== generation.current) return;
      setPage((previous) =>
        cursor && previous
          ? {
              ...next,
              data: [
                ...previous.data,
                ...next.data.filter(
                  (revision) =>
                    !previous.data.some(
                      (saved) => saved.snapshot.report.id === revision.snapshot.report.id,
                    ),
                ),
              ],
            }
          : next,
      );
      if (!cursor) setSelectedId(next.data[0]?.snapshot.report.id ?? '');
    } catch (error) {
      if (requestGeneration === generation.current) setError(message(error));
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    const current = ++generation.current;
    if (open) void load(undefined, current);
    else {
      setPage(null);
      setSelectedId('');
      setError('');
    }
    return () => {
      generation.current++;
    };
  }, [open, orderId]);

  const selected = page?.data.find((revision) => revision.snapshot.report.id === selectedId);
  return (
    <section className="history-launcher" aria-label="Saved submission history">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button ref={trigger} className="quiet" disabled={!online}>
            <ClockCounterClockwiseIcon aria-hidden="true" /> Report history
          </Button>
        </DialogTrigger>
        <DialogContent
          className="history-dialog"
          aria-modal="true"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!trigger.current?.isConnected || trigger.current.disabled) {
              document.getElementById('main')?.focus();
            } else trigger.current.focus();
          }}
        >
          <header className="history-heading">
            <DialogTitle ref={title} tabIndex={-1}>
              Report history
            </DialogTitle>
            <DialogDescription>
              Saved submissions and manager feedback. Viewing a report does not change your draft.
            </DialogDescription>
          </header>
          {!online && (
            <Alert role="status" className="banner notice">
              You’re offline. Loaded text stays available until you close this history. Connect to
              load more submissions or photos.
            </Alert>
          )}
          {error && (
            <Alert className="banner error">
              <p>{error}</p>
              <Button
                className="quiet"
                disabled={busy || !online}
                onClick={() => void load(page?.nextCursor ?? undefined, generation.current)}
              >
                Retry history
              </Button>
            </Alert>
          )}
          {busy && (
            <p className="muted" role="status">
              Loading report history…
            </p>
          )}
          {page && (
            <p className="muted history-count">
              Showing {page.data.length} of {page.total} saved submissions
            </p>
          )}
          {page && !page.data.length && (
            <Empty
              title="No submitted reports yet"
              description="Reports will appear here after the server confirms a submission."
            />
          )}
          {selected && page && (
            <div className="history-layout">
              <nav aria-label="Report revisions">
                <ul className="history-list">
                  {page.data.map((revision) => (
                    <li key={revision.snapshot.report.id}>
                      <Button
                        variant="unstyled"
                        className="history-choice"
                        aria-pressed={revision.snapshot.report.id === selectedId}
                        aria-label={`View report: ${versionLabel(revision)}`}
                        onClick={() => setSelectedId(revision.snapshot.report.id)}
                      >
                        <strong>{versionLabel(revision)}</strong>
                        <span>{timeLabel(revision.snapshot.report.submittedAt)}</span>
                        <span>
                          {revision.review
                            ? labels[revision.review.decision]
                            : revision.reviewStatus === 'awaiting_review'
                              ? 'Awaiting review'
                              : 'Review details unavailable'}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
                {page.nextCursor && (
                  <Button
                    className="quiet history-more"
                    disabled={busy || !online}
                    onClick={() => void load(page.nextCursor!, generation.current)}
                  >
                    Load older submissions
                  </Button>
                )}
              </nav>
              <section className="history-snapshot" aria-label="Selected saved report">
                <div className="section-heading">
                  <h3>{versionLabel(selected)}</h3>
                  <Badge className="status">Read only</Badge>
                </div>
                <p className="muted">
                  Submitted {timeLabel(selected.snapshot.report.submittedAt)} by{' '}
                  {selected.snapshot.assignee.id === selected.snapshot.report.submittedBy
                    ? selected.snapshot.assignee.name
                    : selected.snapshot.report.submittedBy}
                </p>
                {selected.source === 'saved_snapshot' && (
                  <Alert role="status" className="banner notice">
                    Recovered from the saved order. The original submission version and assignment
                    details were not retained.
                  </Alert>
                )}
                <h4>
                  {selected.snapshot.reference} / {selected.snapshot.title}
                </h4>
                <dl className="history-meta">
                  <div>
                    <dt>Site</dt>
                    <dd>
                      {selected.snapshot.site.name}
                      <small>{selected.snapshot.site.address}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {selected.source === 'submission' ? 'Due at submission' : 'Saved due date'}
                    </dt>
                    <dd>
                      {dateLabel(selected.snapshot.dueDate)} · {selected.snapshot.priority}
                    </dd>
                  </div>
                </dl>
                <h4>Field brief</h4>
                <p className="preserve-lines">
                  {selected.snapshot.instructions || 'No additional instructions.'}
                </p>
                <h4>Inspection summary</h4>
                <p className="preserve-lines">{selected.snapshot.report.summary}</p>
                <Table aria-label="Saved checklist answers">
                  <caption className="sr-only">{selected.snapshot.template.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Checklist / notes</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.snapshot.report.answers.map((answer) => (
                      <TableRow key={answer.itemId}>
                        <TableCell>
                          <strong>
                            {selected.snapshot.template.items.find(
                              (item) => item.id === answer.itemId,
                            )?.label ?? answer.itemId}
                          </strong>
                          {answer.note && <p className="preserve-lines">{answer.note}</p>}
                        </TableCell>
                        <TableCell className={answer.value === 'fail' ? 'amber' : 'muted'}>
                          {answer.value === 'fail'
                            ? 'Issue found'
                            : answer.value === 'pass'
                              ? 'Pass'
                              : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <h4>Manager review</h4>
                {selected.review ? (
                  <>
                    <p>
                      <strong>{labels[selected.review.decision]}</strong> by{' '}
                      {selected.review.reviewedBy} · {timeLabel(selected.review.reviewedAt)}
                    </p>
                    <p className="preserve-lines">{selected.review.note || 'No review note.'}</p>
                  </>
                ) : (
                  <p className="muted">
                    {selected.reviewStatus === 'awaiting_review'
                      ? 'Awaiting manager review.'
                      : 'Review details unavailable. Earlier feedback was not retained before report history was introduced.'}
                  </p>
                )}
                <h4>Photos ({selected.snapshot.report.photos.length})</h4>
                {selected.snapshot.report.photos.length > 0 ? (
                  online ? (
                    <div className="photos">
                      {selected.snapshot.report.photos.map((photo, index) => (
                        <a
                          key={photo.id}
                          href={client.photoUrl(photo.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={client.photoUrl(photo.id)}
                            alt={`Saved report photo ${index + 1}`}
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Connect to view saved report photos.</p>
                  )
                ) : (
                  <p className="muted">No photos attached.</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {!online && <p className="muted">Connect to view report history.</p>}
    </section>
  );
}
