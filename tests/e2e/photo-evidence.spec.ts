import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
const requiredHint =
  'At least one site photo is required for each submission, including corrections.';
async function managerClient() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  return createClient(baseURL, () => session.token);
}
async function login(page: Page, role = 'worker') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function fixture(name: string) {
  const manager = await managerClient();
  const template = await manager.createTemplate(
    `${name} checklist`,
    ['Check synthetic access'],
    true,
  );
  const order = await manager.createOrder({
    title: name,
    instructions: 'Synthetic photo evidence workflow.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    priority: 'routine',
    dueDate: '2026-12-28',
  });
  return { manager, template, order };
}
const openOrder = (page: Page, order: WorkOrder) =>
  page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
async function fillReport(page: Page, summary: string) {
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page.getByLabel('Inspection summary', { exact: true }).fill(summary);
}
async function attach(page: Page) {
  const choose = page.getByRole('button', { name: 'Choose photos', exact: true });
  const picker = page.waitForEvent('filechooser');
  await choose.focus();
  await page.keyboard.press('Enter');
  await (
    await picker
  ).setFiles({
    name: 'synthetic-evidence.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
}

test('manager creates a required-photo checklist and the assignment selector identifies its policy', async ({
  page,
}) => {
  const manager = await managerClient();
  const old = await manager.order('demo-1');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await form.getByLabel('Checklist name', { exact: true }).fill('Required evidence setup QA');
  await form
    .getByLabel('Inspection items, one per line', { exact: true })
    .fill('Check synthetic access');
  const policy = form.getByRole('combobox', { name: 'Photo evidence', exact: true });
  await expect(policy).toHaveValue('');
  await policy.focus();
  await expect(policy).toBeFocused();
  await policy.selectOption('required');
  await expect(policy).toHaveValue('required');
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button', { name: 'Add checklist', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await form.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('photo-policy-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/templates') && r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  const template = await (await response).json();
  expect(template.requiresPhoto).toBe(true);
  await expect(policy).toHaveValue('');
  await expect(
    page.getByText('At least one site photo required per submission.', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a work order', exact: true });
  const selector = dialog.getByRole('combobox', { name: 'Checklist', exact: true });
  await expect(selector.locator(`option[value="${template.id}"]`)).toHaveText(
    'Required evidence setup QA · Photo required',
  );
  await selector.selectOption(template.id);
  await dialog
    .getByLabel('Work order title', { exact: true })
    .fill('Required policy assignment QA');
  await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/work-orders') && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Assign work order', exact: true }).click();
  expect((await (await created).json()).template.requiresPhoto).toBe(true);
  expect(await manager.order('demo-1')).toEqual(old);
  expect(errors).toEqual([]);
});

test('worker keeps a missing-photo draft offline, attaches evidence, and supplies evidence again for corrections', async ({
  page,
  context,
}) => {
  const { manager, order } = await fixture('Required photo notebook QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await openOrder(page, order);
  await expect(page.getByText(requiredHint, { exact: true })).toBeVisible();
  await fillReport(page, 'Synthetic evidence draft kept without a photo.');
  await context.setOffline(true);
  const save = page.getByRole('button', { name: 'Save report for sync', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator('.inspection-form').getByRole('alert')).toContainText(
    'Attach at least one site photo',
  );
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Synthetic evidence draft kept without a photo.',
  );
  expect((await manager.order(order.id)).report).toBeNull();
  await page.reload();
  await openOrder(page, order);
  await expect(page.getByText(requiredHint, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Synthetic evidence draft kept without a photo.',
  );
  await attach(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.photo-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('photo-policy-worker-phone.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  await save.click();
  await expect(page.locator('.inspection-form').getByRole('alert')).toContainText(
    'Attach at least one site photo',
  );
  await attach(page);
  await save.click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByAltText('Submitted site photo 1')).toBeVisible();
  const submitted = await manager.order(order.id);
  expect(submitted.report?.photos).toHaveLength(1);
  await manager.review(
    order.id,
    submitted.version,
    'CHANGES_REQUESTED',
    'Synthetic follow-up photo requested.',
  );
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toBeVisible();
  await fillReport(page, 'Synthetic correction requires its own evidence.');
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.locator('.inspection-form').getByRole('alert')).toContainText(
    'Attach at least one site photo',
  );
  expect((await manager.reportHistory(order.id)).data).toHaveLength(1);
  await attach(page);
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.getByAltText('Submitted site photo 1')).toBeVisible();
  const history = await manager.reportHistory(order.id);
  expect(history.data).toHaveLength(2);
  expect(
    history.data.every(
      (revision) =>
        revision.snapshot.template.requiresPhoto && revision.snapshot.report.photos.length === 1,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('map recovery protects an unsaved photo requirement and accepts the untouched optional default', async ({
  browser,
}) => {
  const manager = await managerClient();
  const site = await manager.createSite('Evidence map guard QA', 'Synthetic map fixture', {
    latitude: 51.5,
    longitude: -0.1,
  });
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><text x="10" y="130">Synthetic test tile</text></svg>',
    }),
  );
  await page.route('**/assets/leaflet-src-*.js', (route) => route.abort('failed'));
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const card = page
    .locator('.resource-list > li')
    .filter({ has: page.getByText(site.name, { exact: true }) })
    .locator('.site-location');
  const policy = page
    .getByRole('form', { name: 'Add a checklist', exact: true })
    .getByRole('combobox', { name: 'Photo evidence', exact: true });
  await policy.selectOption('required');
  await card.getByRole('button', { name: 'Load site map', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Map tools could not load.');
  await card.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Your workspace form has unsaved changes.');
  await expect(policy).toHaveValue('required');
  await policy.selectOption('');
  await page.unroute('**/assets/leaflet-src-*.js');
  await Promise.all([
    page.waitForEvent('load'),
    card.getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await context.close();
});
