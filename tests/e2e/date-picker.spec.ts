import { expect, test, type Page, type Locator } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import { resolve } from 'node:path';

test.use({ timezoneId: 'America/Los_Angeles' });

async function login(page: Page) {
  await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
const picker = (page: Page, name: string) => page.getByRole('dialog', { name, exact: true });
const day = (calendar: Locator, date: string) =>
  calendar.getByRole('button', { name: new RegExp(date) });
async function fits(page: Page, calendar: Locator) {
  const rect = await calendar.boundingBox();
  const viewport = page.viewportSize()!;
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('assignment calendars validate typed dates, navigate with keys, and submit the selected date', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Assign a work order', exact: true });
  await form.getByLabel('Work order title', { exact: true }).fill('Date picker assignment QA');
  const input = form.getByLabel('Due date', { exact: true });
  await input.fill('2026-02-30');
  await expect(form.getByRole('alert')).toContainText('Enter a real date as YYYY-MM-DD.');
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/work-orders')) writes++;
  });
  await form.getByRole('button', { name: 'Assign work order', exact: true }).click();
  await expect(input).toBeFocused();
  expect(writes).toBe(0);
  await input.fill('2026-02-31');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('');
  await form.getByRole('button', { name: 'Assign work order', exact: true }).click();
  await expect(form.getByText('Due date: enter a value.', { exact: true })).toBeVisible();
  await input.fill('2026-10-22');
  const trigger = form.getByRole('button', { name: 'Choose due date', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const calendar = picker(page, 'Choose due date');
  await expect(day(calendar, 'October 22nd, 2026')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(day(calendar, 'October 23rd, 2026')).toBeFocused();
  await page.keyboard.press('PageDown');
  await expect(day(calendar, 'November 23rd, 2026')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('2026-10-23');
  await expect(calendar).toHaveCount(0);
  expect(await form.locator('label button').count()).toBe(0);
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/work-orders'),
  );
  await form.getByRole('button', { name: 'Assign work order', exact: true }).click();
  expect((await (await saved).json()).dueDate).toBe('2026-10-23');
  await expect(form).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('all date filters use a bounded calendar, including the nested server-search dialog and offline work', async ({
  page,
  context,
}) => {
  await login(page);
  const from = page.getByLabel('Due from', { exact: true });
  const through = page.getByLabel('Due through', { exact: true });
  await from.fill('2026-10-22');
  await page.getByRole('button', { name: 'Choose due from', exact: true }).click();
  const calendar = picker(page, 'Choose due from');
  await day(calendar, 'October 21st, 2026').click();
  await expect(from).toHaveValue('2026-10-21');
  await through.fill('2026-10-23');
  await page.getByRole('button', { name: 'Choose due through', exact: true }).click();
  await picker(page, 'Choose due through')
    .getByRole('button', { name: 'Clear date', exact: true })
    .click();
  await expect(through).toHaveValue('');
  await from.fill('2026-02-30');
  await expect(page.locator('.order-row')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No work orders in this date range', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Enter a real date as YYYY-MM-DD.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  await expect(from).toHaveValue('');
  await page.getByRole('button', { name: 'Search server', exact: true }).click();
  const server = picker(page, 'Search server');
  for (const [label, field] of [
    ['Choose server due from', 'Server due from'],
    ['Choose server due through', 'Server due through'],
  ]) {
    await server.getByRole('button', { name: label, exact: true }).click();
    await day(picker(page, label), 'October 22nd, 2026').click();
    await expect(server.getByLabel(field, { exact: true })).toHaveValue('2026-10-22');
    await expect(server).toBeVisible();
  }
  const trigger = server.getByRole('button', { name: 'Choose server due from', exact: true });
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(server).toBeVisible();
  await expect(trigger).toBeFocused();
  const searched = page.waitForResponse(
    (response) =>
      response.url().includes('/work-orders/search?') && response.url().includes('dueFrom='),
  );
  await server.getByRole('button', { name: 'Search records', exact: true }).click();
  const url = new URL((await searched).url());
  expect(url.searchParams.get('dueFrom')).toBe('2026-10-22');
  expect(url.searchParams.get('dueThrough')).toBe('2026-10-22');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 480 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Choose due from', exact: true }).click();
    await fits(page, calendar);
    const nextMonth = calendar.getByRole('button', { name: 'Go to the Next Month', exact: true });
    await nextMonth.focus();
    await page.keyboard.press('Enter');
    await expect(nextMonth).toBeFocused();
    await expect(calendar.getByRole('grid', { name: 'November 2026', exact: true })).toBeVisible();
    await calendar.getByRole('button', { name: 'Go to the Previous Month', exact: true }).click();
    await expect(calendar.getByRole('grid', { name: 'October 2026', exact: true })).toBeVisible();
    if (viewport.width !== 320) {
      await page.screenshot({
        path:
          process.env.UPDATE_DATE_PICKER_IMAGES === '1'
            ? resolve(
                `docs/images/date-picker-${viewport.width === 1440 ? 'desktop' : 'phone'}.png`,
              )
            : test.info().outputPath(`date-picker-${viewport.width}.png`),
      });
    }
    await calendar.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(from).toHaveValue('2026-10-22');
  }
  expect(await page.locator('input[type="date"]').count()).toBe(0);
});

test('recurring assignments and rescheduling share calendar choices without canceling their forms', async ({
  page,
}) => {
  const session = await createClient('http://127.0.0.1:4173').login(
    'manager@fieldwork.local',
    'fieldwork-demo',
  );
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  await login(page);
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  const recurring = picker(page, 'Assign recurring work');
  await recurring.getByLabel('Work order title', { exact: true }).fill('Date picker recurrence QA');
  await recurring.getByLabel('Due date', { exact: true }).fill('2028-02-28');
  await recurring.getByLabel('Occurrences', { exact: true }).fill('2');
  await recurring.getByLabel('Repeat', { exact: true }).selectOption('daily');
  await recurring.getByRole('button', { name: 'Choose due date', exact: true }).click();
  await day(picker(page, 'Choose due date'), 'February 29th, 2028').click();
  await expect(recurring.getByLabel('Due date', { exact: true })).toHaveValue('2028-02-29');
  expect(
    await recurring
      .locator('.recurrence-preview time')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2028-02-29', '2028-03-01']);
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/work-order-series'),
  );
  await recurring.getByRole('button', { name: 'Assign 2 work orders', exact: true }).click();
  const receipt = await (await saved).json();
  expect(receipt.orders[0].dueDate).toBe('2028-02-29');
  await expect(recurring).toHaveCount(0);
  await page.getByRole('button', { name: 'Change due date', exact: true }).click();
  const form = page.getByRole('form', { name: 'Change due date', exact: true });
  const date = form.getByLabel('New due date', { exact: true });
  const original = await date.inputValue();
  await form.getByRole('button', { name: 'Choose new due date', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(form).toBeVisible();
  await expect(date).toHaveValue(original);
  await form.getByRole('button', { name: 'Choose new due date', exact: true }).click();
  await picker(page, 'Choose new due date')
    .getByRole('button', { name: 'Today', exact: true })
    .click();
  await expect(date).toHaveValue('2026-10-22');
  await form.getByRole('button', { name: 'Save due date', exact: true }).click();
  await expect(form).toHaveCount(0);
  const orders = await manager.orders();
  expect(
    orders.data.find(
      (order) => order.title === 'Date picker recurrence QA' && order.dueDate === '2026-10-22',
    ),
  ).toBeDefined();
});
