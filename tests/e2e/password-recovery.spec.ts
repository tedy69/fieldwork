import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { State } from '@fieldwork/offline';
const baseURL = 'http://127.0.0.1:4173';
const oldPassword = 'synthetic-old-worker-password';
const password = 'synthetic-recovered-worker-password';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Worker accounts', exact: true });
const recovery = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Worker password recovery', exact: true });
async function fixture() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const email = `recovery-${crypto.randomUUID()}@example.com`;
  const invite = await manager.createInvitation({
    name: 'AAA Synthetic recovery worker QA',
    email,
  });
  const { user } = await createClient(baseURL).acceptInvitation(invite.token, oldPassword);
  return { manager, user };
}
async function login(page: Page, email = 'manager@fieldwork.local', chosen = 'fieldwork-demo') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(chosen);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function open(page: Page, email: string) {
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await expect(dialog(page).getByText('Worker accounts refreshed.', { exact: true })).toBeVisible();
  await dialog(page)
    .getByRole('button', { name: `Password recovery for ${email}`, exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(recovery(page).getByRole('heading')).toBeFocused();
}
async function setPasswords(page: Page, confirmation = password) {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(confirmation);
}
async function signinAfter(page: Page, email: string, button = 'Continue to sign in') {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
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
test('manager creates and copies a reset link and the worker confirms a new password before ordinary sign-in', async ({
  page,
  browser,
}) => {
  const { manager, user } = await fixture();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const oldSession = await createClient(baseURL).login(user.email, oldPassword);
  await login(page);
  await open(page, user.email);
  await expect(recovery(page)).toContainText('No reset link has been issued');
  await recovery(page).getByRole('button', { name: 'Create reset link', exact: true }).click();
  const input = recovery(page).getByLabel('Reset link', { exact: true });
  await expect(input).toBeFocused();
  const link = await input.inputValue();
  const token = new URL(link).hash.slice('#reset='.length);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Synthetic copy failure');
        },
      },
    }),
  );
  await recovery(page).getByRole('button', { name: 'Copy reset link', exact: true }).click();
  await expect(recovery(page).getByRole('alert')).toContainText('Could not copy.');
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (node) =>
        (node as HTMLInputElement).selectionEnd! - (node as HTMLInputElement).selectionStart!,
    ),
  ).toBe(link.length);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedReset: string }).copiedReset = value;
        },
      },
    }),
  );
  await recovery(page).getByRole('button', { name: 'Copy reset link', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as { copiedReset: string }).copiedReset),
  ).toBe(link);
  expect(JSON.stringify(await saved(page, 'manager'))).not.toContain(token);
  expect(
    await page.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    ),
  ).not.toContain(token);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await recovery(page).getByRole('heading').focus();
  await page.screenshot({
    path: test.info().outputPath('password-recovery-manager-desktop.png'),
    mask: [input],
    maskColor: '#344145',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('password-recovery-manager-phone.png'),
    mask: [input],
    maskColor: '#344145',
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const recipientContext = await browser.newContext({ baseURL });
  const recipient = await recipientContext.newPage();
  recipient.on('pageerror', (e) => errors.push(e.message));
  const urls: string[] = [];
  recipient.on('request', (request) => urls.push(request.url()));
  await recipient.goto(link);
  await expect(
    recipient.getByRole('button', { name: 'Change password', exact: true }),
  ).toBeEnabled();
  expect(urls.some((url) => url.includes('/api/v1/me'))).toBe(false);
  expect(urls.some((url) => url.includes(token))).toBe(false);
  await recipient.setViewportSize({ width: 1440, height: 1000 });
  await recipient.screenshot({
    path: test.info().outputPath('password-recovery-worker-desktop.png'),
  });
  await recipient.setViewportSize({ width: 390, height: 844 });
  await recipient.screenshot({
    path: test.info().outputPath('password-recovery-worker-phone.png'),
    fullPage: true,
  });
  await recipient.setViewportSize({ width: 320, height: 740 });
  expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await setPasswords(recipient, 'different-synthetic-password');
  await recipient.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(recipient.getByRole('alert')).toContainText('Passwords do not match.');
  await expect(recipient.getByLabel('Confirm password', { exact: true })).toBeFocused();
  await setPasswords(recipient);
  await recipient.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(
    recipient.getByRole('heading', { name: 'Your password has changed', exact: true }),
  ).toBeFocused();
  expect(new URL(recipient.url()).hash).toBe('');
  expect(await recipientContext.cookies()).toEqual([]);
  await expect(createClient(baseURL, () => oldSession.token).me()).rejects.toMatchObject({
    status: 401,
  });
  await expect(createClient(baseURL).login(user.email, oldPassword)).rejects.toMatchObject({
    status: 401,
  });
  await signinAfter(recipient, user.email);
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(recovery(page).getByText('used', { exact: true })).toBeVisible();
  expect((await manager.passwordReset(user.id)).reset?.status).toBe('used');
  await recipientContext.close();
  expect(errors).toEqual([]);
});
test('manager recovers failed reads and lost writes, replaces or revokes links and cannot dismiss a pending write', async ({
  page,
  context,
}) => {
  const { manager, user } = await fixture();
  const endpoint = `**/api/v1/workers/${user.id}/password-reset`;
  let failRead = true;
  await page.route(endpoint, (route) =>
    route.request().method() === 'GET' && failRead
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Synthetic recovery read failed.' } },
        })
      : route.continue(),
  );
  await login(page);
  await open(page, user.email);
  await expect(recovery(page).getByRole('alert')).toContainText('Synthetic recovery read failed.');
  await expect(
    recovery(page).getByText('No reset link has been issued', { exact: false }),
  ).toHaveCount(0);
  failRead = false;
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeEnabled();
  await page.unroute(endpoint);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let applied = false;
  await page.route(endpoint, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fetch();
      applied = true;
      await held;
      await route.abort('failed');
    } else await route.continue();
  });
  await recovery(page).getByRole('button', { name: 'Create reset link', exact: true }).click();
  await expect.poll(() => applied).toBe(true);
  await expect(
    dialog(page).getByRole('button', { name: 'Close accounts', exact: true }),
  ).toBeDisabled();
  await expect(
    recovery(page).getByRole('button', { name: 'Close recovery', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  release();
  await expect(recovery(page).getByRole('alert')).toContainText(
    'Refresh password recovery to check the saved state',
  );
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeDisabled();
  await page.unroute(endpoint);
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(recovery(page).getByText('pending', { exact: true })).toBeVisible();
  await expect(recovery(page).getByLabel('Reset link', { exact: true })).toHaveCount(0);
  const first = (await manager.passwordReset(user.id)).reset!;
  await recovery(page).getByRole('button', { name: 'Replace reset link', exact: true }).click();
  const linkInput = recovery(page).getByLabel('Reset link', { exact: true });
  await expect(linkInput).toBeVisible();
  expect((await manager.passwordReset(user.id)).reset!.id).not.toBe(first.id);
  const link = await linkInput.inputValue();
  const secret = new URL(link).hash.slice('#reset='.length);
  const concurrent = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await recovery(page).getByRole('button', { name: 'Revoke reset link', exact: true }).click();
  await expect(
    recovery(page).getByRole('status').filter({ hasText: 'Another reset link is now current' }),
  ).toBeVisible();
  await expect(recovery(page).getByText('pending', { exact: true })).toBeVisible();
  expect((await manager.passwordReset(user.id)).reset?.id).toBe(concurrent.reset.id);
  await expect(createClient(baseURL).previewPasswordReset(concurrent.token)).resolves.toMatchObject(
    { email: user.email },
  );
  await expect(linkInput).toHaveCount(0);
  const revokeEndpoint = `**/api/v1/workers/${user.id}/password-reset/*`;
  await page.route(revokeEndpoint, async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await recovery(page).getByRole('button', { name: 'Revoke reset link', exact: true }).click();
  await expect(recovery(page).getByRole('alert')).toContainText('Refresh password recovery');
  await expect(linkInput).toHaveCount(0);
  await page.unroute(revokeEndpoint);
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(recovery(page).getByText('revoked', { exact: true })).toBeVisible();
  await expect(createClient(baseURL).previewPasswordReset(secret)).rejects.toMatchObject({
    status: 410,
  });
  await expect(createClient(baseURL).previewPasswordReset(concurrent.token)).rejects.toMatchObject({
    status: 410,
  });
  await recovery(page).getByRole('button', { name: 'Create reset link', exact: true }).click();
  await expect(linkInput).toBeVisible();
  await recovery(page).getByRole('button', { name: 'Revoke reset link', exact: true }).click();
  await expect(recovery(page).getByText('revoked', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(recovery(page)).toContainText('Loaded recovery details stay visible offline.');
  await expect(
    recovery(page).getByRole('button', { name: 'Refresh password recovery', exact: true }),
  ).toBeDisabled();
  await recovery(page).getByRole('button', { name: 'Close recovery', exact: true }).click();
  await expect(
    dialog(page).getByRole('heading', { name: 'Worker accounts', exact: true }),
  ).toBeFocused();
  await context.setOffline(false);
});
test('a lost password-change response recovers through sign-in without repeating the write', async ({
  page,
}) => {
  const { manager, user } = await fixture();
  const receipt = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await page.goto(`/#reset=${receipt.token}`);
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled();
  await setPasswords(page);
  let attempts = 0;
  await page.route('**/api/v1/password-resets/complete', async (route) => {
    attempts++;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('It may already be saved.');
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password);
  expect(
    await page.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    ),
  ).not.toContain(password);
  await page.getByRole('button', { name: 'Reload reset link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Password reset unavailable', exact: true }),
  ).toBeVisible();
  await signinAfter(page, user.email, 'Try signing in');
  expect(attempts).toBe(1);
  expect((await manager.passwordReset(user.id)).reset?.status).toBe('used');
});
test('a queued photo report survives recovery and submits once after a fresh sign-in to the same account', async ({
  page,
  context,
}) => {
  const { manager, user } = await fixture();
  const order = await manager.createOrder({
    title: 'Synthetic password recovery offline QA',
    instructions: 'Keep this device report.',
    siteId: 'north',
    templateId: 'routine',
    assigneeId: user.id,
    dueDate: '2026-10-30',
    priority: 'routine',
  });
  const receipt = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await login(page, user.email, oldPassword);
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Synthetic queued report survives password recovery.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'synthetic-recovery.png',
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
  await page.goto(`/#reset=${receipt.token}`);
  await expect(page.getByRole('alert')).toContainText('Reconnect');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reload reset link', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled();
  await setPasswords(page);
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your password has changed', exact: true }),
  ).toBeVisible();
  const retained = await saved(page, user.id);
  expect(retained!.drafts).toEqual(before!.drafts);
  expect(retained!.outbox[0].input).toEqual(before!.outbox[0].input);
  expect((await manager.order(order.id)).report).toBeNull();
  await signinAfter(page, user.email);
  await expect.poll(async () => (await saved(page, user.id))?.outbox.length).toBe(0);
  const submitted = await manager.order(order.id);
  expect(submitted.report?.summary).toBe('Synthetic queued report survives password recovery.');
  expect(submitted.report?.photos).toHaveLength(1);
  expect(submitted.version).toBe(2);
  expect((await manager.reportHistory(order.id)).total).toBe(1);
});
test('malformed, revoked and disabled-worker reset links have useful public recovery without credentials being sent', async ({
  page,
}) => {
  const { manager, user } = await fixture();
  const receipt = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await manager.revokePasswordReset(user.id, receipt.reset.id);
  await page.goto('/#reset=short');
  await expect(
    page.getByRole('heading', { name: 'Password reset unavailable', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('incomplete');
  await page.getByRole('button', { name: 'Return to Fieldwork', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.goto(`/#reset=${receipt.token}`);
  await expect(
    page.getByRole('heading', { name: 'Password reset unavailable', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  const fresh = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await manager.updateWorkerAccess(user.id, { enabled: false, expectedVersion: 0 });
  await page.goto(`/#reset=${fresh.token}`);
  await expect(
    page.getByRole('heading', { name: 'Password reset unavailable', exact: true }),
  ).toBeVisible();
  await manager.updateWorkerAccess(user.id, { enabled: true, expectedVersion: 1 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Password reset unavailable', exact: true }),
  ).toBeVisible();
  const available = await manager.createPasswordReset(user.id, { expectedAccessVersion: 2 });
  let fail = true;
  await page.route('**/api/v1/password-resets/preview', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Synthetic reset preview failed.' } },
        })
      : route.continue(),
  );
  await page.goto(`/#reset=${available.token}`);
  await expect(page.getByRole('alert')).toContainText('Synthetic reset preview failed.');
  fail = false;
  await page.getByRole('button', { name: 'Reload reset link', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeEnabled();
});
test('manager refreshes account changes before issuing recovery and dismissed reads cannot replace another worker', async ({
  page,
}) => {
  const first = await fixture();
  const second = await fixture();
  await first.manager.updateWorkerAccess(first.user.id, { enabled: false, expectedVersion: 0 });
  await login(page);
  await open(page, first.user.email);
  await expect(recovery(page)).toContainText('This worker is disabled.');
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeDisabled();
  await first.manager.updateWorkerAccess(first.user.id, { enabled: true, expectedVersion: 1 });
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeEnabled();
  await first.manager.updateWorkerAccess(first.user.id, { enabled: false, expectedVersion: 2 });
  await recovery(page).getByRole('button', { name: 'Create reset link', exact: true }).click();
  await expect(recovery(page).getByRole('alert')).toContainText('This worker account changed.');
  await recovery(page)
    .getByRole('button', { name: 'Refresh password recovery', exact: true })
    .click();
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeDisabled();
  await recovery(page).getByRole('button', { name: 'Close recovery', exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const endpoint = `**/api/v1/workers/${first.user.id}/password-reset`;
  await page.route(endpoint, async (route) => {
    await held;
    await route.fulfill({ json: { reset: null } }).catch(() => {});
  });
  await dialog(page)
    .getByRole('button', { name: `Password recovery for ${first.user.email}`, exact: true })
    .click();
  await expect(recovery(page)).toContainText('Loading password recovery…');
  await dialog(page)
    .getByRole('button', { name: `Password recovery for ${second.user.email}`, exact: true })
    .click();
  await expect(recovery(page)).toContainText(second.user.email);
  await expect(
    recovery(page).getByRole('button', { name: 'Create reset link', exact: true }),
  ).toBeEnabled();
  release();
  await expect(recovery(page)).not.toContainText(first.user.email);
  await dialog(page).getByRole('button', { name: 'Close accounts', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
});
