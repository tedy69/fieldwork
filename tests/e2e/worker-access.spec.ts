import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { State } from '@fieldwork/offline';

const baseURL = 'http://127.0.0.1:4173';
const password = 'synthetic-worker-access-password';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Worker accounts', exact: true });
const row = (page: Page, email: string) =>
  dialog(page).locator('.invitation-list > li').filter({ hasText: email });
async function managerClient() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  return createClient(baseURL, () => session.token);
}
async function workerFixture() {
  const manager = await managerClient();
  const email = `access-${crypto.randomUUID()}@example.com`;
  const invite = await manager.createInvitation({ name: 'AAA Synthetic access worker QA', email });
  const { user } = await createClient(baseURL).acceptInvitation(invite.token, password);
  return { manager, user };
}
async function login(page: Page, email = 'manager@fieldwork.local', chosen = 'fieldwork-demo') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(chosen);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Worker accounts', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    dialog(page).getByRole('heading', { name: 'Worker accounts', exact: true }),
  ).toBeFocused();
  await expect(dialog(page).getByText('Worker accounts refreshed.', { exact: true })).toBeVisible();
}
async function saved(page: Page, id: string) {
  return page.evaluate(
    (key) =>
      new Promise<State | null>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction('keyval', 'readonly').objectStore('keyval').get(key);
          read.onsuccess = () => {
            resolve(read.result ?? null);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
    `fieldwork:v1:${id}`,
  );
}
test('manager confirms access changes with keyboard, refreshes assignment choices and preserves the notebook style on phones', async ({
  page,
  context,
}) => {
  const { manager, user } = await workerFixture();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await open(page);
  await row(page, user.email)
    .getByRole('button', { name: `Disable ${user.email}`, exact: true })
    .focus();
  await page.keyboard.press('Enter');
  const confirm = dialog(page).getByRole('region', { name: 'Confirm worker access', exact: true });
  await expect(confirm.getByRole('heading')).toBeFocused();
  await expect(confirm).toContainText(
    'Saved reports, photos, drafts, and queued reports are kept.',
  );
  await confirm.getByRole('button', { name: 'Cancel change', exact: true }).click();
  expect((await manager.worker(user.id)).enabled).toBe(true);
  await row(page, user.email)
    .getByRole('button', { name: `Disable ${user.email}`, exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: test.info().outputPath('worker-access-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await confirm.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('worker-access-phone.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  for (const button of await confirm.getByRole('button').all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await confirm.getByRole('button', { name: 'Confirm disable', exact: true }).click();
  await expect(row(page, user.email).getByText('Disabled', { exact: true })).toBeVisible();
  await expect(
    dialog(page).getByRole('heading', { name: 'Worker accounts', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Worker accounts', exact: true })).toBeFocused();
  await expect(page.getByRole('main').locator('.brief')).not.toContainText(user.name);
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await expect(row(page, user.email).getByText('Disabled', { exact: true })).toBeVisible();
  await row(page, user.email)
    .getByRole('button', { name: `Reactivate ${user.email}`, exact: true })
    .click();
  await confirm.getByRole('button', { name: 'Confirm reactivation', exact: true }).click();
  await expect(row(page, user.email).getByText('Active', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(dialog(page)).toContainText('Loaded accounts stay visible offline.');
  await expect(
    dialog(page).getByRole('button', { name: 'Refresh accounts', exact: true }),
  ).toBeDisabled();
  await expect(row(page, user.email).getByRole('button')).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('uncertain writes lock retries, keep the dialog open while saving and recover a competing change through refresh', async ({
  page,
}) => {
  const { manager, user } = await workerFixture();
  await login(page);
  await open(page);
  const endpoint = `**/api/v1/workers/${user.id}/access`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let applied = false;
  await page.route(endpoint, async (route) => {
    await route.fetch();
    applied = true;
    await held;
    await route.abort('failed');
  });
  await row(page, user.email).getByRole('button').click();
  const save = dialog(page).getByRole('button', { name: 'Confirm disable', exact: true });
  await save.click();
  await expect.poll(() => applied).toBe(true);
  await expect(
    dialog(page).getByRole('button', { name: 'Close accounts', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  release();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'Refresh worker accounts to check the saved state',
  );
  await expect(save).toBeDisabled();
  await page.unroute(endpoint);
  await dialog(page).getByRole('button', { name: 'Retry accounts', exact: true }).click();
  await expect(row(page, user.email).getByText('Disabled', { exact: true })).toBeVisible();
  await row(page, user.email).getByRole('button').click();
  await manager.updateWorkerAccess(user.id, { enabled: true, expectedVersion: 1 });
  await dialog(page).getByRole('button', { name: 'Confirm reactivation', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('This worker account changed.');
  await expect(
    dialog(page).getByRole('button', { name: 'Confirm reactivation', exact: true }),
  ).toBeDisabled();
  await dialog(page).getByRole('button', { name: 'Refresh accounts', exact: true }).click();
  await expect(row(page, user.email).getByText('Active', { exact: true })).toBeVisible();
});
test('account browsing handles empty, loading, failed pages, cursor restarts and dismissed responses', async ({
  page,
}) => {
  const { manager, user } = await workerFixture();
  await login(page);
  const account = await manager.worker(user.id);
  let mode = 'empty';
  await page.route('**/api/v1/workers?**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (mode === 'empty') await route.fulfill({ json: { data: [], total: 0, nextCursor: null } });
    else if (mode === 'failure' && cursor)
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Synthetic page unavailable.' } },
      });
    else if (mode === 'cursor' && cursor)
      await route.fulfill({
        status: 422,
        json: { error: { code: 'CURSOR', message: 'Synthetic cursor expired.' } },
      });
    else
      await route.fulfill({
        json: { data: [account], total: 2, nextCursor: cursor ? null : user.id },
      });
  });
  await open(page);
  await expect(dialog(page)).toContainText('No worker accounts yet.');
  mode = 'failure';
  await dialog(page).getByRole('button', { name: 'Refresh accounts', exact: true }).click();
  await expect(row(page, user.email)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Load more accounts', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Synthetic page unavailable.');
  await expect(row(page, user.email)).toBeVisible();
  mode = 'loaded';
  await dialog(page).getByRole('button', { name: 'Retry accounts', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Load more accounts', exact: true }),
  ).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Refresh accounts', exact: true }).click();
  mode = 'cursor';
  await dialog(page).getByRole('button', { name: 'Load more accounts', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Restart accounts', exact: true }).click();
  await expect(row(page, user.email)).toBeVisible();
  await page.unroute('**/api/v1/workers?**');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/workers?**', async (route) => {
    await held;
    await route.fulfill({ json: { data: [], total: 0, nextCursor: null } }).catch(() => {});
  });
  await dialog(page).getByRole('button', { name: 'Refresh accounts', exact: true }).click();
  await expect(dialog(page).getByText('Loading worker accounts…', { exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  release();
  await expect(dialog(page)).toHaveCount(0);
  await page.unroute('**/api/v1/workers?**');
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await expect(row(page, user.email)).toBeVisible();
});
test('a disabled worker retains a queued photo report and submits it after reactivation and fresh sign-in', async ({
  page,
  context,
}) => {
  const { manager, user } = await workerFixture();
  const order = await manager.createOrder({
    title: 'Synthetic account access offline QA',
    instructions: 'Keep this device report.',
    siteId: 'north',
    templateId: 'routine',
    assigneeId: user.id,
    dueDate: '2026-10-30',
    priority: 'routine',
  });
  await login(page, user.email, password);
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Synthetic queued photo survives account deactivation.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'synthetic-access.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  const before = await saved(page, user.id);
  expect(before!.outbox).toHaveLength(1);
  await manager.updateWorkerAccess(user.id, { enabled: false, expectedVersion: 0 });
  await context.setOffline(false);
  await expect
    .poll(async () => (await saved(page, user.id))?.outbox[0]?.error)
    .toContain('Sign in again');
  const retained = await saved(page, user.id);
  expect(retained!.drafts).toEqual(before!.drafts);
  expect(retained!.outbox[0].input).toEqual(before!.outbox[0].input);
  expect((await manager.order(order.id)).report).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your worker account is disabled.');
  expect((await saved(page, user.id))!.outbox[0].input).toEqual(before!.outbox[0].input);
  await manager.updateWorkerAccess(user.id, { enabled: true, expectedVersion: 1 });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(async () => (await saved(page, user.id))?.outbox.length).toBe(0);
  const submitted = await manager.order(order.id);
  expect(submitted.report?.summary).toBe('Synthetic queued photo survives account deactivation.');
  expect(submitted.report?.photos).toHaveLength(1);
  expect(submitted.version).toBe(2);
  expect((await manager.reportHistory(order.id)).total).toBe(1);
});
