import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function login(page: Page, role = 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}

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
    await page.getByRole('button', { name: '← Work orders', exact: true }).click();
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
