import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
const baseURL = 'http://127.0.0.1:4173';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Worker accounts', exact: true });
const history = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Worker access history', exact: true });
async function fixture(changes = 0) {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const email = `access-history-${crypto.randomUUID()}@example.com`;
  const invite = await manager.createInvitation({ name: 'AAB Synthetic access history QA', email });
  const { user } = await createClient(baseURL).acceptInvitation(
    invite.token,
    'synthetic-access-history-password',
  );
  for (let version = 0; version < changes; version++)
    await manager.updateWorkerAccess(user.id, {
      enabled: version % 2 === 1,
      expectedVersion: version,
    });
  return { manager, user };
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await expect(dialog(page).getByText('Worker accounts refreshed.', { exact: true })).toBeVisible();
}
async function open(page: Page, email: string) {
  await dialog(page)
    .getByRole('button', { name: `View access history for ${email}`, exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(history(page).getByRole('heading')).toBeFocused();
}
test('manager browses real access history, refreshes newer events and retains loaded rows offline on phone layouts', async ({
  page,
  context,
}) => {
  const { manager, user } = await fixture(23);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const initial = await manager.workerAccessHistory(user.id, { limit: 50 });
  await login(page);
  await open(page, user.email);
  await expect(history(page).locator('ol > li')).toHaveCount(20);
  const firstDates = await history(page)
    .locator('time')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime')));
  expect(firstDates).toEqual(initial.data.slice(0, 20).map((event) => event.at));
  await expect(history(page).locator('ol > li').first()).toContainText('Worker disabled');
  await expect(history(page).locator('ol > li').first()).toContainText('Changed by Alex Morgan');
  await manager.updateWorkerAccess(user.id, { enabled: true, expectedVersion: 23 });
  await history(page)
    .getByRole('button', { name: 'Load older access changes', exact: true })
    .click();
  await expect(history(page).locator('ol > li')).toHaveCount(23);
  expect(
    await history(page)
      .locator('time')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(initial.data.map((event) => event.at));
  await history(page).getByRole('button', { name: 'Refresh access history', exact: true }).click();
  await expect(history(page).locator('ol > li').first()).toContainText('Worker reactivated');
  await expect(
    history(page).getByRole('status').filter({ hasText: '20 loaded · 24 changes' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await history(page).getByRole('heading').focus();
  await page.screenshot({ path: test.info().outputPath('worker-access-history-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await history(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('worker-access-history-phone.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  for (const button of await history(page).getByRole('button').all())
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await context.setOffline(true);
  await expect(history(page)).toContainText('Loaded history stays visible offline.');
  await expect(
    history(page).getByRole('button', { name: 'Refresh access history', exact: true }),
  ).toBeDisabled();
  await expect(
    history(page).getByRole('button', { name: 'Load older access changes', exact: true }),
  ).toBeDisabled();
  await history(page).getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Worker accounts', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('main')).toBeFocused();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
test('history retries initial and later errors, restarts an unavailable cursor, and keeps account setup text', async ({
  page,
}) => {
  const { user } = await fixture(21);
  const endpoint = `**/api/v1/workers/${user.id}/access-history?**`;
  let mode = 'initial';
  await login(page);
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a site', exact: true });
  await form.getByLabel('Site name', { exact: true }).fill('Synthetic unsaved site');
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await page.route(endpoint, async (route) => {
    const cursor = new URL(route.request().url()).searchParams.has('cursor');
    if (mode === 'initial' || (mode === 'page' && cursor))
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Synthetic access history unavailable.' } },
      });
    else if (mode === 'cursor' && cursor)
      await route.fulfill({
        status: 422,
        json: { error: { code: 'CURSOR', message: 'Synthetic history cursor unavailable.' } },
      });
    else await route.continue();
  });
  await open(page, user.email);
  await expect(history(page).getByRole('alert')).toContainText(
    'Synthetic access history unavailable.',
  );
  mode = 'page';
  await history(page).getByRole('button', { name: 'Retry access history', exact: true }).click();
  await expect(history(page).locator('ol > li')).toHaveCount(20);
  await history(page)
    .getByRole('button', { name: 'Load older access changes', exact: true })
    .click();
  await expect(history(page).getByRole('alert')).toContainText(
    'Synthetic access history unavailable.',
  );
  await expect(history(page).locator('ol > li')).toHaveCount(20);
  mode = 'loaded';
  await history(page).getByRole('button', { name: 'Retry access history', exact: true }).click();
  await expect(history(page).locator('ol > li')).toHaveCount(21);
  await history(page).getByRole('button', { name: 'Refresh access history', exact: true }).click();
  await expect(history(page).locator('ol > li')).toHaveCount(20);
  mode = 'cursor';
  await history(page)
    .getByRole('button', { name: 'Load older access changes', exact: true })
    .click();
  await history(page).getByRole('button', { name: 'Restart access history', exact: true }).click();
  await expect(history(page).locator('ol > li')).toHaveCount(20);
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  await expect(form.getByLabel('Site name', { exact: true })).toHaveValue('Synthetic unsaved site');
});
test('empty and superseded history reads cannot replace a newer worker selection or reopen a closed dialog', async ({
  page,
}) => {
  const first = await fixture();
  const second = await fixture();
  await login(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  const endpoint = `**/api/v1/workers/${first.user.id}/access-history?**`;
  await page.route(endpoint, async (route) => {
    requested = true;
    await held;
    await route.fulfill({ json: { data: [], total: 0, nextCursor: null } }).catch(() => {});
  });
  await open(page, first.user.email);
  await expect.poll(() => requested).toBe(true);
  await expect(history(page)).toContainText('Loading access history…');
  await open(page, second.user.email);
  await expect(history(page)).toContainText('No access changes recorded for this worker.');
  release();
  await expect(history(page)).toContainText(second.user.email);
  await expect(history(page)).not.toContainText(first.user.email);
  await history(page).getByRole('button', { name: 'Close history', exact: true }).click();
  await expect(history(page)).toHaveCount(0);
  await page.unroute(endpoint);
  let releaseAgain!: () => void;
  const heldAgain = new Promise<void>((resolve) => {
    releaseAgain = resolve;
  });
  await page.route(endpoint, async (route) => {
    await heldAgain;
    await route.fulfill({ json: { data: [], total: 0, nextCursor: null } }).catch(() => {});
  });
  await open(page, first.user.email);
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  releaseAgain();
  await expect(dialog(page)).toHaveCount(0);
});
