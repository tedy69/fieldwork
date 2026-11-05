import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';
const photo = {
  name: 'synthetic.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
    'base64',
  ),
};

test('Indonesian web inspection retains a reading and item photo through offline sync', async ({
  page,
  context,
}) => {
  const login = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => login.token);
  const template = await manager.createTemplate('Web inspection language QA', [
    { label: 'Check valve', responseType: 'check', requiresPhoto: true },
    { label: 'Pressure', responseType: 'number', readingRule: { unit: 'bar', min: -10, max: 10 } },
  ]);
  const order = await manager.createOrder({
    title: 'Localized inspection QA',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    instructions: 'Synthetic site instructions.',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: `Open ${order.reference}: ${order.title}` }).click();
  const englishSummary = page.getByLabel('Inspection summary', { exact: true });
  const summary = 'Synthetic inspection note.';
  await englishSummary.fill(summary);
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Daftar periksa inspeksi' })).toBeVisible();
  await expect(page.getByText(order.instructions)).toBeVisible();
  const field = page.getByLabel('Ringkasan inspeksi', { exact: true });
  await expect(field).toHaveValue(summary);
  await page.getByRole('radio', { name: 'Lolos', exact: true }).check();
  const reading = page.getByLabel('Hasil pengukuran: Pressure (bar)', { exact: true });
  await reading.fill('-12.5');
  await expect(page.getByText('Hasil pengukuran harus antara -10 dan 10 bar.')).toBeVisible();
  await reading.fill('0');
  await expect(page.getByText('Masukkan hasil pengukuran antara -10 dan 10 bar.')).toBeVisible();
  await page.getByRole('button', { name: 'Kirim laporan inspeksi', exact: true }).click();
  await expect(page.getByText('Lampirkan foto untuk Check valve.')).toBeVisible();
  expect((await manager.order(order.id)).version).toBe(1);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Tambahkan foto untuk Check valve' }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByAltText('Lampiran foto lokasi 1')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: `Buka ${order.reference}: ${order.title}` }).click();
  await expect(reading).toHaveValue('0');
  await expect(field).toHaveValue(summary);
  await expect(page.getByAltText('Lampiran foto lokasi 1')).toBeVisible();
  await page.getByRole('button', { name: 'Simpan laporan untuk sinkronisasi' }).click();
  await expect(page.getByText('Laporan masuk antrean di perangkat ini')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('heading', { name: 'Laporan inspeksi' })).toBeVisible();
  await expect(page.getByAltText('Foto lokasi yang dikirim 1')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const saved = await manager.order(order.id);
  expect(saved.version).toBe(2);
  expect(saved.report?.photos[0].itemId).toBe(template.items[0].id);
  expect(
    saved.report?.answers.find((answer) => answer.itemId === template.items[1].id)?.reading,
  ).toBe(0);
});
