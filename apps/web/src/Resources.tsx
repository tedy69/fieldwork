import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Label } from './components/ui/label';
import { NativeSelect, NativeSelectOption } from './components/ui/native-select';
import { useRef, useState, type FormEvent } from 'react';
import type { Catalog, Site } from '@fieldwork/contracts';
import { createClient } from '@fieldwork/sdk';
import { parseCoordinateInputs } from './coordinate-input';
import SiteLocation from './SiteLocation';
import SiteCoordinatesEditor from './SiteCoordinatesEditor';
const client = createClient();
export default function Resources({
  catalog,
  refresh,
  online,
  onSiteUpdated,
}: {
  catalog: Catalog;
  refresh: () => Promise<void>;
  online: boolean;
  onSiteUpdated: (site: Site) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const forms = useRef<HTMLDivElement>(null);
  async function beforeReload() {
    if (busy) throw new Error('Wait for the workspace save to finish before reloading.');
    if (forms.current?.querySelector('[data-site-coordinate-form]'))
      throw new Error('Save or cancel the open coordinate editor before reloading.');
    for (const form of forms.current?.querySelectorAll<HTMLFormElement>('form') ?? []) {
      if (form && [...new FormData(form).values()].some((value) => String(value).trim()))
        throw new Error(
          'Your workspace form has unsaved changes. Save or clear it before reloading.',
        );
    }
  }
  async function create(event: FormEvent<HTMLFormElement>, kind: 'site' | 'template') {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'site')
        await client.createSite(
          String(data.get('name')),
          String(data.get('address')),
          parseCoordinateInputs(
            String(data.get('latitude') ?? ''),
            String(data.get('longitude') ?? ''),
          ),
        );
      else
        await client.createTemplate(
          String(data.get('name')),
          String(data.get('items'))
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
          data.get('requiresPhoto') === 'required',
        );
      await refresh();
      form.reset();
      setNotice(kind === 'site' ? 'Site added.' : 'Checklist added.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">WORKSPACE SETUP</span>
        <h1>Sites &amp; checklists</h1>
        <p>Define the places and inspection standards your team works with.</p>
      </div>
      {error && <Alert className="banner error">{error}</Alert>}
      {notice && (
        <Alert className="banner notice" role="status">
          {notice}
        </Alert>
      )}
      <div ref={forms} className="resource-grid">
        <Card>
          <h2>
            Sites <span className="muted">/ {catalog.sites.length}</span>
          </h2>
          <ul className="resource-list">
            {catalog.sites.map((site) => (
              <li key={site.id}>
                <strong>{site.name}</strong>
                <p>{site.address}</p>
                <SiteCoordinatesEditor site={site} online={online} onUpdated={onSiteUpdated} />
                <SiteLocation
                  key={`${site.id}:${site.coordinates?.latitude ?? ''}:${site.coordinates?.longitude ?? ''}`}
                  site={site}
                  online={online}
                  beforeReload={beforeReload}
                />
              </li>
            ))}
          </ul>
          <form aria-label="Add a site" onSubmit={(event) => void create(event, 'site')}>
            <h3>Add a site</h3>
            <Label>
              Site name
              <Input name="name" required minLength={2} maxLength={120} />
            </Label>
            <Label>
              Address
              <Input name="address" required minLength={3} maxLength={250} />
            </Label>
            <p className="muted">
              Coordinates are optional. Enter them only when the location should be shared with your
              workspace.
            </p>
            <div className="form-grid">
              <Label>
                Latitude
                <Input name="latitude" type="number" step="any" min={-90} max={90} />
              </Label>
              <Label>
                Longitude
                <Input name="longitude" type="number" step="any" min={-180} max={180} />
              </Label>
            </div>
            <Button className="primary" disabled={busy}>
              Add site
            </Button>
          </form>
        </Card>
        <Card>
          <h2>
            Checklists <span className="muted">/ {catalog.templates.length}</span>
          </h2>
          <ul className="resource-list">
            {catalog.templates.map((template) => (
              <li key={template.id}>
                <strong>{template.name}</strong>
                <p>{template.items.length} inspection items</p>
                {template.requiresPhoto && <p>At least one site photo required per submission.</p>}
                <ol>
                  {template.items.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <form aria-label="Add a checklist" onSubmit={(event) => void create(event, 'template')}>
            <h3>Add a checklist</h3>
            <Label>
              Checklist name
              <Input name="name" required minLength={2} maxLength={120} />
            </Label>
            <Label>
              Inspection items, one per line
              <Textarea
                name="items"
                required
                rows={5}
                placeholder={'Check access route\nCheck equipment condition'}
              />
            </Label>
            <Label>
              Photo evidence
              <NativeSelect name="requiresPhoto" aria-label="Photo evidence" defaultValue="">
                <NativeSelectOption value="">Optional photos</NativeSelectOption>
                <NativeSelectOption value="required">
                  At least one photo required
                </NativeSelectOption>
              </NativeSelect>
            </Label>
            <p className="muted">
              Up to 50 items. Assigned orders keep their original checklist and photo requirement.
            </p>
            <Button className="primary" disabled={busy}>
              Add checklist
            </Button>
          </form>
        </Card>
      </div>
      <Card className="brief">
        <h2>Field workers</h2>
        <p>
          {catalog.users
            .filter((user) => user.role === 'worker')
            .map((user) => user.name)
            .join(' · ') || 'No field workers yet.'}
        </p>
        <p>
          Create accounts with <code>npm run user:create</code>. See the{' '}
          <a href="https://github.com/tedy69/fieldwork/blob/main/docs/self-hosting.md">
            self-hosting guide
          </a>{' '}
          for setup.
        </p>
      </Card>
    </>
  );
}
