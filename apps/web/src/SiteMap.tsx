import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Map as LeafletMap, TileLayer } from 'leaflet';
import type { Coordinates, MapProvider } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { MinusIcon } from '@phosphor-icons/react/dist/csr/Minus';
import { CrosshairIcon } from '@phosphor-icons/react/dist/csr/Crosshair';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Alert } from './components/ui/alert';
import { workerMapCopy } from './worker-map-copy';
import 'leaflet/dist/leaflet.css';

export default function SiteMap({
  coordinates,
  provider,
  name,
  beforeReload,
  locale = 'en',
}: {
  coordinates: Coordinates;
  provider: MapProvider;
  name: string;
  beforeReload: () => Promise<void>;
  locale?: Locale;
}) {
  const copy = workerMapCopy[locale];
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const tiles = useRef<TileLayer | null>(null);
  const [zoom, setZoom] = useState(Math.min(15, provider.maxZoom));
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<'tiles' | 'tools' | { detail: string } | null>(null);
  const [toolError, setToolError] = useState(false);
  const [reloading, setReloading] = useState(false);
  const lifetime = useRef(0);
  const helpId = useId();
  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    setLoading(true);
    setReady(false);
    setZoom(Math.min(15, provider.maxZoom));
    setError(null);
    setToolError(false);
    setReloading(false);
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        instance = L.map(container.current, {
          center: [coordinates.latitude, coordinates.longitude],
          zoom: Math.min(15, provider.maxZoom),
          minZoom: 0,
          maxZoom: provider.maxZoom,
          zoomControl: false,
          keyboard: false,
          attributionControl: false,
          scrollWheelZoom: false,
          inertia: false,
          zoomAnimation: false,
          fadeAnimation: false,
          markerZoomAnimation: false,
        });
        map.current = instance;
        setReady(true);
        const layer = L.tileLayer(provider.tileUrlTemplate, {
          minZoom: 0,
          maxZoom: provider.maxZoom,
          referrerPolicy: 'strict-origin-when-cross-origin',
          keepBuffer: 0,
        });
        tiles.current = layer;
        layer.on('loading', () => {
          if (!cancelled) setLoading(true);
        });
        layer.on('load', () => {
          if (!cancelled) setLoading(false);
        });
        layer.on('tileerror', () => {
          if (!cancelled) {
            setLoading(false);
            setError('tiles');
          }
        });
        layer.addTo(instance);
        const palette = getComputedStyle(container.current);
        L.circleMarker([coordinates.latitude, coordinates.longitude], {
          radius: 8,
          color: palette.getPropertyValue('--ui-foreground').trim(),
          weight: 3,
          fillColor: palette.getPropertyValue('--amber').trim(),
          fillOpacity: 1,
          interactive: false,
        }).addTo(instance);
        instance.on('zoomend', () => {
          if (!cancelled) setZoom(instance!.getZoom());
        });
        observer = new ResizeObserver(() =>
          instance?.invalidateSize({ animate: false, pan: false }),
        );
        observer.observe(container.current);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setToolError(true);
          setError('tools');
        }
      });
    return () => {
      lifetime.current++;
      cancelled = true;
      observer?.disconnect();
      instance?.remove();
      map.current = null;
      tiles.current = null;
    };
  }, [coordinates.latitude, coordinates.longitude, provider]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const instance = map.current;
    if (!instance || event.altKey || event.ctrlKey || event.metaKey) return;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-80, 0],
      ArrowRight: [80, 0],
      ArrowUp: [0, -80],
      ArrowDown: [0, 80],
    };
    if (offsets[event.key]) instance.panBy(offsets[event.key], { animate: false });
    else if (['+', '='].includes(event.key)) instance.zoomIn(1, { animate: false });
    else if (['-', '−'].includes(event.key)) instance.zoomOut(1, { animate: false });
    else return;
    event.preventDefault();
  }
  return (
    <div className="site-map-view">
      <p className="muted" id={helpId}>
        {copy.instructions}
      </p>
      <div className="site-map-frame">
        <div
          ref={container}
          className="site-map-canvas"
          tabIndex={0}
          role="region"
          aria-label={copy.map(name)}
          aria-describedby={helpId}
          onKeyDown={keyboard}
        />
        <p className="site-map-attribution">
          <a href={provider.attributionUrl} target="_blank" rel="noopener noreferrer">
            {provider.attributionText}
          </a>
        </p>
      </div>
      <div className="site-map-controls" role="group" aria-label={copy.controls}>
        <IconButton
          label={copy.zoomIn}
          className="quiet"
          disabled={!ready || zoom >= provider.maxZoom || toolError}
          onClick={() => map.current?.zoomIn(1, { animate: false })}
        >
          <PlusIcon aria-hidden="true" />
        </IconButton>
        <IconButton
          label={copy.zoomOut}
          className="quiet"
          disabled={!ready || zoom <= 0 || toolError}
          onClick={() => map.current?.zoomOut(1, { animate: false })}
        >
          <MinusIcon aria-hidden="true" />
        </IconButton>
        <IconButton
          label={copy.recenter}
          className="quiet"
          disabled={!ready || toolError}
          onClick={() =>
            map.current?.setView(
              [coordinates.latitude, coordinates.longitude],
              Math.min(15, provider.maxZoom),
              { animate: false },
            )
          }
        >
          <CrosshairIcon aria-hidden="true" />
        </IconButton>
        <span className="muted" role="status">
          {copy.zoom} {zoom}
        </span>
      </div>
      {loading && (
        <p className="muted" role="status">
          {copy.loading}
        </p>
      )}
      {error && (
        <Alert className="error">
          <p>
            {error === 'tiles'
              ? copy.tilesFailed
              : error === 'tools'
                ? copy.toolsFailed
                : error.detail}
          </p>
          {toolError ? (
            <Button
              className="quiet"
              disabled={reloading}
              onClick={async () => {
                const current = lifetime.current;
                setReloading(true);
                try {
                  await beforeReload();
                  if (current === lifetime.current) window.location.reload();
                } catch (error) {
                  if (current === lifetime.current)
                    setError({
                      detail: error instanceof Error ? error.message : copy.saveBeforeReload,
                    });
                } finally {
                  if (current === lifetime.current) setReloading(false);
                }
              }}
            >
              {reloading ? copy.checkWork : copy.reload}
            </Button>
          ) : (
            <Button
              className="quiet"
              onClick={() => {
                setError(null);
                setLoading(true);
                tiles.current?.redraw();
              }}
            >
              {copy.retryTiles}
            </Button>
          )}
        </Alert>
      )}
    </div>
  );
}
