import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
async function login(page: Page, role: string) {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function fixture(prefix: string) {
  const api = createClient(baseURL);
  const managerSession = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const workerSession = await api.login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => managerSession.token);
  const worker = createClient(baseURL, () => workerSession.token);
  const catalog = await manager.catalog();
  const records: WorkOrder[] = [];
  for (const [name, dueDate, submitted, assigneeId] of [
    ['Before', '2026-09-30', true, 'worker'],
    ['First', '2026-10-01', false, 'worker'],
    ['Second', '2026-10-01', true, 'worker'],
    ['Mid', '2026-10-15', true, 'worker'],
    ['Last', '2026-10-31', false, 'worker'],
    ['After', '2026-11-01', false, 'worker'],
    ['Private', '2026-10-15', false, 'worker-2'],
  ] as const) {
    let order = await manager.createOrder({
      title: `${prefix} ${name}`,
      instructions: 'Synthetic monthly planner fixture.',
      siteId: catalog.sites[0].id,
      templateId: catalog.templates[0].id,
      assigneeId,
      dueDate,
      priority: 'routine',
    });
    if (submitted)
      order = await worker.submitReport(order.id, {
        mutationId: crypto.randomUUID(),
        baseVersion: order.version,
        answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
        summary: 'Synthetic month report.',
        photos: [],
      });
    records.push(order);
  }
  return { records, manager };
}

for (const [role, timezoneId, time] of [
  ['manager', 'America/Los_Angeles', '2026-11-01T06:50:00Z'],
  ['worker', 'Asia/Jakarta', '2026-10-31T16:50:00Z'],
] as const) {
  test(`${role} plans a month with filters, exports, selected-date assignments and saved offline work`, async ({
    browser,
  }) => {
    const prefix = `Month QA ${role}`;
    const { records, manager } = await fixture(prefix);
    const context = await browser.newContext({
      baseURL,
      timezoneId,
      locale: 'en-US',
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date(time) });
    await login(page, role);
    const search = page.getByLabel('Search work orders');
    const rows = page.locator('.order-row');
    await search.fill(prefix);
    await expect(rows).toHaveCount(role === 'manager' ? 7 : 6);
    if (role === 'worker') {
      const first = records.find((order) => order.title.endsWith(' First'))!;
      await page
        .getByRole('button', { name: `Open ${first.reference}: ${first.title}`, exact: true })
        .click();
      await page
        .getByLabel('Inspection summary', { exact: true })
        .fill('Unsent month planning draft.');
      await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
        name: 'month.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
      await expect(page.getByAltText('Site attachment 1')).toBeVisible();
      await page.getByRole('button', { name: '← Work orders', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Date range', exact: true }).click();
    await page.getByLabel('Due from', { exact: true }).fill('2026-11-01');
    await expect(rows).toHaveCount(1);
    const month = page.getByRole('button', { name: 'Month planner', exact: true });
    await month.focus();
    await page.keyboard.press('Enter');
    await expect(month).toHaveAttribute('aria-pressed', 'true');
    const planner = page.getByRole('region', { name: 'October 2026', exact: true });
    const days = planner.getByRole('group', { name: 'Days in this month', exact: true });
    const today = days.getByRole('button', {
      name: 'Choose Oct 31, 2026: 1 work order, today',
      exact: true,
    });
    await expect(today).toHaveAttribute('aria-current', 'date');
    await expect(days.getByRole('button')).toHaveCount(31);
    await expect(rows).toHaveCount(role === 'manager' ? 5 : 4);
    const expected = records
      .filter(
        (order) =>
          order.dueDate >= '2026-10-01' &&
          order.dueDate <= '2026-10-31' &&
          (role === 'manager' || order.assignee.id === 'worker'),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.reference.localeCompare(b.reference));
    await expect(rows.locator('.order-title')).toHaveText(expected.map((order) => order.title));
    await expect(rows.last()).toContainText(`${prefix} Last`);
    if (role === 'manager') {
      await page.route('**/api/v1/work-orders?*', (route) =>
        route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Month sync unavailable.' } },
        }),
      );
      await page.getByRole('button', { name: 'Sync now', exact: true }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText('Month sync unavailable.');
      await expect(rows).toHaveCount(5);
      await page.unroute('**/api/v1/work-orders?*');
      await page.getByRole('button', { name: 'Sync now', exact: true }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    }
    const firstDay = days.getByRole('button', {
      name: 'Choose Oct 1, 2026: 2 work orders',
      exact: true,
    });
    await expect(firstDay).toBeVisible();
    await expect(days.locator('[tabindex="0"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'To review', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(
      days.getByRole('button', { name: 'Choose Oct 1, 2026: 1 work order', exact: true }),
    ).toBeVisible();
    if (role === 'manager') {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export reports (2)', exact: true }).click();
      const csv = readFileSync((await (await download).path())!, 'utf8');
      expect(csv).toContain(`${prefix} Second`);
      expect(csv).toContain(`${prefix} Mid`);
      expect(csv).not.toContain(`${prefix} Before`);
      expect(csv).not.toContain(`${prefix} After`);
    } else await expect(page.getByRole('button', { name: /Export reports/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    await search.fill(`${prefix} Last`);
    await expect(rows).toHaveCount(1);
    await expect(
      days.getByRole('button', { name: 'Choose Oct 1, 2026: 0 work orders', exact: true }),
    ).toBeVisible();
    await search.fill(prefix);
    await today.focus();
    await page.keyboard.press('Home');
    await expect(firstDay).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      days.getByRole('button', { name: 'Choose Oct 8, 2026: 0 work orders', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(
      days.getByRole('button', { name: 'Choose Oct 7, 2026: 0 work orders', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('End');
    await expect(today).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(today).toBeFocused();
    await expect(rows).toHaveCount(role === 'manager' ? 5 : 4);
    await page.keyboard.press('Space');
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(1);
    await rows.click();
    await page.getByRole('button', { name: '← Work orders', exact: true }).click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await planner.screenshot({ path: test.info().outputPath(`month-${role}-desktop.png`) });
    await page.getByRole('button', { name: 'Whole month', exact: true }).click();
    await expect(rows).toHaveCount(role === 'manager' ? 5 : 4);
    const emptyDay = days.getByRole('button', {
      name: 'Choose Oct 20, 2026: 0 work orders',
      exact: true,
    });
    await emptyDay.click();
    await expect(
      page.getByRole('heading', { name: 'No work orders for this day', exact: true }),
    ).toBeVisible();
    if (role === 'manager') {
      await page.getByRole('button', { name: '+ Assign for selected day', exact: true }).click();
      const form = page.getByRole('dialog');
      await expect(form.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-20');
      await form.getByLabel('Work order title', { exact: true }).fill(`${prefix} Scheduled`);
      await form.getByLabel('Assign to', { exact: true }).selectOption('worker');
      await page.route('**/api/v1/work-orders', (route) =>
        route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Dispatch unavailable. Try again.' } },
        }),
      );
      await form.getByRole('button', { name: 'Assign work order', exact: true }).click();
      await expect(form.getByRole('alert')).toHaveText('Dispatch unavailable. Try again.');
      await expect(form.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-20');
      await page.unroute('**/api/v1/work-orders');
      await form.getByRole('button', { name: 'Assign work order', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: `${prefix} Scheduled`, exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: '← Work orders', exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(`${prefix} Scheduled`);
    } else
      await expect(page.getByRole('button', { name: /Assign for selected day/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Week planner', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 19, 2026', exact: true }),
    ).toBeVisible();
    await month.click();
    await expect(planner.getByText('Showing the whole month.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} After`);
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'No work orders this month', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'This month', exact: true }).click();
    await expect(planner).toBeVisible();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByLabel('Due from', { exact: true })).toHaveValue('2026-11-01');
    await expect(rows).toHaveCount(1);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
    await search.fill(prefix);
    await month.click();
    await expect(rows).toHaveCount(role === 'manager' ? 6 : 4);
    if (role === 'manager') {
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export reports (2)', exact: true }).click();
      const csv = readFileSync((await (await download).path())!, 'utf8');
      expect(csv).toContain(`${prefix} Second`);
      expect(csv).not.toContain(`${prefix} Before`);
    }
    await today.click();
    await expect(rows).toHaveCount(1);
    if (role === 'manager')
      await expect(
        page.getByRole('button', { name: '+ Assign for selected day', exact: true }),
      ).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await planner.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: test.info().outputPath(`month-${role}-phone.png`) });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await days
          .getByRole('button')
          .evaluateAll((elements) =>
            elements.every((element) => element.getBoundingClientRect().height >= 44),
          ),
      ).toBe(true);
    }
    await today.focus();
    await page.keyboard.press('Home');
    await expect(firstDay).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(
      days.getByRole('button', { name: 'Choose Oct 3, 2026: 0 work orders', exact: true }),
    ).toBeFocused();
    await page.clock.fastForward(20 * 60_000);
    await expect(planner).toBeVisible();
    await expect(days.locator('[aria-current="date"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'This month', exact: true }).click();
    const november = page.getByRole('region', { name: 'November 2026', exact: true });
    await expect(
      november.getByRole('button', {
        name: 'Choose Nov 1, 2026: 1 work order, today',
        exact: true,
      }),
    ).toHaveAttribute('aria-current', 'date');
    await expect(rows).toHaveCount(1);
    if (role === 'worker') {
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await search.fill(`${prefix} First`);
      await rows.click();
      await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
        'Unsent month planning draft.',
      );
      await expect(page.getByAltText('Site attachment 1')).toBeVisible();
      const first = records.find((order) => order.title.endsWith(' First'))!;
      expect((await manager.order(first.id)).report).toBeNull();
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('month navigation crosses short months, leap days and year boundaries without skipping months', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL,
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2028-01-31T20:00:00Z') });
  await login(page, 'manager');
  await page.getByLabel('Search work orders').fill('Leap month navigation QA');
  await page.getByRole('button', { name: 'Month planner', exact: true }).click();
  const days = page.getByRole('group', { name: 'Days in this month', exact: true });
  await expect(page.getByRole('heading', { name: 'January 2028', exact: true })).toBeVisible();
  await expect(days.getByRole('button')).toHaveCount(31);
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'February 2028', exact: true })).toBeVisible();
  await expect(days.getByRole('button')).toHaveCount(29);
  await days
    .getByRole('button', { name: 'Choose Feb 29, 2028: 0 work orders', exact: true })
    .click();
  await page.getByRole('button', { name: '+ Assign for selected day', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Due date', { exact: true })).toHaveValue(
    '2028-02-29',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'March 2028', exact: true })).toBeVisible();
  await expect(days.getByRole('button')).toHaveCount(31);
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(days.getByRole('button')).toHaveCount(29);
  await page.getByRole('button', { name: 'This month', exact: true }).click();
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'December 2027', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'January 2028', exact: true })).toBeVisible();
  await context.close();
});
