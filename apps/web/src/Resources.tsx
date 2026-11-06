import { Button } from './components/ui/button';
import { Form } from './components/ui/form';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { SearchField } from './components/ui/search-field';
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
import { inspectionCopy, notebookCopy, signInCopy, type Locale } from '@fieldwork/strings';
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
import { checklistEditorCopy } from './checklist-editor-copy';
import { workerInvitationsCopy } from './worker-invitations-copy';
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
  const checklist = checklistEditorCopy[locale];
  const people = workerInvitationsCopy[locale];
  const validation = locale === 'id' ? signInCopy.id.web : undefined;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [checklistRevision, resetChecklist] = useState(0);
  const [checklistSearch, setChecklistSearch] = useState('');
  const checklistQuery = checklistSearch.trim().toLowerCase();
  const templates = checklistQuery
    ? catalog.templates.filter(
        (template) =>
          template.name.toLowerCase().includes(checklistQuery) ||
          template.items.some((item) =>
            checklistItemLabel(item).toLowerCase().includes(checklistQuery),
          ),
      )
    : catalog.templates;
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
    if (!online) return;
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
      setNotice(kind === 'site' ? copy.saved : checklist.saved);
    } catch (error) {
      setError(
        locale === 'id' && (error instanceof ApiError || error instanceof TypeError)
          ? kind === 'site'
            ? copy.failed
            : checklist.failed
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
            <Form
              noValidate
              validationCopy={validation}
              aria-label={copy.add}
              onSubmit={(event) => void create(event, 'site')}
            >
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
        <Card className="catalog-panel">
          <PanelHeader
            title={
              <>
                {checklist.checklists}{' '}
                <span className="panel-count">{catalog.templates.length}</span>
              </>
            }
            description={checklist.intro}
          />
          <div className="catalog-columns">
            <div className="checklist-catalog">
              <SearchField
                aria-label={checklist.search}
                placeholder={checklist.searchPlaceholder}
                value={checklistSearch}
                onValueChange={setChecklistSearch}
                clearLabel={notebookCopy[locale].clearSearch}
              />
              {checklistQuery && templates.length === 0 ? (
                <p className="muted" role="status">
                  {checklist.noMatches}
                </p>
              ) : (
                <ul className="resource-list" aria-label={checklist.checklists}>
                  {templates.map((template) => (
                    <li key={template.id}>
                      <strong>{template.name}</strong>
                      <p>{checklist.itemCount(template.items.length)}</p>
                      {template.requiresPhoto && <p>{checklist.atLeastOnePhoto}</p>}
                      <ol>
                        {template.items.map((item) => {
                          const bounds = readingBounds(item, inspectionCopy[locale].bounds);
                          return (
                            <li key={item.id}>
                              {checklistItemLabel(item)}
                              {item.requiresPhoto && (
                                <span className="muted"> · {checklist.photoRequired}</span>
                              )}
                              {item.responseType === 'text' && (
                                <span className="muted"> · {checklist.text}</span>
                              )}
                              {item.responseType === 'number' && (
                                <span className="muted">
                                  {' · '}
                                  {bounds ? checklist.readingBounds(bounds) : checklist.number}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Form
              noValidate
              className="checklist-form"
              validationCopy={validation}
              aria-label={checklist.add}
              onSubmit={(event) => void create(event, 'template')}
            >
              <h3>{checklist.add}</h3>
              <Label>
                {checklist.name}
                <Input name="name" required minLength={2} maxLength={120} />
              </Label>
              <ChecklistItemsEditor key={checklistRevision} busy={busy} locale={locale} />
              <Label>
                {checklist.photoEvidence}
                <NativeSelect
                  name="requiresPhoto"
                  aria-label={checklist.photoEvidence}
                  defaultValue=""
                >
                  <NativeSelectOption value="">{checklist.photoOptional}</NativeSelectOption>
                  <NativeSelectOption value="required">{checklist.photoMinimum}</NativeSelectOption>
                </NativeSelect>
              </Label>
              <p className="muted">{checklist.limits}</p>
              {!online && <p className="muted">{checklist.offline}</p>}
              <Button className="primary" disabled={!online || busy}>
                {checklist.save}
              </Button>
            </Form>
          </div>
        </Card>
      </div>
      <Card className="brief worker-directory">
        <PanelHeader
          title={people.directory}
          description={people.directoryHint}
          actions={
            <>
              <WorkerInvitations online={online} locale={locale} />
              <WorkerAccounts
                online={online}
                locale={locale}
                onCatalog={onCatalog}
                onUpdated={onWorkerUpdated}
              />
            </>
          }
        />
        <ul className="worker-summary">
          {catalog.users
            .filter((user) => user.role === 'worker')
            .map((user) => (
              <li key={user.id}>
                <strong>{user.name}</strong>
                <span className="muted">{people.worker}</span>
              </li>
            ))}
        </ul>
        {!catalog.users.some((user) => user.role === 'worker') && <p>{people.noWorkers}</p>}
        <p>
          {people.setup}{' '}
          <a href="https://github.com/tedy69/fieldwork/blob/main/docs/self-hosting.md">
            {people.guide}
          </a>{' '}
          {people.forServer}
        </p>
      </Card>
    </>
  );
}
