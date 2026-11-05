import { Button } from './components/ui/button';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { FieldError } from './components/ui/field';
import { useState } from 'react';
import type { WorkOrder } from '@fieldwork/contracts';
import { localDate } from './dates';
import { reportCsv } from './reportCsv';
import { downloadCsv } from './csv';

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
    try {
      downloadCsv(`fieldwork-reports-${localDate()}.csv`, reportCsv(orders));
      onNotice(`CSV prepared for ${count} ${count === 1 ? 'report' : 'reports'}.`);
    } catch {
      setError('Could not create the CSV. Narrow the list and try again.');
    }
  }
  return (
    <section className="report-export" aria-label="Report export">
      <p className="export-note muted">
        {count
          ? 'Latest reports in this view. Photos are not included.'
          : 'No reports in this view to export.'}
      </p>
      <Button
        className="quiet"
        aria-label={`Export reports (${count})`}
        onClick={download}
        disabled={count === 0}
      >
        <DownloadSimpleIcon aria-hidden="true" /> Export ({count})
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
