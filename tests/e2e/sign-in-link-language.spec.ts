import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';
const firstPassword = 'synthetic-account-setup';
const replacement = 'synthetic-reset-password';

test('invitation and password reset share the sign-in language and preserve form entries', async ({
  page,
  context,
}) => {
  const publicApi = createClient(base);
  const session = await publicApi.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const email = `language-link-${crypto.randomUUID()}@example.com`;
  const invitation = await manager.createInvitation({ name: 'Synthetic field worker', email });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#invite=${invitation.token}`);
  await expect(page.getByRole('heading', { name: 'Join the field team.' })).toBeFocused();
  await page.getByLabel('Password', { exact: true }).fill(firstPassword);
  const switchLanguage = page.getByRole('button', { name: 'Bahasa Indonesia', exact: true });
  await switchLanguage.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page).toHaveTitle('Undangan petugas · Fieldwork');
  const password = page.getByLabel('Kata sandi', { exact: true });
  const confirmation = page.getByLabel('Konfirmasi kata sandi', { exact: true });
  await expect(password).toHaveValue(firstPassword);
  await confirmation.fill('synthetic-other-password');
  const create = page.getByRole('button', { name: 'Buat akun petugas', exact: true });
  await create.click();
  await expect(confirmation).toBeFocused();
  await expect(page.getByText('Kata sandi tidak sama.', { exact: true })).toBeVisible();
  await confirmation.fill(firstPassword);
  await create.click();
  await expect(page.getByRole('heading', { name: 'Akun Anda siap' })).toBeFocused();
  const signIn = page.getByRole('button', { name: 'Lanjut ke halaman masuk', exact: true });
  await signIn.click();
  await expect(page.getByRole('heading', { name: 'Buka catatan kerja Anda' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);

  const { user } = await publicApi.login(email, firstPassword);
  const reset = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/#reset=${reset.token}`);
  await expect(page).toHaveTitle('Pemulihan kata sandi · Fieldwork');
  await expect(page.getByRole('heading', { name: 'Atur ulang kata sandi' })).toBeVisible();
  await password.fill(replacement);
  await confirmation.fill(replacement);
  await context.setOffline(true);
  const change = page.getByRole('button', { name: 'Ubah kata sandi', exact: true });
  await expect(change).toBeDisabled();
  await expect(page.getByText(/Sambungkan kembali untuk melanjutkan/)).toBeVisible();
  await expect(confirmation).toHaveValue(replacement);
  await context.setOffline(false);
  await change.click();
  await expect(page.getByRole('heading', { name: 'Kata sandi Anda sudah diubah' })).toBeFocused();
  await signIn.click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await password.fill(replacement);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tugas saya', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto(`/#reset=${reset.token}`);
  await expect(
    page.getByRole('heading', { name: 'Pengaturan ulang kata sandi tidak tersedia' }),
  ).toBeVisible();
  await expect(page.getByText(/Coba masuk jika sudah menggunakannya/)).toBeVisible();
});
