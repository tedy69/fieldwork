import { expect, test, type Page, type ConsoleMessage } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { Coordinates, MapProvider } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const tileEndpoint = 'https://tile.openstreetmap.org/**';
const tile =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce3df"/><path d="M0 0H256V256H0Z" fill="none" stroke="#8a9a92"/><text x="20" y="130" fill="#23352c" font-family="sans-serif" font-size="16">Synthetic test tile</text></svg>';
async function fixture(
  prefix: string,
  coordinates: Coordinates = { latitude: 51.5, longitude: -0.1 },
) {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const site = await manager.createSite(prefix, 'Synthetic coordinate fixture', coordinates);
  const order = await manager.createOrder({
    title: prefix,
    instructions: 'Synthetic map workflow.',
    siteId: site.id,
    templateId: 'routine',
    assigneeId: 'worker',
    priority: 'routine',
    dueDate: '2026-12-28',
  });
  return { manager, site, order };
}
async function login(page: Page, role = 'worker') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
const map = (page: Page, name: string) =>
  page.getByRole('region', { name: `Map of ${name}`, exact: true });
const location = (page: Page) => page.locator('.site-location');

test('manager adds optional paired coordinates without loading tiles or changing existing assignments', async ({
  page,
}) => {
  const { manager } = await fixture('Map manager existing QA');
  const before = await manager.order('demo-1');
  let tiles = 0;
  await page.route(tileEndpoint, (route) => {
    tiles++;
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a site', exact: true });
  await form.getByLabel('Site name', { exact: true }).fill('Map coordinate entry QA');
  await form
    .getByLabel('Address', { exact: true })
    .fill('Synthetic site, no real customer address');
  await form.getByLabel('Latitude', { exact: true }).fill('0');
  await form.getByRole('button', { name: 'Add site', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter both latitude and longitude');
  await expect(form.getByLabel('Site name', { exact: true })).toHaveValue(
    'Map coordinate entry QA',
  );
  await form.getByLabel('Longitude', { exact: true }).fill('0');
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/sites') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add site', exact: true }).click();
  expect((await (await saved).json()).coordinates).toEqual({ latitude: 0, longitude: 0 });
  await expect(page.getByRole('status').filter({ hasText: 'Site added.' })).toBeVisible();
  await expect(form.getByLabel('Latitude', { exact: true })).toHaveValue('');
  expect(tiles).toBe(0);
  expect(await manager.order('demo-1')).toEqual(before);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('site-coordinates-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(errors).toEqual([]);
});

test('worker opts into map tiles, uses keyboard controls, and retains a photo draft through offline reload', async ({
  page,
  context,
}) => {
  const { site, order } = await fixture('Map worker notebook QA');
  await page.addInitScript(() => {
    const state = window as unknown as { mapGeolocationCalls: number };
    state.mapGeolocationCalls = 0;
    navigator.geolocation.getCurrentPosition = () => {
      state.mapGeolocationCalls++;
    };
    navigator.geolocation.watchPosition = () => {
      state.mapGeolocationCalls++;
      return 1;
    };
  });
  const requests: { url: string; referer?: string }[] = [];
  await page.route(tileEndpoint, (route) => {
    requests.push({ url: route.request().url(), referer: route.request().headers().referer });
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: tile,
      headers: { 'cache-control': 'public,max-age=604800' },
    });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const consoleErrors: string[] = [];
  const recordConsole = (entry: ConsoleMessage) => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  };
  page.on('console', recordConsole);
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Unsent report stays here while reading the map.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await expect(
    location(page).getByText('Latitude 51.5 · Longitude -0.1', { exact: true }),
  ).toBeVisible();
  const load = location(page).getByRole('button', { name: 'Load site map', exact: true });
  await expect(load).toBeEnabled();
  expect(requests).toHaveLength(0);
  await load.focus();
  await page.keyboard.press('Enter');
  const canvas = map(page, site.name);
  await expect(canvas).toBeVisible();
  await expect(location(page).getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(requests.every((request) => request.referer === `${baseURL}/`)).toBe(true);
  expect(await canvas.locator('img.leaflet-tile').first().getAttribute('referrerpolicy')).toBe(
    'strict-origin-when-cross-origin',
  );
  const attribution = location(page).getByRole('link', {
    name: '© OpenStreetMap contributors',
    exact: true,
  });
  await expect(attribution).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect(attribution).toBeVisible();
  await context.route('https://www.openstreetmap.org/copyright', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<title>Attribution test fixture</title><p>Synthetic attribution response</p>',
    }),
  );
  const popup = page.waitForEvent('popup');
  await attribution.click();
  const attributionPage = await popup;
  await attributionPage.waitForLoadState();
  expect(attributionPage.url()).toBe('https://www.openstreetmap.org/copyright');
  await attributionPage.close();
  await location(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(location(page).getByText('Zoom 16', { exact: true })).toBeVisible();
  await location(page).getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(location(page).getByText('Zoom 15', { exact: true })).toBeVisible();
  await canvas.focus();
  expect(
    await location(page)
      .locator('.site-map-frame')
      .evaluate((node) => getComputedStyle(node).outlineColor),
  ).toBe('rgb(245, 198, 109)');
  await page.keyboard.press('+');
  await expect(location(page).getByText('Zoom 16', { exact: true })).toBeVisible();
  const beforePan = await canvas.locator('.leaflet-map-pane').getAttribute('style');
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => canvas.locator('.leaflet-map-pane').getAttribute('style'))
    .not.toBe(beforePan);
  await location(page).getByRole('button', { name: 'Recenter map', exact: true }).click();
  await expect(location(page).getByText('Zoom 15', { exact: true })).toBeVisible();
  const centers = await canvas.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const marker = node.querySelector('.leaflet-overlay-pane path')!.getBoundingClientRect();
    return {
      dx: Math.abs(marker.x + marker.width / 2 - (bounds.x + bounds.width / 2)),
      dy: Math.abs(marker.y + marker.height / 2 - (bounds.y + bounds.height / 2)),
    };
  });
  expect(centers.dx).toBeLessThan(2);
  expect(centers.dy).toBeLessThan(2);
  await canvas.hover();
  await page.mouse.wheel(0, 300);
  await expect(location(page).getByText('Zoom 15', { exact: true })).toBeVisible();
  await location(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('site-map-desktop.png') });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await canvas.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('site-map-phone.png') });
  await location(page).getByRole('button', { name: 'Hide site map', exact: true }).click();
  await expect(load).toBeFocused();
  expect(
    await page.evaluate(
      () => (window as unknown as { mapGeolocationCalls: number }).mapGeolocationCalls,
    ),
  ).toBe(0);
  await expect(canvas).toHaveCount(0);
  const count = requests.length;
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  page.off('console', recordConsole);
  expect(consoleErrors).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(
    location(page).getByText(
      'Reconnect to load map tiles. Coordinates remain available in saved assignments.',
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(canvas).toHaveCount(0);
  expect(requests).toHaveLength(count);
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Unsent report stays here while reading the map.',
  );
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  expect(
    await page.evaluate(async () => (await fetch('/licenses/leaflet-BSD-2-Clause.txt')).text()),
  ).toContain('BSD 2-Clause License');
  await context.setOffline(false);
  await expect(load).toBeEnabled();
  expect(errors).toEqual([]);
});

test('map settings, tile errors, disabled providers, and unsupported latitudes have useful states', async ({
  browser,
}) => {
  const { order } = await fixture('Map error recovery QA');
  const { order: polar } = await fixture('Map polar coordinate QA', { latitude: 90, longitude: 0 });
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  let failTiles = true;
  let tileCount = 0;
  await page.route(tileEndpoint, (route) => {
    tileCount++;
    return failTiles
      ? route.fulfill({ status: 503, body: 'Synthetic tile failure' })
      : route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  await page.route('**/api/v1/map-settings', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Map settings unavailable.' } },
    }),
  );
  await login(page);
  const open = () =>
    page
      .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
      .click();
  await open();
  await expect(location(page).getByRole('alert')).toContainText('Map settings unavailable.');
  expect(tileCount).toBe(0);
  await page.unroute('**/api/v1/map-settings');
  await location(page).getByRole('button', { name: 'Retry map settings', exact: true }).click();
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Some map tiles could not load.');
  failTiles = false;
  await location(page).getByRole('button', { name: 'Retry map tiles', exact: true }).click();
  await expect(location(page).getByRole('alert')).toHaveCount(0);
  await location(page).getByRole('button', { name: 'Hide site map', exact: true }).click();
  await page.route('**/api/v1/map-settings', (route) =>
    route.fulfill({ json: { provider: null } }),
  );
  await page.reload();
  await open();
  await expect(
    location(page).getByText('Map tiles are disabled for this workspace.', { exact: true }),
  ).toBeVisible();
  await expect(
    location(page).getByRole('button', { name: 'Load site map', exact: true }),
  ).toHaveCount(0);
  await page.unroute('**/api/v1/map-settings');
  const provider: MapProvider = {
    name: 'Synthetic tile provider',
    tileUrlTemplate: 'https://tiles.example.test/{z}/{x}/{y}.png',
    attributionText: 'Synthetic test tile attribution',
    attributionUrl: 'https://example.test/attribution',
    maxZoom: 16,
  };
  await page.route('**/api/v1/map-settings', (route) => route.fulfill({ json: { provider } }));
  let customCount = 0;
  await page.route('https://tiles.example.test/**', (route) => {
    customCount++;
    return route.fulfill({ contentType: 'image/svg+xml', body: tile });
  });
  await page.reload();
  await open();
  await expect(location(page).getByText(/Tiles come from Synthetic tile provider/)).toBeVisible();
  expect(customCount).toBe(0);
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect.poll(() => customCount).toBeGreaterThan(0);
  await location(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(location(page).getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
  await expect(
    location(page).getByRole('link', { name: provider.attributionText, exact: true }),
  ).toHaveAttribute('href', provider.attributionUrl);
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page
    .getByRole('button', { name: `Open ${polar.reference}: ${polar.title}`, exact: true })
    .click();
  await expect(location(page).getByText(/outside the latitude range supported/)).toBeVisible();
  await expect(
    location(page).getByRole('button', { name: 'Load site map', exact: true }),
  ).toHaveCount(0);
  await context.close();
});

test('a failed map-tool download offers a page reload without discarding the saved report draft', async ({
  browser,
}) => {
  const { order } = await fixture('Map tools reload QA');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route(tileEndpoint, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile }),
  );
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await login(page);
  const open = () =>
    page
      .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
      .click();
  await open();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Saved before a failed map-tool download.');
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Map tools could not load.');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreMapDraftPut: () => void }).restoreMapDraftPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'fieldwork:v1:worker') throw new Error('Draft persistence unavailable');
      return original.call(this, value, key);
    };
  });
  await location(page).getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Draft persistence unavailable');
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Saved before a failed map-tool download.',
  );
  await page.evaluate(() =>
    (window as unknown as { restoreMapDraftPut: () => void }).restoreMapDraftPut(),
  );
  await page.unroute('**/assets/leaflet-src-*.js');
  await Promise.all([
    page.waitForEvent('load'),
    location(page).getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await open();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Saved before a failed map-tool download.',
  );
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(location(page).getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
  await context.close();
});

test('map-tool recovery blocks a page reload while site or checklist forms have unsaved text', async ({
  browser,
}) => {
  const { site } = await fixture('Map resource reload guard QA');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route(tileEndpoint, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile }),
  );
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const card = page
    .locator('.resource-list > li')
    .filter({ has: page.getByText(site.name, { exact: true }) })
    .locator('.site-location');
  const siteName = page
    .getByRole('form', { name: 'Add a site', exact: true })
    .getByLabel('Site name', { exact: true });
  const checklistName = page
    .getByRole('form', { name: 'Add a checklist', exact: true })
    .getByLabel('Checklist name', { exact: true });
  await siteName.fill('Unsent site form');
  await checklistName.fill('Unsent checklist form');
  await card.getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Map tools could not load.');
  await card.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Your workspace form has unsaved text.');
  await expect(siteName).toHaveValue('Unsent site form');
  await expect(checklistName).toHaveValue('Unsent checklist form');
  await siteName.fill('');
  await card.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(checklistName).toHaveValue('Unsent checklist form');
  await checklistName.fill('');
  await page.unroute('**/assets/leaflet-src-*.js');
  await Promise.all([
    page.waitForEvent('load'),
    card.getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await context.close();
});

test('map-tool recovery keeps an unsent manager review until it is sent or cleared', async ({
  browser,
}) => {
  const { manager, order } = await fixture('Map review reload guard QA');
  const session = await createClient(baseURL).login('worker@fieldwork.local', 'fieldwork-demo');
  await createClient(baseURL, () => session.token).submitReport(order.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: 1,
    summary: 'Synthetic report for review recovery.',
    photos: [],
    answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
  });
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await login(page, 'manager');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page.route(tileEndpoint, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile }),
  );
  const review = page.getByLabel('Review note', { exact: true });
  await review.fill('Unsent inspection feedback.');
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Map tools could not load.');
  await location(page).getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Your review has unsaved text.');
  await expect(review).toHaveValue('Unsent inspection feedback.');
  expect((await manager.order(order.id)).status).toBe('SUBMITTED');
  await review.fill('');
  await page.unroute('**/assets/leaflet-src-*.js');
  await Promise.all([
    page.waitForEvent('load'),
    location(page).getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await context.close();
});

test('hiding the map cancels a reload that is waiting for draft persistence', async ({
  browser,
}) => {
  const { order } = await fixture('Map cancelled reload QA');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route(tileEndpoint, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: tile }),
  );
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await login(page);
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Draft remains after cancelling map recovery.');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await location(page).getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(location(page).getByRole('alert')).toContainText('Map tools could not load.');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const state = window as unknown as { holdMapReload: boolean };
        state.holdMapReload = true;
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          const keepBusy = () => {
            const next = store.get('map-test-lock');
            next.onsuccess = () => {
              resolve();
              if (state.holdMapReload) keepBusy();
            };
          };
          tx.oncomplete = () => db.close();
          keepBusy();
        };
      }),
  );
  await location(page).getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(
    location(page).getByRole('button', { name: 'Checking saved work…', exact: true }),
  ).toBeDisabled();
  await location(page).getByRole('button', { name: 'Hide site map', exact: true }).click();
  await expect(
    location(page).getByRole('button', { name: 'Load site map', exact: true }),
  ).toBeFocused();
  await page.evaluate(() => {
    (window as unknown as { holdMapReload: boolean }).holdMapReload = false;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keyval', 'readonly');
          tx.objectStore('keyval').get('fieldwork:v1:worker');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await expect(page.getByRole('heading', { name: order.title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Draft remains after cancelling map recovery.',
  );
  await context.close();
});
