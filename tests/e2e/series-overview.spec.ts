import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const listEndpoint = '**/api/v1/work-order-series?*';
const dialogFor = (page: Page) =>
  page.getByRole('dialog', { name: 'Recurring batches', exact: true });
const option = (page: Page, batch: OrderSeriesReceipt) =>
  dialogFor(page).getByRole('button', {
    name: `View batch ${batch.id}: ${batch.orders[0].title}`,
    exact: true,
  });
async function fixture(prefix: string, count = 1) {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const batches: OrderSeriesReceipt[] = [];
  for (let index = 0; index < count; index++)
    batches.push(
      await manager.createOrderSeries({
        mutationId: crypto.randomUUID(),
        title: `${prefix} ${index}`,
        instructions: 'Synthetic batch overview.',
        siteId: 'north',
        templateId: 'routine',
        assigneeId: 'worker',
        priority: 'routine',
        dueDate: '2026-12-28',
        frequency: 'weekly',
        occurrences: 2,
      }),
    );
  return { manager, batches };
}
async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}

test('manager compares planned and current orders, pages with retry, and uses keyboard and narrow layouts', async ({
  page,
}) => {
  const { manager, batches } = await fixture('Batch overview manager QA', 21);
  const batch = batches.at(-1)!;
  await manager.rescheduleOrder(batch.orders[0].id, { baseVersion: 1, dueDate: '2027-02-01' });
  await manager.reassignOrder(batch.orders[0].id, { baseVersion: 2, assigneeId: 'worker-2' });
  const workerSession = await createClient(baseURL).login(
    'worker@fieldwork.local',
    'fieldwork-demo',
  );
  const worker = createClient(baseURL, () => workerSession.token);
  await worker.submitReport(batch.orders[1].id, {
    mutationId: crypto.randomUUID(),
    baseVersion: 1,
    summary: 'Synthetic submitted occurrence.',
    photos: [],
    answers: batch.orders[1].template.items.map((item) => ({
      itemId: item.id,
      value: 'pass',
      note: '',
    })),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const trigger = page.getByRole('button', { name: 'Recurring batches', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = dialogFor(page);
  await expect(
    dialog.getByRole('heading', { name: 'Recurring batches', exact: true }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Refresh batches', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.locator('.series-option')).toHaveCount(20);
  await option(page, batch).click();
  const selected = dialog.getByRole('region', { name: 'Selected recurring batch', exact: true });
  await expect(
    selected.getByRole('heading', { name: batch.orders[0].title, exact: true }),
  ).toBeVisible();
  const occurrences = selected.locator('.series-orders > li');
  await expect(occurrences).toHaveCount(2);
  expect(
    await occurrences
      .first()
      .locator('time')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2026-12-28', '2027-02-01']);
  await expect(occurrences.first()).toContainText('Jordan Lee');
  await expect(occurrences.nth(1)).toContainText('To review');
  await manager.rescheduleOrder(batch.orders[0].id, { baseVersion: 3, dueDate: '2027-02-02' });
  await selected.getByRole('button', { name: 'Refresh batch details', exact: true }).click();
  await expect(occurrences.first().locator('time').last()).toHaveAttribute(
    'datetime',
    '2027-02-02',
  );
  await page.route(listEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Batch list unavailable.' } },
    }),
  );
  await dialog.getByRole('button', { name: 'Load more batches', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Batch list unavailable.');
  await expect(dialog.locator('.series-option')).toHaveCount(20);
  await expect(occurrences).toHaveCount(2);
  await page.unroute(listEndpoint);
  await dialog.getByRole('button', { name: 'Retry batch list', exact: true }).click();
  await expect(dialog.locator('.series-option')).toHaveCount(
    (await manager.orderSeries({ limit: 50 })).total,
  );
  await selected.getByRole('heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('series-overview-desktop.png') });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await selected.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: test.info().outputPath('series-overview-phone.png') });
  await page.context().setOffline(true);
  await expect(dialog.getByText(/Loaded batches stay visible/)).toBeVisible();
  await expect(occurrences).toHaveCount(2);
  await expect(
    selected.getByRole('button', { name: 'Refresh batch details', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#main')).toBeFocused();
  expect(errors).toEqual([]);
});

test('batch loading and details handle empty, unavailable, superseded, and dismissed responses', async ({
  page,
}) => {
  const { batches } = await fixture('Batch response QA', 2);
  await login(page);
  await page.route(listEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Try loading batches again.' } },
    }),
  );
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  const dialog = dialogFor(page);
  await expect(dialog.getByRole('alert')).toContainText('Try loading batches again.');
  await page.unroute(listEndpoint);
  await page.route(listEndpoint, (route) =>
    route.fulfill({ json: { data: [], total: 0, nextCursor: null } }),
  );
  await dialog.getByRole('button', { name: 'Retry batch list', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No recurring batches yet', exact: true }),
  ).toBeVisible();
  await page.unroute(listEndpoint);
  await dialog.getByRole('button', { name: 'Refresh batches', exact: true }).click();
  await expect(option(page, batches[0])).toBeVisible();
  const detailEndpoint = `**/api/v1/work-order-series/${batches[0].id}`;
  await page.route(detailEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Batch details unavailable.' } },
    }),
  );
  await option(page, batches[0]).click();
  await expect(dialog.getByRole('alert')).toContainText('Batch details unavailable.');
  await page.unroute(detailEndpoint);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(detailEndpoint, async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  const delivered = page.waitForResponse((response) =>
    response.url().endsWith(`/work-order-series/${batches[0].id}`),
  );
  await dialog.getByRole('button', { name: 'Retry batch details', exact: true }).click();
  await expect(dialog.getByText('Loading current batch orders…', { exact: true })).toBeVisible();
  await option(page, batches[1]).click();
  const selected = dialog.getByRole('region', { name: 'Selected recurring batch', exact: true });
  await expect(
    selected.getByRole('heading', { name: batches[1].orders[0].title, exact: true }),
  ).toBeVisible();
  release();
  await delivered;
  await expect(
    selected.getByRole('heading', { name: batches[1].orders[0].title, exact: true }),
  ).toBeVisible();
  await page.unroute(detailEndpoint);
  let releaseList!: () => void;
  const listHeld = new Promise<void>((resolve) => {
    releaseList = resolve;
  });
  let first = true;
  await page.route(listEndpoint, async (route) => {
    if (first) {
      first = false;
      await listHeld;
      await route.fulfill({
        headers: { 'x-test-old-batch-list': 'yes' },
        json: { data: [], total: 0, nextCursor: null },
      });
    } else await route.continue();
  });
  const listDelivered = page.waitForResponse(
    (response) => response.headers()['x-test-old-batch-list'] === 'yes',
  );
  await dialog.getByRole('button', { name: 'Refresh batches', exact: true }).click();
  await expect(dialog.getByText('Loading batches…', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await expect(option(page, batches[1])).toBeVisible();
  releaseList();
  await listDelivered;
  await expect(
    dialog.getByRole('heading', { name: 'No recurring batches yet', exact: true }),
  ).toHaveCount(0);
  await option(page, batches[1]).click();
  const order = batches[1].orders[0];
  let releaseOrder!: () => void;
  const orderHeld = new Promise<void>((resolve) => {
    releaseOrder = resolve;
  });
  await page.route(`**/api/v1/work-orders/${order.id}`, async (route) => {
    const response = await route.fetch();
    await orderHeld;
    await route.fulfill({ response });
  });
  const orderDelivered = page.waitForResponse((response) =>
    response.url().endsWith(`/work-orders/${order.id}`),
  );
  await dialog
    .getByRole('button', {
      name: `Open batch order ${order.reference}: ${order.title}`,
      exact: true,
    })
    .click();
  await expect(dialog.getByText('Opening current order…', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  releaseOrder();
  await orderDelivered;
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('opening a current batch order awaits persistence and leaves a worker draft and photo intact', async ({
  browser,
}) => {
  const { manager, batches } = await fixture('Batch opening QA');
  const batch = batches[0];
  const order = batch.orders[0];
  const workerContext = await browser.newContext({ baseURL });
  const field = await workerContext.newPage();
  const managerContext = await browser.newContext({ baseURL });
  const desk = await managerContext.newPage();
  await login(field, 'worker');
  await expect(field.getByRole('button', { name: 'Recurring batches', exact: true })).toHaveCount(
    0,
  );
  await field
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await field
    .getByLabel('Inspection summary', { exact: true })
    .fill('Unsent worker draft while manager checks batches.');
  await field.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await login(desk);
  await desk.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await option(desk, batch).click();
  const dialog = dialogFor(desk);
  const openOrder = dialog.getByRole('button', {
    name: `Open batch order ${order.reference}: ${order.title}`,
    exact: true,
  });
  await expect(openOrder).toBeVisible();
  await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2027-03-01' });
  await desk.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreBatchPut: () => void }).restoreBatchPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'fieldwork:v1:manager') throw new Error('Order persistence unavailable');
      return original.call(this, value, key);
    };
  });
  await openOrder.click();
  await expect(dialog.getByRole('alert')).toContainText('Order persistence unavailable');
  await expect(dialog).toBeVisible();
  await desk.evaluate(() =>
    (window as unknown as { restoreBatchPut: () => void }).restoreBatchPut(),
  );
  const fresh = desk.waitForResponse((response) =>
    response.url().endsWith(`/work-orders/${order.id}`),
  );
  await openOrder.click();
  expect((await (await fresh).json()).version).toBe(2);
  await expect(dialog).toHaveCount(0);
  await expect(desk.locator('#main')).toBeFocused();
  await expect(desk.getByRole('heading', { name: order.title, exact: true })).toBeVisible();
  await field.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await workerContext.setOffline(true);
  await field.reload();
  await field
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(field.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Unsent worker draft while manager checks batches.',
  );
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await workerContext.close();
  await managerContext.close();
});
