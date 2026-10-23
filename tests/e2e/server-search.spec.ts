import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
async function fixture(prefix: string, count: number) {
  const api = createClient(baseURL);
  const session = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const catalog = await manager.catalog();
  const create = (
    title: string,
    assigneeId = 'worker',
    priority: 'routine' | 'urgent' = 'routine',
    dueDate = '2026-10-25',
  ) =>
    manager.createOrder({
      title,
      assigneeId,
      priority,
      dueDate,
      siteId: catalog.sites[0].id,
      templateId: catalog.templates[0].id,
      instructions: 'Synthetic server-search fixture.',
    });
  const orders: WorkOrder[] = [];
  for (let index = 0; index < count; index++)
    orders.push(
      await create(
        `${prefix} ${String(index).padStart(2, '0')}`,
        'worker',
        index % 2 ? 'routine' : 'urgent',
        index % 2 ? '2026-10-25' : '2026-10-20',
      ),
    );
  const foreign = await create(`${prefix} Private`, 'worker-2');
  return { manager, orders, foreign, create };
}
async function login(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
const modal = (page: Page) => page.getByRole('dialog', { name: 'Search server', exact: true });
async function search(page: Page, text: string) {
  const dialog = modal(page);
  await dialog.getByLabel('Search text', { exact: true }).fill(text);
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
}

test('manager searches server filters and paged results with retry, changed cursors, and narrow layouts', async ({
  page,
}) => {
  const prefix = 'Server manager QA';
  const { manager, orders } = await fixture(prefix, 28);
  await login(page, 'manager');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const trigger = page.getByRole('button', { name: 'Search server', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = modal(page);
  await expect(dialog.getByLabel('Search text', { exact: true })).toBeFocused();
  await search(page, prefix);
  await expect(
    dialog.getByText('25 loaded · 29 matching on server', { exact: true }),
  ).toBeVisible();
  const results = dialog.locator('.server-search-result');
  const endpoint = '**/api/v1/work-orders/search?*';
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Search unavailable. Try again.' } },
    }),
  );
  await dialog.getByRole('button', { name: 'Load more results', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Search unavailable. Try again.');
  await expect(results).toHaveCount(25);
  await page.unroute(endpoint);
  await dialog.getByRole('button', { name: 'Retry search', exact: true }).click();
  await expect(results).toHaveCount(29);
  const names = await results.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label')),
  );
  expect(new Set(names).size).toBe(29);
  await expect(dialog.getByRole('button', { name: 'Load more results', exact: true })).toHaveCount(
    0,
  );
  await dialog.getByRole('combobox', { name: 'Field worker', exact: true }).selectOption('worker');
  await expect(results).toHaveCount(0);
  const response = page.waitForResponse(
    (response) => response.url().includes('/work-orders/search?') && response.status() === 200,
  );
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
  const first = await (await response).json();
  await expect(
    dialog.getByText('25 loaded · 28 matching on server', { exact: true }),
  ).toBeVisible();
  const cursor = await manager.order(first.nextCursor);
  await manager.reassignOrder(cursor.id, { baseVersion: cursor.version, assigneeId: 'worker-2' });
  await dialog.getByRole('button', { name: 'Load more results', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Search results changed. Start a new search.',
  );
  await dialog.getByRole('button', { name: 'Start new search', exact: true }).click();
  await expect(
    dialog.getByText('25 loaded · 27 matching on server', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('urgent');
  await dialog.getByLabel('Server due from', { exact: true }).fill('2026-10-20');
  await dialog.getByLabel('Server due through', { exact: true }).fill('2026-10-20');
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
  const urgent = orders.filter(
    (order) => order.priority === 'urgent' && order.id !== cursor.id,
  ).length;
  await expect(results).toHaveCount(urgent);
  await expect(results.first()).toContainText('urgent');
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('SUBMITTED');
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No matching server records', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Status', exact: true }).selectOption('ASSIGNED');
  await dialog.getByRole('combobox', { name: 'Due state', exact: true }).selectOption('overdue');
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
  await expect(results).toHaveCount(urgent);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath('server-search-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: test.info().outputPath('server-search-phone.png') });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await dialog.getByLabel('Server due through', { exact: true }).fill('2026-10-19');
  await dialog.getByRole('button', { name: 'Search records', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'The end date must be on or after the start date.',
  );
  await dialog.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Ready to search', exact: true })).toBeVisible();
  await search(page, `${prefix} no matches`);
  await expect(
    dialog.getByRole('heading', { name: 'No matching server records', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('worker opens a fresh authorized result without replacing saved orders or an unsent photo draft', async ({
  page,
  context,
}) => {
  const prefix = 'Server worker QA';
  const { manager, orders, create, foreign } = await fixture(prefix, 2);
  await login(page, 'worker');
  const original = orders[0];
  await page.getByLabel('Search work orders', { exact: true }).fill(original.title);
  await page
    .getByRole('button', { name: `Open ${original.reference}: ${original.title}`, exact: true })
    .click();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Keep this unsent search draft.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'search.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  const fresh = await create(`${prefix} Fresh`);
  const trigger = page.getByRole('button', { name: 'Search server', exact: true });
  await trigger.click();
  const dialog = modal(page);
  await expect(dialog.getByRole('combobox', { name: 'Field worker', exact: true })).toHaveCount(0);
  await search(page, foreign.title);
  await expect(
    dialog.getByRole('heading', { name: 'No matching server records', exact: true }),
  ).toBeVisible();
  await search(page, fresh.title);
  const result = dialog.getByRole('button', {
    name: `Open server order ${fresh.reference}: ${fresh.title}`,
    exact: true,
  });
  await expect(result).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page.getByLabel('Search work orders', { exact: true }).fill(fresh.title);
  await expect(page.locator('.order-row')).toHaveCount(0);
  await trigger.click();
  await search(page, fresh.title);
  await result.click();
  await expect(page.getByRole('heading', { name: fresh.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page.getByLabel('Search work orders', { exact: true }).fill(original.title);
  await page
    .getByRole('button', { name: `Open ${original.reference}: ${original.title}`, exact: true })
    .click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this unsent search draft.',
  );
  await trigger.click();
  await search(page, fresh.title);
  await expect(result).toBeVisible();
  await context.setOffline(true);
  await expect(result).toBeDisabled();
  await expect(dialog.getByText('You’re offline.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeDisabled();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this unsent search draft.',
  );
  await context.setOffline(false);
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await search(page, fresh.title);
  await manager.reassignOrder(fresh.id, { baseVersion: fresh.version, assigneeId: 'worker-2' });
  await result.click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Work order not found. Your current draft is kept.',
  );
  await expect(dialog).toBeVisible();
  await manager.reassignOrder(fresh.id, { baseVersion: 2, assigneeId: 'worker' });
  await result.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: fresh.title, exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page.getByLabel('Search work orders', { exact: true }).fill(original.title);
  await page
    .getByRole('button', { name: `Open ${original.reference}: ${original.title}`, exact: true })
    .click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this unsent search draft.',
  );
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Search work orders', { exact: true }).fill(original.title);
  await page
    .getByRole('button', { name: `Open ${original.reference}: ${original.title}`, exact: true })
    .click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this unsent search draft.',
  );
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  expect((await manager.order(original.id)).report).toBeNull();
});

test('search ignores closed or superseded responses and cancels navigation from a dismissed view', async ({
  page,
}) => {
  const { orders } = await fixture('Server cancellation QA', 1);
  await login(page, 'manager');
  const trigger = page.getByRole('button', { name: 'Search server', exact: true });
  const dialog = modal(page);
  const endpoint = '**/api/v1/work-orders/search?*';
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let first = true;
  await page.route(endpoint, async (route) => {
    if (!first) {
      await route.continue();
      return;
    }
    first = false;
    entered();
    await held;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'OLD', message: 'Old request should be ignored.' } },
    });
  });
  await trigger.click();
  await started;
  await expect(dialog.getByText('Searching server…', { exact: true })).toBeVisible();
  await search(page, orders[0].title);
  const result = dialog.getByRole('button', {
    name: `Open server order ${orders[0].reference}: ${orders[0].title}`,
    exact: true,
  });
  await expect(result).toBeVisible();
  const response = page.waitForResponse(
    (response) => response.status() === 503 && response.url().includes('/work-orders/search'),
  );
  release();
  await response;
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(result).toBeVisible();
  let releaseOrder!: () => void;
  let enteredOrder!: () => void;
  const orderHeld = new Promise<void>((resolve) => {
    releaseOrder = resolve;
  });
  const orderStarted = new Promise<void>((resolve) => {
    enteredOrder = resolve;
  });
  await page.route(`**/api/v1/work-orders/${orders[0].id}`, async (route) => {
    enteredOrder();
    await orderHeld;
    await route.continue();
  });
  await result.click();
  await orderStarted;
  await expect(dialog.getByText('Opening current order…', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  const orderResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/work-orders/${orders[0].id}`),
  );
  releaseOrder();
  await orderResponse;
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await trigger.click();
  await expect(dialog.getByLabel('Search text', { exact: true })).toHaveValue('');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(trigger).toBeFocused();
});
