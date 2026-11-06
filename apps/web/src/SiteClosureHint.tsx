import { CalendarXIcon } from '@phosphor-icons/react/dist/csr/CalendarX';
import type { Locale } from '@fieldwork/strings';
import './site-closure-hint.css';

export default function SiteClosureHint({
  id,
  closed,
  locale,
}: {
  id: string;
  closed: boolean;
  locale: Locale;
}) {
  return (
    <p id={id} className="site-closure-hint" aria-live="polite">
      {closed && (
        <>
          <CalendarXIcon aria-hidden="true" />
          {locale === 'id'
            ? 'Lokasi tutup pada tanggal ini.'
            : 'This site is closed on the selected date.'}
        </>
      )}
    </p>
  );
}
