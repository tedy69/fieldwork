import { expect, test } from '@playwright/test';

test('recovers from a rejected password without storing either password', async ({
  page,
  context,
}) => {
  const wrongPassword = 'wrong-password-for-sign-in-qa';
  const correctPassword = 'fieldwork-demo';
  const password = page.getByLabel('Password', { exact: true });
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  const expectPasswordsAbsent = async () => {
    const storage = JSON.stringify({
      persistent: await context.storageState({ indexedDB: true }),
      session: await page.evaluate(() => Object.entries(sessionStorage)),
    });
    expect(storage).not.toContain(wrongPassword);
    expect(storage).not.toContain(correctPassword);
  };

  await page.goto('/');
  await expect(signIn).toBeEnabled();
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await password.fill(wrongPassword);
  const rejected = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/sessions') &&
      response.request().method() === 'POST',
  );
  await password.press('Enter');
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await expect(signIn).toBeEnabled();
  await expectPasswordsAbsent();

  await password.fill(correctPassword);
  await password.press('Enter');
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open FW-001:/ })).toBeVisible();
  await expectPasswordsAbsent();
});

test.describe('Indonesian browser language', () => {
  test.use({ locale: 'id-ID' });

  test('starts in Indonesian and keeps an explicit English choice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Buka catatan kerja Anda' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Open your notebook' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test('switches sign-in language by keyboard and retains it across an offline reload', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Open your notebook' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const language = page.getByRole('button', { name: 'Bahasa Indonesia', exact: true });
  await language.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Buka catatan kerja Anda' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page).toHaveTitle('Masuk · Fieldwork');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const email = page.getByLabel('Email', { exact: true });
  const password = page.getByLabel('Kata sandi', { exact: true });
  const submit = page.getByRole('button', { name: 'Masuk', exact: true });
  await submit.click();
  await expect(email).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Periksa kolom berikut');
  await expect(page.getByRole('alert')).toContainText('Kata sandi: wajib diisi.');
  await email.fill('invalid');
  await password.fill('wrong-demo-password');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('masukkan alamat email yang valid');
  await email.fill('worker@fieldwork.local');
  await page.getByRole('button', { name: 'Tampilkan kata sandi', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sembunyikan kata sandi', exact: true }).click();
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Email atau kata sandi salah.');

  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong-demo-password');
  await language.click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Buka catatan kerja Anda' })).toBeVisible();
  await email.fill('worker@fieldwork.local');
  await password.fill('fieldwork-demo');
  await submit.click();
  await expect(page.getByRole('alert')).toContainText('Tidak bisa masuk.');
  await context.setOffline(false);
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Tugas saya', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await page.getByRole('button', { name: 'English', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'My assignments', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Buka catatan kerja Anda' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText('Jurnal kerja lapangan', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tentang proyek' })).toBeVisible();
});
