import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { State } from '@fieldwork/offline';

const baseURL = 'http://127.0.0.1:4173';
const password = 'synthetic-invitation-password';
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Worker invitations', exact: true });
async function managerClient() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  return createClient(baseURL, () => session.token);
}
async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function openInvitations(page: Page) {
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Worker invitations', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(
    dialog(page).getByRole('heading', { name: 'Worker invitations', exact: true }),
  ).toBeFocused();
  await expect(
    dialog(page).getByRole('button', { name: 'Create invitation', exact: true }),
  ).toBeEnabled();
}
async function saved(page: Page, userId: string) {
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
    `fieldwork:v1:${userId}`,
  );
}
async function createLink(page: Page, email: string) {
  await dialog(page).getByLabel('Worker name', { exact: true }).fill('Synthetic invited worker QA');
  await dialog(page).getByLabel('Worker email', { exact: true }).fill(email);
  await dialog(page).getByRole('button', { name: 'Create invitation', exact: true }).click();
  const input = dialog(page).getByLabel('Invitation link', { exact: true });
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  return input.inputValue();
}
async function setPasswords(page: Page, first = password, second = first) {
  await page.getByLabel('Password', { exact: true }).fill(first);
  await page.getByLabel('Confirm password', { exact: true }).fill(second);
}
async function signInNew(page: Page, email: string) {
  await page.getByRole('button', { name: 'Continue to sign in', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
}

test('manager creates and copies a one-time link, recipient activates a worker, and acceptance appears in the ledger', async ({
  browser,
}) => {
  const deskContext = await browser.newContext({ baseURL });
  const fieldContext = await browser.newContext({ baseURL });
  const desk = await deskContext.newPage();
  const field = await fieldContext.newPage();
  const errors: string[] = [];
  desk.on('pageerror', (error) => errors.push(error.message));
  field.on('pageerror', (error) => errors.push(error.message));
  await login(desk);
  await openInvitations(desk);
  await expect(
    dialog(desk).getByRole('heading', { name: 'No invitations yet', exact: true }),
  ).toBeVisible();
  const email = `invitation-ui-${crypto.randomUUID()}@example.com`;
  const link = await createLink(desk, email);
  const secret = new URL(link).hash.slice('#invite='.length);
  expect(link.startsWith(baseURL + '/#invite=')).toBe(true);
  const input = dialog(desk).getByLabel('Invitation link', { exact: true });
  await desk.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Synthetic clipboard failure');
        },
      },
    }),
  );
  await dialog(desk).getByRole('button', { name: 'Copy invitation link', exact: true }).click();
  await expect(dialog(desk).getByRole('alert')).toContainText('Could not copy.');
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((node) =>
      node instanceof HTMLInputElement ? (node.selectionEnd ?? 0) - (node.selectionStart ?? 0) : 0,
    ),
  ).toBe(link.length);
  await desk.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copiedInvitation: string }).copiedInvitation = value;
        },
      },
    }),
  );
  await dialog(desk).getByRole('button', { name: 'Copy invitation link', exact: true }).focus();
  await desk.keyboard.press('Enter');
  await expect(
    dialog(desk).getByRole('status').filter({ hasText: 'Invitation link copied.' }),
  ).toBeVisible();
  expect(
    await desk.evaluate(() => (window as unknown as { copiedInvitation: string }).copiedInvitation),
  ).toBe(link);
  expect(JSON.stringify(await saved(desk, 'manager'))).not.toContain(secret);
  expect(
    await desk.evaluate(() =>
      JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
    ),
  ).not.toContain(secret);
  await desk.setViewportSize({ width: 1440, height: 1100 });
  await desk.screenshot({
    path: test.info().outputPath('worker-invitations-desktop.png'),
    mask: [input],
    maskColor: '#151d20',
  });
  for (const width of [390, 320]) {
    await desk.setViewportSize({ width, height: 844 });
    expect(await dialog(desk).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await desk.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await desk.setViewportSize({ width: 390, height: 844 });
  await input.scrollIntoViewIfNeeded();
  await desk.screenshot({
    path: test.info().outputPath('worker-invitations-phone.png'),
    mask: [input],
    maskColor: '#151d20',
  });
  await dialog(desk)
    .getByRole('button', { name: 'Create another invitation', exact: true })
    .click();
  await expect(dialog(desk).getByLabel('Worker name', { exact: true })).toHaveValue('');
  await expect(dialog(desk).getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  await desk.keyboard.press('Escape');
  await expect(desk.getByRole('button', { name: 'Worker invitations', exact: true })).toBeFocused();
  const urls: string[] = [];
  field.on('request', (request) => urls.push(request.url()));
  await field.goto(link);
  await expect(field.getByText(email, { exact: true })).toBeVisible();
  await expect(
    field.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toBeEnabled();
  await field.setViewportSize({ width: 1440, height: 1100 });
  await expect(field.getByRole('heading', { name: 'Join the field team.', exact: true })).toHaveCSS(
    'outline-color',
    'rgb(245, 198, 109)',
  );
  await field.screenshot({ path: test.info().outputPath('accept-invitation-desktop.png') });
  for (const width of [390, 320]) {
    await field.setViewportSize({ width, height: 844 });
    expect(await field.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await field.setViewportSize({ width: 390, height: 844 });
  await field
    .getByRole('heading', { name: 'Set up your notebook', exact: true })
    .scrollIntoViewIfNeeded();
  await field.screenshot({ path: test.info().outputPath('accept-invitation-phone.png') });
  await setPasswords(field, password, 'different-synthetic-password');
  await field.getByRole('button', { name: 'Create worker account', exact: true }).click();
  await expect(field.getByRole('alert')).toContainText('Passwords do not match.');
  await expect(field.getByLabel('Confirm password', { exact: true })).toBeFocused();
  await setPasswords(field);
  const accepted = field.waitForResponse((response) =>
    response.url().endsWith('/invitations/accept'),
  );
  await field.getByRole('button', { name: 'Create worker account', exact: true }).click();
  expect((await accepted).headers()['set-cookie']).toBeUndefined();
  await expect(
    field.getByRole('heading', { name: 'Your account is ready', exact: true }),
  ).toBeFocused();
  expect(new URL(field.url()).hash).toBe('');
  expect(urls.every((url) => !url.includes(secret))).toBe(true);
  expect(urls.some((url) => url.endsWith('/me'))).toBe(false);
  await signInNew(field, email);
  await expect(field.getByRole('button', { name: 'Sites & checklists', exact: true })).toHaveCount(
    0,
  );
  await expect(field.getByRole('button', { name: /^Open FW-001:/ })).toHaveCount(0);
  await desk.getByRole('button', { name: 'Worker invitations', exact: true }).click();
  await expect(
    dialog(desk).locator('.invitation-list > li').filter({ hasText: email }),
  ).toContainText('accepted');
  await expect(dialog(desk).getByLabel('Invitation link', { exact: true })).toHaveCount(0);
  await dialog(desk).getByRole('button', { name: 'Close invitations', exact: true }).click();
  await desk.getByRole('button', { name: 'Sync now', exact: true }).click();
  expect(errors).toEqual([]);
  await deskContext.close();
  await fieldContext.close();
});

test('acceptance and explicit sign-in keep an existing worker notebook and photo draft on the device', async ({
  page,
  context,
}) => {
  const manager = await managerClient();
  const email = `invitation-draft-${crypto.randomUUID()}@example.com`;
  const receipt = await manager.createInvitation({
    name: 'Synthetic invited worker draft QA',
    email,
  });
  await login(page, 'worker');
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Existing worker draft survives invitation acceptance.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await expect
    .poll(async () => (await saved(page, 'worker'))?.drafts['demo-1']?.photos.length)
    .toBe(1);
  const before = await saved(page, 'worker');
  const cookies = await context.cookies();
  await page.goto(`/#invite=${receipt.token}`);
  await expect(
    page.getByRole('button', { name: 'Create worker account', exact: true }),
  ).toBeEnabled();
  await setPasswords(page);
  await page.getByRole('button', { name: 'Create worker account', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your account is ready', exact: true }),
  ).toBeVisible();
  expect(await context.cookies()).toEqual(cookies);
  expect(await saved(page, 'worker')).toEqual(before);
  await signInNew(page, email);
  expect(await saved(page, 'worker')).toEqual(before);
  const signedOut = page.waitForResponse((response) =>
    response.url().endsWith('/sessions/current'),
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await signedOut;
  await login(page, 'worker');
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Existing worker draft survives invitation acceptance.',
  );
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
});
