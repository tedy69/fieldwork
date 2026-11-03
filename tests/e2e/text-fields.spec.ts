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

test('manager creates a text checklist with keyboard and narrow-screen access', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const form = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await form.getByLabel('Checklist name', { exact: true }).fill('Text setup QA');
  await form
    .getByLabel('Inspection items, one per line', { exact: true })
    .fill('Equipment serial\nLocation description');
  const type = form.getByRole('combobox', { name: 'Response type', exact: true });
  await expect(type).toHaveValue('');
  await type.focus();
  await expect(type).toBeFocused();
  await type.selectOption('text');
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
  const template = await (await response).json();
  expect(template.items.map((item: { responseType: string }) => item.responseType)).toEqual([
    'text',
    'text',
  ]);
  await expect(type).toHaveValue('');
  await expect(page.getByText('Text setup QA', { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`text responses survive offline reload and appear in saved reports at ${width}px`, async ({
    page,
    context,
  }) => {
    const session = await createClient('http://127.0.0.1:4173').login(
      'manager@fieldwork.local',
      'fieldwork-demo',
    );
    const manager = createClient('http://127.0.0.1:4173', () => session.token);
    const template = await manager.createTemplate('Mixed text QA', [
      'Check access',
      { label: 'Equipment serial', responseType: 'text' },
    ]);
    const order = await manager.createOrder({
      title: `Text notebook QA ${width}`,
      instructions: 'Synthetic typed inspection.',
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
    await expect(page.getByRole('radio', { name: 'Pass', exact: true })).toHaveCount(1);
    await page.getByRole('radio', { name: 'Pass', exact: true }).check();
    const field = page.getByLabel('Response: Equipment serial', { exact: true });
    await field.fill('   ');
    await page.getByLabel('Inspection summary', { exact: true }).fill('Synthetic text report.');
    await page.getByRole('button', { name: 'Submit inspection', exact: true }).click();
    await expect(page.locator('.inspection-form').getByRole('alert')).toContainText(
      'Complete every checklist item',
    );
    const text = '=SERIAL-0042\n<script>equipment</script>';
    await field.fill(text);
    await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(page.getByAltText('Site attachment 1')).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await open();
    await expect(field).toHaveValue(text);
    await expect(page.getByAltText('Site attachment 1')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export draft', exact: true }).click();
    const exported = LocalReportExportSchema.parse(
      JSON.parse(await readFile((await (await download).path())!, 'utf8')),
    );
    expect(exported.draft?.answers[1].text).toBe(text);
    expect(exported.draft?.photos).toHaveLength(1);
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`text-field-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByAltText('Submitted site photo 1')).toBeVisible();
    expect((await manager.order(order.id)).report?.answers[1].text).toBe(text);
    await page.getByRole('button', { name: 'Report history', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Report history', exact: true });
    await expect(
      dialog.getByRole('region', { name: 'Selected saved report', exact: true }),
    ).toContainText(text);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.print-report')).toContainText(text);
    await expect(page.locator('.print-report script')).toHaveCount(0);
    await page.emulateMedia({ media: 'screen' });
  });
}
