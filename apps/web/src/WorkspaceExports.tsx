import { Button } from './components/ui/button';
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots';
import { ClipboardTextIcon } from '@phosphor-icons/react/dist/csr/ClipboardText';
import { TableIcon } from '@phosphor-icons/react/dist/csr/Table';
import { FieldError } from './components/ui/field';
import { useState } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { localDate } from './dates';
import { reportCsv } from './reportCsv';
import { downloadCsv, formatCsv } from './csv';
import { downloadText } from './download-text';
import { formatScheduleCalendar } from './schedule-calendar';
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
  function download(kind: 'schedule' | 'reports' | 'calendar') {
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
      } else if (kind === 'calendar') {
        downloadText(
          `fieldwork-calendar-${localDate()}.ics`,
          formatScheduleCalendar(orders),
          'text/calendar;charset=utf-8',
        );
        onNotice(copy.calendarPrepared(orders.length));
      } else {
        downloadCsv(`fieldwork-reports-${localDate()}.csv`, reportCsv(orders));
        onNotice(copy.reportsPrepared(reportCount));
      }
    } catch {
      setError(kind === 'calendar' ? copy.calendarFailed : copy.exportFailed);
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
          <TableIcon aria-hidden="true" /> {copy.schedule} ({orders.length})
        </Button>
        <Button
          className="quiet"
          aria-label={copy.exportCalendar(orders.length)}
          onClick={() => download('calendar')}
          disabled={orders.length === 0}
        >
          <CalendarDotsIcon aria-hidden="true" /> {copy.calendarFile} ({orders.length})
        </Button>
        <Button
          className="quiet"
          aria-label={copy.exportReports(reportCount)}
          onClick={() => download('reports')}
          disabled={reportCount === 0}
        >
          <ClipboardTextIcon aria-hidden="true" /> {copy.reports} ({reportCount})
        </Button>
      </ActionGroup>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
