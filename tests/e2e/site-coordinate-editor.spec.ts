import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { Coordinates } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const point = { latitude: 51.5, longitude: -0.1 };
const tileEndpoint = 'https://tile.openstreetmap.org/**';
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce3df"/><text x="20" y="130">Synthetic test tile</text></svg>';
async function fixture(name: string, coordinates?: Coordinates) {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const site = await manager.createSite(
    name,
    'Synthetic editor fixture, not a real worksite',
    coordinates,
  );
  return { manager, site };
}
async function resources(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
}
const editor = (page: Page, name: string) =>
  page.getByRole('region', { name: `Coordinates for ${name}`, exact: true });
const form = (page: Page, name: string) =>
  page.getByRole('form', { name: `Edit coordinates for ${name}`, exact: true });
const row = (page: Page, name: string) =>
  page.locator('.resource-list > li').filter({ has: page.getByText(name, { exact: true }) });

test('manager adds, changes and clears coordinates without rewriting assignment snapshots', async ({
  page,
  context,
}) => {
  const { manager, site } = await fixture('Coordinate notebook QA');
  const oldOrder = await manager.createOrder({
    title: 'Before coordinate edit QA',
    siteId: site.id,
    templateId: 'routine',
    assigneeId: 'worker',
    priority: 'routine',
    dueDate: '2026-12-28',
    instructions: '',
  });
  let tiles = 0;
  await page.route(tileEndpoint, (route) => {
    tiles++;
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await resources(page);
  const open = editor(page, site.name).getByRole('button', {
    name: `Add coordinates for ${site.name}`,
    exact: true,
  });
  await open.focus();
  await page.keyboard.press('Enter');
  const fields = form(page, site.name);
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await expect(fields).toHaveCSS('border-left-color', 'rgb(245, 198, 109)');
  await expect(fields).toHaveCSS('background-color', 'rgb(21, 29, 32)');
  await fields.getByLabel('Latitude', { exact: true }).fill('0');
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields.getByRole('alert')).toContainText('Enter both latitude and longitude');
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('0');
  await fields.getByLabel('Longitude', { exact: true }).fill('0');
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  const edit = editor(page, site.name).getByRole('button', {
    name: `Edit coordinates for ${site.name}`,
    exact: true,
  });
  await expect(edit).toBeFocused();
  expect((await manager.site(site.id)).coordinates).toEqual({ latitude: 0, longitude: 0 });
  expect(await manager.order(oldOrder.id)).toEqual(oldOrder);
  expect(tiles).toBe(0);
  await edit.click();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('0');
  await fields.getByLabel('Latitude', { exact: true }).fill('51.5');
  await fields.getByLabel('Longitude', { exact: true }).fill('-0.1');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await fields.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('site-coordinate-editor-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await fields.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('site-coordinate-editor-phone.png') });
  await context.setOffline(true);
  await expect(
    fields.getByRole('button', { name: 'Save coordinates', exact: true }),
  ).toBeDisabled();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('51.5');
  await context.setOffline(false);
  await expect(fields.getByRole('button', { name: 'Save coordinates', exact: true })).toBeEnabled();
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields).toHaveCount(0);
  const newOrder = await manager.createOrder({
    title: 'After coordinate edit QA',
    siteId: site.id,
    templateId: 'routine',
    assigneeId: 'worker',
    priority: 'routine',
    dueDate: '2026-12-28',
    instructions: '',
  });
  expect(newOrder.site.coordinates).toEqual(point);
  expect(await manager.order(oldOrder.id)).toEqual(oldOrder);
  await edit.click();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('51.5');
  await fields.getByRole('button', { name: 'Clear both fields', exact: true }).click();
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(open).toBeFocused();
  expect((await manager.site(site.id)).coordinates).toBeUndefined();
  expect((await manager.order(newOrder.id)).site.coordinates).toEqual(point);
  await open.click();
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  expect(errors).toEqual([]);
});

test('conflicting edits require a fresh read while keeping the manager proposal', async ({
  page,
}) => {
  const { manager, site } = await fixture('Coordinate conflict QA', point);
  await resources(page);
  await editor(page, site.name)
    .getByRole('button', { name: `Edit coordinates for ${site.name}`, exact: true })
    .click();
  const fields = form(page, site.name);
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await fields.getByLabel('Latitude', { exact: true }).fill('12');
  await fields.getByLabel('Longitude', { exact: true }).fill('34');
  await manager.updateSiteLocation(site.id, {
    expectedCoordinates: point,
    coordinates: { latitude: 5, longitude: 6 },
  });
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields.getByRole('alert')).toContainText('Site coordinates changed');
  const reload = fields.getByRole('button', { name: 'Reload site', exact: true });
  await expect(reload).toBeFocused();
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeDisabled();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('12');
  await page.route(`**/api/v1/sites/${site.id}`, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Synthetic site read failed.' } },
    }),
  );
  await reload.click();
  await expect(fields.getByRole('alert')).toContainText('Synthetic site read failed');
  await expect(fields.getByLabel('Longitude', { exact: true })).toHaveValue('34');
  await page.unroute(`**/api/v1/sites/${site.id}`);
  await reload.click();
  await expect(fields.getByText('Loaded coordinates: 5, 6.', { exact: true })).toBeVisible();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('12');
  await expect(fields.getByLabel('Longitude', { exact: true })).toHaveValue('34');
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields).toHaveCount(0);
  expect((await manager.site(site.id)).coordinates).toEqual({ latitude: 12, longitude: 34 });
});

test('lost acknowledgments lock retries, held saves block dismissal, and cancelled reads stay dismissed', async ({
  page,
}) => {
  const { manager, site } = await fixture('Coordinate recovery QA', point);
  await resources(page);
  const edit = editor(page, site.name).getByRole('button', {
    name: `Edit coordinates for ${site.name}`,
    exact: true,
  });
  await edit.click();
  const fields = form(page, site.name);
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await fields.getByRole('button', { name: 'Clear both fields', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const sent = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(`**/api/v1/sites/${site.id}/location`, async (route) => {
    await route.fetch();
    received();
    await held;
    await route.abort('failed');
  });
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await sent;
  await expect(fields.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(fields).toBeVisible();
  release();
  await expect(fields.getByRole('button', { name: 'Reload site', exact: true })).toBeFocused();
  await expect(
    fields.getByRole('button', { name: 'Save coordinates', exact: true }),
  ).toBeDisabled();
  expect((await manager.site(site.id)).coordinates).toBeUndefined();
  await page.unroute(`**/api/v1/sites/${site.id}/location`);
  await fields.getByRole('button', { name: 'Reload site', exact: true }).click();
  await expect(fields.getByText('Loaded coordinates: none.', { exact: true })).toBeVisible();
  await expect(fields.getByLabel('Latitude', { exact: true })).toHaveValue('');
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields).toHaveCount(0);
  let releaseRead!: () => void;
  const heldRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await page.route(`**/api/v1/sites/${site.id}`, async (route) => {
    const response = await route.fetch();
    await heldRead;
    await route.fulfill({ response });
  });
  await editor(page, site.name)
    .getByRole('button', { name: `Add coordinates for ${site.name}`, exact: true })
    .click();
  await expect(fields.getByText('Loading current coordinates…', { exact: true })).toBeVisible();
  await fields.getByRole('button', { name: 'Cancel', exact: true }).click();
  releaseRead();
  await expect(fields).toHaveCount(0);
  await page.unroute(`**/api/v1/sites/${site.id}`);
});

test('map changes need a new opt-in and map-tool reload cannot discard an open editor', async ({
  browser,
}) => {
  const { site } = await fixture('Coordinate map privacy QA', point);
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  let tiles = 0;
  await page.route(tileEndpoint, (route) => {
    tiles++;
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  await resources(page);
  const entry = row(page, site.name);
  await entry.getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(entry.getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
  await expect.poll(() => tiles).toBeGreaterThan(0);
  await entry
    .getByRole('button', { name: `Edit coordinates for ${site.name}`, exact: true })
    .click();
  const fields = form(page, site.name);
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await fields.getByLabel('Latitude', { exact: true }).fill('40');
  await fields.getByRole('button', { name: 'Save coordinates', exact: true }).click();
  await expect(fields).toHaveCount(0);
  await expect(entry.getByRole('region', { name: `Map of ${site.name}`, exact: true })).toHaveCount(
    0,
  );
  await expect(entry.getByRole('button', { name: 'Load site map', exact: true })).toBeEnabled();
  const afterSave = tiles;
  await page.waitForTimeout(100);
  expect(tiles).toBe(afterSave);
  await page.reload();
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await entry.getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(entry.getByRole('alert')).toContainText('Map tools could not load.');
  await entry
    .getByRole('button', { name: `Edit coordinates for ${site.name}`, exact: true })
    .click();
  await expect(fields.getByLabel('Latitude', { exact: true })).toBeFocused();
  await fields.getByRole('button', { name: 'Clear both fields', exact: true }).click();
  await entry.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(entry.getByRole('alert')).toContainText('Save or cancel the open coordinate editor');
  await expect(fields).toBeVisible();
  await fields.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.unroute('**/assets/leaflet-src-*.js');
  await Promise.all([
    page.waitForEvent('load'),
    entry.getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await context.close();
});
