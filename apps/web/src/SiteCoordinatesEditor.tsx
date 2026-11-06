import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { Coordinates, Site } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { MapPinIcon } from '@phosphor-icons/react/dist/csr/MapPin';
import { client, message } from './lib';
import { parseCoordinateInputs } from './coordinate-input';
import { Button } from './components/ui/button';
import { IconButton } from './components/ui/icon-button';
import { Form } from './components/ui/form';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { FieldError, FieldSet, FieldLegend } from './components/ui/field';
import { managerSitesCopy } from './manager-sites-copy';
import './site-coordinates-editor.css';

export default function SiteCoordinatesEditor({
  site,
  online,
  locale,
  onUpdated,
}: {
  site: Site;
  online: boolean;
  locale: Locale;
  onUpdated: (site: Site) => void;
}) {
  const labels = managerSitesCopy[locale];
  const copy = labels.coordinates;
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
  const restoreFocus = useRef(false);
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
  useLayoutEffect(() => {
    if (editing || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (trigger.current && !trigger.current.disabled) trigger.current.focus();
    else document.getElementById('main')?.focus();
  }, [editing]);
  function close() {
    generation.current++;
    restoreFocus.current = true;
    setEditing(false);
    setBusy(null);
    setError('');
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
      } else setNotice(copy.reloaded);
      loaded.current = true;
      onUpdated(latest);
      setNeedsReload(false);
    } catch (error) {
      if (current === generation.current)
        setError(locale === 'en' ? message(error) : copy.loadFailed);
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
      coordinates = parseCoordinateInputs(latitude, longitude, locale) ?? null;
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
      setNotice(coordinates ? copy.saved : copy.removed);
      close();
    } catch (error) {
      if (current === generation.current) {
        setError(`${locale === 'en' ? message(error) : copy.saveFailed} ${copy.reloadHint}`);
        setNeedsReload(true);
      }
    } finally {
      if (current === generation.current) setBusy(null);
    }
  }
  return (
    <section className="site-coordinate-editor" aria-label={copy.region(site.name)}>
      <IconButton
        ref={trigger}
        className="quiet"
        aria-expanded={editing}
        aria-controls={formId}
        label={site.coordinates ? copy.edit(site.name) : copy.add(site.name)}
        tooltip={site.coordinates ? copy.editHint : copy.addHint}
        disabled={!online || busy === 'saving'}
        onClick={() => (editing ? close() : open())}
      >
        <MapPinIcon aria-hidden="true" />
      </IconButton>
      {!online && <p className="muted">{copy.connect}</p>}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {editing && (
        <Form
          noValidate
          id={formId}
          data-site-coordinate-form
          aria-label={copy.edit(site.name)}
          onSubmit={save}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && busy !== 'saving') {
              event.preventDefault();
              close();
            }
          }}
        >
          <p className="muted">{copy.snapshot}</p>
          {loaded.current && (
            <p className="muted">
              {copy.loaded(expected ? `${expected.latitude}, ${expected.longitude}` : undefined)}
            </p>
          )}
          {busy && (
            <p className="muted" role="status">
              {busy === 'loading' ? copy.loading : copy.saving}
            </p>
          )}
          {!online && (
            <p className="muted" role="status">
              {copy.offline}
            </p>
          )}
          <FieldSet disabled={Boolean(busy) || needsReload || !online}>
            <FieldLegend>{copy.proposed}</FieldLegend>
            <div className="form-grid">
              <Label>
                {labels.latitude}
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
                {labels.longitude}
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
              {copy.clear}
            </Button>
          </FieldSet>
          <p className="muted">{copy.both}</p>
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
                {copy.reload}
              </Button>
            )}
            <Button
              type="submit"
              className="primary"
              disabled={!online || Boolean(busy) || needsReload}
            >
              {copy.save}
            </Button>
            <Button type="button" className="quiet" disabled={busy === 'saving'} onClick={close}>
              {copy.cancel}
            </Button>
          </div>
        </Form>
      )}
    </section>
  );
}
