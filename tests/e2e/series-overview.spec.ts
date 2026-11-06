import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const listEndpoint = '**/api/v1/work-order-series?*';
const dialogFor = (page: Page) =>
  page.getByRole('dialog', { name: 'Recurring batches', exact: true });
const option = (page: Page, batch: OrderSeriesReceipt) =>
  dialogFor(page).getByRole('button', {
    name: `View batch ${batch.id}: ${batch.orders[0].title}`,
    exact: true,
  });
async function fixture(
  prefix: string,
  count = 1,
  frequency: OrderSeriesReceipt['frequency'] = 'weekly',
) {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(baseURL, () => session.token);
  const batches: OrderSeriesReceipt[] = [];
  for (let index = 0; index < count; index++)
    batches.push(
      await manager.createOrderSeries({
        mutationId: crypto.randomUUID(),
        title: `${prefix} ${index}`,
        instructions: 'Synthetic batch overview.',
        siteId: 'north',
        templateId: 'routine',
        assigneeId: 'worker',
        priority: 'routine',
        dueDate: '2026-12-28',
        frequency,
        occurrences: 2,
      }),
    );
  return { manager, batches };
}
async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}

test('manager combines batch search and frequency across pages and keeps loaded matches during a failure', async ({
  page,
  context,
}) => {
  const prefix = `Batch search ${crypto.randomUUID().slice(0, 8)}`;
  const { batches } = await fixture(prefix, 22);
  const {
    batches: [daily],
  } = await fixture(prefix, 1, 'daily');
  const firstBatch = batches[0];
  const query = firstBatch.id.slice(0, 8);
  await page.setViewportSize({ width: 320, height: 840 });
  await login(page);
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  const dialog = dialogFor(page);
  const input = dialog.getByRole('searchbox', { name: 'Search batches', exact: true });
  const submit = dialog.getByRole('button', { name: 'Search recurring batches', exact: true });
  const frequency = dialog.getByRole('combobox', { name: 'Frequency', exact: true });
  await expect(submit.locator('svg[aria-hidden=true]')).toBeVisible();
  await input.fill(prefix);
  await input.press('Enter');
  await expect(dialog.getByText(`20 loaded · 23 matches for “${prefix}”`)).toBeVisible();
  await frequency.focus();
  await page.keyboard.press('w');
  await expect(frequency).toHaveValue('weekly');
  await expect(frequency).toBeFocused();
  await expect(dialog.getByText(`20 loaded · 22 matches for “${prefix}” · Weekly`)).toBeVisible();
  await expect(option(page, daily)).toHaveCount(0);
  await expect(option(page, firstBatch)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Load more batches', exact: true }).click();
  await expect(dialog.getByText(`22 loaded · 22 matches for “${prefix}” · Weekly`)).toBeVisible();
  await expect(option(page, firstBatch)).toHaveCount(1);

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(listEndpoint, async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'held result') {
      await held;
      await route.fulfill({
        headers: { 'x-test-held-batch-search': 'yes' },
        json: { data: [], total: 0, nextCursor: null },
      });
    } else await route.continue();
  });
  const delayed = page.waitForResponse(
    (response) => response.headers()['x-test-held-batch-search'] === 'yes',
  );
  await input.fill('held result');
  await input.press('Enter');
  await expect(dialog.getByText('Loading batches…', { exact: true })).toBeVisible();
  await input.fill(query);
  await input.press('Enter');
  await expect(dialog.getByText(`1 loaded · 1 match for “${query}” · Weekly`)).toBeVisible();
  release();
  await delayed;
  await expect(option(page, firstBatch)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('recurring-batch-search-phone.png') });
  await page.unroute(listEndpoint);

  const noMatches = 'no such synthetic batch';
  await page.route(listEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Try loading batches again.' } },
    }),
  );
  await input.fill(noMatches);
  await submit.click();
  await expect(dialog.getByRole('alert')).toContainText('Try loading batches again.');
  await expect(option(page, firstBatch)).toBeVisible();
  await context.setOffline(true);
  await expect(input).toBeDisabled();
  await expect(frequency).toBeDisabled();
  const clear = dialog.getByRole('button', { name: 'Clear batch search', exact: true });
  await expect(clear).toBeDisabled();
  await expect(option(page, firstBatch)).toBeVisible();
  await page.unroute(listEndpoint);
  await context.setOffline(false);
  await dialog.getByRole('button', { name: 'Retry batch list', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No matching batches', exact: true }),
  ).toBeVisible();
  await clear.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(dialog.getByText(/20 loaded · \d+ batches · Weekly/)).toBeVisible();
  await frequency.selectOption('');
  await expect(option(page, daily)).toBeVisible();
  await expect(dialog.getByText(/20 loaded · \d+ batches/)).toBeVisible();
  await input.fill('North pump station');
  await input.press('Enter');
  await expect(dialog.getByText(/matches for “North pump station”/)).toBeVisible();
  await expect(option(page, daily)).toHaveAccessibleDescription('North pump station');
  const reference = firstBatch.orders[1].reference;
  await input.fill(reference);
  await input.press('Enter');
  await expect(dialog.getByText(`1 loaded · 1 match for “${reference}”`)).toBeVisible();
  await expect(option(page, firstBatch)).toBeVisible();
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test('manager filters current batch visits offline and keeps focus when an order leaves the filter', async ({
  page,
  context,
}) => {
  const { manager, batches } = await fixture('Batch visit filter QA', 2);
  const [batch, other] = batches;
  const [late, review] = batch.orders;
  const session = await createClient(baseURL).login('worker@fieldwork.local', 'fieldwork-demo');
  await createClient(baseURL, () => session.token).submitReport(review.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: review.version,
    summary: 'Synthetic visit awaiting review.',
    photos: [],
    answers: review.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
  });
  await page.setViewportSize({ width: 320, height: 840 });
  await page.clock.setFixedTime(new Date('2026-12-30T12:00:00Z'));
  await login(page);
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await option(page, batch).click();
  const dialog = dialogFor(page);
  const selected = dialog.getByRole('region', { name: 'Selected recurring batch' });
  const filter = selected.getByRole('combobox', { name: 'Show visits', exact: true });
  const rows = selected.locator('.series-orders > li');
  const loadedAt = selected.locator('.series-loaded time');
  await expect(loadedAt).toHaveAttribute('datetime', '2026-12-30T12:00:00.000Z');
  await expect(rows).toHaveCount(2);
  await filter.selectOption('review');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(review.reference);
  await filter.selectOption('overdue');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(late.reference);
  await rows
    .first()
    .getByRole('button', { name: `Change due date for ${late.reference}` })
    .click();
  await selected.getByLabel('New due date', { exact: true }).fill('2027-01-09');
  await selected.getByRole('button', { name: 'Save due date', exact: true }).click();
  await expect(filter).toBeFocused();
  await expect(selected.getByRole('heading', { name: 'No matching visits' })).toBeVisible();
  await expect(rows).toHaveCount(0);
  expect((await manager.order(late.id)).dueDate).toBe('2027-01-09');

  const refresh = selected.getByRole('button', { name: 'Refresh batch details', exact: true });
  await context.setOffline(true);
  await page.clock.setFixedTime(new Date('2026-12-30T12:30:00Z'));
  await expect(refresh).toBeDisabled();
  await expect(loadedAt).toHaveAttribute('datetime', '2026-12-30T12:00:00.000Z');
  await filter.selectOption('upcoming');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(late.reference);
  await expect(selected.getByText('1 of 2 visits', { exact: true })).toBeVisible();
  await filter.selectOption('rescheduled');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('time').first()).toHaveAttribute('datetime', late.dueDate);
  await expect(rows.first().locator('time').last()).toHaveAttribute('datetime', '2027-01-09');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await context.setOffline(false);
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(refresh).toBeEnabled();
  await expect(loadedAt).toHaveAttribute('datetime', '2026-12-30T12:30:00.000Z');
  await expect(filter).toHaveValue('rescheduled');
  await rows
    .first()
    .getByRole('button', { name: `Change due date for ${late.reference}` })
    .click();
  await selected.getByLabel('New due date', { exact: true }).fill(late.dueDate);
  await selected.getByRole('button', { name: 'Save due date', exact: true }).click();
  await expect(filter).toBeFocused();
  await expect(rows).toHaveCount(0);
  await option(page, other).click();
  await expect(filter).toHaveValue('all');
  await expect(rows).toHaveCount(2);
});

test('manager exports only filtered batch visits while offline and can retry a failed download', async ({
  page,
  context,
}) => {
  const {
    manager,
    batches: [batch],
  } = await fixture('=Batch visit CSV QA');
  const [visit, other] = batch.orders;
  await manager.rescheduleOrder(visit.id, { baseVersion: visit.version, dueDate: '2027-01-08' });
  const session = await createClient(baseURL).login('worker@fieldwork.local', 'fieldwork-demo');
  await createClient(baseURL, () => session.token).submitReport(other.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: other.version,
    summary: 'Synthetic inspection omitted from the schedule file.',
    photos: [],
    answers: other.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
  });
  await page.setViewportSize({ width: 320, height: 840 });
  await page.clock.setFixedTime(new Date('2026-12-30T12:00:00Z'));
  await login(page);
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await option(page, batch).click();
  const dialog = dialogFor(page);
  const filter = dialog.getByRole('combobox', { name: 'Show visits', exact: true });
  const button = dialog.getByRole('button', { name: 'Export batch visits as CSV', exact: true });
  await context.setOffline(true);
  await filter.selectOption('approved');
  await expect(button).toBeDisabled();
  await filter.selectOption('upcoming');
  await expect(button).toBeEnabled();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = () => {
      URL.createObjectURL = create;
      throw new Error('Synthetic download failure');
    };
  });
  await button.click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'Could not create the schedule CSV. Try again.',
  );
  await button.focus();
  const ready = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await ready;
  expect(download.suggestedFilename()).toBe(`fieldwork-batch-${batch.id.slice(0, 8)}.csv`);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('"Planned due date","Current due date"');
  expect(csv).toContain(`"\t${visit.title}"`);
  expect(csv).toContain(`"${visit.reference}"`);
  expect(csv).toContain('"2026-12-28","2027-01-08"');
  expect(csv).not.toContain(other.reference);
  expect(csv).not.toContain('Synthetic inspection omitted');
  await expect(dialog.getByText('CSV prepared for 1 visit.', { exact: true })).toBeVisible();
});

test('manager compares planned and current orders, pages with retry, and uses keyboard and narrow layouts', async ({
  page,
  browserName,
}) => {
  const backTab =
    browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Shift+Tab' : 'Shift+Tab';
  const { manager, batches } = await fixture('Batch overview manager QA', 21);
  const batch = batches.at(-1)!;
  await manager.rescheduleOrder(batch.orders[0].id, { baseVersion: 1, dueDate: '2027-02-01' });
  await manager.reassignOrder(batch.orders[0].id, { baseVersion: 2, assigneeId: 'worker-2' });
  const workerSession = await createClient(baseURL).login(
    'worker@fieldwork.local',
    'fieldwork-demo',
  );
  const worker = createClient(baseURL, () => workerSession.token);
  await worker.submitReport(batch.orders[1].id, {
    mutationId: crypto.randomUUID(),
    baseVersion: 1,
    summary: 'Synthetic submitted occurrence.',
    photos: [],
    answers: batch.orders[1].template.items.map((item) => ({
      itemId: item.id,
      value: 'pass',
      note: '',
    })),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const trigger = page.getByRole('button', { name: 'Recurring batches', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = dialogFor(page);
  await expect(
    dialog.getByRole('heading', { name: 'Recurring batches', exact: true }),
  ).toBeFocused();
  const refresh = dialog.getByRole('button', { name: 'Refresh batches', exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.focus();
  await expect(refresh).toBeFocused();
  await page.keyboard.press(backTab);
  await expect(dialog.getByRole('combobox', { name: 'Frequency', exact: true })).toBeFocused();
  await page.keyboard.press(backTab);
  await expect(
    dialog.getByRole('button', { name: 'Search recurring batches', exact: true }),
  ).toBeFocused();
  await page.keyboard.press(backTab);
  await expect(
    dialog.getByRole('searchbox', { name: 'Search batches', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialog.locator('.series-option')).toHaveCount(20);
  await option(page, batch).click();
  const selected = dialog.getByRole('region', { name: 'Selected recurring batch', exact: true });
  await expect(
    selected.getByRole('heading', { name: batch.orders[0].title, exact: true }),
  ).toBeVisible();
  const occurrences = selected.locator('.series-orders > li');
  await expect(occurrences).toHaveCount(2);
  expect(
    await occurrences
      .first()
      .locator('time')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2026-12-28', '2027-02-01']);
  await expect(occurrences.first()).toContainText('Jordan Lee');
  await expect(occurrences.first().getByText('Planned due date', { exact: true })).toBeVisible();
  await expect(occurrences.first().getByText('Current due date', { exact: true })).toBeVisible();
  await expect(occurrences.nth(1).getByText('Due date', { exact: true })).toBeVisible();
  await expect(occurrences.nth(1).locator('time')).toHaveCount(1);
  await expect(occurrences.nth(1)).toContainText('To review');
  await expect(occurrences.nth(1).getByRole('button', { name: /Change due date/ })).toHaveCount(0);
  await manager.rescheduleOrder(batch.orders[0].id, { baseVersion: 3, dueDate: '2027-02-02' });
  await selected.getByRole('button', { name: 'Refresh batch details', exact: true }).click();
  await expect(occurrences.first().locator('time').last()).toHaveAttribute(
    'datetime',
    '2027-02-02',
  );
  await page.route(listEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Batch list unavailable.' } },
    }),
  );
  await dialog.getByRole('button', { name: 'Load more batches', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Batch list unavailable.');
  await expect(dialog.locator('.series-option')).toHaveCount(20);
  await expect(occurrences).toHaveCount(2);
  await page.unroute(listEndpoint);
  await dialog.getByRole('button', { name: 'Retry batch list', exact: true }).click();
  const { total } = await manager.orderSeries({ limit: 50 });
  await expect(dialog.locator('.series-option')).toHaveCount(Math.min(total, 40));
  if (total > 40)
    await expect(dialog.getByRole('button', { name: 'Load more batches' })).toBeEnabled();
  await selected.getByRole('heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('series-overview-desktop.png') });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await selected.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: test.info().outputPath('series-overview-phone.png') });
  await page.context().setOffline(true);
  await expect(dialog.getByText(/Loaded batches stay visible/)).toBeVisible();
  await expect(occurrences).toHaveCount(2);
  await expect(
    selected.getByRole('button', { name: 'Refresh batch details', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#main')).toBeFocused();
  expect(errors).toEqual([]);
});

test('manager reschedules one batch order with stale data and keeps the original plan', async ({
  page,
}) => {
  const {
    manager,
    batches: [batch],
  } = await fixture('Batch due date QA');
  const [order, sibling] = batch.orders;
  await login(page);
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  const dialog = dialogFor(page);
  await option(page, batch).click();
  const row = dialog.locator('.series-orders > li').first();
  const change = row.getByRole('button', { name: `Change due date for ${order.reference}` });
  const date = row.getByRole('textbox', { name: 'New due date', exact: true });
  const save = row.getByRole('button', { name: 'Save due date' });
  await change.focus();
  await page.keyboard.press('Enter');
  await expect(date).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(change).toBeFocused();
  await change.click();
  await date.fill('2027-02-05');

  await manager.rescheduleOrder(order.id, { baseVersion: order.version, dueDate: '2027-02-01' });
  await save.click();
  await expect(row.getByText(/Reload this order before trying again/)).toBeVisible();
  await expect(date).toHaveValue('2027-02-05');
  await expect(save).toBeDisabled();
  await row.getByRole('button', { name: 'Reload order', exact: true }).click();
  await expect(row.locator('time').first()).toHaveAttribute('datetime', order.dueDate);
  await expect(row.locator('time').last()).toHaveAttribute('datetime', '2027-02-01');
  await expect(date).toHaveValue('2027-02-05');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

  const endpoint = `**/api/v1/work-orders/${order.id}/schedule`;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await wait;
    await route.continue();
  });
  try {
    await save.click();
    await expect(row.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Refresh batches' })).toBeDisabled();
  } finally {
    release();
  }
  await expect(row.locator('time').last()).toHaveAttribute('datetime', '2027-02-05');
  await expect(row.locator('time').first()).toHaveAttribute('datetime', order.dueDate);
  await expect(change).toBeFocused();
  await expect(dialog.getByText(`${order.reference} is now due`, { exact: false })).toBeVisible();
  const detail = await manager.orderSeriesDetail(batch.id);
  expect(
    detail.orders.map(({ plannedDueDate, order: current }) => [plannedDueDate, current.dueDate]),
  ).toEqual([
    [order.dueDate, '2027-02-05'],
    [sibling.dueDate, sibling.dueDate],
  ]);
  await page.context().setOffline(true);
  await expect(change).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: `Open ${order.reference}: ${order.title}` }).locator('time'),
  ).toHaveAttribute('datetime', '2027-02-05');
});

test('batch loading and details handle empty, unavailable, superseded, and dismissed responses', async ({
  page,
}) => {
  const { batches } = await fixture('Batch response QA', 2);
  await login(page);
  await page.route(listEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Try loading batches again.' } },
    }),
  );
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  const dialog = dialogFor(page);
  await expect(dialog.getByRole('alert')).toContainText('Try loading batches again.');
  await page.unroute(listEndpoint);
  await page.route(listEndpoint, (route) =>
    route.fulfill({ json: { data: [], total: 0, nextCursor: null } }),
  );
  await dialog.getByRole('button', { name: 'Retry batch list', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No recurring batches yet', exact: true }),
  ).toBeVisible();
  await page.unroute(listEndpoint);
  await dialog.getByRole('button', { name: 'Refresh batches', exact: true }).click();
  await expect(option(page, batches[0])).toBeVisible();
  const detailEndpoint = `**/api/v1/work-order-series/${batches[0].id}`;
  await page.route(detailEndpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Batch details unavailable.' } },
    }),
  );
  await option(page, batches[0]).click();
  await expect(dialog.getByRole('alert')).toContainText('Batch details unavailable.');
  await page.unroute(detailEndpoint);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(detailEndpoint, async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  const delivered = page.waitForResponse((response) =>
    response.url().endsWith(`/work-order-series/${batches[0].id}`),
  );
  await dialog.getByRole('button', { name: 'Retry batch details', exact: true }).click();
  await expect(dialog.getByText('Loading current batch orders…', { exact: true })).toBeVisible();
  await option(page, batches[1]).click();
  const selected = dialog.getByRole('region', { name: 'Selected recurring batch', exact: true });
  await expect(
    selected.getByRole('heading', { name: batches[1].orders[0].title, exact: true }),
  ).toBeVisible();
  release();
  await delivered;
  await expect(
    selected.getByRole('heading', { name: batches[1].orders[0].title, exact: true }),
  ).toBeVisible();
  await page.unroute(detailEndpoint);
  let releaseList!: () => void;
  const listHeld = new Promise<void>((resolve) => {
    releaseList = resolve;
  });
  let first = true;
  await page.route(listEndpoint, async (route) => {
    if (first) {
      first = false;
      await listHeld;
      await route.fulfill({
        headers: { 'x-test-old-batch-list': 'yes' },
        json: { data: [], total: 0, nextCursor: null },
      });
    } else await route.continue();
  });
  const listDelivered = page.waitForResponse(
    (response) => response.headers()['x-test-old-batch-list'] === 'yes',
  );
  await dialog.getByRole('button', { name: 'Refresh batches', exact: true }).click();
  await expect(dialog.getByText('Loading batches…', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await expect(option(page, batches[1])).toBeVisible();
  releaseList();
  await listDelivered;
  await expect(
    dialog.getByRole('heading', { name: 'No recurring batches yet', exact: true }),
  ).toHaveCount(0);
  await option(page, batches[1]).click();
  const order = batches[1].orders[0];
  let releaseOrder!: () => void;
  const orderHeld = new Promise<void>((resolve) => {
    releaseOrder = resolve;
  });
  await page.route(`**/api/v1/work-orders/${order.id}`, async (route) => {
    const response = await route.fetch();
    await orderHeld;
    await route.fulfill({ response });
  });
  const orderDelivered = page.waitForResponse((response) =>
    response.url().endsWith(`/work-orders/${order.id}`),
  );
  await dialog
    .getByRole('button', {
      name: `Open batch order ${order.reference}: ${order.title}`,
      exact: true,
    })
    .click();
  await expect(dialog.getByText('Opening current order…', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  releaseOrder();
  await orderDelivered;
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('opening a current batch order awaits persistence and leaves a worker draft and photo intact', async ({
  browser,
}) => {
  const { manager, batches } = await fixture('Batch opening QA');
  const batch = batches[0];
  const order = batch.orders[0];
  const workerContext = await browser.newContext({ baseURL });
  const field = await workerContext.newPage();
  const managerContext = await browser.newContext({ baseURL });
  const desk = await managerContext.newPage();
  await login(field, 'worker');
  await expect(field.getByRole('button', { name: 'Recurring batches', exact: true })).toHaveCount(
    0,
  );
  await field
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await field
    .getByLabel('Inspection summary', { exact: true })
    .fill('Unsent worker draft while manager checks batches.');
  await field.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await login(desk);
  await desk.getByRole('button', { name: 'Recurring batches', exact: true }).click();
  await option(desk, batch).click();
  const dialog = dialogFor(desk);
  const openOrder = dialog.getByRole('button', {
    name: `Open batch order ${order.reference}: ${order.title}`,
    exact: true,
  });
  await expect(openOrder).toBeVisible();
  await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2027-03-01' });
  await desk.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreBatchPut: () => void }).restoreBatchPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === 'fieldwork:v1:manager') throw new Error('Order persistence unavailable');
      return original.call(this, value, key);
    };
  });
  await openOrder.click();
  await expect(dialog.getByRole('alert')).toContainText('Order persistence unavailable');
  await expect(dialog).toBeVisible();
  await desk.evaluate(() =>
    (window as unknown as { restoreBatchPut: () => void }).restoreBatchPut(),
  );
  const fresh = desk.waitForResponse((response) =>
    response.url().endsWith(`/work-orders/${order.id}`),
  );
  await openOrder.click();
  expect((await (await fresh).json()).version).toBe(2);
  await expect(dialog).toHaveCount(0);
  await expect(desk.locator('#main')).toBeFocused();
  await expect(desk.getByRole('heading', { name: order.title, exact: true })).toBeVisible();
  await field.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await workerContext.setOffline(true);
  await field.reload();
  await field
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(field.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Unsent worker draft while manager checks batches.',
  );
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await workerContext.close();
  await managerContext.close();
});
