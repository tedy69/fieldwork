import { IconButton } from './components/ui/icon-button';
import { PrinterIcon } from '@phosphor-icons/react/dist/csr/Printer';
import { FieldError } from './components/ui/field';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './components/ui/table';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type WorkOrder, answerLabel, reportItemLabel } from '@fieldwork/contracts';
import { inspectionCopy, languageTags, notebookCopy, type Locale } from '@fieldwork/strings';
import { workerReportCopy } from './worker-report-copy';
import { calendarLabel } from './calendar';
import './print.css';

export default function ReportPrint({
  order,
  report,
  locale = 'en',
}: {
  order: WorkOrder;
  report: NonNullable<WorkOrder['report']>;
  locale?: Locale;
}) {
  const reportLabels = workerReportCopy[locale];
  const copy = reportLabels.print;
  const inspection = inspectionCopy[locale];
  const status = notebookCopy[locale].status;
  const dateLocale = languageTags[locale];
  const timestamp = (value: string) =>
    `${new Date(value).toLocaleString(dateLocale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'UTC',
    })} UTC`;
  const [error, setError] = useState(false);
  function print() {
    setError(false);
    try {
      window.print();
    } catch {
      setError(true);
    }
  }
  return (
    <>
      <section className="report-print-action" aria-label={copy.action} lang={locale}>
        <IconButton label={copy.print} className="quiet" onClick={print}>
          <PrinterIcon aria-hidden="true" />
        </IconButton>
        <p className="muted">{copy.hint}</p>
        {error && <FieldError>{copy.failed}</FieldError>}
      </section>
      {createPortal(
        <article className="print-report" aria-label={copy.printable} lang={locale}>
          <header>
            <p>
              Fieldwork / {inspection.report} / {order.reference}
            </p>
            <h1>{order.title}</h1>
            <p>{copy.snapshot}</p>
          </header>
          <dl>
            <div>
              <dt>{inspection.site}</dt>
              <dd>
                {order.site.name}
                <br />
                {order.site.address}
              </dd>
            </div>
            <div>
              <dt>{inspection.assignee}</dt>
              <dd>{order.assignee.name}</dd>
            </div>
            <div>
              <dt>{copy.due}</dt>
              <dd>
                <time dateTime={order.dueDate}>
                  {calendarLabel(order.dueDate, true, dateLocale)}
                </time>{' '}
                / {inspection.priority[order.priority]}
              </dd>
            </div>
            <div>
              <dt>{copy.status}</dt>
              <dd>{status[order.status]}</dd>
            </div>
            <div>
              <dt>{copy.submittedAt}</dt>
              <dd>
                <time dateTime={report.submittedAt}>{timestamp(report.submittedAt)}</time>
              </dd>
            </div>
            <div>
              <dt>{copy.submittedBy}</dt>
              <dd>{report.submittedBy}</dd>
            </div>
            <div>
              <dt>{copy.version}</dt>
              <dd>
                {report.id} / {order.version}
              </dd>
            </div>
            <div>
              <dt>{copy.photoCount}</dt>
              <dd>
                {report.photos.length} {copy.photoFiles}
              </dd>
            </div>
          </dl>
          <section>
            <h2>{inspection.brief}</h2>
            <p className="print-lines">{order.instructions || reportLabels.noInstructions}</p>
          </section>
          <section>
            <h2>{order.template.name}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{copy.checklistItem}</TableHead>
                  <TableHead scope="col">{reportLabels.result}</TableHead>
                  <TableHead scope="col">{reportLabels.notes}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.answers.map((answer) => (
                  <TableRow key={answer.itemId}>
                    <TableHead scope="row">
                      {reportItemLabel(order.template, answer.itemId)}
                      {report.photos.some((photo) => photo.itemId === answer.itemId) && (
                        <div>{inspection.photoAttached}</div>
                      )}
                    </TableHead>
                    <TableCell className="print-lines">
                      {answer.value === 'text' || answer.value === 'number'
                        ? answerLabel(answer)
                        : inspection.results[answer.value]}
                    </TableCell>
                    <TableCell className="print-lines">{answer.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <section>
            <h2>{inspection.summary}</h2>
            <p className="print-lines">{report.summary}</p>
          </section>
          <section className="print-review">
            <h2>{reportLabels.review}</h2>
            {order.review ? (
              <>
                <p>
                  {status[order.review.decision]} {reportLabels.by} {order.review.reviewedBy}
                  <br />
                  <time dateTime={order.review.reviewedAt}>
                    {timestamp(order.review.reviewedAt)}
                  </time>
                </p>
                <p className="print-lines">{order.review.note || reportLabels.noReview}</p>
              </>
            ) : (
              <p>{copy.pendingReview}</p>
            )}
          </section>
          <footer>{copy.footer}</footer>
        </article>,
        document.body,
      )}
    </>
  );
}
