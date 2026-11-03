import { useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { localReportExport, type OfflineRepository } from '@fieldwork/offline';
import { Button } from './components/ui/button';
import { FieldError } from './components/ui/field';

export default function DraftExport({
  orderId,
  repo,
  disabled = false,
}: {
  orderId: string;
  repo: OfflineRepository;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function download() {
    setBusy(true);
    setError('');
    setNotice('');
    let url: string | undefined;
    try {
      const file = localReportExport(await repo.read(), orderId);
      const reference = (file.assignment?.reference ?? orderId)
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 80);
      url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `fieldwork-local-${reference}-${file.exportedAt.slice(0, 10)}.json`;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
      }
      setNotice('Draft file prepared. Your local draft and sync queue are kept.');
    } catch {
      setError('Could not export this draft. Your local data is kept. Try again.');
    } finally {
      setBusy(false);
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  }
  return (
    <section className="report-export" aria-label="Local draft export">
      <p className="export-note muted">
        JSON includes this report’s answers, notes and photos. Keep the file private.
      </p>
      <Button className="quiet" onClick={download} disabled={disabled || busy}>
        <DownloadSimpleIcon aria-hidden="true" /> {busy ? 'Preparing…' : 'Export draft'}
      </Button>
      {error && <FieldError>{error}</FieldError>}
      {notice && (
        <p className="full" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
