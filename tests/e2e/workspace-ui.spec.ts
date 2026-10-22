import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function login(page: Page, role: 'worker' | 'manager') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(`${role}@fieldwork.local`);
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('Kokonut workspace keeps the palette and supports keyboard filters across desktop and phone layouts', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Open your notebook', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
  ).toBe('rgb(21, 29, 32)');
  expect(
    await page
      .getByRole('button', { name: 'Sign in', exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(245, 198, 109)');
  await page.screenshot({ path: test.info().outputPath('kokonut-sign-in.png'), fullPage: true });
  await login(page, 'manager');
  await expect(page.getByRole('button', { name: /^Open FW-001:/ })).toBeVisible();
  const filters = page.getByRole('group', { name: 'Filter work orders', exact: true });
  await filters.getByRole('button', { name: 'All orders', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(filters.getByRole('button', { name: 'Overdue', exact: true })).toBeFocused();
  await expect(filters.getByRole('button', { name: 'Overdue', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('End');
  await expect(
    filters.getByRole('button', { name: 'Changes requested', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Home');
  await expect(filters.getByRole('button', { name: 'All orders', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const views = page.getByRole('group', { name: 'Work order view', exact: true });
  await views.getByRole('button', { name: 'List', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(views.getByRole('button', { name: 'Week planner', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(views.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({ path: test.info().outputPath('kokonut-dispatch.png') });
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Add a site', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('kokonut-resources.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Assign a work order', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Work order title', { exact: true }).fill('Synthetic Kokonut assignment');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Open your notebook', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';

test('Kokonut photo attachment accepts real drops and keyboard selection without submitting the offline draft', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const session = await createClient('http://127.0.0.1:4173').login(
    'manager@fieldwork.local',
    'fieldwork-demo',
  );
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const order = await manager.createOrder({
    title: 'Kokonut photo QA',
    instructions: 'Synthetic attachment fixture.',
    siteId: catalog.sites[0].id,
    templateId: catalog.templates[0].id,
    assigneeId: catalog.users.find((user) => user.email === 'worker@fieldwork.local')!.id,
    dueDate: '2026-10-22',
    priority: 'routine',
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'worker');
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  const zone = page.getByRole('group', { name: 'Site photo attachments', exact: true });
  const rejected = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['<svg/>'], 'invalid.svg', { type: 'image/svg+xml' }));
    return data;
  });
  await zone.dispatchEvent('drop', { dataTransfer: rejected });
  await expect(page.getByRole('alert')).toContainText(
    'Choose JPEG, PNG, or WebP photos smaller than 2 MB.',
  );
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(0);
  const dropped = await page.evaluateHandle((encoded) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    data.items.add(new File([bytes], 'gate.png', { type: 'image/png' }));
    data.items.add(new File([bytes], 'latch.png', { type: 'image/png' }));
    return data;
  }, png);
  expect(
    await page.evaluate((data) => {
      const event = new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }, dropped),
  ).toBe(true);
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(0);
  await zone.dispatchEvent('drop', { dataTransfer: dropped });
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(2);
  const choose = zone.getByRole('button', { name: 'Choose photos', exact: true });
  const picker = page.waitForEvent('filechooser');
  await choose.focus();
  await page.keyboard.press('Enter');
  await (
    await picker
  ).setFiles({ name: 'area.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(3);
  await expect(choose).toBeDisabled();
  expect((await manager.order(order.id)).report).toBeNull();
  for (const radio of await page.getByRole('radio', { name: 'Pass', exact: true }).all())
    await radio.check();
  await page
    .getByLabel('Inspection summary', { exact: true })
    .fill('Synthetic photos retained in the local draft.');
  await page.getByRole('button', { name: 'Remove photo 1', exact: true }).click();
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(2);
  await expect(choose).toBeEnabled();
  await page
    .getByLabel('Attach site photos', { exact: true })
    .setInputFiles({ name: 'gate.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(3);
  await zone.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('kokonut-worker-photos.png') });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole('button', { name: `Open ${order.reference}: ${order.title}`, exact: true })
    .click();
  await expect(page.getByLabel('Inspection summary', { exact: true })).toHaveValue(
    'Synthetic photos retained in the local draft.',
  );
  await expect(page.getByAltText(/Site attachment/)).toHaveCount(3);
  expect(
    await page.evaluate(async () => (await fetch('/licenses/shadcn-ui-MIT.txt')).text()),
  ).toContain('Copyright (c) 2023 shadcn');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Save report for sync', exact: true }).click();
  await expect(page.getByText('Report queued on this device', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByAltText('Submitted site photo 3', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('.detail-heading .status-submitted')
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe('rgb(245, 198, 109)');
  expect((await manager.order(order.id)).report?.photos).toHaveLength(3);
  expect(errors).toEqual([]);
});
