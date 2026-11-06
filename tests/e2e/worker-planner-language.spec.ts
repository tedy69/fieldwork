import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test.use({ locale: 'en-US', timezoneId: 'Asia/Jakarta' });
const base = 'http://127.0.0.1:4173';

test('worker uses Indonesian week and month planners with cached work and keyboard dates', async ({
  page,
  context,
}) => {
  const login = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => login.token);
  const order = await manager.createOrder({
    title: 'Worker planner language QA',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: 'routine',
    instructions: 'Synthetic calendar fixture.',
    dueDate: '2026-12-29',
    priority: 'routine',
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.clock.setFixedTime(new Date('2026-12-28T03:00:00Z'));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Open ${order.reference}: ${order.title}` }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search work orders' }).fill(order.reference);
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  await page.getByRole('button', { name: 'Jadwal mingguan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Minggu mulai 28 Des 2026' })).toBeVisible();
  const week = page.getByRole('group', { name: 'Hari dalam minggu ini' });
  const weekDate = week.getByRole('button', { name: /29 Des.*1 tugas/ });
  await weekDate.click();
  await expect(weekDate).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('Menampilkan tugas pada 29 Des 2026.', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Jadwal bulanan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Desember 2026', exact: true })).toBeVisible();
  const month = page.getByRole('group', { name: 'Hari dalam bulan ini' });
  await month.getByRole('button', { name: /^Pilih 28 Des 2026:/ }).focus();
  await page.keyboard.press('ArrowRight');
  const monthDate = month.getByRole('button', { name: 'Pilih 29 Des 2026: 1 tugas', exact: true });
  await expect(monthDate).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(monthDate).toHaveAttribute('aria-pressed', 'true');
  const row = page.getByRole('button', { name: `Buka ${order.reference}: ${order.title}` });
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Bekerja offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Bulan berikutnya', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Januari 2027', exact: true })).toBeVisible();
  await expect(page.getByText('Tidak ada tugas bulan ini', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bulan sebelumnya', exact: true }).click();
  await expect(row).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Cari tugas' })).toHaveValue(order.reference);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible();
});
