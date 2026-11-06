import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';

test('worker language keeps filters and an offline report available at 320px', async ({
  page,
  context,
}) => {
  const login = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => login.token);
  const template = await manager.createTemplate('Web language checklist', ['Check valve']);
  const order = await manager.createOrder({
    title: 'Web language inspection',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    instructions: 'Synthetic locale fixture.',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const enOrder = page.getByRole('button', { name: `Open ${order.reference}: ${order.title}` });
  await expect(enOrder).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.getByRole('searchbox', { name: 'Search work orders' }).fill(order.reference);
  await page.getByRole('button', { name: 'Assigned', exact: true }).click();
  const language = page.getByRole('button', { name: 'Bahasa Indonesia', exact: true });
  await language.focus();
  await page.keyboard.press('Enter');
  const idOrder = page.getByRole('button', { name: `Buka ${order.reference}: ${order.title}` });
  await expect(page.getByRole('heading', { name: 'Tugas saya' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Cari tugas' })).toHaveValue(order.reference);
  await expect(page.getByRole('button', { name: 'Ditugaskan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(idOrder).toContainText('Ditugaskan');
  await page.getByRole('button', { name: 'Rentang tanggal', exact: true }).click();
  await page.getByLabel('Tenggat mulai', { exact: true }).fill('2026-12-31');
  await page.getByLabel('Tenggat hingga', { exact: true }).fill('2026-12-20');
  await expect(
    page.getByText(/Tanggal akhir harus sama dengan atau sesudah tanggal awal/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pilih tanggal awal', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'Pilih tanggal awal', exact: true });
  await expect(calendar.getByRole('button', { name: 'Hari ini', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Hapus tanggal', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await context.setOffline(true);
  await expect(page.getByText('Bekerja offline', { exact: true })).toBeVisible();
  await idOrder.click();
  await expect(page.getByRole('button', { name: 'Salin nomor tugas', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Lolos', exact: true }).check();
  const summary = 'Synthetic worker locale draft.';
  await page.getByLabel('Ringkasan inspeksi', { exact: true }).fill(summary);
  await page
    .getByRole('button', { name: 'Simpan laporan untuk sinkronisasi', exact: true })
    .click();
  const outbox = page.getByRole('button', { name: /^Antrean sinkronisasi/ });
  await outbox.click();
  await expect(page.getByText('MENUNGGU SINKRONISASI', { exact: true })).toBeVisible();
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor draf', exact: true }).click();
  expect((await download).suggestedFilename()).toContain(order.reference);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tugas saya' })).toBeVisible();
  await outbox.click();
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Semua laporan sudah tersinkron' })).toBeVisible();
  const submitted = await manager.order(order.id);
  expect(submitted.version).toBe(2);
  expect(submitted.report?.summary).toBe(summary);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sync outbox', exact: true })).toBeVisible();
});
