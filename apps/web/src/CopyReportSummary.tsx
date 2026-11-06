import { useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { inspectionCopy, type Locale } from '@fieldwork/strings';
import { IconButton } from './components/ui/icon-button';

export default function CopyReportSummary({
  summary,
  locale,
}: {
  summary: string;
  locale: Locale;
}) {
  const [result, setResult] = useState<'copied' | 'failed'>();
  const copy = inspectionCopy[locale];
  if (!summary.trim()) return null;

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  }

  return (
    <>
      <IconButton
        label={copy.copyReportSummary}
        tooltip={result === 'copied' ? copy.reportSummaryCopied : copy.copyReportSummary}
        variant="ghost"
        onClick={() => void copySummary()}
      >
        {result === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </IconButton>
      <span role="status" className={result === 'failed' ? 'muted' : 'sr-only'}>
        {result === 'copied' && copy.reportSummaryCopied}
        {result === 'failed' && copy.reportSummaryCopyFailed}
      </span>
    </>
  );
}
