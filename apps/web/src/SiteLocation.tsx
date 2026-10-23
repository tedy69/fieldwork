import { useEffect, useRef, useState } from 'react';
import type { Site } from '@fieldwork/contracts';
import { useMapSettings } from './MapSettings';
import SiteMap from './SiteMap';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Button } from './components/ui/button';
import './site-location.css';

export default function SiteLocation({
  site,
  online,
  beforeReload,
}: {
  site: Site;
  online: boolean;
  beforeReload: () => Promise<void>;
}) {
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
    <Card className="site-location">
      <h2>Site location</h2>
      <p className="site-coordinates">
        Latitude {site.coordinates.latitude} · Longitude {site.coordinates.longitude}
      </p>
      {!covered && (
        <p className="muted">
          These coordinates are outside the latitude range supported by this map.
        </p>
      )}
      {!online && (
        <Alert className="notice" role="status">
          Reconnect to load map tiles. Coordinates remain available in saved assignments.
        </Alert>
      )}
      {loading && (
        <p className="muted" role="status">
          Loading map settings…
        </p>
      )}
      {error && (
        <Alert className="error">
          <p>{error}</p>
          <Button className="quiet" disabled={!online || loading} onClick={reload}>
            Retry map settings
          </Button>
        </Alert>
      )}
      {provider === null && <p className="muted">Map tiles are disabled for this workspace.</p>}
      {provider && covered && (
        <>
          <p className="muted">
            Tiles come from {provider.name}. Loading shares your IP address, this website's address,
            and the viewed area with that provider.
          </p>
          {!active ? (
            <Button
              ref={launcher}
              className="quiet"
              disabled={!online || loading}
              onClick={() => setActive(true)}
            >
              Load site map
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
                Hide site map
              </Button>
              {online && (
                <SiteMap
                  coordinates={site.coordinates}
                  provider={provider}
                  name={site.name}
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
