import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';

test('manager configures a mixed checklist in Indonesian without losing its inputs', async ({
  page,
  context,
}) => {
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const name = `Daftar periksa pompa ${crypto.randomUUID().slice(0, 6)}`;
  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const english = page.getByRole('form', { name: 'Add a checklist', exact: true });
  await english.getByLabel('Checklist name', { exact: true }).fill(name);
  await english
    .getByRole('textbox', { name: 'Inspection items, one per line' })
    .fill('Catat kondisi pompa\nBaca tekanan pompa');
  await english.getByRole('combobox', { name: 'Response type', exact: true }).selectOption('text');
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  const form = page.getByRole('form', { name: 'Tambah daftar periksa', exact: true });
  await expect(form.getByLabel('Nama daftar periksa', { exact: true })).toHaveValue(name);
  const individual = form.getByRole('button', { name: 'Atur jenis per pertanyaan' });
  await individual.focus();
  await page.keyboard.press('Enter');
  const first = form.getByLabel('Isi pertanyaan 1', { exact: true });
  await expect(first).toBeFocused();
  await expect(first).toHaveValue('Catat kondisi pompa');
  await expect(form.getByLabel('Isi pertanyaan 2', { exact: true })).toHaveValue(
    'Baca tekanan pompa',
  );
  await expect(form.getByRole('combobox', { name: 'Jenis jawaban pertanyaan 1' })).toHaveValue(
    'text',
  );
  await form.getByRole('combobox', { name: 'Jenis jawaban pertanyaan 2' }).selectOption('number');
  await form.getByLabel('Satuan pertanyaan 2').fill('bar');
  await form.getByLabel('Minimum pertanyaan 2').fill('-2.5');
  await form.getByLabel('Maksimum pertanyaan 2').fill('0');
  await form.getByRole('checkbox', { name: 'Wajibkan foto untuk pertanyaan 2' }).check();
  await form.getByRole('combobox', { name: 'Bukti foto', exact: true }).selectOption('required');
  await form.getByRole('button', { name: 'Tambah pertanyaan', exact: true }).click();
  await expect(form.getByLabel('Isi pertanyaan 3', { exact: true })).toBeFocused();
  const remove = form.getByRole('button', { name: 'Hapus pertanyaan 3', exact: true });
  await expect(remove.locator('svg[aria-hidden=true]')).toBeVisible();
  await remove.click();
  await expect(form.getByLabel('Isi pertanyaan 2', { exact: true })).toBeFocused();

  const save = form.getByRole('button', { name: 'Simpan daftar periksa', exact: true });
  await context.setOffline(true);
  await expect(save).toBeDisabled();
  await expect(form.getByLabel('Maksimum pertanyaan 2')).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole('combobox', { name: 'Jenis jawaban pertanyaan 2' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('checklist-phone.png') });
  await context.setOffline(false);
  await save.click();
  await expect(page.getByText('Daftar periksa ditambahkan.', { exact: true })).toBeVisible();
  const template = (await manager.catalog()).templates.find((entry) => entry.name === name);
  expect(template).toMatchObject({
    requiresPhoto: true,
    items: [
      { label: 'Catat kondisi pompa', responseType: 'text' },
      {
        label: 'Baca tekanan pompa',
        responseType: 'number',
        requiresPhoto: true,
        readingRule: { unit: 'bar', min: -2.5, max: 0 },
      },
    ],
  });
  await expect(page.getByText(/Pembacaan antara -2\.5 dan 0 bar/)).toBeVisible();
});
