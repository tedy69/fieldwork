import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

test('manager planners mark days with matching closure visits on a narrow offline screen', async ({
  page,
  context,
  baseURL,
}) => {
  const base = baseURL ?? 'http://127.0.0.1:4173';
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const site = await manager.createSite('Planner closure QA site', 'Synthetic site address');
  await manager.updateSiteClosures(site.id, {
    expectedDates: [],
    dates: ['2026-10-23', '2026-10-24'],
  });
  for (const [name, dueDate] of [
    ['Open day', '2026-10-22'],
    ['Closed day', '2026-10-23'],
  ]) {
    await manager.createOrder({
      title: `Planner closure QA ${name}`,
      instructions: 'Synthetic planner visit.',
      siteId: site.id,
      assigneeId: 'worker',
      templateId: 'routine',
      dueDate,
      priority: 'routine',
    });
  }
  await page.clock.setFixedTime(new Date('2026-10-22T12:00:00Z'));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const search = page.getByLabel('Search work orders');
  await search.fill('Planner closure QA');
  const rows = page.locator('.order-row');
  await expect(rows).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Site closure visits', exact: true }),
  ).toBeVisible();
  await context.setOffline(true);

  await page.getByRole('button', { name: 'Week planner', exact: true }).press('Enter');
  const week = page.getByRole('group', { name: 'Days in this week' });
  const friday = week.getByRole('button', { name: 'Fri, Oct 23 1 work order', exact: true });
  await expect(friday).toHaveAccessibleDescription('Visits on site closure dates');
  await expect(friday.locator('svg')).toBeVisible();
  await expect(week.locator('button[aria-describedby]')).toHaveCount(1);
  await friday.press('Space');
  await expect(friday).toBeFocused();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Closed day');
  await week.screenshot({ path: test.info().outputPath('closure-week-desktop.png') });

  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'Month planner', exact: true }).press('Enter');
  const month = page.getByRole('group', { name: 'Days in this month' });
  const closed = month.getByRole('button', { name: 'Choose Oct 23, 2026: 1 work order' });
  await expect(closed).toHaveAccessibleDescription('Visits on site closure dates');
  await expect(closed.locator('svg')).toBeVisible();
  await expect(month.locator('button[aria-describedby]')).toHaveCount(1);
  await month.screenshot({ path: test.info().outputPath('closure-month-phone.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await search.fill('Planner closure QA Open day');
  await expect(month.locator('button[aria-describedby]')).toHaveCount(0);
  await expect(page.getByText('Visits on site closure dates', { exact: true })).toHaveCount(0);
  await search.fill('Planner closure QA');
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).press('Enter');
  const localized = page.getByRole('group', { name: 'Hari dalam bulan ini' });
  await expect(localized.locator('button[aria-describedby]')).toHaveAccessibleDescription(
    'Kunjungan saat lokasi tutup',
  );
});

test('managers resolve competing closure edits and copy later dates into a recurring batch', async ({
  page,
  context,
}) => {
  const base = 'http://127.0.0.1:4173';
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const site = await manager.createSite(
    `Closure edit QA ${crypto.randomUUID().slice(0, 8)}`,
    'Synthetic closure edit fixture',
  );
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const edit = page.getByRole('button', { name: `Edit closure dates for ${site.name}` });
  await edit.focus();
  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: `Edit closure dates for ${site.name}` });
  const dates = form.getByLabel('Closure dates, one per line');
  await expect(dates).toBeFocused();
  await dates.fill('2027-02-29');
  const save = form.getByRole('button', { name: 'Save closure dates' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('distinct dates');
  const proposal = '2027-01-02\n2027-01-04\n2027-01-05\n2027-01-06';
  await dates.fill(proposal);
  await manager.updateSiteClosures(site.id, { expectedDates: [], dates: ['2026-12-25'] });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Site closure dates changed');
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Load saved dates' }).click();
  await expect(dates).toHaveValue(proposal);
  await expect(form.getByText('Saved dates: 2026-12-25', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(form.getByText('Reconnect to save closure dates.')).toBeVisible();
  await expect(save).toBeDisabled();
  const endpoint = '**/api/v1/catalog';
  let captureCatalog!: () => void;
  let releaseCatalog!: () => void;
  const captured = new Promise<void>((resolve) => {
    captureCatalog = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseCatalog = resolve;
  });
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    captureCatalog();
    await held;
    await route.fulfill({ response });
  });
  try {
    await context.setOffline(false);
    await captured;
    await save.click();
    await expect(form).toHaveCount(0);
    await expect(edit).toBeFocused();
  } finally {
    releaseCatalog();
  }
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  await expect((await manager.site(site.id)).closureDates).toEqual(proposal.split('\n'));
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign recurring work', exact: true });
  await dialog.getByLabel('Work order title').fill('Synthetic site calendar visit');
  await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
  const siteSelect = dialog.getByRole('combobox', { name: 'Site', exact: true });
  await siteSelect.selectOption(site.id);
  await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await dialog.getByLabel('Due date', { exact: true }).fill('2027-01-04');
  await dialog.getByLabel('Occurrences', { exact: true }).fill('3');
  const preview = dialog.getByRole('region', { name: 'Scheduled dates', exact: true });
  const closed = preview.getByText('Site closed', { exact: true });
  await expect(preview.getByRole('status')).toHaveText('3 visits fall on site closure dates.');
  await expect(closed).toHaveCount(3);
  await expect(preview.locator('li').first()).toContainText('Site closed');
  await dialog.getByText('Skip dates (optional)', { exact: true }).click();
  const copy = dialog.getByRole('button', { name: 'Copy site closure dates' });
  await expect(dialog.getByText(/first date is marked closed/)).toBeVisible();
  const other = (await manager.catalog()).sites.find(
    (entry) => entry.id !== site.id && !entry.closureDates?.length,
  )!;
  await siteSelect.selectOption(other.id);
  await expect(copy).toHaveCount(0);
  await expect(closed).toHaveCount(0);
  await siteSelect.selectOption(site.id);
  await dialog.getByLabel('Due date', { exact: true }).fill('2027-01-03');
  await expect(preview.getByRole('status')).toHaveText('2 visits fall on site closure dates.');
  await expect(closed).toHaveCount(2);
  await preview.screenshot({ path: test.info().outputPath('closed-visits-phone.png') });
  await copy.focus();
  await page.keyboard.press('Enter');
  const skipped = dialog
    .getByRole('region', { name: 'Skipped dates', exact: true })
    .locator('time');
  await expect(skipped).toHaveCount(3);
  await expect(closed).toHaveCount(0);
  await expect(preview.getByRole('status')).toHaveText('');
  const scheduled = preview.locator('time');
  expect(
    await scheduled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2027-01-03', '2027-01-07', '2027-01-08']);
  const response = page.waitForResponse(
    (result) => result.url().endsWith('/work-order-series') && result.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Assign 3 work orders', exact: true }).click();
  const receipt = await (await response).json();
  expect(receipt.skipDates).toEqual(['2027-01-04', '2027-01-05', '2027-01-06']);
  await manager.updateSiteClosures(site.id, { expectedDates: proposal.split('\n'), dates: [] });
  expect((await manager.orderSeriesDetail(receipt.id)).skipDates).toEqual(receipt.skipDates);
});

test('dispatch flags unfinished visits on loaded closure dates and filters them offline', async ({
  page,
  context,
  baseURL,
}) => {
  const base = baseURL ?? 'http://127.0.0.1:4173';
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const site = await manager.site('north');
  const savedDates = site.closureDates ?? [];
  const closedDate = '2029-05-15';
  const closureDates = [...savedDates, closedDate].sort();
  const prefix = 'Dispatch closure QA';
  const create = (name: string, dueDate: string, siteId = site.id) =>
    manager.createOrder({
      title: `${prefix} ${name}`,
      instructions: 'Synthetic dispatch visit.',
      siteId,
      templateId: 'routine',
      assigneeId: 'worker',
      priority: 'routine',
      dueDate,
    });
  await manager.updateSiteClosures(site.id, {
    expectedDates: savedDates,
    dates: closureDates,
  });
  try {
    const assigned = await create('assigned', closedDate);
    const submitted = await create('submitted', closedDate);
    const openDate = await create('open date', '2029-05-16');
    const otherSite = await create('other site', closedDate, 'depot');
    const workerSession = await createClient(base).login(
      'worker@fieldwork.local',
      'fieldwork-demo',
    );
    await createClient(base, () => workerSession.token).submitReport(submitted.id, {
      mutationId: crypto.randomUUID(),
      baseVersion: submitted.version,
      answers: submitted.template.items.map((item) => ({
        itemId: item.id,
        value: 'pass',
        note: '',
      })),
      summary: 'Synthetic visit awaiting review.',
      photos: [],
    });

    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: `Open ${assigned.reference}: ${assigned.title}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).press('Enter');
    await page.setViewportSize({ width: 320, height: 850 });
    const row = (order: WorkOrder) =>
      page.getByRole('button', { name: `Buka ${order.reference}: ${order.title}`, exact: true });
    const search = page.getByRole('searchbox', { name: 'Cari tugas' });
    const toggle = page.getByRole('button', { name: 'Tugas saat lokasi tutup', exact: true });
    await search.fill(prefix);
    await expect(row(assigned)).toHaveAccessibleDescription('Lokasi tutup');
    for (const order of [submitted, openDate, otherSite]) await expect(row(order)).toBeVisible();
    await expect(row(submitted)).not.toHaveAccessibleDescription('Lokasi tutup');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

    await context.setOffline(true);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(row(assigned)).toBeVisible();
    for (const order of [submitted, openDate, otherSite]) await expect(row(order)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ekspor tugas (1)' })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath('dispatch-closure-filter-320.png'),
      fullPage: true,
    });

    await search.fill(`${prefix} other site`);
    await expect(page.getByText('Tidak ada tugas yang cocok saat lokasi tutup')).toBeVisible();
    await toggle.click();
    await expect(row(otherSite)).toBeVisible();
    await page.reload();
    await expect(row(assigned)).toBeVisible();
    await expect(toggle).toHaveCount(0);
    await expect(row(assigned)).not.toHaveAccessibleDescription('Lokasi tutup');

    await context.setOffline(false);
    await expect(row(assigned)).toHaveAccessibleDescription('Lokasi tutup');
    await manager.rescheduleOrder(assigned.id, {
      baseVersion: assigned.version,
      dueDate: '2029-05-16',
    });
    await page.getByRole('button', { name: 'Sinkronkan sekarang', exact: true }).click();
    await expect(row(assigned)).not.toHaveAccessibleDescription('Lokasi tutup');
    await search.fill(prefix);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Tidak ada tugas yang cocok saat lokasi tutup')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(row(assigned)).toBeVisible();
  } finally {
    await manager.updateSiteClosures(site.id, {
      expectedDates: closureDates,
      dates: savedDates,
    });
  }
});
