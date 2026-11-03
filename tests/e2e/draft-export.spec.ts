import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import { LocalReportExportSchema } from '@fieldwork/contracts';

async function downloadDraft(page: Page) {
  const downloaded = page.waitForEvent('download');
  const button = page.getByRole('button', { name: 'Export draft', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(
    /^fieldwork-local-[a-zA-Z0-9_-]+-\d{4}-\d{2}-\d{2}\.json$/,
  );
  return LocalReportExportSchema.parse(JSON.parse(await readFile((await file.path())!, 'utf8')));
}

for (const width of [390, 1440]) {
  test(`local export preserves offline photos and a blocked report at ${width}px`, async ({
    page,
    context,
  }) => {
    const session = await createClient('http://127.0.0.1:4173').login(
      'manager@fieldwork.local',
      'fieldwork-demo',
    );
    const manager = createClient('http://127.0.0.1:4173', () => session.token);
    const catalog = await manager.catalog();
    const order = await manager.createOrder({
      title: `Synthetic draft export ${width}`,
      instructions: 'Export fixture.',
      siteId: catalog.sites[0].id,
      templateId: catalog.templates[0].id,
      assigneeId: catalog.users.find((user) => user.email === 'worker@fieldwork.local')!.id,
      dueDate: '2026-11-03',
      priority: 'routine',
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
      .click();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect(page.getByRole('button', { name: 'Export draft', exact: true })).toHaveCount(0);
    await page.getByLabel('Inspection summary', { exact: true }).fill('Local export evidence.');
    await page.getByLabel('Attach site photos', { exact: true }).setInputFiles({
      name: 'site.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
        'base64',
      ),
    });
    await expect(page.getByAltText('Site attachment 1')).toBeVisible();
    await context.setOffline(true);
    const draft = await downloadDraft(page);
    expect(draft.assignment?.reference).toBe(order.reference);
    expect(draft.draft?.summary).toBe('Local export evidence.');
    expect(draft.draft?.photos[0].data).toBeTruthy();
    expect(draft.draft?.answers.every((answer) => answer.value === '')).toBe(true);
    expect(draft.queuedReport).toBeNull();
    for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
      await radio.check();
    await page
      .getByRole('textbox', { name: /^Notes:/ })
      .first()
      .fill('Gate note retained.');
    await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
    await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
    const pending = await downloadDraft(page);
    expect(pending.queuedReport?.state).toBe('pending');
    await manager.rescheduleOrder(order.id, { baseVersion: 1, dueDate: '2026-11-04' });
    await context.setOffline(false);
    await expect(page.getByText('Sync needs your attention', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Sync outbox/ }).click();
    await context.setOffline(true);
    const blocked = await downloadDraft(page);
    expect(blocked.queuedReport?.state).toBe('blocked');
    expect(blocked.queuedReport?.input).toEqual(pending.queuedReport?.input);
    expect(blocked.draft?.answers[0].note).toBe('Gate note retained.');
    expect(JSON.stringify(blocked)).not.toContain(session.token);
    expect(blocked.assignment).not.toHaveProperty('assignee');
    await page.screenshot({
      path: test.info().outputPath(`draft-export-${width}.png`),
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    // A failed download cannot acknowledge or discard the queued report.
    await page.evaluate(() => {
      URL.createObjectURL = () => {
        throw new Error('Synthetic download failure');
      };
    });
    await page.getByRole('button', { name: 'Export draft', exact: true }).click();
    await expect(
      page.getByText('Could not export this draft. Your local data is kept. Try again.'),
    ).toBeVisible();
    await expect(page.getByText('NEEDS YOUR ATTENTION', { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /Sync outbox/ }).click();
    const after = await downloadDraft(page);
    expect(after.queuedReport).toEqual(blocked.queuedReport);
    expect(after.draft).toEqual(blocked.draft);
    expect((await manager.order(order.id)).report).toBeNull();
  });
}
