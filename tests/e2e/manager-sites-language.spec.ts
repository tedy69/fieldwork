import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';

test('manager adds a site and resolves competing closure dates in Indonesian', async ({
  page,
  context,
}) => {
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const name = `Gerbang timur QA ${crypto.randomUUID().slice(0, 6)}`;
  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const english = page.getByRole('form', { name: 'Add a site', exact: true });
  await english.getByLabel('Site name', { exact: true }).fill(name);
  await english.getByLabel('Address', { exact: true }).fill('Jalan Contoh 12');
  await english.getByLabel('Latitude', { exact: true }).fill('-6.2');
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lokasi dan daftar periksa' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Tambah lokasi', exact: true });
  await expect(form.getByLabel('Nama lokasi', { exact: true })).toHaveValue(name);
  const save = form.getByRole('button', { name: 'Simpan lokasi', exact: true });
  await save.click();
  await expect(page.getByText('Isi lintang dan bujur, atau kosongkan keduanya.')).toBeVisible();
  await form.getByLabel('Bujur', { exact: true }).fill('106.8');
  await context.setOffline(true);
  await expect(save).toBeDisabled();
  await expect(form.getByText('Sambungkan ke internet untuk menambahkan lokasi.')).toBeVisible();
  await context.setOffline(false);
  await save.click();
  await expect(page.getByText('Lokasi ditambahkan.', { exact: true })).toBeVisible();
  const site = (await manager.catalog()).sites.find((candidate) => candidate.name === name);
  expect(site?.coordinates).toEqual({ latitude: -6.2, longitude: 106.8 });

  const edit = page.getByRole('button', { name: `Edit koordinat ${name}`, exact: true });
  await expect(edit.locator('svg[aria-hidden=true]')).toBeVisible();
  await edit.focus();
  await page.keyboard.press('Enter');
  const coordinates = page.getByRole('form', { name: `Edit koordinat ${name}`, exact: true });
  const latitude = coordinates.getByLabel('Lintang', { exact: true });
  await expect(latitude).toBeFocused();
  await expect(latitude).toHaveValue('-6.2');
  await page.keyboard.press('Escape');
  await expect(edit).toBeFocused();

  const closureName = `Edit tanggal penutupan ${name}`;
  await page.getByRole('button', { name: closureName, exact: true }).click();
  const closures = page.getByRole('form', { name: closureName, exact: true });
  const dates = closures.getByRole('textbox', {
    name: 'Tanggal penutupan, satu per baris',
    exact: true,
  });
  await dates.fill('2026-12-25');
  await manager.updateSiteClosures(site!.id, { expectedDates: [], dates: ['2026-12-24'] });
  const saveDates = closures.getByRole('button', { name: 'Simpan tanggal', exact: true });
  await saveDates.click();
  await expect(closures.getByRole('alert')).toContainText('Tanggal penutupan berubah.');
  await expect(saveDates).toBeDisabled();
  await closures.getByRole('button', { name: 'Muat tanggal tersimpan', exact: true }).click();
  await expect(dates).toHaveValue('2026-12-25');
  await expect(closures.getByText('Tanggal tersimpan 2026-12-24')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await closures.screenshot({ path: test.info().outputPath('site-closures-phone.png') });
  await saveDates.click();
  await expect(page.getByText('Tanggal penutupan tersimpan.', { exact: true })).toBeVisible();
  expect((await manager.site(site!.id)).closureDates).toEqual(['2026-12-25']);
});
