import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Alert } from './components/ui/alert';
import { Input, Textarea } from './components/ui/input';
import { useState, type FormEvent } from 'react';
import type { Catalog } from '@fieldwork/contracts';
import { createClient } from '@fieldwork/sdk';
const client = createClient();
export default function Resources({
  catalog,
  refresh,
}: {
  catalog: Catalog;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function create(event: FormEvent<HTMLFormElement>, kind: 'site' | 'template') {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'site')
        await client.createSite(String(data.get('name')), String(data.get('address')));
      else
        await client.createTemplate(
          String(data.get('name')),
          String(data.get('items'))
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
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
      <div className="resource-grid">
        <Card>
          <h2>
            Sites <span className="muted">/ {catalog.sites.length}</span>
          </h2>
          <ul className="resource-list">
            {catalog.sites.map((site) => (
              <li key={site.id}>
                <strong>{site.name}</strong>
                <p>{site.address}</p>
              </li>
            ))}
          </ul>
          <form aria-label="Add a site" onSubmit={(event) => void create(event, 'site')}>
            <h3>Add a site</h3>
            <label>
              Site name
              <Input name="name" required minLength={2} maxLength={120} />
            </label>
            <label>
              Address
              <Input name="address" required minLength={3} maxLength={250} />
            </label>
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
            <label>
              Checklist name
              <Input name="name" required minLength={2} maxLength={120} />
            </label>
            <label>
              Inspection items, one per line
              <Textarea
                name="items"
                required
                rows={5}
                placeholder={'Check access route\nCheck equipment condition'}
              />
            </label>
            <p className="muted">Up to 50 items. Assigned orders keep their original checklist.</p>
            <Button className="primary" disabled={busy}>
              Add checklist
            </Button>
          </form>
        </Card>
      </div>
      <section className="brief">
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
      </section>
    </>
  );
}
