import { expect, test } from '@playwright/test';

test('manager assigns work and uses saved dispatch in Indonesian at 320px', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  const language = page.getByRole('button', { name: 'Bahasa Indonesia', exact: true });
  await language.focus();
  await page.keyboard.press('Enter');
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('lang', 'id');
  await expect(page.getByText('Terhubung', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tugas', exact: true })).toBeVisible();

  const assign = page.getByRole('button', { name: 'Beri tugas baru', exact: true });
  await assign.click();
  const dialog = page.getByRole('dialog', { name: 'Beri tugas baru', exact: true });
  const title = dialog.getByLabel('Judul tugas', { exact: true });
  await expect(title).toBeFocused();
  await expect(dialog).toHaveAttribute('lang', 'id');
  await page.keyboard.press('Escape');
  await expect(assign).toBeFocused();
  await page.keyboard.press('Enter');
  const titleText = 'Pemeriksaan gerbang QA';
  await title.fill(titleText);
  await dialog.getByRole('combobox', { name: 'Lokasi', exact: true }).selectOption('north');
  await dialog.getByRole('combobox', { name: 'Tugaskan kepada' }).selectOption('worker');
  await dialog.getByRole('combobox', { name: 'Daftar periksa' }).selectOption('routine');
  await dialog.getByLabel('Tenggat', { exact: true }).fill('2026-12-28');
  await dialog.getByRole('button', { name: 'Pilih tenggat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hari ini', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.getByLabel('Petunjuk', { exact: true }).fill('Periksa kait gerbang.');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('indonesian-assignment-phone.png') });

  const endpoint = '**/api/v1/work-orders';
  await page.route(endpoint, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: 'Synthetic outage.' } },
        })
      : route.continue(),
  );
  const submit = dialog.getByRole('button', { name: 'Beri tugas baru', exact: true });
  await submit.click();
  await expect(
    dialog.getByText('Tugas gagal dibuat. Periksa koneksi dan coba lagi.'),
  ).toBeVisible();
  await expect(title).toHaveValue(titleText);
  await page.unroute(endpoint);
  await submit.click();
  await expect(page.getByRole('heading', { name: titleText, exact: true })).toBeVisible();
  await expect(page.getByText(/ditugaskan kepada Sam Rivera/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to work orders', exact: true }).click();

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await expect(page.getByText('Bekerja offline', { exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Cari tugas', exact: true });
  await search.fill(titleText);
  const row = page.getByRole('button', { name: new RegExp(`^Buka FW-.+: ${titleText}$`) });
  await expect(row).toContainText('28 Des');
  await expect(row).toContainText('Ditugaskan');
  await expect(assign).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor tugas (1)', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^fieldwork-schedule-.*\.csv$/);
  await expect(page.getByText('CSV untuk 1 tugas siap diunduh.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tugas', exact: true })).toBeVisible();
  await expect(row).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText('Ruang penugasan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work orders', exact: true })).toBeVisible();
});
