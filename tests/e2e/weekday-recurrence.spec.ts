import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { CreateOrderSeries, OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const endpoint = '**/api/v1/work-order-series';
const planned = [
  '2026-12-25',
  '2026-12-28',
  '2026-12-29',
  '2026-12-30',
  '2026-12-31',
  '2027-01-01',
  '2027-01-04',
];
const dialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Assign recurring work', exact: true });
const dates = (page: Page) =>
  dialog(page).getByRole('region', { name: 'Scheduled dates', exact: true }).locator('time');
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function fill(page: Page, title: string) {
  await dialog(page).getByLabel('Work order title', { exact: true }).fill(title);
  await dialog(page)
    .getByRole('combobox', { name: 'Assign to', exact: true })
    .selectOption('worker');
  await dialog(page).getByLabel('Due date', { exact: true }).fill('2026-12-25');
  await dialog(page).getByLabel('Occurrences', { exact: true }).fill('7');
  await dialog(page)
    .getByRole('combobox', { name: 'Repeat', exact: true })
    .selectOption('weekdays');
}
test.use({ timezoneId: 'America/Los_Angeles' });

test('weekday preview rejects weekend starts and creates the exact dates shown in the batch overview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const trigger = page.getByRole('button', { name: 'Assign recurring work', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await fill(page, 'Weekday calendar QA');
  await expect(
    dialog(page).getByText(
      'Choose a Monday–Friday first date. Weekday repeats skip weekends and include holidays.',
      { exact: true },
    ),
  ).toBeVisible();
  expect(
    await dates(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(planned);
  await dialog(page).getByLabel('Due date', { exact: true }).fill('2026-12-26');
  await expect(dates(page)).toHaveCount(0);
  await expect(
    dialog(page).getByRole('button', { name: 'Assign work orders', exact: true }),
  ).toBeDisabled();
  await dialog(page).getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await expect(dates(page).first()).toHaveAttribute('datetime', '2026-12-26');
  await dialog(page).getByLabel('Due date', { exact: true }).fill('2026-12-25');
  await dialog(page)
    .getByRole('combobox', { name: 'Repeat', exact: true })
    .selectOption('weekdays');
  await page.setViewportSize({ width: 1440, height: 1200 });
  await dialog(page)
    .getByRole('heading', { name: 'Assign recurring work', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('weekday-dispatch-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog(page).evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog(page)
    .getByRole('combobox', { name: 'Repeat', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('weekday-dispatch-phone.png') });
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/work-order-series') && r.request().method() === 'POST',
  );
  await dialog(page).getByRole('button', { name: 'Assign 7 work orders', exact: true }).click();
  const receipt: OrderSeriesReceipt = await (await response).json();
  await expect(dialog(page)).toHaveCount(0);
  expect(receipt.frequency).toBe('weekdays');
  expect(receipt.orders.map((order) => order.dueDate)).toEqual(planned);
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  const overview = page.getByRole('dialog', { name: 'Recurring batches', exact: true });
  const entry = overview.getByRole('button', {
    name: `View batch ${receipt.id}: Weekday calendar QA`,
    exact: true,
  });
  await expect(entry).toContainText('Weekdays (Mon–Fri)');
  await entry.click();
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const batch = await manager.orderSeriesDetail(receipt.id);
  expect(batch.frequency).toBe('weekdays');
  expect(batch.orders.map((order) => order.plannedDueDate)).toEqual(planned);
  expect(errors).toEqual([]);
});

test('weekday recovery survives an offline reload and replays the original request without duplicate assignments', async ({
  page,
  context,
}) => {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  await login(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await fill(page, 'Weekday recovery QA');
  const requests: CreateOrderSeries[] = [];
  await page.route(endpoint, async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fetch();
    await route.abort('failed');
  });
  await dialog(page).getByRole('button', { name: 'Assign 7 work orders', exact: true }).click();
  await expect(
    dialog(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeEnabled();
  await expect(
    dialog(page).getByText('Weekdays (Mon–Fri) · 7 work orders', { exact: true }),
  ).toBeVisible();
  expect(
    await dates(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(planned);
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.unroute(endpoint);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
  await expect(
    dialog(page).getByText('Weekdays (Mon–Fri) · 7 work orders', { exact: true }),
  ).toBeVisible();
  await expect(
    dialog(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeDisabled();
  expect(
    await dates(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(planned);
  await context.setOffline(false);
  await page.route(endpoint, async (route) => {
    requests.push(route.request().postDataJSON());
    await route.continue();
  });
  await expect(
    dialog(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeEnabled();
  await dialog(page).getByRole('button', { name: 'Retry saved batch', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0].frequency).toBe('weekdays');
  expect((await manager.searchOrders({ q: 'Weekday recovery QA' })).total).toBe(7);
});
