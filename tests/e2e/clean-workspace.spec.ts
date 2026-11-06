import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}

test.describe('workspace sync warning', () => {
  test.use({ serviceWorkers: 'block' });

  test('retries from the warning and restores keyboard focus when sync recovers', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 320, height: 840 });
    await login(page, 'worker');
    await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Cari tugas', exact: true });
    await search.fill('FW-001');
    const assignment = page.getByRole('button', { name: /^Buka FW-001:/ });
    await expect(assignment).toBeVisible();
    const sync = page.getByRole('button', { name: 'Sinkronkan sekarang', exact: true });
    let unavailable = true;
    await page.route('**/api/v1/catalog', (route) =>
      unavailable
        ? route.fulfill({
            status: 503,
            json: { error: { code: 'UNAVAILABLE', message: 'Synthetic sync failure.' } },
          })
        : route.continue(),
    );
    const waitForFailure = () =>
      page.waitForResponse(
        (response) => response.url().endsWith('/catalog') && response.status() === 503,
      );
    await sync.click();
    const warning = page.getByRole('region', { name: 'Sinkronisasi perlu diperiksa' });
    const retry = warning.getByRole('button', { name: 'Coba sinkron lagi' });
    await expect(warning.getByRole('alert')).toContainText('Server tidak tersedia.');
    await expect(retry.locator('svg[aria-hidden=true]')).toBeVisible();
    await expect(assignment).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await warning.screenshot({ path: test.info().outputPath('sync-warning-320.png') });

    await retry.focus();
    const rejected = waitForFailure();
    await page.keyboard.press('Enter');
    await rejected;
    await expect(retry).toBeEnabled();
    await expect(retry).toBeFocused();
    await context.setOffline(true);
    await expect(retry).toBeDisabled();
    const reconnected = waitForFailure();
    await context.setOffline(false);
    await reconnected;
    await expect(retry).toBeEnabled();

    unavailable = false;
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(warning).toHaveCount(0);
    await expect(sync).toBeFocused();
    await expect(search).toHaveValue('FW-001');
    await expect(assignment).toBeVisible();
  });
});

for (const role of ['manager', 'worker']) {
  test(`${role} keeps collapsed date filters, receives visible errors, and clears them offline`, async ({
    page,
    context,
  }) => {
    const session = await createClient('http://127.0.0.1:4173').login(
      'manager@fieldwork.local',
      'fieldwork-demo',
    );
    const manager = createClient('http://127.0.0.1:4173', () => session.token);
    const catalog = await manager.catalog();
    const title = `Disclosure ${role} inspection`;
    for (const dueDate of ['2026-10-27', '2026-10-29']) {
      await manager.createOrder({
        title,
        dueDate,
        instructions: 'Synthetic date disclosure fixture.',
        priority: 'routine',
        siteId: catalog.sites[0].id,
        templateId: catalog.templates[0].id,
        assigneeId: 'worker',
      });
    }
    await login(page, role);
    await page.getByLabel('Search work orders').fill(title);
    const rows = page.locator('.order-row');
    await expect(rows).toHaveCount(2);
    const trigger = page.getByRole('button', { name: 'Date range', exact: true });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Due from', { exact: true })).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Due from', { exact: true }).fill('2026-10-27');
    await page.getByLabel('Due through', { exact: true }).fill('2026-10-27');
    await expect(rows).toHaveCount(1);
    await trigger.click();
    await expect(page.getByText('2026-10-27 to 2026-10-27', { exact: true })).toBeVisible();
    await rows.first().click();
    await page.getByRole('button', { name: 'Back to work orders', exact: true }).click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(rows).toHaveCount(1);
    await trigger.click();
    await expect(page.getByLabel('Due from', { exact: true })).toHaveValue('2026-10-27');
    await page.getByLabel('Due through', { exact: true }).fill('2026-10-26');
    await trigger.click();
    await expect(page.getByRole('alert')).toContainText(
      'Due through must be on or after Due from.',
    );
    await expect(rows).toHaveCount(0);
    await trigger.click();
    await page.getByLabel('Due from', { exact: true }).fill('2026-02-30');
    await trigger.click();
    await expect(page.getByRole('alert')).toContainText('Enter a real date as YYYY-MM-DD.');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    await expect(page.getByLabel('Search work orders')).toHaveValue(title);
  });
}

test('phone navigation leaves controls reachable, filters scroll by keyboard, and the first record stays in view', async ({
  page,
}) => {
  await login(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
  for (const width of [320, 390, 600, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const navRect = await nav.boundingBox();
    if (width < 600) {
      expect(await nav.evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
      expect(navRect!.y + navRect!.height).toBeLessThanOrEqual(844);
      for (const button of await nav.getByRole('button').all()) {
        const rect = await button.boundingBox();
        expect(rect!.height).toBeGreaterThanOrEqual(44);
        expect(rect!.width).toBeGreaterThanOrEqual(44);
      }
    }
    await nav.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
    const checklist = page.getByRole('form', { name: 'Add a checklist', exact: true });
    await checklist.getByRole('button', { name: 'Add checklist', exact: true }).click();
    await expect(checklist.getByLabel('Checklist name', { exact: true })).toBeFocused();
    await nav.getByRole('button', { name: /Sync outbox/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Everything is up to date', exact: true }),
    ).toBeVisible();
    await nav.getByRole('button', { name: /Work orders/ }).click();
    await page.getByLabel('Search work orders').fill('Morning safety walkthrough');
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 390) {
      const title = await page.locator('.order-title').first().boundingBox();
      expect(title!.y + title!.height).toBeLessThan(navRect!.y);
    }
    const row = page.locator('.order-row').first();
    await expect(row.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
    for (const label of ['Assigned to', 'Due']) {
      const metadata = row.getByText(label, { exact: true });
      if (width <= 600) await expect(metadata).toBeVisible();
      else await expect(metadata).toBeHidden();
    }
    const filters = page.getByRole('group', { name: 'Filter work orders', exact: true });
    await filters.getByRole('button', { name: 'All orders', exact: true }).focus();
    await page.keyboard.press('End');
    await expect(
      filters.getByRole('button', { name: 'Changes requested', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('.order-row')).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});
