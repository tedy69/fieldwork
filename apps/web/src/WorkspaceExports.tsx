import { Button } from './components/ui/button';
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { FieldError } from './components/ui/field';
import { useState } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { localDate } from './dates';
import { reportCsv } from './reportCsv';
import { downloadCsv, formatCsv } from './csv';
import { ActionGroup } from './components';
import { managerDispatchCopy } from './manager-dispatch-copy';

export default function WorkspaceExports({
  orders,
  locale,
  onNotice,
}: {
  orders: WorkOrder[];
  locale: Locale;
  onNotice: (notice: string) => void;
}) {
  const copy = managerDispatchCopy[locale];
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
        onNotice(copy.schedulePrepared(orders.length));
      } else {
        downloadCsv(`fieldwork-reports-${localDate()}.csv`, reportCsv(orders));
        onNotice(copy.reportsPrepared(reportCount));
      }
    } catch {
      setError(copy.exportFailed);
    }
  }
  return (
    <section className="workspace-exports" aria-label={copy.exports}>
      <p className="export-note muted">{copy.exportView}</p>
      <ActionGroup>
        <Button
          className="quiet"
          aria-label={copy.exportSchedule(orders.length)}
          onClick={() => download('schedule')}
          disabled={orders.length === 0}
        >
          <CalendarBlankIcon aria-hidden="true" /> {copy.schedule} ({orders.length})
        </Button>
        <Button
          className="quiet"
          aria-label={copy.exportReports(reportCount)}
          onClick={() => download('reports')}
          disabled={reportCount === 0}
        >
          <DownloadSimpleIcon aria-hidden="true" /> {copy.reports} ({reportCount})
        </Button>
      </ActionGroup>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
