import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { NativeSelect, NativeSelectOption } from './components/ui/native-select';
import { useRef, useState, type FormEvent } from 'react';
import {
  checklistItemLabel,
  readingBounds,
  type Catalog,
  type CatalogSite,
  type Site,
  type WorkerAccount,
} from '@fieldwork/contracts';
import { ApiError, createClient } from '@fieldwork/sdk';
import type { Locale } from '@fieldwork/strings';
import { parseCoordinateInputs } from './coordinate-input';
import SiteLocation from './SiteLocation';
import SiteCoordinatesEditor from './SiteCoordinatesEditor';
import SiteClosuresEditor from './SiteClosuresEditor';
import WorkerInvitations from './WorkerInvitations';
import WorkerAccounts from './WorkerAccounts';
import { PageHeading, PanelHeader } from './components';
import ChecklistItemsEditor, { checklistItems } from './ChecklistItemsEditor';
import { managerSitesCopy } from './manager-sites-copy';
import { managerDispatchCopy } from './manager-dispatch-copy';
const client = createClient();
export default function Resources({
  catalog,
  locale,
  refresh,
  online,
  onSiteUpdated,
  onSiteClosuresUpdated,
  onCatalog,
  onWorkerUpdated,
}: {
  catalog: Catalog;
  locale: Locale;
  refresh: () => Promise<void>;
  online: boolean;
  onSiteUpdated: (site: Site) => void;
  onSiteClosuresUpdated: (site: CatalogSite) => void;
  onCatalog: (catalog: Catalog) => void;
  onWorkerUpdated: (account: WorkerAccount) => void;
}) {
  const copy = managerSitesCopy[locale];
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checklistRevision, resetChecklist] = useState(0);
  const forms = useRef<HTMLDivElement>(null);
  async function beforeReload() {
    if (busy) throw new Error(copy.wait);
    if (forms.current?.querySelector('[data-site-coordinate-form]'))
      throw new Error(copy.openCoordinates);
    if (forms.current?.querySelector('[data-site-closure-form]'))
      throw new Error(copy.openClosures);
    for (const form of forms.current?.querySelectorAll<HTMLFormElement>('form') ?? []) {
      if (form && [...new FormData(form).values()].some((value) => String(value).trim()))
        throw new Error(copy.unsaved);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>, kind: 'site' | 'template') {
    event.preventDefault();
    if (kind === 'site' && !online) return;
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
            locale,
          ),
        );
      else
        await client.createTemplate(
          String(data.get('name')),
          checklistItems(data),
          data.get('requiresPhoto') === 'required',
        );
      await refresh();
      form.reset();
      if (kind === 'template') resetChecklist((revision) => revision + 1);
      setNotice(kind === 'site' ? copy.saved : 'Checklist added.');
    } catch (error) {
      setError(
        kind === 'site' &&
          locale === 'id' &&
          (error instanceof ApiError || error instanceof TypeError)
          ? copy.failed
          : error instanceof Error
            ? error.message
            : 'Unable to save.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title={managerDispatchCopy[locale].resources} description={copy.intro} />
      {error && <Alert className="banner error">{error}</Alert>}
      {notice && (
        <Alert className="banner notice" role="status">
          {notice}
        </Alert>
      )}
      <div ref={forms} className="resource-grid">
        <Card className="catalog-panel">
          <PanelHeader
            title={
              <>
                {copy.sites} <span className="panel-count">{catalog.sites.length}</span>
              </>
            }
            description={copy.sitesHint}
          />
          <div className="catalog-columns">
            <ul className="resource-list">
              {catalog.sites.map((site) => (
                <li key={site.id}>
                  <strong>{site.name}</strong>
                  <p>{site.address}</p>
                  <SiteCoordinatesEditor
                    site={site}
                    online={online}
                    locale={locale}
                    onUpdated={onSiteUpdated}
                  />
                  <SiteClosuresEditor
                    site={site}
                    online={online}
                    locale={locale}
                    onUpdated={onSiteClosuresUpdated}
                  />
                  <SiteLocation
                    key={`${site.id}:${site.coordinates?.latitude ?? ''}:${site.coordinates?.longitude ?? ''}`}
                    site={site}
                    online={online}
                    locale={locale}
                    beforeReload={beforeReload}
                  />
                </li>
              ))}
            </ul>
            <Form noValidate aria-label={copy.add} onSubmit={(event) => void create(event, 'site')}>
              <h3>{copy.add}</h3>
              <Label>
                {copy.name}
                <Input name="name" required minLength={2} maxLength={120} />
              </Label>
              <Label>
                {copy.address}
                <Input name="address" required minLength={3} maxLength={250} />
              </Label>
              <p className="muted">{copy.coordinatesHint}</p>
              <div className="form-grid">
                <Label>
                  {copy.latitude}
                  <Input name="latitude" type="number" step="any" min={-90} max={90} />
                </Label>
                <Label>
                  {copy.longitude}
                  <Input name="longitude" type="number" step="any" min={-180} max={180} />
                </Label>
              </div>
              {!online && <p className="muted">{copy.offline}</p>}
              <Button className="primary" disabled={!online || busy}>
                {copy.save}
              </Button>
            </Form>
          </div>
        </Card>
        <Card className="catalog-panel" lang="en">
          <PanelHeader
            title={
              <>
                Checklists <span className="panel-count">{catalog.templates.length}</span>
              </>
            }
            description="Reusable questions for new assignments."
          />
          <div className="catalog-columns">
            <ul className="resource-list">
              {catalog.templates.map((template) => (
                <li key={template.id}>
                  <strong>{template.name}</strong>
                  <p>{template.items.length} inspection items</p>
                  {template.requiresPhoto && (
                    <p>At least one site photo required per submission.</p>
                  )}
                  <ol>
                    {template.items.map((item) => (
                      <li key={item.id}>
                        {checklistItemLabel(item)}
                        {item.requiresPhoto && <span className="muted"> · Photo required</span>}
                        {item.responseType === 'text' && (
                          <span className="muted"> · Text response</span>
                        )}
                        {item.responseType === 'number' && (
                          <span className="muted">
                            {readingBounds(item)
                              ? ` · Reading ${readingBounds(item)}`
                              : ' · Numeric reading'}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            <Form
              noValidate
              aria-label="Add a checklist"
              onSubmit={(event) => void create(event, 'template')}
            >
              <h3>Add a checklist</h3>
              <Label>
                Checklist name
                <Input name="name" required minLength={2} maxLength={120} />
              </Label>
              <ChecklistItemsEditor key={checklistRevision} busy={busy} />
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
                Up to 50 items, with required photos on up to 3. Assigned orders keep their original
                checklist and photo requirements.
              </p>
              <Button className="primary" disabled={busy}>
                Add checklist
              </Button>
            </Form>
          </div>
        </Card>
      </div>
      <Card className="brief worker-directory" lang="en">
        <PanelHeader
          title="Field workers"
          description="Invite people and manage their access to the workspace."
          actions={
            <>
              <WorkerInvitations online={online} />
              <WorkerAccounts online={online} onCatalog={onCatalog} onUpdated={onWorkerUpdated} />
            </>
          }
        />
        <ul className="worker-summary">
          {catalog.users
            .filter((user) => user.role === 'worker')
            .map((user) => (
              <li key={user.id}>
                <strong>{user.name}</strong>
                <span className="muted">Field worker</span>
              </li>
            ))}
        </ul>
        {!catalog.users.some((user) => user.role === 'worker') && <p>No field workers yet.</p>}
        <p>
          Invite workers to set up their accounts, or use the{' '}
          <a href="https://github.com/tedy69/fieldwork/blob/main/docs/self-hosting.md">
            self-hosting guide
          </a>{' '}
          for server setup.
        </p>
      </Card>
    </>
  );
}
