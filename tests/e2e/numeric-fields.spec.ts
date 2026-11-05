import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import { LocalReportExportSchema } from '@fieldwork/contracts';

async function login(page: Page, role: 'worker' | 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
}

test('manager creates numeric checklists and retains the default check type', async ({ page }) => {
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await form.getByLabel('Checklist name', { exact: true }).fill('Meter readings setup QA');
  await form
    .getByLabel('Inspection items, one per line', { exact: true })
    .fill('Pressure (bar)\nTemperature (C)');
  const type = form.getByRole('combobox', { name: 'Response type', exact: true });
  await type.focus();
  await expect(type).toBeFocused();
  await type.selectOption('number');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/templates') && r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  expect(
    (await (await response).json()).items.every(
      (item: { responseType: string }) => item.responseType === 'number',
    ),
  ).toBe(true);
  await expect(type).toHaveValue('');
  await expect(page.getByText('Meter readings setup QA', { exact: true })).toBeVisible();
});

test('a manager configures units and limits on a numeric item', async ({ page }) => {
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await form.getByLabel('Checklist name').fill('Bounded pressure checklist');
  await form.getByLabel('Inspection items, one per line').fill('Temporary question\nPressure');
  await form.getByRole('button', { name: 'Set types per item' }).click();
  const type = form.getByLabel('Item 2 response type');
  await type.selectOption('number');
  await form.getByLabel('Item 2 unit').fill('bar');
  await form.getByLabel('Item 2 minimum').fill('0');
  const maximum = form.getByLabel('Item 2 maximum');
  await maximum.fill('-1');
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await expect(maximum).toBeFocused();
  await expect(form.getByText('Item 2 maximum: use 0 or more.')).toBeVisible();
  await maximum.fill('2.5');
  await type.selectOption('text');
  await expect(maximum).toBeHidden();
  await type.selectOption('number');
  await expect(maximum).toHaveValue('2.5');
  await form.getByRole('button', { name: 'Remove item 1' }).click();
  await expect(form.getByLabel('Item 1 unit')).toHaveValue('bar');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/templates') && response.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Add checklist', exact: true }).click();
  expect((await (await saved).json()).items).toMatchObject([
    { label: 'Pressure', responseType: 'number', readingRule: { unit: 'bar', min: 0, max: 2.5 } },
  ]);
  await expect(page.getByText(/Pressure \(bar\).*Reading from 0 to 2\.5 bar/)).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`numeric drafts retain invalid input and recover a stale offline submission at ${width}px`, async ({
    page,
    context,
  }) => {
    const session = await createClient('http://127.0.0.1:4173').login(
      'manager@fieldwork.local',
      'fieldwork-demo',
    );
    const manager = createClient('http://127.0.0.1:4173', () => session.token);
    const template = await manager.createTemplate('Mixed reading QA', [
      'Check access',
      { label: 'Equipment serial', responseType: 'text' },
      {
        label: 'Pressure',
        responseType: 'number',
        readingRule: { unit: 'bar', min: -12.5, max: 0 },
      },
      { label: 'Temperature', responseType: 'number', readingRule: { unit: '°C', min: 0 } },
    ]);
    const order = await manager.createOrder({
      title: `Reading notebook QA ${width}`,
      instructions: 'Synthetic meter visit.',
      siteId: 'north',
      assigneeId: 'worker',
      templateId: template.id,
      dueDate: '2026-12-28',
      priority: 'routine',
    });
    const open = () =>
      page
        .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
        .click();
    await page.setViewportSize({ width, height: 900 });
    await login(page, 'worker');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await open();
    await page.getByRole('radio', { name: 'Pass', exact: true }).check();
    await page
      .getByLabel('Response: Equipment serial', { exact: true })
      .fill('SERIAL-READING-0042');
    const pressure = page.getByLabel('Reading: Pressure (bar)', { exact: true });
    const temperature = page.getByLabel('Reading: Temperature (°C)', { exact: true });
    await expect(pressure).toHaveAccessibleDescription('Enter a reading from -12.5 to 0 bar.');
    await pressure.fill('-');
    await expect(pressure).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Enter a number, such as 12.5 or -3.', { exact: true }),
    ).toBeVisible();
    await temperature.fill('0');
    await page.getByLabel('Inspection summary', { exact: true }).fill('Synthetic meter readings.');
    await context.setOffline(true);
    await page.reload();
    await open();
    await expect(pressure).toHaveValue('-');
    await expect(temperature).toHaveValue('0');
    await pressure.fill('12,5');
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(
      page
        .locator('.inspection-form')
        .getByRole('alert')
        .filter({ hasText: 'Complete every checklist item' }),
    ).toBeVisible();
    await pressure.fill('-12.51');
    await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
    await page.reload();
    await open();
    await expect(pressure).toHaveValue('-12.51');
    await expect(pressure).toHaveAccessibleDescription('Reading must be from -12.5 to 0 bar.');
    await expect(page.getByText(/of 4 checks recorded/)).toContainText('3 of 4');
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(page.getByText('Complete every checklist item before submitting.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sync outbox 0/ })).toBeVisible();
    await pressure.fill('-12.50');
    await expect(pressure).toHaveAttribute('aria-invalid', 'false');
    await pressure.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Notes: Pressure', { exact: true })).toBeFocused();
    await pressure.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`numeric-field-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export draft', exact: true }).click();
    const exported = LocalReportExportSchema.parse(
      JSON.parse(await readFile((await (await download).path())!, 'utf8')),
    );
    expect(exported.draft?.answers[2].reading).toBe('-12.50');
    expect(exported.assignment?.template.items[2].readingRule).toEqual({
      unit: 'bar',
      min: -12.5,
      max: 0,
    });
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
    await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2026-12-29' });
    await context.setOffline(false);
    await expect(page.getByText('Sync needs your attention', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Sync outbox/ }).click();
    await page
      .getByRole('button', { name: 'Keep draft and open latest order', exact: true })
      .click();
    await expect(pressure).toHaveValue('-12.50');
    await expect(temperature).toHaveValue('0');
    await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Inspection report', exact: true }),
    ).toBeVisible();
    const saved = await manager.order(order.id);
    expect(saved.report?.answers[2].reading).toBe(-12.5);
    expect(saved.report?.answers[3].reading).toBe(0);
    expect((await manager.reportHistory(order.id)).total).toBe(1);
    await page.getByRole('button', { name: 'Report history', exact: true }).click();
    const snapshot = page
      .getByRole('dialog', { name: 'Report history', exact: true })
      .getByRole('region', { name: 'Selected saved report', exact: true });
    await expect(snapshot).toContainText('-12.5');
    await expect(snapshot).toContainText('Temperature (°C)');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.print-report')).toContainText('-12.5');
    await expect(page.locator('.print-report')).toContainText('Pressure (bar)');
    await expect(page.locator('.print-report tbody tr').last()).toContainText('0');
    await page.emulateMedia({ media: 'screen' });
  });
}
