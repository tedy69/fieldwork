import { useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/csr/DownloadSimple';
import { localReportExport, type OfflineRepository } from '@fieldwork/offline';
import type { Locale } from '@fieldwork/strings';
import { Button } from './components/ui/button';
import { FieldError } from './components/ui/field';
import { workerWorkspaceCopy } from './worker-workspace-copy';

export default function DraftExport({
  orderId,
  repo,
  disabled = false,
  locale = 'en',
}: {
  orderId: string;
  repo: OfflineRepository;
  disabled?: boolean;
  locale?: Locale;
}) {
  const copy = workerWorkspaceCopy[locale].export;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState(false);
  async function download() {
    setBusy(true);
    setError(false);
    setNotice(false);
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
      setNotice(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  }
  return (
    <section className="report-export" aria-label={copy.title}>
      <p className="export-note muted">{copy.privacy}</p>
      <Button className="quiet" onClick={download} disabled={disabled || busy}>
        <DownloadSimpleIcon aria-hidden="true" /> {busy ? copy.preparing : copy.download}
      </Button>
      {error && <FieldError>{copy.failed}</FieldError>}
      {notice && (
        <p className="full" role="status">
          {copy.complete}
        </p>
      )}
    </section>
  );
}
