import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

for (const [role, timezoneId, time] of [
  ['manager', 'America/Los_Angeles', '2026-10-23T06:30:00Z'],
  ['worker', 'Asia/Jakarta', '2026-10-21T17:30:00Z'],
] as const) {
  test(`${role} plans a week and day across search, status, and offline records`, async ({
    browser,
  }) => {
    const baseURL = 'http://127.0.0.1:4173';
    const client = createClient(baseURL);
    const managerSession = await client.login('manager@fieldwork.local', 'fieldwork-demo');
    const workerSession = await client.login('worker@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => managerSession.token);
    const worker = createClient(baseURL, () => workerSession.token);
    const catalog = await manager.catalog();
    const prefix = `Planner QA ${role}`;
    for (const [name, dueDate, submitted] of [
      ['Before', '2026-10-18', false],
      ['Monday', '2026-10-19', true],
      ['Today', '2026-10-22', false],
      ['Sunday', '2026-10-25', true],
      ['After', '2026-10-26', false],
    ] as const) {
      const order = await manager.createOrder({
        title: `${prefix} ${name}`,
        instructions: 'Synthetic weekly planner fixture.',
        siteId: catalog.sites[0].id,
        templateId: catalog.templates[0].id,
        assigneeId: workerSession.user.id,
        dueDate,
        priority: 'routine',
      });
      if (submitted)
        await worker.submitReport(order.id, {
          mutationId: crypto.randomUUID(),
          baseVersion: order.version,
          answers: order.template.items.map((item) => ({
            itemId: item.id,
            value: 'pass',
            note: '',
          })),
          summary: 'Synthetic planner report.',
          photos: [],
        });
    }
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
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const search = page.getByLabel('Search work orders');
    const rows = page.locator('.order-row');
    const planner = page.getByRole('button', { name: 'Week planner', exact: true });
    await search.fill(prefix);
    await page.getByRole('button', { name: 'Date range', exact: true }).click();
    await page.getByLabel('Due from', { exact: true }).fill('2026-10-26');
    await expect(rows).toHaveCount(1);
    await planner.focus();
    await page.keyboard.press('Enter');
    await expect(planner).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 19, 2026', exact: true }),
    ).toBeVisible();
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText(`${prefix} Monday`);
    await expect(rows.last()).toContainText(`${prefix} Sunday`);
    const days = page.getByRole('group', { name: 'Days in this week', exact: true });
    await expect(days.getByRole('button')).toHaveCount(7);
    const today = days.getByRole('button', {
      name: 'Thu, Oct 22 1 work order · Today',
      exact: true,
    });
    await expect(today).toHaveAttribute('aria-current', 'date');
    await page.getByRole('button', { name: 'To review', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(
      days.getByRole('button', { name: 'Thu, Oct 22 0 work orders · Today', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    if (role === 'manager') {
      const ready = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export reports (2)', exact: true }).click();
      const csv = readFileSync((await (await ready).path())!, 'utf8');
      expect(csv).toContain(`${prefix} Monday`);
      expect(csv).toContain(`${prefix} Sunday`);
      expect(csv).not.toContain(`${prefix} Before`);
      expect(csv).not.toContain(`${prefix} After`);
    }
    await page.getByRole('button', { name: 'Overdue', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} Monday`);
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    await today.focus();
    await page.keyboard.press('Space');
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} Today`);
    await rows.click();
    await page.getByRole('button', { name: '← Work orders', exact: true }).click();
    await expect(today).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: test.info().outputPath('planner-desktop.png'), fullPage: true });
    await days.getByRole('button', { name: 'Wed, Oct 21 0 work orders', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'No work orders for this day', exact: true }),
    ).toBeVisible();
    if (role === 'manager') {
      await page.getByRole('button', { name: '+ Assign for selected day', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-21');
      await dialog.getByLabel('Work order title', { exact: true }).fill(`${prefix} Scheduled`);
      await dialog.getByLabel('Assign to', { exact: true }).selectOption({ label: 'Sam Rivera' });
      await page.route('**/api/v1/work-orders', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'UNAVAILABLE', message: 'Dispatch server unavailable. Try again.' },
          }),
        }),
      );
      await dialog.getByRole('button', { name: 'Assign work order', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText('Dispatch server unavailable. Try again.');
      await expect(dialog.getByLabel('Due date', { exact: true })).toHaveValue('2026-10-21');
      await expect(dialog.getByLabel('Work order title', { exact: true })).toHaveValue(
        `${prefix} Scheduled`,
      );
      await page.unroute('**/api/v1/work-orders');
      await dialog.getByRole('button', { name: 'Assign work order', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: `${prefix} Scheduled`, exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: '← Work orders', exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(`${prefix} Scheduled`);
    } else {
      await expect(page.getByRole('button', { name: /Assign for selected day/ })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 26, 2026', exact: true }),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} After`);
    await page.getByRole('button', { name: 'Previous week', exact: true }).click();
    await expect(rows).toHaveCount(role === 'manager' ? 4 : 3);
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await page.getByRole('button', { name: 'Next week', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'No work orders this week', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 19, 2026', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByLabel('Due from', { exact: true })).toHaveValue('2026-10-26');
    await expect(rows).toHaveCount(1);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
    await search.fill(prefix);
    await planner.click();
    await expect(rows).toHaveCount(role === 'manager' ? 4 : 3);
    await today.click();
    await expect(rows).toHaveCount(1);
    if (role === 'manager')
      await expect(
        page.getByRole('button', { name: '+ Assign for selected day', exact: true }),
      ).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await days.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath('planner-mobile.png') });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Whole week', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(rows).toHaveCount(role === 'manager' ? 4 : 3);
    await page.clock.fastForward(
      3 * 86_400_000 + (role === 'manager' ? 30 : 23 * 60 + 30) * 60_000 + 1000,
    );
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 19, 2026', exact: true }),
    ).toBeVisible();
    await expect(days.locator('[aria-current="date"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'This week', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Week of Oct 26, 2026', exact: true }),
    ).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} After`);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('new list assignments default to the local calendar date', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'America/Los_Angeles',
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-23T06:30:00Z') });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Due date', { exact: true })).toHaveValue(
    '2026-10-22',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.close();
});
