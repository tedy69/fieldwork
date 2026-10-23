import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Coordinates, Site } from '@fieldwork/contracts';
import { client, message } from './lib';
import { parseCoordinateInputs } from './coordinate-input';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { FieldError, FieldSet, FieldLegend } from './components/ui/field';
import './site-coordinates-editor.css';

export default function SiteCoordinatesEditor({
  site,
  online,
  onUpdated,
}: {
  site: Site;
  online: boolean;
  onUpdated: (site: Site) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [expected, setExpected] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState<'loading' | 'saving' | null>(null);
  const [needsReload, setNeedsReload] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const loaded = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const reloadButton = useRef<HTMLButtonElement>(null);
  const formId = useId();
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (!editing || busy) return;
    if (needsReload && online) reloadButton.current?.focus();
    else if (!needsReload) firstInput.current?.focus();
  }, [editing, busy, needsReload, online]);
  function close() {
    generation.current++;
    setEditing(false);
    setBusy(null);
    setError('');
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected && !trigger.current.disabled) trigger.current.focus();
      else document.getElementById('main')?.focus();
    });
  }
  async function reload() {
    const current = ++generation.current;
    setBusy('loading');
    setError('');
    setNeedsReload(true);
    try {
      const latest = await client.site(site.id);
      if (current !== generation.current) return;
      setExpected(latest.coordinates ?? null);
      if (!loaded.current) {
        setLatitude(latest.coordinates ? String(latest.coordinates.latitude) : '');
        setLongitude(latest.coordinates ? String(latest.coordinates.longitude) : '');
        setNotice('');
      } else
        setNotice(
          'Latest coordinates loaded. Your proposed values are kept. Review them before saving.',
        );
      loaded.current = true;
      onUpdated(latest);
      setNeedsReload(false);
    } catch (error) {
      if (current === generation.current) setError(message(error));
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  function open() {
    loaded.current = false;
    setEditing(true);
    setNotice('');
    setLatitude(site.coordinates ? String(site.coordinates.latitude) : '');
    setLongitude(site.coordinates ? String(site.coordinates.longitude) : '');
    setExpected(site.coordinates ?? null);
    void reload();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!online || busy || needsReload) return;
    let coordinates: Coordinates | null;
    try {
      coordinates = parseCoordinateInputs(latitude, longitude) ?? null;
    } catch (error) {
      setError(message(error));
      return;
    }
    const current = ++generation.current;
    setBusy('saving');
    setError('');
    setNotice('');
    try {
      const updated = await client.updateSiteLocation(site.id, {
        expectedCoordinates: expected,
        coordinates,
      });
      if (current !== generation.current) return;
      onUpdated(updated);
      setNotice(
        coordinates
          ? 'Coordinates saved for future assignments. Existing inspections stay unchanged.'
          : 'Coordinates removed from future assignments. Existing inspections stay unchanged.',
      );
      close();
    } catch (error) {
      if (current === generation.current) {
        setError(`${message(error)} Reload this site before trying again.`);
        setNeedsReload(true);
      }
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  return (
    <section className="site-coordinate-editor" aria-label={`Coordinates for ${site.name}`}>
      <Button
        ref={trigger}
        type="button"
        className="quiet"
        aria-expanded={editing}
        aria-controls={formId}
        aria-label={`${site.coordinates ? 'Edit' : 'Add'} coordinates for ${site.name}`}
        disabled={!online || busy === 'saving'}
        onClick={() => (editing ? close() : open())}
      >
        {site.coordinates ? 'Edit coordinates' : 'Add coordinates'}
      </Button>
      {!online && <p className="muted">Connect to edit site coordinates.</p>}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {editing && (
        <form
          id={formId}
          data-site-coordinate-form
          aria-label={`Edit coordinates for ${site.name}`}
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && busy !== 'saving') {
              event.preventDefault();
              close();
            }
          }}
        >
          <p className="muted">
            New assignments use the saved site location. Existing assignments and reports keep their
            original snapshot.
          </p>
          {loaded.current && (
            <p className="muted">
              Loaded coordinates:{' '}
              {expected ? `${expected.latitude}, ${expected.longitude}` : 'none'}.
            </p>
          )}
          {busy && (
            <p className="muted" role="status">
              {busy === 'loading' ? 'Loading current coordinates…' : 'Saving coordinates…'}
            </p>
          )}
          {!online && (
            <p className="muted" role="status">
              Your proposed values are kept here. Reconnect to save or reload.
            </p>
          )}
          <FieldSet disabled={Boolean(busy) || needsReload || !online}>
            <FieldLegend>Proposed coordinates</FieldLegend>
            <div className="form-grid">
              <Label>
                Latitude
                <Input
                  ref={firstInput}
                  name="latitude"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={latitude}
                  onChange={(event) => {
                    setLatitude(event.target.value);
                    setError('');
                  }}
                />
              </Label>
              <Label>
                Longitude
                <Input
                  name="longitude"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={longitude}
                  onChange={(event) => {
                    setLongitude(event.target.value);
                    setError('');
                  }}
                />
              </Label>
            </div>
            <Button
              type="button"
              className="quiet"
              onClick={() => {
                setLatitude('');
                setLongitude('');
                setError('');
                firstInput.current?.focus();
              }}
            >
              Clear both fields
            </Button>
          </FieldSet>
          <p className="muted">
            Enter both values, or save both fields empty to remove coordinates from future
            assignments.
          </p>
          {error && <FieldError>{error}</FieldError>}
          <div className="site-coordinate-actions">
            {needsReload && (
              <Button
                ref={reloadButton}
                type="button"
                className="quiet"
                disabled={!online || Boolean(busy)}
                onClick={() => void reload()}
              >
                Reload site
              </Button>
            )}
            <Button
              type="submit"
              className="primary"
              disabled={!online || Boolean(busy) || needsReload}
            >
              Save coordinates
            </Button>
            <Button type="button" className="quiet" disabled={busy === 'saving'} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
