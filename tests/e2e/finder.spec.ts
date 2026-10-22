import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function fixtures(prefix: string) {
  const client = createClient('http://127.0.0.1:4173');
  const session = await client.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const worker = catalog.users.find((user) => user.email === 'worker@fieldwork.local')!;
  const other = catalog.users.find((user) => user.email === 'jordan@fieldwork.local')!;
  const orders = [];
  for (const [title, assigneeId] of [
    ['Gate', worker.id],
    ['Valve', worker.id],
    ['Private', other.id],
  ])
    orders.push(
      await manager.createOrder({
        title: `${prefix} ${title}`,
        instructions: 'Synthetic command palette fixture.',
        siteId: catalog.sites[0].id,
        templateId: catalog.templates[0].id,
        assigneeId,
        dueDate: '2026-10-22',
        priority: 'routine',
      }),
    );
  return orders;
}

async function signIn(page: Page, role: 'manager' | 'worker') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('manager finds real work and pages with Kokonut keyboard navigation and modal focus', async ({
  page,
}) => {
  const [gate] = await fixtures('Finder manager QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'manager');
  await expect(
    page.getByRole('button', { name: `Open ${gate.reference}: ${gate.title}`, exact: true }),
  ).toBeVisible();
  const launcher = page.getByRole('button', { name: 'Find work', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Find saved work', exact: true });
  const input = page.getByRole('combobox', { name: 'Search saved work and pages', exact: true });
  await launcher.click();
  await expect(input).toBeFocused();
  expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true);
  await expect(
    dialog.getByRole('option', { name: 'Sites & checklists', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'Saved work', exact: true })).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'New document', exact: true })).toHaveCount(0);
  await input.fill('Finder manager QA');
  await expect(dialog.getByRole('option')).toHaveCount(3);
  const first = await input.getAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowDown');
  await expect(input).not.toHaveAttribute('aria-activedescendant', first!);
  await page.keyboard.press('Home');
  await expect(input).toHaveAttribute('aria-activedescendant', first!);
  await page.keyboard.press('End');
  await expect(dialog.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: test.info().outputPath('finder-desktop.png') });
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await input.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await page.getByLabel('Search work orders').fill('no-matching-order');
  await page.keyboard.press('Control+k');
  await input.fill(`${gate.reference}`);
  await dialog.getByRole('option', { name: new RegExp(gate.title) }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: gate.title, exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Meta+k');
  await input.fill('Sam Rivera');
  await expect(dialog.getByRole('option', { name: new RegExp(gate.title) })).toBeVisible();
  await input.fill('<img src=x onerror=alert(1)>');
  await expect(dialog.getByText(/No results for/)).toBeVisible();
  await expect(dialog.locator('img, script')).toHaveCount(0);
  await input.fill('Sync outbox');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Everything is up to date', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill('Sites & checklists');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('form', { name: 'Add a site', exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill('Work orders');
  await dialog.getByRole('option', { name: 'Work orders', exact: true }).click();
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  await page.keyboard.press('Control+k');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: 'Assign a work order', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('worker finder works offline, excludes other assignments, and preserves a draft', async ({
  page,
  context,
}) => {
  const [gate, , privateOrder] = await fixtures('Finder worker QA');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'worker');
  await expect(
    page.getByRole('button', { name: `Open ${gate.reference}: ${gate.title}`, exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () => (await fetch('/licenses/kokonut-ui-MIT.txt')).text()),
  ).toContain('Copyright (c) 2025 kokonutUI');
  expect(
    await page.evaluate(async () => (await fetch('/licenses/phosphor-icons-MIT.txt')).text()),
  ).toContain('Copyright (c) 2020 Phosphor Icons');
  await page.getByRole('button', { name: 'Find work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Find saved work', exact: true });
  const input = page.getByRole('combobox', { name: 'Search saved work and pages', exact: true });
  await expect(dialog.getByRole('option', { name: 'Sites & checklists', exact: true })).toHaveCount(
    0,
  );
  await input.fill(privateOrder.title);
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(dialog.getByText(/No results for/)).toBeVisible();
  await input.fill(gate.reference);
  await expect(dialog.getByRole('option', { name: new RegExp(gate.title) })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('finder-mobile.png') });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Enter');
  await page.getByLabel('Inspection summary', { exact: true }).fill('Unsent finder draft');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill('Sync outbox');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Everything is up to date', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await input.fill(gate.reference);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Unsent finder draft',
  );
  await page.keyboard.press('Control+k');
  await dialog.getByRole('button', { name: 'Close finder', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.keyboard.press('Control+k');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
