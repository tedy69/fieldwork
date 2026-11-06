import { useEffect, useRef, useState } from 'react';
import { type ReportRevision, answerLabel, reportItemLabel } from '@fieldwork/contracts';
import { inspectionCopy, languageTags, notebookCopy, type Locale } from '@fieldwork/strings';
import { ClockCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ClockCounterClockwise';
import { client, dateLabel, message } from './lib';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Badge } from './components/ui/badge';
import { Alert } from './components/ui/alert';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
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
import { workerReportCopy } from './worker-report-copy';
import './report-history.css';

type HistoryPage = Awaited<ReturnType<typeof client.reportHistory>>;
export default function ReportHistory({
  orderId,
  online,
  locale = 'en',
}: {
  orderId: string;
  online: boolean;
  locale?: Locale;
}) {
  const report = workerReportCopy[locale];
  const copy = report.history;
  const inspection = inspectionCopy[locale];
  const status = notebookCopy[locale].status;
  const dateLocale = languageTags[locale];
  const timeLabel = (time: string) => new Date(time).toLocaleString(dateLocale);
  const versionLabel = (revision: ReportRevision) =>
    revision.submissionVersion === null ? copy.saved : copy.version(revision.submissionVersion);
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
    <section className="history-launcher" aria-label={copy.section} lang={locale}>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <IconButton label={copy.title} ref={trigger} className="quiet" disabled={!online}>
            <ClockCounterClockwiseIcon aria-hidden="true" />
          </IconButton>
        </DialogTrigger>
        <DialogContent
          size="compare"
          className="history-dialog"
          aria-modal="true"
          lang={locale}
          closeLabel={copy.close}
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
          <DialogHeader className="history-heading">
            <div>
              <DialogTitle ref={title} tabIndex={-1}>
                {copy.title}
              </DialogTitle>
              <DialogDescription>{copy.intro}</DialogDescription>
            </div>
          </DialogHeader>
          {!online && (
            <Alert role="status" className="banner notice">
              {copy.offline}
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
                {copy.retry}
              </Button>
            </Alert>
          )}
          {busy && (
            <p className="muted" role="status">
              {copy.loading}
            </p>
          )}
          {page && (
            <p className="muted history-count">{copy.count(page.data.length, page.total)}</p>
          )}
          {page && !page.data.length && <Empty title={copy.empty} description={copy.emptyHint} />}
          {selected && page && (
            <div className="history-layout">
              <nav aria-label={copy.revisions}>
                <ul className="history-list">
                  {page.data.map((revision) => (
                    <li key={revision.snapshot.report.id}>
                      <Button
                        variant="unstyled"
                        className="history-choice"
                        aria-pressed={revision.snapshot.report.id === selectedId}
                        aria-label={copy.view(versionLabel(revision))}
                        onClick={() => setSelectedId(revision.snapshot.report.id)}
                      >
                        <strong>{versionLabel(revision)}</strong>
                        <span>{timeLabel(revision.snapshot.report.submittedAt)}</span>
                        <span>
                          {revision.review
                            ? status[revision.review.decision]
                            : revision.reviewStatus === 'awaiting_review'
                              ? copy.awaiting
                              : copy.missingReview}
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
                    {copy.older}
                  </Button>
                )}
              </nav>
              <section className="history-snapshot" aria-label={copy.selected}>
                <div className="section-heading">
                  <h3>{versionLabel(selected)}</h3>
                  <Badge className="status">{copy.readOnly}</Badge>
                </div>
                <p className="muted">
                  {inspection.submitted} {timeLabel(selected.snapshot.report.submittedAt)}{' '}
                  {report.by}{' '}
                  {selected.snapshot.assignee.id === selected.snapshot.report.submittedBy
                    ? selected.snapshot.assignee.name
                    : selected.snapshot.report.submittedBy}
                </p>
                {selected.source === 'saved_snapshot' && (
                  <Alert role="status" className="banner notice">
                    {copy.legacy}
                  </Alert>
                )}
                <h4>
                  {selected.snapshot.reference} / {selected.snapshot.title}
                </h4>
                <dl className="history-meta">
                  <div>
                    <dt>{inspection.site}</dt>
                    <dd>
                      {selected.snapshot.site.name}
                      <small>{selected.snapshot.site.address}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {selected.source === 'submission' ? copy.dueAtSubmission : copy.savedDue}
                    </dt>
                    <dd>
                      {dateLabel(selected.snapshot.dueDate, dateLocale)} ·{' '}
                      {inspection.priority[selected.snapshot.priority]}
                    </dd>
                  </div>
                </dl>
                <h4>{inspection.brief}</h4>
                <p className="preserve-lines">
                  {selected.snapshot.instructions || report.noInstructions}
                </p>
                <h4>{inspection.summary}</h4>
                <p className="preserve-lines">{selected.snapshot.report.summary}</p>
                <Table aria-label={copy.answers}>
                  <caption className="sr-only">{selected.snapshot.template.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.checklistNotes}</TableHead>
                      <TableHead>{report.result}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.snapshot.report.answers.map((answer) => (
                      <TableRow key={answer.itemId}>
                        <TableCell>
                          <strong>
                            {reportItemLabel(selected.snapshot.template, answer.itemId)}
                          </strong>
                          {answer.note && <p className="preserve-lines">{answer.note}</p>}
                        </TableCell>
                        <TableCell
                          className={`preserve-lines ${answer.value === 'fail' ? 'amber' : 'muted'}`}
                        >
                          {answer.value === 'text' || answer.value === 'number'
                            ? answerLabel(answer)
                            : inspection.results[answer.value]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <h4>{report.review}</h4>
                {selected.review ? (
                  <>
                    <p>
                      <strong>{status[selected.review.decision]}</strong> {report.by}{' '}
                      {selected.review.reviewedBy} · {timeLabel(selected.review.reviewedAt)}
                    </p>
                    <p className="preserve-lines">{selected.review.note || report.noReview}</p>
                  </>
                ) : (
                  <p className="muted">
                    {selected.reviewStatus === 'awaiting_review'
                      ? copy.awaitingManager
                      : copy.missingReviewDetail}
                  </p>
                )}
                <h4>
                  {copy.photos} ({selected.snapshot.report.photos.length})
                </h4>
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
                          <img src={client.photoUrl(photo.id)} alt={`${copy.photo} ${index + 1}`} />
                          {photo.itemId && (
                            <p>{reportItemLabel(selected.snapshot.template, photo.itemId)}</p>
                          )}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">{copy.photosOffline}</p>
                  )
                ) : (
                  <p className="muted">{copy.noPhotos}</p>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {!online && <p className="muted">{copy.openOffline}</p>}
    </section>
  );
}
