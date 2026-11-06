import { useEffect, useRef, useState } from 'react';
import type { Site } from '@fieldwork/contracts';
import { inspectionCopy, type Locale } from '@fieldwork/strings';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { useMapSettings } from './MapSettings';
import SiteMap from './SiteMap';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { workerMapCopy } from './worker-map-copy';
import './site-location.css';

export default function SiteLocation({
  site,
  online,
  beforeReload,
  locale = 'en',
}: {
  site: Site;
  online: boolean;
  beforeReload: () => Promise<void>;
  locale?: Locale;
}) {
  const copy = workerMapCopy[locale];
  const inspection = inspectionCopy[locale];
  const { provider, loading, error, ensure, reload } = useMapSettings();
  const [active, setActive] = useState(false);
  const [clipboard, setClipboard] = useState<'copied' | 'failed'>();
  const coordinates = site.coordinates;
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (site.coordinates && online) ensure();
  }, [site.coordinates, online, ensure]);
  useEffect(() => {
    if (!online) setActive(false);
  }, [online]);
  if (!coordinates) return null;
  const { latitude, longitude } = coordinates;
  const covered = Math.abs(latitude) <= 85.05112878;
  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(`${latitude}, ${longitude}`);
      setClipboard('copied');
    } catch {
      setClipboard('failed');
    }
  }
  return (
    <Card className="site-location" lang={locale}>
      <h2>{copy.location}</h2>
      <div className="site-coordinates">
        <p>{inspection.coordinates(latitude, longitude)}</p>
        <IconButton
          label={inspection.copyCoordinates}
          tooltip={
            clipboard === 'copied' ? inspection.coordinatesCopied : inspection.copyCoordinates
          }
          variant="ghost"
          onClick={() => void copyCoordinates()}
        >
          {clipboard === 'copied' ? (
            <CheckIcon aria-hidden="true" />
          ) : (
            <CopyIcon aria-hidden="true" />
          )}
        </IconButton>
      </div>
      <p role="status" className={clipboard === 'failed' ? 'muted' : 'sr-only'}>
        {clipboard === 'copied' && inspection.coordinatesCopied}
        {clipboard === 'failed' && inspection.coordinatesCopyFailed}
      </p>
      {!covered && <p className="muted">{copy.outside}</p>}
      {!online && (
        <Alert className="notice" role="status">
          {copy.offline}
        </Alert>
      )}
      {loading && (
        <p className="muted" role="status">
          {copy.loadingSettings}
        </p>
      )}
      {error && (
        <Alert className="error">
          <p>{error}</p>
          <Button className="quiet" disabled={!online || loading} onClick={reload}>
            {copy.retrySettings}
          </Button>
        </Alert>
      )}
      {provider === null && <p className="muted">{copy.disabled}</p>}
      {provider && covered && (
        <>
          <p className="muted">{copy.privacy(provider.name)}</p>
          {!active ? (
            <Button
              ref={launcher}
              className="quiet"
              disabled={!online || loading}
              onClick={() => setActive(true)}
            >
              {copy.load}
            </Button>
          ) : (
            <>
              <Button
                className="quiet"
                onClick={() => {
                  setActive(false);
                  requestAnimationFrame(() => launcher.current?.focus());
                }}
              >
                {copy.hide}
              </Button>
              {online && (
                <SiteMap
                  coordinates={coordinates}
                  provider={provider}
                  name={site.name}
                  locale={locale}
                  beforeReload={beforeReload}
                />
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
