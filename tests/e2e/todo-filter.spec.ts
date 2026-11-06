import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { WorkOrder } from '@fieldwork/contracts';

test('worker To do filter keeps queued, submitted and approved work out of the offline list', async ({
  page,
  context,
}) => {
  const base = 'http://127.0.0.1:4173';
  const api = createClient(base);
  const managerSession = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const workerSession = await api.login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => managerSession.token);
  const worker = createClient(base, () => workerSession.token);
  const template = await manager.createTemplate('To do filter checklist', ['Check valve']);
  const prefix = `To do QA ${crypto.randomUUID().slice(0, 6)}`;
  const create = (title: string) =>
    manager.createOrder({
      title: `${prefix} ${title}`,
      instructions: 'Synthetic assignment.',
      siteId: 'north',
      templateId: template.id,
      assigneeId: 'worker',
      dueDate: '2026-10-23',
      priority: 'routine',
    });
  const assigned = await create('assigned');
  const correction = await create('correction');
  const submitted = await create('submitted');
  const approved = await create('approved');
  for (const [order, review] of [
    [correction, 'CHANGES_REQUESTED'],
    [submitted, null],
    [approved, 'APPROVED'],
  ] as const) {
    const saved = await worker.submitReport(order.id, {
      mutationId: crypto.randomUUID(),
      baseVersion: order.version,
      answers: [{ itemId: template.items[0].id, value: 'pass', note: '' }],
      summary: 'Synthetic saved report.',
      photos: [],
    });
    if (review) await manager.review(order.id, saved.version, review, 'Synthetic review.');
  }

  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const row = (order: WorkOrder) =>
    page.getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true });
  const rows = page.locator('.order-row');
  const search = page.getByRole('searchbox', { name: 'Search work orders' });
  await search.fill(prefix);
  await expect(rows).toHaveCount(4);
  await context.setOffline(true);
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  const toDo = page.getByRole('button', { name: 'To do', exact: true });
  await toDo.press('Enter');
  await expect(toDo).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(2);
  await expect(row(assigned)).toBeVisible();
  await expect(row(correction)).toBeVisible();

  await row(assigned).press('Enter');
  await page.getByRole('radio', { name: 'Pass', exact: true }).check();
  const summary = 'Queued report stays in the outbox.';
  await page.getByLabel('Inspection summary', { exact: true }).fill(summary);
  const save = page.getByRole('button', { name: 'Save report for sync', exact: true });
  await expect(save).toBeEnabled();
  await save.press('Enter');
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to work orders', exact: true }).press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(row(correction)).toBeVisible();
  await expect(toDo).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Sync outbox/ }).press('Enter');
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  expect((await manager.order(assigned.id)).report).toBeNull();
  await page.getByRole('button', { name: /^Work orders/ }).press('Enter');
  await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Perlu dikerjakan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Hapus filter tugas', exact: true }).press('Enter');
  await expect(page.getByRole('searchbox', { name: 'Cari tugas' })).toHaveValue(prefix);
  await expect(rows).toHaveCount(4);
});
