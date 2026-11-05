import { useEffect, useRef, useState } from 'react';
import type { Site } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { useMapSettings } from './MapSettings';
import SiteMap from './SiteMap';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
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
  const { provider, loading, error, ensure, reload } = useMapSettings();
  const [active, setActive] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (site.coordinates && online) ensure();
  }, [site.coordinates, online, ensure]);
  useEffect(() => {
    if (!online) setActive(false);
  }, [online]);
  if (!site.coordinates) return null;
  const covered = Math.abs(site.coordinates.latitude) <= 85.05112878;
  return (
    <Card className="site-location" lang={locale}>
      <h2>{copy.location}</h2>
      <p className="site-coordinates">
        {copy.latitude} {site.coordinates.latitude} · {copy.longitude} {site.coordinates.longitude}
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
                  coordinates={site.coordinates}
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
