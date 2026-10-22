import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

for (const scenario of [
  { zone: 'America/Los_Angeles', time: '2026-10-23T06:50:00Z', role: 'manager' },
  { zone: 'Asia/Jakarta', time: '2026-10-22T16:50:00Z', role: 'worker' },
] as const) {
  test(`overdue work follows the local date, search, and offline cache in ${scenario.zone}`, async ({
    browser,
  }) => {
    const baseURL = 'http://127.0.0.1:4173';
    const loginClient = createClient(baseURL);
    const managerSession = await loginClient.login('manager@fieldwork.local', 'fieldwork-demo');
    const workerSession = await loginClient.login('worker@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => managerSession.token);
    const worker = createClient(baseURL, () => workerSession.token);
    const catalog = await manager.catalog();
    const prefix = `Due date ${scenario.role}`;
    for (const [name, dueDate, state] of [
      ['Yesterday', '2026-10-21', 'ASSIGNED'],
      ['Today', '2026-10-22', 'ASSIGNED'],
      ['Tomorrow', '2026-10-23', 'ASSIGNED'],
      ['Approved', '2026-10-21', 'APPROVED'],
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
    await expect(rows).toHaveCount(6);
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
    await expect(rows.filter({ hasText: `${prefix} Tomorrow` })).toHaveCount(0);
    await expect(rows.filter({ hasText: `${prefix} Approved` })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await overdue.focus();
    await page.keyboard.press('Space');
    await expect(overdue).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('overdue-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    await expect(rows).toHaveCount(6);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('an empty notebook explains when work becomes overdue', async ({ page }) => {
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
