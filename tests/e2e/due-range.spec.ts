import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

for (const [role, timezoneId] of [
  ['manager', 'America/Los_Angeles'],
  ['worker', 'Asia/Jakarta'],
] as const) {
  test(`${role} filters inclusive due dates with search, status, and offline records`, async ({
    browser,
  }) => {
    const baseURL = 'http://127.0.0.1:4173';
    const client = createClient(baseURL);
    const managerSession = await client.login('manager@fieldwork.local', 'fieldwork-demo');
    const workerSession = await client.login('worker@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => managerSession.token);
    const worker = createClient(baseURL, () => workerSession.token);
    const catalog = await manager.catalog();
    const prefix = `Range QA ${role}`;
    for (const [name, dueDate, status] of [
      ['Before', '2026-10-20', 'ASSIGNED'],
      ['Start', '2026-10-21', 'SUBMITTED'],
      ['Middle', '2026-10-22', 'SUBMITTED'],
      ['End', '2026-10-23', 'APPROVED'],
      ['After', '2026-10-24', 'ASSIGNED'],
    ] as const) {
      let order = await manager.createOrder({
        title: `${prefix} ${name}`,
        instructions: 'Synthetic date-range test assignment.',
        siteId: catalog.sites[0].id,
        templateId: catalog.templates[0].id,
        assigneeId: workerSession.user.id,
        dueDate,
        priority: 'routine',
      });
      if (status !== 'ASSIGNED') {
        order = await worker.submitReport(order.id, {
          mutationId: crypto.randomUUID(),
          baseVersion: order.version,
          answers: order.template.items.map((item) => ({
            itemId: item.id,
            value: 'pass',
            note: '',
          })),
          summary: 'Synthetic inspection for date-range coverage.',
          photos: [],
        });
        if (status === 'APPROVED')
          await manager.review(order.id, order.version, 'APPROVED', 'Synthetic review.');
      }
    }
    const context = await browser.newContext({
      baseURL,
      timezoneId,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-22T12:00:00Z') });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const search = page.getByLabel('Search work orders');
    const from = page.getByLabel('Due from', { exact: true });
    const through = page.getByLabel('Due through', { exact: true });
    const clear = page.getByRole('button', { name: 'Clear dates', exact: true });
    const rows = page.locator('.order-row');
    await search.fill(prefix);
    await expect(rows).toHaveCount(5);
    await expect(clear).toBeDisabled();
    await from.fill('2026-10-21');
    await expect(rows).toHaveCount(4);
    await through.fill('2026-10-23');
    await expect(rows).toHaveCount(3);
    for (const name of ['Start', 'Middle', 'End'])
      await expect(rows.filter({ hasText: `${prefix} ${name}` })).toHaveCount(1);
    await through.fill('2026-10-21');
    await expect(rows).toHaveCount(1);
    await from.fill('');
    await through.fill('2026-10-22');
    await expect(rows).toHaveCount(3);
    await from.fill('2026-10-21');
    await through.fill('2026-10-23');
    await page.getByRole('button', { name: 'To review', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await page.getByRole('button', { name: 'Overdue', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText(`${prefix} Start`);
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    if (role === 'manager') {
      const ready = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export reports (3)', exact: true }).click();
      const csv = readFileSync((await (await ready).path())!, 'utf8');
      for (const name of ['Start', 'Middle', 'End']) expect(csv).toContain(`${prefix} ${name}`);
      for (const name of ['Before', 'After']) expect(csv).not.toContain(`${prefix} ${name}`);
    }
    await rows.filter({ hasText: `${prefix} Start` }).click();
    await page.getByRole('button', { name: '← Work orders', exact: true }).click();
    await expect(from).toHaveValue('2026-10-21');
    await expect(through).toHaveValue('2026-10-23');
    await expect(rows).toHaveCount(3);
    await from.focus();
    expect(await from.evaluate((input) => getComputedStyle(input).outlineStyle)).not.toBe('none');
    await page.screenshot({
      path: test.info().outputPath('due-range-desktop.png'),
      fullPage: true,
    });

    await from.fill('2026-10-24');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Due through must be on or after Due from.' }),
    ).toBeVisible();
    await expect(from).toHaveAttribute('aria-invalid', 'true');
    await expect(through).toHaveAttribute('aria-invalid', 'true');
    await expect(rows).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'No work orders in this date range' }),
    ).toHaveCount(0);
    if (role === 'manager')
      await expect(
        page.getByRole('button', { name: 'Export reports (0)', exact: true }),
      ).toBeDisabled();
    await from.fill('2026-11-01');
    await through.fill('2026-11-02');
    await expect(
      page.getByRole('heading', { name: 'No work orders in this date range' }),
    ).toBeVisible();
    await expect(
      page.getByText('Change or clear the dates, or adjust your search and status filter.'),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
    await search.fill(prefix);
    await from.fill('2026-10-21');
    await through.fill('2026-10-23');
    await expect(rows).toHaveCount(3);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: test.info().outputPath('due-range-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('group', { name: 'Due dates', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('due-range-small.png') });
    await page.getByRole('button', { name: 'To review', exact: true }).click();
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(from).toHaveValue('');
    await expect(through).toHaveValue('');
    await expect(rows).toHaveCount(2);
    await expect(search).toHaveValue(prefix);
    await expect(page.getByRole('button', { name: 'To review', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'All orders', exact: true }).click();
    await expect(rows).toHaveCount(5);
    expect(errors).toEqual([]);
    await context.close();
  });
}
