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
import type { LocalizedNotice } from './useLocalizedNotice';

export default function WorkspaceExports({
  orders,
  locale,
  includeCsv,
  onNotice,
}: {
  orders: WorkOrder[];
  locale: Locale;
  includeCsv: boolean;
  onNotice: (notice: LocalizedNotice | null) => void;
}) {
  const copy = managerDispatchCopy[locale];
  const [error, setError] = useState('');
  const orderCount = orders.length;
  const reportCount = includeCsv ? orders.filter((order) => order.report).length : 0;
  function download(kind: 'schedule' | 'reports' | 'calendar') {
    setError('');
    onNotice(null);
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
        onNotice((language) => managerDispatchCopy[language].schedulePrepared(orderCount));
      } else if (kind === 'calendar') {
        downloadText(
          `fieldwork-calendar-${localDate()}.ics`,
          formatScheduleCalendar(orders),
          'text/calendar;charset=utf-8',
        );
        onNotice((language) => managerDispatchCopy[language].calendarPrepared(orderCount));
      } else {
        downloadCsv(`fieldwork-reports-${localDate()}.csv`, reportCsv(orders));
        onNotice((language) => managerDispatchCopy[language].reportsPrepared(reportCount));
      }
    } catch {
      setError(kind === 'calendar' ? copy.calendarFailed : copy.exportFailed);
    }
  }
  return (
    <section className="workspace-exports" aria-label={copy.exports}>
      {includeCsv && <p className="export-note muted">{copy.exportView}</p>}
      <ActionGroup>
        {includeCsv && (
          <Button
            className="quiet"
            aria-label={copy.exportSchedule(orders.length)}
            onClick={() => download('schedule')}
            disabled={orders.length === 0}
          >
            <TableIcon aria-hidden="true" /> {copy.schedule} ({orders.length})
          </Button>
        )}
        <Button
          className="quiet"
          aria-label={copy.exportCalendar(orders.length)}
          onClick={() => download('calendar')}
          disabled={orders.length === 0}
        >
          <CalendarDotsIcon aria-hidden="true" /> {copy.calendarFile} ({orders.length})
        </Button>
        {includeCsv && (
          <Button
            className="quiet"
            aria-label={copy.exportReports(reportCount)}
            onClick={() => download('reports')}
            disabled={reportCount === 0}
          >
            <ClipboardTextIcon aria-hidden="true" /> {copy.reports} ({reportCount})
          </Button>
        )}
      </ActionGroup>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
