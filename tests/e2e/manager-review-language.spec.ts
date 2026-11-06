import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const base = 'http://127.0.0.1:4173';

test('manager switches a review to Indonesian and keeps the note during an outage', async ({
  page,
  context,
}) => {
  const managerSession = await createClient(base).login(
    'manager@fieldwork.local',
    'fieldwork-demo',
  );
  const workerSession = await createClient(base).login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => managerSession.token);
  const worker = createClient(base, () => workerSession.token);
  const order = await manager.createOrder({
    title: 'Tinjauan gerbang QA',
    instructions: 'Synthetic inspection for manager review.',
    siteId: 'north',
    assigneeId: workerSession.user.id,
    templateId: 'routine',
    dueDate: '2026-12-28',
    priority: 'routine',
  });
  const summary = 'Gate inspected. Add a photo of the latch.';
  const submitted = await worker.submitReport(order.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: order.version,
    summary,
    answers: order.template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
    photos: [],
  });

  await page.setViewportSize({ width: 320, height: 840 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  const feedback = 'Tambahkan foto kait gerbang.';
  await page.getByLabel('Review note', { exact: true }).fill(feedback);
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
  const main = page.getByRole('main');
  await expect(main).toHaveAttribute('lang', 'id');
  await expect(page.getByRole('heading', { name: 'Tinjauan manajer', exact: true })).toBeVisible();
  const note = page.getByLabel('Catatan tinjauan', { exact: true });
  await expect(note).toHaveValue(feedback);
  await expect(main.getByText(summary, { exact: true })).toBeVisible();
  const approve = page.getByRole('button', { name: 'Setujui inspeksi', exact: true });
  const request = page.getByRole('button', { name: 'Minta perbaikan', exact: true });
  await expect(request.locator('svg[aria-hidden=true]')).toBeVisible();

  await context.setOffline(true);
  await expect(approve).toBeDisabled();
  await expect(request).toBeDisabled();
  await expect(page.getByText('Sambungkan ke internet untuk mengirim tinjauan.')).toBeVisible();
  await expect(note).toHaveValue(feedback);
  expect((await manager.order(order.id)).version).toBe(submitted.version);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.review-box')
    .screenshot({ path: test.info().outputPath('review-phone.png') });

  await context.setOffline(false);
  const endpoint = `**/api/v1/work-orders/${order.id}/reviews`;
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'UNAVAILABLE', message: 'Synthetic review outage.' } },
    }),
  );
  await request.click();
  await expect(page.getByText('Tinjauan gagal disimpan. Coba lagi.')).toBeVisible();
  await expect(note).toHaveValue(feedback);
  await page.unroute(endpoint);
  await request.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Perbaikan diminta. Petugas dapat memperbarui inspeksi.', { exact: true }),
  ).toBeVisible();
  await expect(main.getByText(feedback, { exact: true })).toBeVisible();
  const saved = await manager.order(order.id);
  expect(saved.version).toBe(submitted.version + 1);
  expect(saved.status).toBe('CHANGES_REQUESTED');
  expect(saved.review?.note).toBe(feedback);
  expect(saved.report?.summary).toBe(summary);
  await expect(page.getByRole('button', { name: 'Ganti petugas', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ubah tenggat', exact: true })).toBeVisible();
});
