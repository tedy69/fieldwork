import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test('managers download filtered reports online and offline, with an actionable download error', async ({
  browser,
}) => {
  const baseURL = 'http://127.0.0.1:4173';
  const client = createClient(baseURL);
  const managerSession = await client.login('manager@fieldwork.local', 'fieldwork-demo');
  const workerSession = await client.login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => managerSession.token);
  const worker = createClient(baseURL, () => workerSession.token);
  const catalog = await manager.catalog();
  const photoId = crypto.randomUUID();
  const image =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
  for (const title of ['CSV QA valve', '=CSV QA pump', 'CSV QA pending']) {
    let order = await manager.createOrder({
      title,
      instructions: '',
      siteId: catalog.sites[0].id,
      templateId: catalog.templates[0].id,
      assigneeId: workerSession.user.id,
      dueDate: '2026-10-22',
      priority: 'routine',
    });
    if (title.endsWith('pending')) continue;
    order = await worker.submitReport(order.id, {
      mutationId: crypto.randomUUID(),
      baseVersion: order.version,
      answers: order.template.items.map((item) => ({
        itemId: item.id,
        value: 'pass',
        note: '=1+1',
      })),
      summary: 'Valve, "north"\n東京 checked.',
      photos: title.endsWith('valve') ? [{ id: photoId, mimeType: 'image/png', data: image }] : [],
    });
    if (title.endsWith('valve'))
      await manager.review(order.id, order.version, 'APPROVED', 'Checked at dispatch.');
  }
  const context = await browser.newContext({
    baseURL,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const search = page.getByLabel('Search work orders');
  await search.fill('CSV QA pending');
  await expect(
    page.getByRole('button', { name: 'Export reports (0)', exact: true }),
  ).toBeDisabled();
  await search.fill('CSV QA');
  await page.getByRole('button', { name: 'Approved', exact: true }).click();
  const filtered = page.getByRole('button', { name: 'Export reports (1)', exact: true });
  await expect(filtered).toBeEnabled();
  await filtered.focus();
  const ready = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await ready;
  expect(download.suggestedFilename()).toMatch(/^fieldwork-reports-\d{4}-\d{2}-\d{2}\.csv$/);
  const approved = readFileSync((await download.path())!, 'utf8');
  expect(approved).toContain('"CSV QA valve"');
  expect(approved).not.toContain('CSV QA pump');
  expect(approved).toContain('"Checked at dispatch."');
  await page.screenshot({ path: test.info().outputPath('csv-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'All orders', exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  await search.fill('CSV QA');
  await page.setViewportSize({ width: 390, height: 844 });
  const all = page.getByRole('button', { name: 'Export reports (2)', exact: true });
  await expect(all).toBeEnabled();
  await all.focus();
  const offlineReady = page.waitForEvent('download');
  await page.keyboard.press('Space');
  const offlineDownload = await offlineReady;
  const bytes = readFileSync((await offlineDownload.path())!);
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  const csv = bytes.toString('utf8');
  expect(csv).toContain('"\t=CSV QA pump"');
  expect(csv).toContain('"\t=1+1"');
  expect(csv).toContain('"Valve, ""north""\n東京 checked."');
  for (const value of ['CSV QA pending', 'Due date manager', 'Due date worker', photoId, image])
    expect(csv).not.toContain(value);
  expect([managerSession.token, workerSession.token].some((token) => csv.includes(token))).toBe(
    false,
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'CSV prepared for 2 reports.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('csv-mobile.png'), fullPage: true });
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('Download unavailable');
    };
  });
  await all.click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Could not create the CSV. Narrow the list and try again.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('workers do not see the manager report export control', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Report export' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export reports/ })).toHaveCount(0);
});
