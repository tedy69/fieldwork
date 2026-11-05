import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

const baseURL = 'http://127.0.0.1:4173';
const oldPassword = 'synthetic-worker-session-password';
const newPassword = 'synthetic-worker-recovered-password';

for (const width of [320, 1440]) {
  test(`worker recovers a revoked session and syncs the same report at ${width}px`, async ({
    page,
    context,
  }) => {
    const account = createClient(baseURL);
    const session = await account.login('manager@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => session.token);
    const invitation = await manager.createInvitation({
      name: 'Synthetic session recovery worker',
      email: `session-${crypto.randomUUID()}@example.com`,
    });
    const { user } = await account.acceptInvitation(invitation.token, oldPassword);
    const catalog = await manager.catalog();
    const template = await manager.createTemplate('Session recovery QA checklist', [
      { label: 'Check the gate', responseType: 'check' },
    ]);
    const order = await manager.createOrder({
      title: 'Synthetic notebook recovery visit',
      instructions: 'Session recovery fixture.',
      siteId: catalog.sites[0].id,
      templateId: template.id,
      assigneeId: user.id,
      dueDate: '2026-12-28',
      priority: 'routine',
    });
    const sentMutationIds: string[] = [];
    const reportStatuses: number[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(`/${order.id}/reports`))
        sentMutationIds.push(request.postDataJSON().mutationId);
    });
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith(`/${order.id}/reports`))
        reportStatuses.push(response.status());
    });

    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
      .click();
    await page.getByRole('radio', { name: 'Pass', exact: true }).check();
    await page.getByLabel('Inspection summary', { exact: true }).fill('Gate checked offline.');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Sign in to sync' })).toHaveCount(0);

    const reset = await manager.createPasswordReset(user.id, { expectedAccessVersion: 0 });
    await account.completePasswordReset(reset.token, newPassword);
    await context.setOffline(false);
    const notice = page.getByRole('region', { name: 'Sign in to sync', exact: true });
    await expect(notice.getByRole('alert')).toContainText(
      'Drafts and queued reports stay on this device.',
    );
    expect((await manager.reportHistory(order.id)).total).toBe(0);
    expect(reportStatuses).toEqual([401]);

    const narrow = width === 320;
    if (narrow) {
      await page.getByRole('button', { name: /^Sync outbox/ }).click();
      await page.getByRole('button', { name: 'Bahasa Indonesia', exact: true }).click();
      await expect(
        page.getByRole('region', { name: 'Masuk untuk sinkronisasi', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Your session expired.', { exact: false })).toHaveCount(0);
    }
    const recovery = page.getByRole('button', {
      name: narrow ? 'Masuk kembali' : 'Sign in again',
      exact: true,
    });
    await expect(recovery.locator('svg[aria-hidden=true]')).toBeVisible();
    await expect(recovery).toBeEnabled();
    await recovery.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`worker-session-recovery-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await recovery.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(user.email);
    const password = page.getByLabel(narrow ? 'Kata sandi' : 'Password', { exact: true });
    await expect(password).toBeFocused();
    await password.fill(newPassword);
    await page.getByRole('button', { name: narrow ? 'Masuk' : 'Sign in', exact: true }).click();
    const sync = page.getByRole('button', {
      name: narrow ? 'Sinkronkan sekarang' : 'Sync now',
      exact: true,
    });
    await expect(sync).toBeEnabled();
    await sync.click();
    await expect(sync).toBeEnabled();
    const history = await manager.reportHistory(order.id);
    expect(history.total).toBe(1);
    expect(reportStatuses).toEqual([401, 200]);
    expect(new Set(sentMutationIds).size).toBe(1);
    expect((await manager.order(order.id)).report?.summary).toBe('Gate checked offline.');
  });
}
