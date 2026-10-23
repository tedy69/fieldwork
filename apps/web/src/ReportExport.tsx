import { Button } from './components/ui/button';
import { FieldError } from './components/ui/field';
import { useState } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { localDate } from './dates';
import { reportCsv } from './reportCsv';

export default function ReportExport({
  orders,
  onNotice,
}: {
  orders: WorkOrder[];
  onNotice: (notice: string) => void;
}) {
  const [error, setError] = useState('');
  const count = orders.filter((order) => order.report).length;
  function download() {
    setError('');
    onNotice('');
    let url: string | undefined;
    try {
      const csv = reportCsv(orders);
      url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `fieldwork-reports-${localDate()}.csv`;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
      }
      onNotice(`CSV prepared for ${count} ${count === 1 ? 'report' : 'reports'}.`);
    } catch {
      setError('Could not create the CSV. Narrow the list and try again.');
    } finally {
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  }
  return (
    <section className="report-export" aria-label="Report export">
      <p className="export-note muted">
        {count
          ? 'Latest reports in this view. Photos are not included.'
          : 'No reports in this view to export.'}
      </p>
      <Button className="quiet" onClick={download} disabled={count === 0}>
        Export reports ({count})
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
