import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';
test.use({ locale: 'id-ID', timezoneId: 'Asia/Jakarta' });

test('worker reads localized report history and prints the latest saved report offline', async ({
  page,
  context,
  browserName,
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
  const latestSummary = 'Synthetic corrected report.\nValve secure.';
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

  if (browserName === 'chromium')
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 320, height: 844 });
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
  const printDue = page.locator(`.print-report time[datetime="${order.dueDate}"]`);
  await expect(printDue).toHaveText('Dec 28, 2026');
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
  const historyCopy = snapshot.getByRole('button', {
    name: 'Salin ringkasan laporan',
    exact: true,
  });
  await historyCopy.press('Enter');
  await expect(
    snapshot.getByRole('status').filter({ hasText: 'Ringkasan laporan disalin.' }),
  ).toHaveCount(1);
  if (browserName === 'chromium')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstSummary);
  await dialog.getByRole('button', { name: 'Tutup dialog', exact: true }).click();
  await expect(history).toBeDisabled();
  const copy = page.getByRole('button', { name: 'Salin ringkasan laporan', exact: true });
  await expect(copy.locator('svg[aria-hidden=true]')).toBeVisible();
  await copy.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Ringkasan laporan disalin.' }),
  ).toHaveCount(1);
  if (browserName === 'chromium')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(latestSummary);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new DOMException('Clipboard access denied', 'NotAllowedError');
      },
    });
  });
  await copy.press('Enter');
  await expect(
    page.getByText('Ringkasan tidak bisa disalin. Pilih teks untuk menyalin.'),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.report-summary-heading')
    .screenshot({ path: test.info().outputPath('copy-saved-summary-320.png') });
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
  await expect(printDue).toHaveText('28 Des 2026');
  const printedTimestamp = await page.evaluate(
    (time) =>
      new Date(time).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'medium',
        timeZone: 'UTC',
      }),
    submittedAt,
  );
  await expect(print.locator(`time[datetime="${submittedAt}"]`)).toHaveText(
    `${printedTimestamp} UTC`,
  );
  expect((await manager.order(order.id)).version).toBe(latest.version);
});
