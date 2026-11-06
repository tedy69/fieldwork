import { useState } from 'react';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { reportClipboardCopy, type Locale, type ReportClipboardKind } from '@fieldwork/strings';
import { IconButton } from './components/ui/icon-button';

export default function CopyReportText({
  text,
  locale,
  kind,
}: {
  text: string;
  kind: ReportClipboardKind;
  locale: Locale;
}) {
  const [result, setResult] = useState<'copied' | 'failed'>();
  const copy = reportClipboardCopy[locale][kind];
  if (!text.trim()) return null;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  }

  return (
    <>
      <IconButton
        label={copy.label}
        tooltip={result === 'copied' ? copy.copied : copy.label}
        variant="ghost"
        onClick={() => void copyText()}
      >
        {result === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      </IconButton>
      <span role="status" className={result === 'failed' ? 'muted' : 'sr-only'}>
        {result === 'copied' && copy.copied}
        {result === 'failed' && copy.failed}
      </span>
    </>
  );
}
