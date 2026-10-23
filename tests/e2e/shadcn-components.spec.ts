import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test('shadcn assignment dialog traps focus, restores it, and stays open during a save', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const trigger = page.getByRole('button', { name: '+ Assign work order', exact: true });
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Assign a work order', exact: true });
  const title = dialog.getByLabel('Work order title', { exact: true });
  await expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(title).toBeFocused();
  await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  const submit = dialog.getByRole('button', { name: 'Assign work order', exact: true });
  await cancel.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Space');
  await title.fill('Shadcn dialog QA');
  await expect(dialog.getByLabel('Assign to', { exact: true })).toHaveAttribute(
    'data-slot',
    'native-select',
  );
  await dialog.getByLabel('Assign to', { exact: true }).selectOption('worker');
  let finishSave: (() => void) | undefined;
  const paused = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  await page.route('**/api/v1/work-orders', async (route) => {
    await paused;
    await route.continue();
  });
  await submit.click();
  await expect(dialog.getByRole('button', { name: 'Assigning…', exact: true })).toBeDisabled();
  await expect(cancel).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('heading', { name: 'Assign a work order', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath('shadcn-dialog-phone.png'),
    fullPage: false,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  finishSave!();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Shadcn dialog QA', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shadcn checklist radio groups validate, support arrow keys, and retain offline answers', async ({
  page,
  context,
}) => {
  const api = createClient('http://127.0.0.1:4173');
  const session = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const order = await manager.createOrder({
    title: 'Shadcn radios QA',
    instructions: 'Synthetic checklist controls.',
    siteId: catalog.sites[0].id,
    templateId: catalog.templates[0].id,
    assigneeId: 'worker',
    dueDate: '2026-10-23',
    priority: 'routine',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const open = page.getByRole('button', {
    name: `Open ${order.reference}: ${order.title}`,
    exact: true,
  });
  await open.click();
  page.on('console', (entry) => {
    if (entry.type() === 'error' && !entry.text().includes('net::ERR_INTERNET_DISCONNECTED'))
      errors.push(entry.text());
  });
  await page.getByLabel('Inspection summary', { exact: true }).fill('Offline shadcn answers.');
  await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toHaveCount(0);
  expect((await manager.order(order.id)).report).toBeNull();
  const groups = page.getByRole('radiogroup');
  await expect(groups).toHaveCount(order.template.items.length);
  const first = groups.first();
  await expect(first).toHaveAccessibleName(new RegExp(order.template.items[0].label));
  const pass = first.getByRole('radio', { name: 'Pass', exact: true });
  await pass.focus();
  await page.keyboard.press('Space');
  await expect(pass).toBeChecked();
  await page.keyboard.down('ArrowRight');
  await expect(first.getByRole('radio', { name: 'Issue found', exact: true })).toBeChecked();
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await expect(pass).toBeChecked();
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({
    path: test.info().outputPath('shadcn-checklist-desktop.png'),
    fullPage: true,
  });
  for (const group of (await groups.all()).slice(1))
    await group.getByRole('radio', { name: 'Pass', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath('shadcn-checklist-phone.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  expect(
    await page.evaluate(async () => (await fetch('/licenses/radix-ui-MIT.txt')).text()),
  ).toContain('Copyright (c) 2022 WorkOS');
  await open.click();
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await expect(radio).toBeChecked();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Offline shadcn answers.',
  );
  await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Inspection report', exact: true })).toBeVisible();
  expect(
    (await manager.order(order.id)).report?.answers.every((answer) => answer.value === 'pass'),
  ).toBe(true);
  expect(errors).toEqual([]);
});
