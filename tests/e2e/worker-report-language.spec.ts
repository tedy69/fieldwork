import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';
test.use({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });

test('worker reads localized report history and prints the latest saved report offline', async ({
  page,
  context,
}) => {
  const managerLogin = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => managerLogin.token);
  const workerLogin = await createClient(base).login('worker@fieldwork.local', 'fieldwork-demo');
  const worker = createClient(base, () => workerLogin.token);
  const template = await manager.createTemplate('Report language checklist', ['Check valve']);
  const order = await manager.createOrder({
    title: 'Report language inspection',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: template.id,
    instructions: 'Synthetic site instructions.',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  const firstSummary = 'Synthetic first report.';
  const latestSummary = 'Synthetic corrected report.';
  const feedback = 'Synthetic review note.';
  const first = await worker.submitReport(order.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: order.version,
    summary: firstSummary,
    answers: [{ itemId: template.items[0].id, value: 'fail', note: 'Synthetic initial note.' }],
    photos: [],
  });
  const correction = await manager.review(order.id, first.version, 'CHANGES_REQUESTED', feedback);
  const latest = await worker.submitReport(order.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: correction.version,
    summary: latestSummary,
    answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
    photos: [],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: `Open ${order.reference}: ${order.title}` }).click();
  const submittedAt = latest.report!.submittedAt;
  const [englishTime, indonesianTime] = await page.evaluate(
    (time) => ['en-US', 'id-ID'].map((language) => new Date(time).toLocaleString(language)),
    submittedAt,
  );
  await expect(page.getByText(`Submitted ${englishTime}`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  await expect(page.getByText(`Dikirim ${indonesianTime}`, { exact: true })).toBeVisible();
  const history = page.getByRole('button', { name: 'Riwayat laporan', exact: true });
  await history.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Riwayat laporan', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Riwayat laporan', exact: true })).toBeFocused();
  await expect(dialog.getByText('Menampilkan 2 dari 2 laporan tersimpan')).toBeVisible();
  await dialog.getByRole('button', { name: `Lihat laporan: Versi tugas ${first.version}` }).click();
  const snapshot = dialog.getByRole('region', { name: 'Laporan tersimpan yang dipilih' });
  await expect(snapshot.getByText(firstSummary)).toBeVisible();
  await expect(snapshot.getByText(feedback)).toBeVisible();
  await expect(snapshot.getByText('Masalah ditemukan')).toBeVisible();
  await context.setOffline(true);
  await expect(dialog.getByText(/Teks yang sudah dimuat tetap tersedia/)).toBeVisible();
  await expect(snapshot.getByText(firstSummary)).toBeVisible();
  await dialog.getByRole('button', { name: 'Tutup dialog', exact: true }).click();
  await expect(history).toBeDisabled();
  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printed = 'yes';
    };
  });
  await page.getByRole('button', { name: 'Cetak laporan', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-printed', 'yes');
  await page.emulateMedia({ media: 'print' });
  const print = page.getByRole('article', { name: 'Laporan inspeksi siap cetak' });
  await expect(print).toHaveAttribute('lang', 'id');
  await expect(print.getByText(latestSummary)).toBeVisible();
  await expect(print.getByText(firstSummary)).toHaveCount(0);
  await expect(print.getByText('Lolos', { exact: true })).toBeVisible();
  expect((await manager.order(order.id)).version).toBe(latest.version);
});
