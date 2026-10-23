import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { InvitationReceiptSchema } from '@fieldwork/contracts';
import type { z } from 'zod';

const baseURL = 'http://127.0.0.1:4173';
const endpoint = '**/api/v1/invitations**';
const password = 'synthetic-recovery-password';
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Worker invitations', exact: true });
const row = (page: Page, email: string) =>
  dialog(page).locator('.invitation-list > li').filter({ hasText: email });
async function managerClient() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  return createClient(baseURL, () => session.token);
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Worker invitations', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Create invitation', exact: true }),
  ).toBeEnabled();
}
async function fill(page: Page, email: string) {
  await dialog(page)
    .getByLabel('Worker name', { exact: true })
    .fill('Synthetic recovery worker QA');
  await dialog(page).getByLabel('Worker email', { exact: true }).fill(email);
}
const address = () => `invitation-recovery-${crypto.randomUUID()}@example.com`;

test('manager pages invitations, retries a failed page, and confirms a lost revocation response', async ({
  page,
  context,
}) => {
  const manager = await managerClient();
  const receipts = [];
  for (let index = 0; index < 21; index++)
    receipts.push(
      await manager.createInvitation({ name: 'Synthetic invitation ledger QA', email: address() }),
    );
  await login(page);
  await open(page);
  const target = receipts.at(-1)!;
  let failed = false;
  await page.route(endpoint, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.searchParams.has('cursor') && !failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Synthetic invitation page failed.' } },
      });
    } else await route.continue();
  });
  const firstEmails = await dialog(page)
    .locator('.invitation-list > li > p')
    .filter({ hasText: '@example.com' })
    .allTextContents();
  await dialog(page).getByRole('button', { name: 'Load more invitations', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Synthetic invitation page failed.');
  for (const email of firstEmails)
    await expect(dialog(page).getByText(email, { exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Retry invitations', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Load more invitations', exact: true }),
  ).toHaveCount(0);
  expect(await dialog(page).locator('.invitation-list > li').count()).toBe(
    (await manager.invitations()).total,
  );
  await page.unroute(endpoint);
  await dialog(page).getByRole('button', { name: 'Refresh invitations', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Load more invitations', exact: true }),
  ).toBeEnabled();
  await page.route(endpoint, async (route) => {
    if (
      route.request().method() === 'GET' &&
      new URL(route.request().url()).searchParams.has('cursor')
    )
      await route.fulfill({
        status: 422,
        json: { error: { code: 'CURSOR', message: 'Synthetic invitation cursor is unavailable.' } },
      });
    else await route.continue();
  });
  await dialog(page).getByRole('button', { name: 'Load more invitations', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Restart invitations', exact: true }),
  ).toBeEnabled();
  await expect(row(page, target.invitation.email)).toBeVisible();
  await page.unroute(endpoint);
  await dialog(page).getByRole('button', { name: 'Restart invitations', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Load more invitations', exact: true }),
  ).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const sent = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(`**/api/v1/invitations/${target.invitation.id}`, async (route) => {
    await route.fetch();
    received();
    await held;
    await route.abort('failed');
  });
  await row(page, target.invitation.email)
    .getByRole('button', { name: `Revoke invitation for ${target.invitation.email}`, exact: true })
    .click();
  await sent;
  await expect(
    dialog(page).getByRole('button', { name: 'Close invitations', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  release();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'Refresh invitations to check its current state.',
  );
  await page.unroute(`**/api/v1/invitations/${target.invitation.id}`);
  await dialog(page).getByRole('button', { name: 'Refresh invitations', exact: true }).click();
  await expect(
    row(page, target.invitation.email).getByText('revoked', { exact: true }),
  ).toBeVisible();
  await expect(
    row(page, target.invitation.email).getByRole('button', { name: /Revoke/ }),
  ).toHaveCount(0);
  await expect(manager.previewInvitation(target.token)).rejects.toMatchObject({ status: 410 });
  await context.setOffline(true);
  await expect(
    dialog(page).getByRole('button', { name: 'Refresh invitations', exact: true }),
  ).toBeDisabled();
  await expect(row(page, target.invitation.email)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Close invitations', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await context.setOffline(false);
});

test('a lost creation response keeps the form, requires revocation, and produces a distinct replacement link', async ({
  page,
}) => {
  const manager = await managerClient();
  const email = address();
  await login(page);
  await open(page);
  await fill(page, email);
  let original!: z.infer<typeof InvitationReceiptSchema>;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const sent = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST' || !route.request().url().endsWith('/invitations')) {
      await route.continue();
      return;
    }
    original = await (await route.fetch()).json();
    received();
    await held;
    await route.abort('failed');
  });
  await dialog(page).getByRole('button', { name: 'Create invitation', exact: true }).click();
  await sent;
  await expect(
    dialog(page).getByRole('button', { name: 'Close invitations', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  release();
  await expect(dialog(page).getByRole('alert')).toContainText('If the response was lost');
  await expect(dialog(page).getByLabel('Worker email', { exact: true })).toHaveValue(email);
  await page.unroute(endpoint);
  await dialog(page).getByRole('button', { name: 'Create invitation', exact: true }).click();
  await expect(dialog(page).getByRole('alert')).toContainText(
    'A pending invitation already uses this email.',
  );
  await dialog(page).getByRole('button', { name: 'Refresh invitations', exact: true }).click();
  await row(page, email)
    .getByRole('button', { name: `Revoke invitation for ${email}`, exact: true })
    .click();
  await expect(row(page, email).getByText('revoked', { exact: true })).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Create invitation', exact: true }).click();
  const input = dialog(page).getByLabel('Invitation link', { exact: true });
  await expect(input).toBeVisible();
  const replacement = new URL(await input.inputValue()).hash.slice('#invite='.length);
  expect(replacement).not.toBe(original.token);
  await expect(manager.previewInvitation(original.token)).rejects.toMatchObject({ status: 410 });
  expect((await manager.previewInvitation(replacement)).email).toBe(email);
});

test('a committed acceptance with a lost response recovers through normal sign-in without duplicate accounts', async ({
  page,
}) => {
  const manager = await managerClient();
  const email = address();
  const created = await manager.createInvitation({
    name: 'Synthetic acceptance recovery QA',
    email,
  });
  await page.goto(`/#invite=${created.token}`);
  await expect(
    page.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const sent = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route('**/api/v1/invitations/accept', async (route) => {
    await route.fetch();
    received();
    await held;
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Create worker account', exact: true }).click();
  await sent;
  await expect(
    page.getByRole('button', { name: 'Return to Fieldwork', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Creating account…', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText('The account may already exist.');
  await expect(
    page.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password);
  await page.unroute('**/api/v1/invitations/accept');
  await page.getByRole('button', { name: 'Reload invitation', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Invitation unavailable', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try signing in', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
  expect((await manager.catalog()).users.filter((user) => user.email === email)).toHaveLength(1);
});

test('offline opening, failed previews, malformed and revoked links have useful recovery without sending credentials', async ({
  page,
  context,
}) => {
  const manager = await managerClient();
  const created = await manager.createInvitation({
    name: 'Synthetic offline acceptance QA',
    email: address(),
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto(`/#invite=${created.token}`);
  await expect(page.getByRole('button', { name: 'Reload invitation', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Reconnect to load this invitation.');
  await context.setOffline(false);
  await page.route('**/api/v1/invitations/preview', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Synthetic preview unavailable.' } },
    }),
  );
  await page.getByRole('button', { name: 'Reload invitation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic preview unavailable.');
  await page.unroute('**/api/v1/invitations/preview');
  await page.getByRole('button', { name: 'Reload invitation', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(password);
  await context.setOffline(false);
  await manager.revokeInvitation(created.invitation.id);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Invitation unavailable', exact: true }),
  ).toBeVisible();
  let requests = 0;
  await page.route('**/api/v1/invitations/preview', async (route) => {
    requests++;
    await route.continue();
  });
  await page.goto('/#invite=short');
  await expect(page.getByRole('alert')).toContainText('This invitation link is incomplete.');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Return to Fieldwork', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('dismissed invitation reads cannot reopen a dialog or replace the sign-in page', async ({
  page,
}) => {
  const manager = await managerClient();
  const created = await manager.createInvitation({
    name: 'Synthetic dismissed invitation QA',
    email: address(),
  });
  await login(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delivered!: () => void;
  const finished = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
    delivered();
  });
  await page.getByRole('button', { name: 'Worker invitations', exact: true }).click();
  await expect(dialog(page).getByText('Loading invitations…', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  release();
  await finished;
  await expect(dialog(page)).toHaveCount(0);
  await page.unroute(endpoint);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  let releasePreview!: () => void;
  const heldPreview = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  let previewDone!: () => void;
  const previewFinished = new Promise<void>((resolve) => {
    previewDone = resolve;
  });
  await page.route('**/api/v1/invitations/preview', async (route) => {
    const response = await route.fetch();
    await heldPreview;
    await route.fulfill({ response });
    previewDone();
  });
  await page.goto(`/#invite=${created.token}`);
  await expect(page.getByText('Loading invitation…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to Fieldwork', exact: true }).click();
  releasePreview();
  await previewFinished;
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toHaveCount(0);
});
