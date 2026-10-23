import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { CreateOrderSeries, OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const endpoint = '**/api/v1/work-order-series';
const dialogFor = (page: Page) =>
  page.getByRole('dialog', { name: 'Assign recurring work', exact: true });
async function managerClient() {
  const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
  return createClient(baseURL, () => session.token);
}
async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}
async function logout(page: Page) {
  const response = page.waitForResponse((response) => response.url().endsWith('/sessions/current'));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await response;
}
async function fillBatch(page: Page, title: string, count = 3) {
  const dialog = dialogFor(page);
  await dialog.getByLabel('Work order title', { exact: true }).fill(title);
  await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
  await dialog.getByLabel('Due date', { exact: true }).fill('2026-12-28');
  await dialog.getByLabel('Occurrences', { exact: true }).fill(String(count));
}
async function journal(page: Page) {
  return page.evaluate(
    () =>
      new Promise<CreateOrderSeries | null>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction('keyval', 'readonly')
            .objectStore('keyval')
            .get('fieldwork:dispatch:v1:manager');
          read.onsuccess = () => {
            resolve(read.result ?? null);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      }),
  );
}
const dates = (page: Page) =>
  dialogFor(page).getByRole('region', { name: 'Scheduled dates', exact: true }).locator('time');

test('manager previews calendar dates, validates the batch, and assigns real work with keyboard and narrow layouts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const manager = await managerClient();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await login(page);
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  const trigger = page.getByRole('button', { name: 'Assign recurring work', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = dialogFor(page);
  await expect(dialog.getByLabel('Work order title', { exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(
    dialog.getByRole('button', { name: 'Assign 4 work orders', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await fillBatch(page, 'Recurring calendar QA');
  await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await dialog.getByLabel('Due date', { exact: true }).fill('2028-02-28');
  expect(
    await dates(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  await dialog.getByLabel('Occurrences', { exact: true }).fill('53');
  await expect(
    dialog.getByRole('heading', { name: 'Choose a valid schedule', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Assign work orders', exact: true }),
  ).toBeDisabled();
  await fillBatch(page, 'Recurring calendar QA');
  await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('weekly');
  await dialog.getByRole('combobox', { name: 'Site', exact: true }).selectOption('depot');
  await dialog.getByRole('combobox', { name: 'Checklist', exact: true }).selectOption('routine');
  await dialog.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('urgent');
  await dialog.getByLabel('Instructions', { exact: true }).fill('Synthetic recurring gate checks.');
  expect(
    await dates(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2026-12-28', '2027-01-04', '2027-01-11']);
  await dialog
    .getByRole('heading', { name: 'Assign recurring work', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('recurring-dispatch-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await dialog
    .getByRole('button', { name: 'Assign 3 work orders', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('recurring-dispatch-phone.png') });
  let release!: () => void;
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await paused;
    await route.continue();
  });
  await dialog.getByRole('button', { name: 'Assign 3 work orders', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirming batch…', exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  expect((await journal(page))?.title).toBe('Recurring calendar QA');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#main').getByRole('status')).toContainText(
    '3 recurring work orders confirmed.',
  );
  await expect(page.locator('#main')).toBeFocused();
  expect(await journal(page)).toBeNull();
  const result = await manager.searchOrders({ q: 'Recurring calendar QA' });
  expect(result.total).toBe(3);
  expect(result.data.map((order) => order.dueDate).sort()).toEqual([
    '2026-12-28',
    '2027-01-04',
    '2027-01-11',
  ]);
  expect(
    result.data.every(
      (order) =>
        order.site.id === 'depot' &&
        order.priority === 'urgent' &&
        order.instructions === 'Synthetic recurring gate checks.',
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('a lost creation response survives reload, offline recovery, and another account before duplicate-safe retry', async ({
  page,
  context,
}) => {
  const manager = await managerClient();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await fillBatch(page, 'Recurring lost response QA');
  let original: OrderSeriesReceipt | undefined;
  const bodies: CreateOrderSeries[] = [];
  await page.route(endpoint, async (route) => {
    bodies.push(route.request().postDataJSON());
    const response = await route.fetch();
    original = await response.json();
    await route.abort('failed');
  });
  await dialogFor(page).getByRole('button', { name: 'Assign 3 work orders', exact: true }).click();
  await expect(
    dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeEnabled();
  await expect(
    dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeFocused();
  await expect(dialogFor(page).getByRole('alert').last()).toContainText('Failed to fetch');
  const saved = await journal(page);
  expect(saved?.mutationId).toBe(bodies[0].mutationId);
  expect((await manager.searchOrders({ q: 'Recurring lost response QA' })).total).toBe(3);
  await dialogFor(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Recover recurring batch', exact: true }),
  ).toBeFocused();
  await page.unroute(endpoint);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
  await expect(
    dialogFor(page).getByText('Reconnect to confirm this batch. Its saved request is kept.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await context.setOffline(false);
  await logout(page);
  await login(page, 'worker');
  await expect(page.getByRole('button', { name: /recurring (work|batch)/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Worker draft kept during manager dispatch.');
  await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'draft.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  await logout(page);
  await login(page);
  const first = original!.orders[0];
  await manager.rescheduleOrder(first.id, { baseVersion: 1, dueDate: '2027-03-01' });
  await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
  await expect(
    dialogFor(page).getByRole('heading', { name: 'Assign recurring work', exact: true }),
  ).toBeFocused();
  await page.route(endpoint, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }).click();
  await expect(dialogFor(page)).toHaveCount(0);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(await journal(page)).toBeNull();
  expect((await manager.searchOrders({ q: 'Recurring lost response QA' })).total).toBe(3);
  expect((await manager.order(first.id)).dueDate).toBe('2027-03-01');
  await logout(page);
  await login(page, 'worker');
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Worker draft kept during manager dispatch.',
  );
  await expect(page.getByAltText('Site attachment 1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('storage failures prevent sending, declined batches can be edited, and failed receipt cleanup stays recoverable', async ({
  page,
}) => {
  const manager = await managerClient();
  await login(page);
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await fillBatch(page, 'Recurring storage QA', 2);
  const requests: CreateOrderSeries[] = [];
  await page.route(endpoint, async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1)
      await route.fulfill({
        status: 422,
        json: {
          error: { code: 'INVALID_ASSIGNMENT', message: 'Choose an existing field worker.' },
        },
      });
    else await route.continue();
  });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreDispatchPut: () => void }).restoreDispatchPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (String(key).startsWith('fieldwork:dispatch:'))
        throw new DOMException('Dispatch storage unavailable', 'QuotaExceededError');
      return original.call(this, value, key);
    };
  });
  await dialogFor(page).getByRole('button', { name: 'Assign 2 work orders', exact: true }).click();
  await expect(dialogFor(page).getByRole('alert')).toContainText('Dispatch storage unavailable');
  expect(requests).toHaveLength(0);
  await page.evaluate(() =>
    (window as unknown as { restoreDispatchPut: () => void }).restoreDispatchPut(),
  );
  await dialogFor(page).getByRole('button', { name: 'Assign 2 work orders', exact: true }).click();
  await dialogFor(page).getByRole('button', { name: 'Edit declined batch', exact: true }).click();
  await expect(dialogFor(page).getByLabel('Work order title', { exact: true })).toHaveValue(
    'Recurring storage QA',
  );
  await expect(dialogFor(page).getByLabel('Occurrences', { exact: true })).toHaveValue('2');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (String(key).startsWith('fieldwork:dispatch:') && value === null)
        throw new Error('Receipt cleanup unavailable');
      return original.call(this, value, key);
    };
  });
  await dialogFor(page).getByRole('button', { name: 'Assign 2 work orders', exact: true }).click();
  await expect(dialogFor(page).getByRole('alert').last()).toContainText(
    'Receipt cleanup unavailable',
  );
  expect(requests).toHaveLength(2);
  expect(requests[1].mutationId).not.toBe(requests[0].mutationId);
  expect((await manager.searchOrders({ q: 'Recurring storage QA' })).total).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
  await dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }).click();
  await expect(dialogFor(page)).toHaveCount(0);
  expect(requests[2]).toEqual(requests[1]);
  expect(await journal(page)).toBeNull();
  expect((await manager.searchOrders({ q: 'Recurring storage QA' })).total).toBe(2);
});

test('competing tabs recover the first saved batch instead of sending a different one', async ({
  page,
  context,
}) => {
  const manager = await managerClient();
  await login(page);
  const second = await context.newPage();
  await second.goto('/');
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await second.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await fillBatch(page, 'Recurring winning tab QA', 2);
  await fillBatch(second, 'Recurring losing tab QA', 2);
  await page.route(endpoint, (route) => route.abort('failed'));
  await dialogFor(page).getByRole('button', { name: 'Assign 2 work orders', exact: true }).click();
  await expect(
    dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }),
  ).toBeEnabled();
  await dialogFor(second)
    .getByRole('button', { name: 'Assign 2 work orders', exact: true })
    .click();
  await expect(dialogFor(second).getByRole('alert').last()).toContainText(
    'Another recurring batch is waiting for confirmation',
  );
  await expect(
    dialogFor(second).getByRole('heading', { name: 'Recurring winning tab QA', exact: true }),
  ).toBeVisible();
  expect((await manager.searchOrders({ q: 'Recurring losing tab QA' })).total).toBe(0);
  await dialogFor(second).getByRole('button', { name: 'Retry saved batch', exact: true }).click();
  await expect(dialogFor(second)).toHaveCount(0);
  await page.unroute(endpoint);
  await dialogFor(page).getByRole('button', { name: 'Retry saved batch', exact: true }).click();
  await expect(dialogFor(page)).toHaveCount(0);
  expect((await manager.searchOrders({ q: 'Recurring winning tab QA' })).total).toBe(2);
  expect(await journal(page)).toBeNull();
  await second.close();
});

test('planner dates seed recurring work, long previews scroll by keyboard, and unreadable saved dispatch blocks creation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
  await login(page);
  await page.getByRole('button', { name: 'Week planner', exact: true }).click();
  await page
    .getByRole('group', { name: 'Days in this week', exact: true })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  await expect(dialogFor(page).getByLabel('Due date', { exact: true })).toHaveValue('2026-10-19');
  await dialogFor(page).getByLabel('Occurrences', { exact: true }).fill('52');
  await expect(dates(page)).toHaveCount(52);
  const list = dialogFor(page).getByRole('list', { name: 'All scheduled dates', exact: true });
  await list.focus();
  await page.keyboard.press('End');
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  const outline = await list.evaluate((node) => getComputedStyle(node).outlineColor);
  expect(outline).toBe('rgb(245, 198, 109)');
  await page.context().setOffline(true);
  await expect(
    dialogFor(page).getByRole('button', { name: 'Assign 52 work orders', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#main')).toBeFocused();
  await page.context().setOffline(false);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put({ unreadable: true }, 'fieldwork:dispatch:v1:manager');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByText(/The saved dispatch could not be read/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Assign recurring work', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Reload saved dispatch', exact: true }).click();
  await expect(page.getByText(/The saved dispatch could not be read/)).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(null, 'fieldwork:dispatch:v1:manager');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.getByRole('button', { name: 'Reload saved dispatch', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Assign recurring work', exact: true }),
  ).toBeEnabled();
  expect(await journal(page)).toBeNull();
});
