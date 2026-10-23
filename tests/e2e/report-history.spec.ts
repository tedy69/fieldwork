import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

const base = 'http://127.0.0.1:4173';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
async function fixture(title: string) {
  const api = createClient(base);
  const managerSession = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const workerSession = await api.login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => managerSession.token);
  const worker = createClient(base, () => workerSession.token);
  const catalog = await manager.catalog();
  const order = await manager.createOrder({
    title,
    instructions: 'Check the gate and equipment. Synthetic QA fixture.',
    siteId: catalog.sites[0].id,
    templateId: catalog.templates[0].id,
    assigneeId: 'worker',
    dueDate: '2026-10-23',
    priority: 'routine',
  });
  return { manager, worker, order };
}
const report = (order: WorkOrder, summary: string) => ({
  mutationId: crypto.randomUUID(),
  baseVersion: order.version,
  summary,
  answers: order.template.items.map((item, index) => ({
    itemId: item.id,
    value: index === 0 ? ('fail' as const) : ('pass' as const),
    note: index === 0 ? 'Original gate note.' : '',
  })),
  photos: [{ id: crypto.randomUUID(), mimeType: 'image/png' as const, data: png }],
});
async function login(page: Page, account: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${account}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function openOrder(page: Page, order: WorkOrder) {
  await page.getByLabel('Search work orders').fill(order.title);
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Report history', exact: true })).toBeEnabled();
}

test('history preserves correction drafts, saved feedback and photos, and works with keyboard and narrow layouts', async ({
  page,
  context,
}) => {
  const { manager, worker, order } = await fixture('Report history corrections QA');
  const first = await worker.submitReport(order.id, report(order, 'Gate needs repair.'));
  const requested = await manager.review(
    order.id,
    first.version,
    'CHANGES_REQUESTED',
    'Repair the latch and inspect again.',
  );
  await login(page, 'worker');
  await openOrder(page, order);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const draft = page.getByLabel('Inspection summary', { exact: true });
  await draft.fill('Keep my unsent correction draft.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  const trigger = page.getByRole('button', { name: 'Report history', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Report history', exact: true });
  const snapshot = dialog.getByRole('region', { name: 'Selected saved report', exact: true });
  await expect(snapshot).toContainText('Gate needs repair.');
  await expect(snapshot).toContainText('Repair the latch and inspect again.');
  await expect(snapshot).toContainText('Original gate note.');
  await expect(dialog.getByRole('heading', { name: 'Report history', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'View report: Order version 2', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('button', { name: 'View report: Order version 2', exact: true }),
  ).toBeFocused();
  const photo = snapshot.getByAltText('Saved report photo 1');
  await expect(photo).toBeVisible();
  const photoResponse = await context.request.get((await photo.getAttribute('src')) ?? '');
  expect(photoResponse.status()).toBe(200);
  expect(await photoResponse.body()).toEqual(Buffer.from(png, 'base64'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath('history-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('history-phone.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await context.setOffline(true);
  await expect(dialog.getByRole('status')).toContainText('Loaded text stays available');
  await expect(snapshot).toContainText('Gate needs repair.');
  await expect(
    snapshot.getByText('Connect to view saved report photos.', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main')).toBeFocused();
  await expect(trigger).toBeDisabled();
  await expect(draft).toHaveValue('Keep my unsent correction draft.');
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await context.setOffline(false);
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(snapshot).toContainText('Gate needs repair.');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await openOrder(page, order);
  await expect(draft).toHaveValue('Keep my unsent correction draft.');
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  expect((await manager.order(order.id)).version).toBe(requested.version);
  expect((await manager.reportHistory(order.id)).total).toBe(1);
  await manager.reassignOrder(order.id, { baseVersion: requested.version, assigneeId: 'worker-2' });
  await trigger.click();
  await expect(dialog.getByRole('alert')).toContainText('Work order not found.');
  await expect(snapshot).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(draft).toHaveValue('Keep my unsent correction draft.');
  expect(errors).toEqual([]);
});

test('empty, loading and failed history requests can be retried without showing stale data', async ({
  page,
}) => {
  const { order } = await fixture('Report history empty QA');
  await login(page, 'manager');
  await openOrder(page, order);
  const trigger = page.getByRole('button', { name: 'Report history', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Report history', exact: true });
  const endpoint = `**/api/v1/work-orders/${order.id}/history?*`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await held;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'History is temporarily unavailable.' } },
    });
  });
  await trigger.click();
  await expect(dialog.getByRole('status')).toHaveText('Loading report history…');
  release();
  await expect(dialog.getByRole('alert')).toContainText('History is temporarily unavailable.');
  await expect(dialog.getByText('No submitted reports yet', { exact: true })).toHaveCount(0);
  await page.unroute(endpoint);
  await dialog.getByRole('button', { name: 'Retry history', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No submitted reports yet', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  // A response from a closed view must not populate a later opening.
  let releaseStale!: () => void;
  const staleHeld = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  let firstRequest = true;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(endpoint, async (route) => {
    if (!firstRequest) {
      await route.continue();
      return;
    }
    firstRequest = false;
    entered();
    await staleHeld;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'OLD', message: 'Old closed request.' } },
    });
  });
  await trigger.click();
  await expect(dialog.getByRole('status')).toBeVisible();
  await started;
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(
    dialog.getByRole('heading', { name: 'No submitted reports yet', exact: true }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse(
    (response) => response.status() === 503 && response.url().includes('/history'),
  );
  releaseStale();
  await staleResponse;
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(trigger).toBeFocused();
});

test('older submissions page without moving selection, and missing legacy review details stay explicit', async ({
  page,
  context,
}) => {
  const { manager, worker, order } = await fixture('Report history pagination QA');
  let current = order;
  for (let index = 1; index <= 11; index++) {
    current = await worker.submitReport(order.id, report(current, `Inspection attempt ${index}.`));
    if (index < 11)
      current = await manager.review(
        order.id,
        current.version,
        'CHANGES_REQUESTED',
        `Feedback for attempt ${index}.`,
      );
  }
  await login(page, 'manager');
  await openOrder(page, order);
  const dialog = page.getByRole('dialog', { name: 'Report history', exact: true });
  const snapshot = dialog.getByRole('region', { name: 'Selected saved report', exact: true });
  await page.getByRole('button', { name: 'Report history', exact: true }).click();
  await expect(
    dialog.getByText('Showing 10 of 11 saved submissions', { exact: true }),
  ).toBeVisible();
  await expect(snapshot).toContainText('Inspection attempt 11.');
  await expect(snapshot).toContainText('Awaiting manager review.');
  const older = dialog.getByRole('button', { name: 'Load older submissions', exact: true });
  await context.setOffline(true);
  await expect(older).toBeDisabled();
  await context.setOffline(false);
  await expect(older).toBeEnabled();
  const endpoint = `**/api/v1/work-orders/${order.id}/history?*cursor=*`;
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Older reports unavailable.' } },
    }),
  );
  await older.click();
  await expect(dialog.getByRole('alert')).toContainText('Older reports unavailable.');
  await expect(snapshot).toContainText('Inspection attempt 11.');
  await page.unroute(endpoint);
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data[0] = {
      ...body.data[0],
      source: 'saved_snapshot',
      submissionVersion: null,
      review: null,
      reviewStatus: 'not_retained',
    };
    await route.fulfill({ response, json: body });
  });
  await dialog.getByRole('button', { name: 'Retry history', exact: true }).click();
  await expect(
    dialog.getByText('Showing 11 of 11 saved submissions', { exact: true }),
  ).toBeVisible();
  await expect(snapshot).toContainText('Inspection attempt 11.');
  await expect(older).toHaveCount(0);
  const oldest = dialog.getByRole('button', { name: 'View report: Saved report', exact: true });
  await oldest.focus();
  await page.keyboard.press('Space');
  await expect(oldest).toHaveAttribute('aria-pressed', 'true');
  await expect(snapshot).toContainText('Inspection attempt 1.');
  await expect(snapshot).toContainText('Review details unavailable.');
  await expect(snapshot).toContainText(
    'The original submission version and assignment details were not retained.',
  );
  await dialog.getByRole('button', { name: 'View report: Order version 4', exact: true }).click();
  await expect(snapshot).toContainText('Inspection attempt 2.');
  await expect(snapshot).toContainText('Feedback for attempt 2.');
  expect((await manager.order(order.id)).report?.summary).toBe('Inspection attempt 11.');
});
