import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkOrder } from '@fieldwork/contracts';
import { labels } from './lib';
import './print.css';

export default function ReportPrint({
  order,
  report,
}: {
  order: WorkOrder;
  report: NonNullable<WorkOrder['report']>;
}) {
  const [error, setError] = useState('');
  function print() {
    setError('');
    try {
      window.print();
    } catch {
      setError('Could not open the print dialog. Try printing from a desktop browser.');
    }
  }
  return (
    <>
      <section className="report-print-action" aria-label="Print saved report">
        <button className="quiet" onClick={print}>
          Print report
        </button>
        <p className="muted">Print or save as PDF. Unsent edits and photo files are excluded.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {createPortal(
        <article className="print-report" aria-label="Printable inspection report">
          <header>
            <p>Fieldwork / Inspection report / {order.reference}</p>
            <h1>{order.title}</h1>
            <p>Saved report snapshot. Sync before printing when you need recent changes.</p>
          </header>
          <dl>
            <div>
              <dt>Site</dt>
              <dd>
                {order.site.name}
                <br />
                {order.site.address}
              </dd>
            </div>
            <div>
              <dt>Assigned to</dt>
              <dd>{order.assignee.name}</dd>
            </div>
            <div>
              <dt>Due date / priority</dt>
              <dd>
                {order.dueDate} / {order.priority}
              </dd>
            </div>
            <div>
              <dt>Workflow status</dt>
              <dd>{labels[order.status]}</dd>
            </div>
            <div>
              <dt>Submitted (UTC)</dt>
              <dd>{report.submittedAt}</dd>
            </div>
            <div>
              <dt>Submitted by (user ID)</dt>
              <dd>{report.submittedBy}</dd>
            </div>
            <div>
              <dt>Report ID / work-order version</dt>
              <dd>
                {report.id} / {order.version}
              </dd>
            </div>
            <div>
              <dt>Photo count</dt>
              <dd>{report.photos.length} (photo files excluded)</dd>
            </div>
          </dl>
          <section>
            <h2>Field brief</h2>
            <p className="print-lines">{order.instructions || 'No additional instructions.'}</p>
          </section>
          <section>
            <h2>{order.template.name}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Checklist item</th>
                  <th scope="col">Result</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.answers.map((answer) => (
                  <tr key={answer.itemId}>
                    <th scope="row">
                      {order.template.items.find((item) => item.id === answer.itemId)?.label ??
                        answer.itemId}
                    </th>
                    <td>
                      {answer.value === 'pass'
                        ? 'Pass'
                        : answer.value === 'fail'
                          ? 'Issue found'
                          : 'N/A'}
                    </td>
                    <td className="print-lines">{answer.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2>Inspection summary</h2>
            <p className="print-lines">{report.summary}</p>
          </section>
          <section className="print-review">
            <h2>Manager review</h2>
            {order.review ? (
              <>
                <p>
                  {labels[order.review.decision]} by {order.review.reviewedBy}
                  <br />
                  {order.review.reviewedAt} (UTC)
                </p>
                <p className="print-lines">{order.review.note || 'No review note.'}</p>
              </>
            ) : (
              <p>Not reviewed yet.</p>
            )}
          </section>
          <footer>Latest saved report only. Unsent edits and photo files are not included.</footer>
        </article>,
        document.body,
      )}
    </>
  );
}
