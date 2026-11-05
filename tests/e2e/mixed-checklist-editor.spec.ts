import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test('a manager configures a mixed checklist and a worker can use the saved questions offline', async ({
  page,
  context,
  browser,
}) => {
  const base = 'http://127.0.0.1:4173';
  const signIn = async (target: typeof page, role: 'manager' | 'worker') => {
    await target.goto(base);
    await target.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
    await target.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await target.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(target.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  };
  await signIn(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await form.getByLabel('Checklist name').fill('Mixed station inspection');
  await form
    .getByLabel('Inspection items, one per line')
    .fill('Access is clear\nEquipment serial\nTemporary item');
  await form.getByRole('combobox', { name: 'Response type', exact: true }).selectOption('text');
  const customize = form.getByRole('button', { name: 'Set types per item' });
  await customize.focus();
  await page.keyboard.press('Enter');
  const first = form.getByLabel('Item 1 question');
  const second = form.getByLabel('Item 2 question');
  const secondType = form.getByLabel('Item 2 response type');
  await expect(first).toBeFocused();
  await expect(second).toHaveValue('Equipment serial');
  await expect(secondType).toHaveValue('text');
  await form.getByLabel('Item 1 response type').selectOption('');
  const remove = form.getByRole('button', { name: 'Remove item 3' });
  await remove.focus();
  await page.keyboard.press('Space');
  await expect(second).toBeFocused();
  await form.getByRole('button', { name: 'Add item', exact: true }).click();
  const third = form.getByLabel('Item 3 question');
  await expect(third).toBeFocused();
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await expect(third).toBeFocused();
  await expect(form.getByText('Item 3 question: enter a value.')).toBeVisible();
  await third.fill('Pressure');
  await form.getByLabel('Item 3 response type').selectOption('number');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await context.setOffline(true);
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /fetch|network|offline/i })
      .first(),
  ).toBeVisible();
  await expect(first).toHaveValue('Access is clear');
  await expect(secondType).toHaveValue('text');
  await expect(third).toHaveValue('Pressure');
  await context.setOffline(false);
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/templates') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  const template = await (await saved).json();
  expect(template.items).toMatchObject([
    { label: 'Access is clear' },
    { label: 'Equipment serial', responseType: 'text' },
    { label: 'Pressure', responseType: 'number' },
  ]);
  expect(template.items[0]).not.toHaveProperty('responseType');
  await expect(page.getByText('Mixed station inspection', { exact: true })).toBeVisible();
  await expect(form.getByLabel('Inspection items, one per line')).toHaveValue('');

  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const order = await manager.createOrder({
    title: 'Mixed station visit',
    instructions: '',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 850 } });
  try {
    const worker = await workerContext.newPage();
    await signIn(worker, 'worker');
    await worker.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const open = () =>
      worker.getByRole('button', { name: `Open ${order.reference}: ${order.title}` }).click();
    await open();
    await worker.getByRole('radio', { name: 'Pass', exact: true }).check();
    await worker.getByLabel('Response: Equipment serial', { exact: true }).fill('PUMP-42');
    await worker.getByLabel('Reading: Pressure', { exact: true }).fill('0');
    await expect(worker.getByText(/of 3 checks recorded/)).toContainText('3 of 3');
    await expect(worker.getByText('Draft saved on this device', { exact: true })).toBeVisible();
    await workerContext.setOffline(true);
    await worker.reload();
    await open();
    await expect(worker.getByRole('radio', { name: 'Pass', exact: true })).toBeChecked();
    await expect(worker.getByLabel('Response: Equipment serial', { exact: true })).toHaveValue(
      'PUMP-42',
    );
    await expect(worker.getByLabel('Reading: Pressure', { exact: true })).toHaveValue('0');
  } finally {
    await workerContext.close();
  }
});
