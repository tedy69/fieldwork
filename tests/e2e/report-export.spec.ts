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
    timezoneId: 'Asia/Jakarta',
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
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
  await page.getByRole('button', { name: 'Next 7 days', exact: true }).click();
  const schedule = page.getByRole('button', { name: 'Export work orders (2)', exact: true });
  await schedule.focus();
  const scheduleReady = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const scheduleDownload = await scheduleReady;
  expect(scheduleDownload.suggestedFilename()).toBe('fieldwork-schedule-2026-10-21.csv');
  const scheduleCsv = readFileSync((await scheduleDownload.path())!, 'utf8');
  expect(scheduleCsv).toContain(
    '"Reference","Work order","Site","Assigned to","Due date","Priority","Status"',
  );
  expect(scheduleCsv).toContain('"CSV QA pending"');
  expect(scheduleCsv).toContain('"\t=CSV QA pump"');
  expect(scheduleCsv).not.toContain('CSV QA valve');
  expect(scheduleCsv).not.toContain('東京 checked.');
  await expect(
    page.getByRole('status').filter({ hasText: 'CSV prepared for 2 work orders.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'All orders', exact: true }).click();
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

test('manager downloads only filtered planner visits as all-day calendar events offline', async ({
  page,
  context,
}) => {
  const base = 'http://127.0.0.1:4173';
  const account = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => account.token);
  const site = await manager.createSite('North, Gate; \\ row', 'Synthetic unexported address');
  const title = 'Calendar export QA, Gate; ' + '東京'.repeat(16) + '\\\nBEGIN:VEVENT';
  const create = (title: string, dueDate: string) =>
    manager.createOrder({
      title,
      instructions: 'Synthetic unexported instructions.',
      siteId: site.id,
      templateId: 'routine',
      assigneeId: 'worker',
      dueDate,
      priority: 'routine',
    });
  const visible = await create(title, '2026-10-22');
  const next = await create('Calendar export QA next date', '2026-10-23');
  const excluded = await create('Unrelated planner visit', '2026-10-22');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const search = page.getByLabel('Search work orders');
  await search.fill('Calendar export QA');
  await expect(page.getByRole('button', { name: 'Export calendar (2)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Week planner', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Thu, Oct 22 1 work order', exact: true }).press('Enter');
  await page.setViewportSize({ width: 320, height: 840 });
  await context.setOffline(true);
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).press('Enter');
  const calendar = page.getByRole('button', { name: 'Ekspor kalender (1)', exact: true });
  await expect(calendar.locator('svg[aria-hidden=true]')).toBeVisible();
  const ready = page.waitForEvent('download');
  await calendar.press('Enter');
  const download = await ready;
  expect(download.suggestedFilename()).toBe('fieldwork-calendar-2026-10-21.ics');
  const file = readFileSync((await download.path())!, 'utf8');
  expect(file).toContain('\r\n ');
  expect(file.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  const lines = file.replace(/\r\n[ \t]/g, '').split('\r\n');
  expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
  expect(lines).toContain('DTSTAMP:20261021T120000Z');
  expect(lines).toContain('DTSTART;VALUE=DATE:20261022');
  expect(lines).toContain('TRANSP:TRANSPARENT');
  expect(lines).toContain('UID:' + visible.id);
  expect(lines).toContain('LOCATION:North\\, Gate\\; \\\\ row');
  expect(lines).toContain(
    'SUMMARY:' +
      visible.reference +
      ' Calendar export QA\\, Gate\\; ' +
      '東京'.repeat(16) +
      '\\\\\\nBEGIN:VEVENT',
  );
  for (const privateValue of [next.id, excluded.id, account.token, 'Synthetic unexported'])
    expect(file).not.toContain(privateValue);
  await expect(page.getByText('Kalender untuk 1 tugas siap diunduh.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('region', { name: 'Ekspor tugas' })
    .screenshot({ path: test.info().outputPath('calendar-export-320.png') });
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error('Download unavailable');
    };
  });
  await calendar.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Kalender gagal dibuat.' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Cari tugas' }).fill('No such synthetic visit');
  await expect(page.getByRole('button', { name: 'Ekspor kalender (0)' })).toBeDisabled();
});

test('workers do not see the manager export controls', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Work order exports' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export calendar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export reports/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Export work orders/ })).toHaveCount(0);
});
