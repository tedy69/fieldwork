import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, role: 'worker' | 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: role === 'manager' ? 'Work orders' : 'My assignments',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Open FW-001/ })).toBeVisible();
}
test('worker completes an inspection offline, survives reload, syncs photos, and gets manager approval', async ({
  browser,
}) => {
  const worker = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
  });
  const manager = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1000 },
  });
  const field = await worker.newPage();
  const desk = await manager.newPage();
  const uncaught: string[] = [];
  field.on('pageerror', (error) => uncaught.push(error.message));
  desk.on('pageerror', (error) => uncaught.push(error.message));
  await login(field, 'worker');
  await field.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await field.reload();
  await field.getByRole('button', { name: /Open FW-001/ }).click();
  for (const radio of await field.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await field
    .getByLabel('Inspection summary', { exact: true })
    .fill('Gate and equipment checked. No follow-up needed.');
  await field.getByLabel('Attach site photos', { exact: true }).setInputFiles({
    name: 'site.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await expect(field.getByRole('button', { name: 'Submit inspection', exact: true })).toBeEnabled();
  await worker.setOffline(true);
  await field.reload();
  await expect(field.getByText('Working offline', { exact: true })).toBeVisible();
  await field.getByRole('button', { name: /Open FW-001/ }).click();
  await expect(field.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Gate and equipment checked. No follow-up needed.',
  );
  await expect(field.getByAltText('Site attachment 1')).toBeVisible();
  await expect(field.getByRole('radio', { name: 'Pass', exact: true }).first()).toBeChecked();
  await field.getByRole('button', { name: 'Save report for sync', exact: true }).click();
  await expect(field.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await field.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(field.getByText('WAITING TO SYNC', { exact: true })).toBeVisible();
  await worker.setOffline(false);
  await expect(
    field.getByRole('heading', { name: 'Everything is up to date', exact: true }),
  ).toBeVisible();
  await login(desk, 'manager');
  await desk.getByRole('button', { name: /Open FW-001/ }).click();
  await expect(
    desk.getByText('Gate and equipment checked. No follow-up needed.', { exact: true }),
  ).toBeVisible();
  await expect(desk.getByAltText('Submitted site photo 1')).toBeVisible();
  await desk.getByLabel('Review note', { exact: true }).fill('Reviewed at the dispatch desk.');
  await desk.getByRole('button', { name: 'Approve inspection', exact: true }).click();
  await expect(desk.getByText('Approved by Alex Morgan', { exact: true })).toBeVisible();
  await desk.getByRole('button', { name: '← Work orders', exact: true }).click();
  await desk.screenshot({ path: test.info().outputPath('dispatch-desk.png'), fullPage: true });
  await field.getByRole('button', { name: /^Work orders/ }).click();
  await field.getByRole('button', { name: /Sync now/ }).click();
  await field.getByRole('button', { name: /Open FW-001/ }).click();
  await expect(field.getByText('Approved by Alex Morgan', { exact: true })).toBeVisible();
  await field.screenshot({ path: test.info().outputPath('field-notebook.png'), fullPage: true });
  expect(
    await field.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  expect(uncaught).toEqual([]);
  await worker.close();
  await manager.close();
});

test('manager configures sites and checklists and assigns work through the keyboard-accessible dialog', async ({
  page,
}) => {
  await login(page, 'manager');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const site = page.getByRole('form', { name: 'Add a site' });
  await site.getByLabel('Site name', { exact: true }).fill('East access gate');
  await site.getByLabel('Address', { exact: true }).fill('14 Demo Road');
  await site.getByRole('button', { name: 'Add site', exact: true }).click();
  await expect(page.getByText('Site added.', { exact: true })).toBeVisible();
  const checklist = page.getByRole('form', { name: 'Add a checklist' });
  await checklist.getByLabel('Checklist name', { exact: true }).fill('Gate inspection');
  await checklist
    .getByLabel('Inspection items, one per line')
    .fill('Check gate latch\nCheck emergency access');
  await checklist.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await expect(page.getByText('Checklist added.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Work order title', { exact: true }).fill('Inspect east gate');
  await dialog.getByLabel('Site', { exact: true }).selectOption({ label: 'East access gate' });
  await dialog.getByLabel('Checklist', { exact: true }).selectOption({ label: 'Gate inspection' });
  await dialog.getByLabel('Assign to', { exact: true }).selectOption({ label: 'Sam Rivera' });
  await dialog.getByLabel('Instructions', { exact: true }).fill('Check both entry points.');
  await dialog.getByRole('button', { name: 'Assign work order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspect east gate', exact: true })).toBeVisible();
  await expect(page.getByText('Gate inspection', { exact: false }).first()).toBeVisible();
});

test('search, empty outbox, draft edits, and a request for changes work across both roles', async ({
  browser,
}) => {
  const worker = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const manager = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const field = await worker.newPage();
  const desk = await manager.newPage();
  await login(field, 'worker');
  await field.getByLabel('Search work orders').fill('no-such-site');
  await expect(field.getByRole('heading', { name: 'No matching work orders' })).toBeVisible();
  await field.getByLabel('Search work orders').fill('');
  await field.getByRole('button', { name: 'Assigned', exact: true }).click();
  await field.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(field.getByRole('heading', { name: 'Everything is up to date' })).toBeVisible();
  await field.getByRole('button', { name: /^Work orders/ }).click();
  await field.getByRole('button', { name: /Open FW-002/ }).click();
  for (const radio of await field.getByRole('radio', { name: 'N/A', exact: true }).all())
    await radio.check();
  await field.getByRole('radio', { name: 'Issue found', exact: true }).first().check();
  await field.getByLabel('Inspection summary', { exact: true }).fill('Access needs follow-up.');
  await field.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await expect(field.getByText('To review', { exact: true }).first()).toBeVisible();
  await login(desk, 'manager');
  await desk.getByRole('button', { name: /Open FW-002/ }).click();
  await desk.getByLabel('Review note', { exact: true }).fill('Please describe the blocked access.');
  await desk.getByRole('button', { name: 'Request changes', exact: true }).click();
  await field.getByRole('button', { name: /Sync now/ }).click();
  await expect(
    field.getByText('Please describe the blocked access.', { exact: true }),
  ).toBeVisible();
  await field
    .getByLabel('Inspection summary', { exact: true })
    .fill('Gate blocked by stored equipment. Dispatch notified.');
  await field.getByRole('button', { name: 'Submit inspection', exact: true }).click();
  await field.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await field.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(field.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await worker.close();
  await manager.close();
});
