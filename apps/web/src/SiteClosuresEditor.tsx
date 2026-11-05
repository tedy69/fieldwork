import { useId, useRef, useState, type FormEvent } from 'react';
import { SkippedDatesSchema, type CatalogSite } from '@fieldwork/contracts';
import { ApiError } from '@fieldwork/sdk';
import { Button } from './components/ui/button';
import { FieldError } from './components/ui/field';
import { Form } from './components/ui/form';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { ActionGroup } from './components';
import { client, message } from './lib';

export default function SiteClosuresEditor({
  site,
  online,
  onUpdated,
}: {
  site: CatalogSite;
  online: boolean;
  onUpdated: (site: CatalogSite) => void;
}) {
  const [expected, setExpected] = useState<string[] | null>(null);
  const [proposal, setProposal] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  function close() {
    setExpected(null);
    setConflict(false);
    setError('');
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expected || !online || busy || conflict) return;
    const dates = proposal
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean);
    const parsed = SkippedDatesSchema.safeParse(dates);
    if (!parsed.success) {
      setError('Enter up to 52 distinct dates in YYYY-MM-DD format, one per line.');
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      onUpdated(
        await client.updateSiteClosures(site.id, { expectedDates: expected, dates: parsed.data }),
      );
      setSaved(true);
      close();
    } catch (error) {
      setConflict(error instanceof ApiError && error.code === 'CLOSURE_CONFLICT');
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError('');
    try {
      const latest = await client.site(site.id);
      onUpdated(latest);
      setExpected(latest.closureDates ?? []);
      setConflict(false);
      requestAnimationFrame(() => input.current?.focus());
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="site-closure-editor" aria-label={`Closure dates for ${site.name}`}>
      <Button
        ref={trigger}
        type="button"
        className="quiet"
        aria-label={`Edit closure dates for ${site.name}`}
        aria-expanded={expected !== null}
        aria-controls={formId}
        disabled={!online || busy}
        onClick={() => {
          if (expected) return close();
          const dates = site.closureDates ?? [];
          setExpected(dates);
          setProposal(dates.join('\n'));
          setSaved(false);
          requestAnimationFrame(() => input.current?.focus());
        }}
      >
        Closure dates{site.closureDates?.length ? ` (${site.closureDates.length})` : ''}
      </Button>
      {saved && <p role="status">Closure dates saved.</p>}
      {expected && (
        <Form
          id={formId}
          aria-label={`Edit closure dates for ${site.name}`}
          data-site-closure-form
          onSubmit={(event) => void save(event)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault();
              close();
            }
          }}
        >
          <Label>
            Closure dates, one per line
            <Textarea
              ref={input}
              name="closureDates"
              rows={4}
              maxLength={1500}
              value={proposal}
              onChange={(event) => {
                setProposal(event.target.value);
                if (!conflict) setError('');
              }}
              disabled={busy}
              placeholder="2026-12-25"
              aria-describedby={error ? `${formId}-error` : undefined}
            />
          </Label>
          <p className="muted">Use YYYY-MM-DD. Save an empty list to clear the calendar.</p>
          {proposal !== expected.join('\n') && (
            <p className="muted">Saved dates: {expected.length ? expected.join(', ') : 'None'}</p>
          )}
          {!online && <p role="status">Reconnect to save closure dates.</p>}
          {error && <FieldError id={`${formId}-error`}>{error}</FieldError>}
          <ActionGroup>
            {conflict && (
              <Button
                type="button"
                variant="outline"
                disabled={!online || busy}
                onClick={() => void reload()}
              >
                Load saved dates
              </Button>
            )}
            <Button className="primary" disabled={!online || busy || conflict}>
              {busy ? 'Working…' : 'Save closure dates'}
            </Button>
            <Button type="button" className="quiet" disabled={busy} onClick={close}>
              Cancel
            </Button>
          </ActionGroup>
        </Form>
      )}
    </section>
  );
}
