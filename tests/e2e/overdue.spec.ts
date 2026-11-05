import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

for (const scenario of [
  { zone: 'America/Los_Angeles', time: '2026-10-23T06:50:00Z', role: 'manager' },
  { zone: 'Asia/Jakarta', time: '2026-10-22T16:50:00Z', role: 'worker' },
] as const) {
  test(`due-date filters follow the local date offline in ${scenario.zone}`, async ({
    browser,
  }) => {
    const baseURL = 'http://127.0.0.1:4173';
    const loginClient = createClient(baseURL);
    const managerSession = await loginClient.login('manager@fieldwork.local', 'fieldwork-demo');
    const workerSession = await loginClient.login('worker@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => managerSession.token);
    const worker = createClient(baseURL, () => workerSession.token);
    const catalog = await manager.catalog();
    const prefix = `Due date ${scenario.role} ${crypto.randomUUID().slice(0, 8)}`;
    for (const [name, dueDate, state] of [
      ['Yesterday', '2026-10-21', 'ASSIGNED'],
      ['Today', '2026-10-22', 'ASSIGNED'],
      ['Tomorrow', '2026-10-23', 'ASSIGNED'],
      ['Last in range', '2026-10-28', 'ASSIGNED'],
      ['After range', '2026-10-29', 'ASSIGNED'],
      ['Approved', '2026-10-21', 'APPROVED'],
      ['Approved today', '2026-10-22', 'APPROVED'],
      ['Submitted', '2026-10-21', 'SUBMITTED'],
      ['Changes', '2026-10-21', 'CHANGES_REQUESTED'],
    ] as const) {
      let order = await manager.createOrder({
        title: `${prefix} ${name}`,
        instructions: 'Synthetic due-date test assignment.',
        siteId: catalog.sites[0].id,
        templateId: catalog.templates[0].id,
        assigneeId: workerSession.user.id,
        dueDate,
        priority: 'routine',
      });
      if (state !== 'ASSIGNED') {
        order = await worker.submitReport(order.id, {
          mutationId: crypto.randomUUID(),
          baseVersion: order.version,
          answers: order.template.items.map((item) => ({
            itemId: item.id,
            value: 'pass',
            note: '',
          })),
          summary: 'Synthetic inspection for due-date coverage.',
          photos: [],
        });
        if (state !== 'SUBMITTED')
          await manager.review(order.id, order.version, state, 'Test review.');
      }
    }

    const context = await browser.newContext({
      baseURL,
      timezoneId: scenario.zone,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date(scenario.time) });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(`${scenario.role}@fieldwork.local`);
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const search = page.getByLabel('Search work orders');
    await search.fill(prefix);
    const rows = page.locator('.order-row');
    await expect(rows).toHaveCount(9);
    for (const name of ['Yesterday', 'Submitted', 'Changes']) {
      const row = rows.filter({ hasText: `${prefix} ${name}` });
      await expect(row.locator('.due')).toHaveClass(/is-overdue/);
      await expect(row.getByText('Overdue', { exact: true })).toBeVisible();
      await expect(row.locator('time')).toHaveAttribute('datetime', '2026-10-21');
    }
    for (const name of ['Today', 'Tomorrow', 'Approved', 'Approved today']) {
      const row = rows.filter({ has: page.getByText(`${prefix} ${name}`, { exact: true }) });
      await expect(row.locator('.due')).not.toHaveClass(/is-overdue/);
      await expect(row.getByText('Overdue', { exact: true })).toHaveCount(0);
    }
    const dueToday = page.getByRole('button', { name: 'Due today', exact: true });
    await dueToday.focus();
    await page.keyboard.press('Space');
    await expect(dueToday).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(`${prefix} Today`);
    const nextWeek = page.getByRole('button', { name: 'Next 7 days', exact: true });
    await nextWeek.focus();
    await page.keyboard.press('Enter');
    await expect(nextWeek).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: `${prefix} Last in range` })).toHaveCount(1);
    await expect(rows.filter({ hasText: `${prefix} After range` })).toHaveCount(0);
    await expect(rows.filter({ hasText: `${prefix} Approved` })).toHaveCount(0);
    const overdue = page.getByRole('button', { name: 'Overdue', exact: true });
    await overdue.focus();
    await page.keyboard.press('Enter');
    await expect(overdue).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveCount(3);
    for (const name of ['Yesterday', 'Submitted', 'Changes'])
      await expect(rows.filter({ hasText: `${prefix} ${name}` })).toHaveCount(1);
    for (const name of ['Today', 'Tomorrow', 'Approved'])
      await expect(rows.filter({ hasText: `${prefix} ${name}` })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('overdue-desktop.png'), fullPage: true });

    await search.fill(`${prefix} Yesterday`);
    await expect(rows).toHaveCount(1);
    await search.fill(`${prefix} Tomorrow`);
    await expect(
      page.getByRole('heading', { name: 'No matching overdue work orders' }),
    ).toBeVisible();
    await search.fill(prefix);
    await expect(rows).toHaveCount(3);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
    await search.fill(prefix);
    await overdue.click();
    await expect(rows).toHaveCount(3);
    await page.clock.fastForward('10:01');
    await expect(rows).toHaveCount(4);
    await expect(rows.filter({ hasText: `${prefix} Today` })).toHaveCount(1);
    await expect(
      rows.filter({ hasText: `${prefix} Today` }).getByText('Overdue', { exact: true }),
    ).toBeVisible();
    await expect(rows.filter({ hasText: `${prefix} Tomorrow` })).toHaveCount(0);
    await expect(rows.filter({ hasText: `${prefix} Approved` })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rows.first().getByText('Assigned to', { exact: true })).toBeVisible();
    await expect(rows.first().getByText('Due', { exact: true })).toBeVisible();
    await overdue.focus();
    await page.keyboard.press('Space');
    await expect(overdue).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('overdue-mobile.png'), fullPage: true });
    await dueToday.click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(`${prefix} Tomorrow`);
    await nextWeek.focus();
    await page.keyboard.press('Space');
    await expect(nextWeek).toBeInViewport();
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: `${prefix} After range` })).toHaveCount(1);
    await expect(rows.filter({ hasText: `${prefix} Today` })).toHaveCount(0);
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    await expect(rows).toHaveCount(9);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('an empty notebook explains when work becomes overdue', async ({ page }) => {
  await page.route('**/api/v1/work-orders?*', (route) =>
    route.fulfill({ json: { data: [], total: 0, limit: 100, offset: 0 } }),
  );
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('jordan@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Overdue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No overdue work orders', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Unfinished work appears here after its due date, based on this device’s local date.',
      { exact: true },
    ),
  ).toBeVisible();
});
