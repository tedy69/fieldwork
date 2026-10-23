import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

async function fixture(title: string) {
  const api = createClient('http://127.0.0.1:4173');
  const session = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const order = await manager.createOrder({
    title,
    instructions: 'Synthetic handover fixture.',
    siteId: catalog.sites[0].id,
    templateId: catalog.templates[0].id,
    assigneeId: 'worker',
    dueDate: '2026-10-23',
    priority: 'routine',
  });
  const sessionWorker = await api.login('worker@fieldwork.local', 'fieldwork-demo');
  const worker = createClient('http://127.0.0.1:4173', () => sessionWorker.token);
  return { manager, worker, order };
}
async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${email}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
const open = (page: Page, order: WorkOrder) =>
  page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
const report = (order: WorkOrder) => ({
  mutationId: crypto.randomUUID(),
  baseVersion: order.version,
  answers: order.template.items.map((item) => ({
    itemId: item.id,
    value: 'pass' as const,
    note: '',
  })),
  summary: 'Original worker report.',
  photos: [],
});

test('manager hands over work with keyboard, reload guards, uncertain saves, narrow layout, and offline access', async ({
  page,
  context,
}) => {
  const { manager, worker, order } = await fixture('Handover manager QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, 'manager');
  await page.getByLabel('Search work orders').fill(order.title);
  await open(page, order);
  const trigger = page.getByRole('button', { name: 'Change worker', exact: true });
  const form = page.getByRole('form', { name: 'Change worker', exact: true });
  const select = form.getByLabel('New field worker', { exact: true });
  const save = form.getByRole('button', { name: 'Save worker', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(select).toBeFocused();
  await expect(save).toBeDisabled();
  await expect(select.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await select.selectOption('worker-2');
  await expect(select).toHaveValue('worker-2');
  await page.screenshot({
    path: test.info().outputPath('reassignment-desktop.png'),
    fullPage: true,
  });
  const endpoint = `**/api/v1/work-orders/${order.id}/assignee`;
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Dispatch server unavailable.' },
      }),
    }),
  );
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Dispatch server unavailable.');
  await expect(select).toHaveValue('worker-2');
  await expect(save).toBeDisabled();
  await page.unroute(endpoint);
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(save).toBeEnabled();
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    `${order.reference} is now assigned to Jordan Lee.`,
  );
  await expect(page.locator('.order-meta')).toContainText('Jordan Lee');
  await expect(page.getByRole('main')).toBeFocused();
  await trigger.click();
  await select.selectOption('worker');
  await manager.rescheduleOrder(order.id, { baseVersion: 2, dueDate: '2026-10-25' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('This work order changed.');
  await expect(select).toHaveValue('worker');
  await expect(save).toBeDisabled();
  const orderEndpoint = `**/api/v1/work-orders/${order.id}`;
  await page.route(orderEndpoint, (route) => route.abort('failed'));
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.unroute(orderEndpoint);
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.order-meta')).toContainText('Oct 25');
  await trigger.click();
  await select.selectOption('worker');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('reassignment-phone.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route(endpoint, async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Reload this order before trying again.');
  await expect(select).toHaveValue('worker');
  await expect(save).toBeDisabled();
  await page.unroute(endpoint);
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.order-meta')).toContainText('Sam Rivera');
  expect((await manager.order(order.id)).version).toBe(4);
  await trigger.click();
  await select.selectOption('worker-2');
  await context.setOffline(true);
  await expect(save).toBeDisabled();
  await expect(page.getByText('Connect to change the worker.', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await open(page, order);
  await expect(trigger).toBeDisabled();
  await expect(page.locator('.order-meta')).toContainText('Sam Rivera');
  await context.setOffline(false);
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await select.selectOption('worker-2');
  await worker.submitReport(order.id, report(await manager.order(order.id)));
  await save.click();
  await expect(form.getByRole('alert')).toContainText('This work order changed.');
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve inspection', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a reassigned offline report stays queued with photos until the original worker receives the order again', async ({
  page,
  context,
  browser,
}) => {
  const { manager, order } = await fixture('Handover offline QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page, 'worker');
  await open(page, order);
  await expect(page.getByRole('button', { name: 'Change worker', exact: true })).toHaveCount(0);
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Notes: Access route is clear and secure', { exact: true })
    .fill('Keep the gate note.');
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Keep this offline handover report.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'handover.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await manager.reassignOrder(order.id, { baseVersion: 1, assigneeId: 'worker-2' });
  await context.setOffline(false);
  await page.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(page.getByText('NEEDS YOUR ATTENTION', { exact: true })).toBeVisible();
  const recover = page.getByRole('button', {
    name: 'Keep draft and open latest order',
    exact: true,
  });
  await recover.click();
  await expect(page.getByRole('main')).toContainText(
    'This assignment is no longer available to your account.',
  );
  await expect(page.getByText('Keep this offline handover report.', { exact: true })).toBeVisible();
  await expect(recover).toBeEnabled();
  await context.setOffline(true);
  await expect(recover).toBeDisabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(page.getByText('Keep this offline handover report.', { exact: true })).toBeVisible();
  await expect(page.getByText('1 photos', { exact: false })).toBeVisible();
  const replacementContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const replacement = await replacementContext.newPage();
  await login(replacement, 'jordan');
  await open(replacement, order);
  await expect(replacement.getByLabel('Inspection summary', { exact: true })).toHaveValue('');
  await expect(replacement.getByAltText('Site attachment 1')).toHaveCount(0);
  await replacementContext.close();
  expect((await manager.order(order.id)).report).toBeNull();
  await manager.reassignOrder(order.id, { baseVersion: 2, assigneeId: 'worker' });
  await context.setOffline(false);
  await expect(recover).toBeEnabled();
  await recover.click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this offline handover report.',
  );
  await expect(
    page.getByLabel('Notes: Access route is clear and secure', { exact: true }),
  ).toHaveValue('Keep the gate note.');
  await expect(page.getByRole('radio', { name: 'Pass', exact: true }).first()).toBeChecked();
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspection report', exact: true })).toBeVisible();
  const confirmed = await manager.order(order.id);
  expect(confirmed.version).toBe(4);
  expect(confirmed.report?.summary).toBe('Keep this offline handover report.');
  expect(confirmed.report?.photos).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('correction handover preserves the saved report and feedback, with a useful empty worker state', async ({
  page,
}) => {
  const { manager, worker, order } = await fixture('Handover corrections QA');
  const submitted = await worker.submitReport(order.id, report(order));
  await manager.review(order.id, submitted.version, 'CHANGES_REQUESTED', 'Recheck the latch.');
  const catalogEndpoint = '**/api/v1/catalog';
  await page.route(catalogEndpoint, async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    await route.fulfill({
      response,
      json: {
        ...catalog,
        users: catalog.users.filter((user: { id: string }) => user.id !== 'worker-2'),
      },
    });
  });
  await login(page, 'manager');
  await open(page, order);
  const trigger = page.getByRole('button', { name: 'Change worker', exact: true });
  await expect(trigger).toBeDisabled();
  await expect(
    page.getByText('Sync the workspace to load workers. Another field worker is required.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(catalogEndpoint);
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.getByLabel('New field worker', { exact: true }).selectOption('worker-2');
  await page.getByRole('button', { name: 'Save worker', exact: true }).click();
  await expect(page.locator('.order-meta')).toContainText('Jordan Lee');
  await expect(
    page.getByRole('main').getByText('Original worker report.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByText('Recheck the latch.', { exact: true }),
  ).toBeVisible();
  expect((await manager.order(order.id)).report).toEqual(submitted.report);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 'jordan');
  await open(page, order);
  await expect(
    page.getByRole('main').getByText('Recheck the latch.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue('');
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Replacement worker checked the latch.');
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspection report', exact: true })).toBeVisible();
  expect((await manager.order(order.id)).report?.submittedBy).toBe('worker-2');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 'manager');
  await open(page, order);
  await expect(trigger).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve inspection', exact: true }).click();
  await expect(page.getByText('Approved by Alex Morgan', { exact: true })).toBeVisible();
  await expect(trigger).toHaveCount(0);
});
