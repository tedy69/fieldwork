import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function fixture(title: string) {
  const session = await createClient('http://127.0.0.1:4173').login(
    'manager@fieldwork.local',
    'fieldwork-demo',
  );
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const order = await manager.createOrder({
    title,
    instructions: 'Synthetic rescheduling fixture.',
    siteId: catalog.sites[0].id,
    templateId: catalog.templates[0].id,
    assigneeId: catalog.users.find((user) => user.email === 'worker@fieldwork.local')!.id,
    dueDate: '2026-10-22',
    priority: 'routine',
  });
  return { manager, order };
}
async function login(page: Page, role: 'manager' | 'worker') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('manager reschedules from the planner with keyboard, retry, conflict, and offline guards', async ({
  browser,
}) => {
  const { manager, order } = await fixture('Schedule manager QA');
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-10-22T19:00:00Z') });
  await login(page, 'manager');
  await page.getByLabel('Search work orders').fill(order.title);
  await page.getByRole('button', { name: 'Week planner', exact: true }).click();
  await page
    .getByRole('group', { name: 'Days in this week', exact: true })
    .getByRole('button', { name: 'Thu, Oct 22 1 work order · Today', exact: true })
    .click();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  const trigger = page.getByRole('button', { name: 'Change due date', exact: true });
  const form = page.getByRole('form', { name: 'Change due date', exact: true });
  const date = form.getByLabel('New due date', { exact: true });
  const save = form.getByRole('button', { name: 'Save due date', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(date).toBeFocused();
  await expect(date).toHaveValue('2026-10-22');
  await expect(save).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await date.fill('2026-10-24');
  await page.screenshot({ path: test.info().outputPath('reschedule-desktop.png'), fullPage: true });
  const endpoint = `**/api/v1/work-orders/${order.id}/schedule`;
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
  await expect(date).toHaveValue('2026-10-24');
  await expect(save).toBeDisabled();
  await page.unroute(endpoint);
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(save).toBeEnabled();
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    `${order.reference} is now due Oct 24.`,
  );
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.locator('.order-meta')).toContainText('Oct 24');
  await trigger.click();
  await date.fill('2026-10-26');
  await manager.rescheduleOrder(order.id, { baseVersion: 2, dueDate: '2026-10-25' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('This work order changed.');
  await expect(date).toHaveValue('2026-10-26');
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(page.locator('.order-meta')).toContainText('Oct 25');
  await expect(form).toHaveCount(0);
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No work orders for this day', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Whole week', exact: true }).click();
  await expect(page.locator('.order-row')).toHaveCount(1);
  await expect(
    page
      .getByRole('group', { name: 'Days in this week', exact: true })
      .getByRole('button', { name: 'Sun, Oct 25 1 work order', exact: true }),
  ).toBeVisible();
  await page.locator('.order-row').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await date.fill('2026-10-27');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('reschedule-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route(endpoint, async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Reload this order before trying again.');
  await expect(save).toBeDisabled();
  await page.unroute(endpoint);
  await form.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(page.locator('.order-meta')).toContainText('Oct 27');
  await expect(form).toHaveCount(0);
  expect((await manager.order(order.id)).version).toBe(4);
  await trigger.click();
  await date.fill('2026-10-28');
  await context.setOffline(true);
  await expect(save).toBeDisabled();
  await expect(page.getByText('Connect to change the due date.', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(page.locator('.order-meta')).toContainText('Oct 27');
  await expect(trigger).toBeDisabled();
  expect(errors).toEqual([]);
  await context.close();
});

test('rescheduling blocks a stale offline report and preserves its answers, notes, and photo for review', async ({
  page,
  context,
}) => {
  const { manager, order } = await fixture('Schedule worker QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'worker');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Change due date', exact: true })).toHaveCount(0);
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Keep this offline reschedule report.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'site.png',
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
  await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2026-10-24' });
  await context.setOffline(false);
  await expect(page.getByText('Sync needs your attention', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(page.getByText('NEEDS YOUR ATTENTION', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Keep this offline reschedule report.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep draft and open latest order', exact: true }).click();
  await expect(page.locator('.order-meta')).toContainText('Oct 24');
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Keep this offline reschedule report.',
  );
  await expect(page.getByRole('radio', { name: 'Pass', exact: true }).first()).toBeChecked();
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspection report', exact: true })).toBeVisible();
  const confirmed = await manager.order(order.id);
  expect(confirmed.dueDate).toBe('2026-10-24');
  expect(confirmed.report?.summary).toBe('Keep this offline reschedule report.');
  expect(confirmed.report?.photos).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('manager can reschedule correction work while submitted and approved work stays locked', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { manager, order } = await fixture('Schedule corrections QA');
  const session = await createClient('http://127.0.0.1:4173').login(
    'worker@fieldwork.local',
    'fieldwork-demo',
  );
  const worker = createClient('http://127.0.0.1:4173', () => session.token);
  const report = {
    mutationId: crypto.randomUUID(),
    baseVersion: 1,
    answers: order.template.items.map((item) => ({
      itemId: item.id,
      value: 'pass' as const,
      note: '',
    })),
    summary: 'Original inspection snapshot.',
    photos: [],
  };
  const submitted = await worker.submitReport(order.id, report);
  await manager.review(order.id, submitted.version, 'CHANGES_REQUESTED', 'Recheck the gate.');
  await login(page, 'manager');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Change due date', exact: true }).click();
  await page.getByLabel('New due date', { exact: true }).fill('2027-01-04');
  await page.getByRole('button', { name: 'Save due date', exact: true }).click();
  await expect(page.locator('.order-meta')).toContainText('Jan 4');
  await expect(
    page.getByRole('main').getByText('Original inspection snapshot.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByText('Recheck the gate.', { exact: true }),
  ).toBeVisible();
  expect((await manager.order(order.id)).report).toEqual(submitted.report);
  await worker.submitReport(order.id, {
    ...report,
    mutationId: crypto.randomUUID(),
    baseVersion: 4,
    summary: 'Corrected inspection snapshot.',
  });
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve inspection', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change due date', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Approve inspection', exact: true }).click();
  await expect(page.getByText('Approved by Alex Morgan', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change due date', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
