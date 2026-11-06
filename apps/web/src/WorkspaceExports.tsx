import { Button } from './components/ui/button';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { FieldError } from './components/ui/field';
import { useState } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { localDate } from './dates';
import { reportCsv } from './reportCsv';
import { downloadCsv, formatCsv } from './csv';
import { ActionGroup } from './components';

export default function WorkspaceExports({
  orders,
  onNotice,
}: {
  orders: WorkOrder[];
  onNotice: (notice: string) => void;
}) {
  const [error, setError] = useState('');
  const reportCount = orders.filter((order) => order.report).length;
  function download(kind: 'schedule' | 'reports') {
    setError('');
    onNotice('');
    try {
      if (kind === 'schedule') {
        const csv = formatCsv([
          ['Reference', 'Work order', 'Site', 'Assigned to', 'Due date', 'Priority', 'Status'],
          ...orders.map((order) => [
            order.reference,
            order.title,
            order.site.name,
            order.assignee.name,
            order.dueDate,
            order.priority,
            order.status,
          ]),
        ]);
        downloadCsv(`fieldwork-schedule-${localDate()}.csv`, csv);
        onNotice(
          `CSV prepared for ${orders.length} ${orders.length === 1 ? 'work order' : 'work orders'}.`,
        );
      } else {
        downloadCsv(`fieldwork-reports-${localDate()}.csv`, reportCsv(orders));
        onNotice(`CSV prepared for ${reportCount} ${reportCount === 1 ? 'report' : 'reports'}.`);
      }
    } catch {
      setError('Could not create the CSV. Narrow the list and try again.');
    }
  }
  return (
    <section className="workspace-exports" aria-label="CSV exports">
      <p className="export-note muted">Export this view</p>
      <ActionGroup>
        <Button
          className="quiet"
          aria-label={`Export work orders (${orders.length})`}
          onClick={() => download('schedule')}
          disabled={orders.length === 0}
        >
          <CalendarBlankIcon aria-hidden="true" /> Schedule ({orders.length})
        </Button>
        <Button
          className="quiet"
          aria-label={`Export reports (${reportCount})`}
          onClick={() => download('reports')}
          disabled={reportCount === 0}
        >
          <DownloadSimpleIcon aria-hidden="true" /> Reports ({reportCount})
        </Button>
      </ActionGroup>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
