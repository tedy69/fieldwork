import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function inspection(
  title: string,
  status: 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED',
  long = false,
) {
  const client = createClient('http://127.0.0.1:4173');
  const managerSession = await client.login('manager@fieldwork.local', 'fieldwork-demo');
  const workerSession = await client.login('worker@fieldwork.local', 'fieldwork-demo');
  const manager = createClient('http://127.0.0.1:4173', () => managerSession.token);
  const worker = createClient('http://127.0.0.1:4173', () => workerSession.token);
  const catalog = await manager.catalog();
  const template = await manager.createTemplate(
    'Print QA checklist',
    long
      ? Array.from({ length: 50 }, (_, index) => `Inspection point ${index + 1}`)
      : ['Access route', 'Valve <script> text', 'Emergency access'],
  );
  let order = await manager.createOrder({
    title,
    instructions: 'Synthetic field brief.\nCheck both entry points.',
    siteId: catalog.sites[0].id,
    templateId: template.id,
    assigneeId: workerSession.user.id,
    dueDate: '2026-10-22',
    priority: 'urgent',
  });
  order = await worker.submitReport(order.id, {
    mutationId: crypto.randomUUID(),
    baseVersion: order.version,
    answers: template.items.map((item, index) => ({
      itemId: item.id,
      value: index % 3 === 0 ? 'pass' : index % 3 === 1 ? 'fail' : 'na',
      note: long
        ? `Point ${index + 1}: ${'Synthetic inspection note. '.repeat(20)}`
        : 'Line one\nLine two',
    })),
    summary: long
      ? 'Synthetic long report. '.repeat(150)
      : 'Saved report 東京.\n<img src=x onerror=alert(1)>',
    photos: long
      ? []
      : [
          {
            id: crypto.randomUUID(),
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
          },
        ],
  });
  if (status !== 'SUBMITTED')
    order = await manager.review(
      order.id,
      order.version,
      status,
      'Dispatch review.\nFollow up at the gate.',
    );
  return order;
}

async function signIn(page: Page, role: 'manager' | 'worker') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function watchPrint(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.printCalls = '0';
    window.print = () => {
      document.documentElement.dataset.printCalls = String(
        Number(document.documentElement.dataset.printCalls) + 1,
      );
    };
  });
}

test('manager prints only the selected saved report, offline and with useful errors', async ({
  page,
  context,
}) => {
  const order = await inspection('Print QA approved valve', 'APPROVED');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page, 'manager');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  const action = page.getByRole('button', { name: 'Print report', exact: true });
  const print = page.locator('.print-report');
  await expect(print).toBeHidden();
  await watchPrint(page);
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
  await page.screenshot({
    path: test.info().outputPath('print-action-desktop.png'),
    fullPage: true,
  });
  await page.emulateMedia({ media: 'print' });
  await expect(print).toBeVisible();
  await expect(page.locator('#root')).toBeHidden();
  await expect(print).toContainText(order.reference);
  await expect(print).toContainText(order.title);
  await expect(print).toContainText(order.site.address);
  await expect(print).toContainText('Pass');
  await expect(print).toContainText('Issue found');
  await expect(print).toContainText('N/A');
  await expect(print).toContainText('Saved report 東京.\n<img src=x onerror=alert(1)>');
  await expect(print).toContainText('Dispatch review.');
  await expect(print).toContainText('1 (photo files excluded)');
  await expect(print.locator('img, script, input, textarea, button, a')).toHaveCount(0);
  for (const value of [
    'Print QA pending',
    'manager@fieldwork.local',
    'worker@fieldwork.local',
    order.report!.photos[0].id,
  ])
    await expect(print).not.toContainText(value);
  const pdf = await page.pdf({
    path: test.info().outputPath('inspection-report.pdf'),
    preferCSSPageSize: true,
  });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  await page.screenshot({ path: test.info().outputPath('print-report.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await expect(action).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await watchPrint(page);
  await action.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-print-calls', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('region', { name: 'Print saved report', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('print-action-mobile.png') });
  await page.evaluate(() => {
    window.print = () => {
      throw new Error('Print unavailable');
    };
  });
  await action.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not open the print dialog.' }),
  ).toBeVisible();
  await watchPrint(page);
  await action.click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Could not open the print dialog.' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await expect(print).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeVisible();
  expect(errors).toEqual([]);
});

test('worker printing excludes unsent corrections and is unavailable before submission', async ({
  page,
}) => {
  const order = await inspection('Print QA correction', 'CHANGES_REQUESTED');
  await signIn(page, 'worker');
  await page.getByRole('button', { name: /Open FW-003/ }).click();
  await expect(page.getByRole('button', { name: 'Print report', exact: true })).toHaveCount(0);
  await expect(page.locator('.print-report')).toHaveCount(0);
  await page.getByRole('button', { name: '← Work orders', exact: true }).click();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page.getByLabel('Inspection summary', { exact: true }).fill('PRIVATE UNSENT CORRECTION');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await watchPrint(page);
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  const print = page.getByRole('article', { name: 'Printable inspection report', exact: true });
  await expect(print).toContainText('Changes requested');
  await expect(print).toContainText('Saved report 東京.');
  await expect(print).not.toContainText('PRIVATE UNSENT CORRECTION');
  await expect(print.locator('input, textarea')).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'PRIVATE UNSENT CORRECTION',
  );
  await expect(page.getByRole('button', { name: /Sync outbox 0/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.print-report')).toHaveCount(0);
});

test('long unreviewed reports paginate with every checklist result', async ({ page }) => {
  const order = await inspection('Print QA long inspection', 'SUBMITTED', true);
  await signIn(page, 'manager');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await page.emulateMedia({ media: 'print' });
  const print = page.locator('.print-report');
  await expect(print.locator('tbody tr')).toHaveCount(50);
  await expect(print).toContainText('Inspection point 50');
  await expect(print).toContainText('Not reviewed yet.');
  expect(await print.locator('thead').evaluate((head) => getComputedStyle(head).display)).toBe(
    'table-header-group',
  );
  const pdf = await page.pdf({
    path: test.info().outputPath('long-inspection.pdf'),
    preferCSSPageSize: true,
  });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  expect(await print.evaluate((report) => report.scrollWidth <= report.clientWidth)).toBe(true);
});
