import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test('offline outbox search keeps queued reports separate from assignment search', async ({
  page,
  context,
}) => {
  const base = 'http://127.0.0.1:4173';
  const api = createClient(base);
  const session = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const template = await manager.createTemplate('Outbox search checklist', ['Check valve']);
  const prefix = `Outbox QA ${crypto.randomUUID().slice(0, 6)}`;
  const create = (title: string) =>
    manager.createOrder({
      title: `${prefix} ${title}`,
      instructions: 'Synthetic inspection.',
      siteId: 'north',
      templateId: template.id,
      assigneeId: 'worker',
      dueDate: '2026-10-23',
      priority: 'routine',
    });
  const first = await create('Pump');
  const second = await create('Gate');
  const reports = [
    { order: first, summary: 'Valve aligned and dry.' },
    { order: second, summary: 'Latch moves freely.' },
  ];

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const assignments = page.getByRole('searchbox', { name: 'Search work orders' });
  await assignments.fill(prefix);
  await expect(page.locator('.order-row')).toHaveCount(2);
  await context.setOffline(true);
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  const compactReference = first.reference.replace('-', '').toLowerCase();
  await assignments.fill(compactReference);
  await expect(page.locator('.order-row')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: `Open ${first.reference}: ${first.title}` }),
  ).toBeVisible();
  await assignments.fill(prefix);
  for (const { order, summary } of reports) {
    await page
      .getByRole('button', { name: `Open ${order.reference}: ${order.title}` })
      .press('Enter');
    await page.getByRole('radio', { name: 'Pass', exact: true }).check();
    await page.getByLabel('Inspection summary', { exact: true }).fill(summary);
    const save = page.getByRole('button', { name: 'Save report for sync', exact: true });
    await expect(save).toBeEnabled();
    await save.press('Enter');
    await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to work orders', exact: true }).press('Enter');
  }
  const outbox = page.getByRole('button', { name: /^Sync outbox/ });
  await outbox.press('Enter');
  const search = page.getByRole('searchbox', { name: 'Search queued reports' });
  const cards = page.locator('.outbox-item');
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Sync needs attention' })).toBeVisible();
  await expect(cards.locator('.error')).toHaveCount(0);
  await search.fill('LATCH');
  await expect(cards).toHaveCount(1);
  const attention = page.getByRole('button', { name: 'Filter reports that need attention' });
  await attention.press('Enter');
  await expect(attention).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('No reports are blocked', { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect(outbox).toContainText('2');
  await attention.press('Enter');
  await expect(attention).toHaveAttribute('aria-pressed', 'false');
  await expect(search).toHaveValue('LATCH');
  await expect(cards).toHaveCount(1);
  await search.fill(compactReference);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(reports[0].summary);
  const openSaved = cards.getByRole('button', { name: 'Open saved assignment', exact: true });
  await expect(openSaved).toHaveAccessibleDescription(first.title);
  await openSaved.press('Enter');
  await expect(page.getByRole('heading', { name: first.title, exact: true })).toBeFocused();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save report for sync', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Back to sync outbox', exact: true }).press('Enter');
  await expect(openSaved).toBeFocused();
  await expect(search).toHaveValue(compactReference);
  await expect(cards).toHaveCount(1);
  await search.fill('LATCH');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(second.title);
  await search.fill('North pump station');
  await expect(cards).toHaveCount(2);
  await search.fill('no queued match');
  await expect(page.getByRole('status').getByText('No matching queued reports')).toBeVisible();
  await expect(outbox).toContainText('2');
  await page.getByRole('button', { name: /^Work orders/ }).press('Enter');
  await expect(assignments).toHaveValue(prefix);
  await outbox.press('Enter');
  await expect(search).toHaveValue('no queued match');

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByText('Report saved to your outbox. It will sync when the server is available.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).press('Enter');
  await expect(
    page.getByText('Laporan tersimpan di antrean dan akan dikirim saat server tersedia.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Cari laporan dalam antrean' })).toHaveValue(
    'no queued match',
  );
  await expect(
    page.getByRole('button', { name: 'Saring laporan yang perlu diperiksa' }),
  ).toBeVisible();
  await expect(
    page.getByText('Tidak ada laporan dalam antrean yang cocok', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hapus pencarian', exact: true }).press('Enter');
  await expect(page.getByRole('searchbox', { name: 'Cari laporan dalam antrean' })).toBeFocused();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Tutup pemberitahuan', exact: true }).press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('searchbox', { name: 'Cari laporan dalam antrean' })).toBeFocused();
  await expect(
    page.getByText('Laporan tersimpan di antrean dan akan dikirim saat server tersedia.', {
      exact: true,
    }),
  ).toHaveCount(0);
  for (const { order } of reports) expect((await manager.order(order.id)).report).toBeNull();
});
