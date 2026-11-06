import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';

test('manager creates and revokes an invitation in Indonesian at 320px', async ({
  page,
  context,
}) => {
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const email = `invite-qa-${crypto.randomUUID().slice(0, 8)}@example.com`;
  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  await page.getByRole('button', { name: 'Lokasi dan daftar periksa', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Undangan petugas', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Undangan petugas', exact: true });
  await expect(dialog).toHaveAttribute('lang', 'id');
  await expect(
    dialog.getByRole('heading', { name: 'Undangan petugas', exact: true }),
  ).toBeFocused();
  const refresh = dialog.getByRole('button', { name: 'Muat ulang undangan', exact: true });
  await expect(refresh.locator('svg[aria-hidden=true]')).toBeVisible();
  const form = dialog.getByRole('form', { name: 'Undang petugas lapangan', exact: true });
  await form.getByLabel('Nama petugas', { exact: true }).fill('Petugas QA');
  const address = form.getByLabel('Email petugas', { exact: true });
  await address.fill('worker@fieldwork.local');
  const create = form.getByRole('button', { name: 'Buat undangan', exact: true });
  await create.click();
  await expect(dialog.getByText('Email ini sudah digunakan oleh sebuah akun.')).toBeVisible();
  await address.fill(email);
  await create.click();
  const link = dialog.getByRole('textbox', { name: 'Tautan undangan', exact: true });
  await expect(link).toBeFocused();
  await expect(dialog.getByText('Menunggu', { exact: true }).first()).toBeVisible();
  const copy = dialog.getByRole('button', { name: 'Salin tautan undangan', exact: true });
  await expect(copy.locator('svg[aria-hidden=true]')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error('Synthetic clipboard failure')) },
    });
  });

  await context.setOffline(true);
  await expect(refresh).toBeDisabled();
  await copy.click();
  await expect(
    dialog.getByText('Tautan gagal disalin. Pilih dan salin tautan secara manual.'),
  ).toBeVisible();
  await expect(link).toBeFocused();
  await context.setOffline(false);
  await dialog.getByRole('button', { name: 'Tutup undangan', exact: true }).click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(link).toHaveCount(0);
  const row = dialog.getByRole('listitem').filter({ hasText: email });
  await expect(row.getByText('Menunggu', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: `Cabut undangan untuk ${email}`, exact: true }).click();
  await expect(row.getByText('Dicabut', { exact: true })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('invitations-phone.png') });
  const record = (await manager.invitations({ limit: 50 })).data.find(
    (entry) => entry.email === email,
  );
  expect(record?.status).toBe('revoked');
});
