import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

async function login(page: Page, role: 'manager' | 'worker') {
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
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('sign-in validation and password reveal remain usable with the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Sign in · Fieldwork');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Check these fields')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  const password = page.getByLabel('Password', { exact: true });
  await page.getByText('Password', { exact: true }).click();
  await expect(password).toBeFocused();
  expect(
    await page
      .locator('label')
      .evaluateAll((labels) =>
        labels.every(
          (label) => label.querySelectorAll('input, select, textarea, button').length <= 1,
        ),
      ),
  ).toBe(true);
  await password.fill('visible only on request');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('visible only on request');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByLabel('Email', { exact: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Email: enter a valid email address.')).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
  }
});

test('workspace, finder and server search clear immediately without losing navigation state', async ({
  page,
}) => {
  await login(page, 'manager');
  const search = page.getByLabel('Search work orders', { exact: true });
  await search.fill('no match for this inspection');
  await expect(page.getByRole('heading', { name: 'No matching work orders' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(page.locator('.order-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Find work', exact: true }).click();
  const finder = page.getByRole('dialog');
  await finder.getByRole('combobox').fill('unmatched query');
  await finder.getByRole('button', { name: 'Clear search' }).click();
  await expect(finder.getByRole('combobox')).toHaveValue('');
  await expect(finder.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search server', exact: true }).click();
  const server = page.getByRole('dialog');
  await server.getByLabel('Search text', { exact: true }).fill('pump');
  await server.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(server.getByLabel('Search text', { exact: true })).toBeFocused();
  await expect(server.getByLabel('Search text', { exact: true })).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await expect(page).toHaveTitle('Sites & checklists · Fieldwork');
  await page
    .getByRole('form', { name: 'Add a site', exact: true })
    .getByRole('button', { name: 'Add site', exact: true })
    .click();
  await expect(page.getByLabel('Site name', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: /Sync outbox/ }).click();
  await expect(page).toHaveTitle('Sync outbox · Fieldwork');
});

test('redesigned screens retain readable layouts, modal focus and shared tokens', async ({
  page,
}) => {
  await login(page, 'manager');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    await fits(page);
    await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
    await fits(page);
    await page.getByRole('button', { name: /Work orders/ }).click();
  }
  const scrollbar = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollbarColor,
  );
  expect(scrollbar).not.toBe('auto');
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Work order title', { exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Assign work order', exact: true }).click();
  await expect(dialog.getByText('Check these fields')).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 600 });
    await fits(page);
    const bounds = await dialog.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeLessThanOrEqual(600);
  }
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: '+ Assign work order', exact: true }),
  ).toBeFocused();
});

test('every workspace dialog keeps its title, close action and keyboard focus usable', async ({
  page,
}) => {
  await login(page, 'manager');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    for (const [destination, trigger, close] of [
      ['orders', '+ Assign work order', 'Cancel'],
      ['orders', 'Assign recurring work', 'Close'],
      ['orders', 'Recurring batches', 'Close dialog'],
      ['orders', 'Search server', 'Close dialog'],
      ['orders', 'Find work', 'Close finder'],
      ['resources', 'Worker accounts', 'Close accounts'],
      ['resources', 'Worker invitations', 'Close invitations'],
      ['detail', 'Report history', 'Close dialog'],
    ] as const) {
      if (destination === 'resources')
        await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
      else {
        await page.getByRole('button', { name: /^Work orders/ }).click();
        if (destination === 'detail')
          await page.getByRole('button', { name: /^Open FW-001:/ }).click();
      }
      const opener = page.getByRole('button', { name: trigger, exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const title = dialog.getByRole('heading', { level: 2 }).first();
      const closer = dialog.getByRole('button', { name: close, exact: true });
      const [a, b, bounds] = await Promise.all([
        title.boundingBox(),
        closer.boundingBox(),
        dialog.boundingBox(),
      ]);
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(bounds).not.toBeNull();
      expect(
        a!.x < b!.x + b!.width &&
          a!.x + a!.width > b!.x &&
          a!.y < b!.y + b!.height &&
          a!.y + a!.height > b!.y,
      ).toBe(false);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.height).toBeLessThanOrEqual(700);
      expect(b!.height).toBeGreaterThanOrEqual(44);
      for (let index = 0; index < 4; index++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
      await closer.click();
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await fits(page);
    }
  }
});

test('documentation walkthrough shows real dispatch, planning, setup and field screens', async ({
  browser,
}) => {
  const api = createClient('http://127.0.0.1:4173');
  const session = await api.login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient('http://127.0.0.1:4173', () => session.token);
  const catalog = await manager.catalog();
  const dueDate = new Date().toLocaleDateString('en-CA');
  const orders = [];
  for (const [index, name] of [
    'Safety walkthrough',
    'Emergency access check',
    'Equipment inspection',
  ].entries()) {
    orders.push(
      await manager.createOrder({
        title: `Demo work: ${name}`,
        instructions:
          'Inspect the access route and equipment. Record any issue and the follow-up needed.',
        siteId: catalog.sites[index % catalog.sites.length].id,
        templateId: catalog.templates[0].id,
        assigneeId: 'worker',
        dueDate,
        priority: index === 1 ? 'urgent' : 'routine',
      }),
    );
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const save = async (name: string, fullPage = true) => {
    await fits(page);
    if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: process.env.UPDATE_README_IMAGES
        ? resolve('docs/images', name)
        : test.info().outputPath(name),
      fullPage: fullPage && page.viewportSize()!.width > 600,
    });
  };
  await page.goto('/');
  await save('notebook-sign-in.png');
  await login(page, 'manager');
  await page.getByLabel('Search work orders', { exact: true }).fill('Demo work:');
  await expect(page.locator('.order-row')).toHaveCount(3);
  await save('dispatch-desk.png');
  await page.getByRole('button', { name: '+ Assign work order', exact: true }).click();
  await save('notebook-dispatch-dialog.png', false);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await save('notebook-work-orders-phone.png');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Month planner', exact: true }).click();
  await save('notebook-planner.png');
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  await save('notebook-resources.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await save('notebook-resources-phone.png');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole('button', { name: 'Worker accounts', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('worker@fieldwork.local', { exact: true }),
  ).toBeVisible();
  await save('notebook-worker-access.png', false);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Sync outbox/ }).click();
  await save('notebook-outbox.png');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'worker');
  await page
    .getByRole('button', { name: `Open ${orders[0].reference}: ${orders[0].title}`, exact: true })
    .click();
  await page.getByRole('radio', { name: 'Pass', exact: true }).first().check();
  await save('field-notebook.png');
  await page
    .getByRole('heading', { name: 'Inspection checklist', exact: true })
    .evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
  await save('notebook-inspection-phone.png', false);
  await context.setOffline(true);
  await expect(page.getByText('Working offline', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await fits(page);
  await context.setOffline(false);
  const workerSession = await api.login('worker@fieldwork.local', 'fieldwork-demo');
  const worker = createClient('http://127.0.0.1:4173', () => workerSession.token);
  await worker.submitReport(orders[1].id, {
    mutationId: crypto.randomUUID(),
    baseVersion: orders[1].version,
    answers: orders[1].template.items.map((item) => ({ itemId: item.id, value: 'pass', note: '' })),
    summary: 'Access route is clear. Emergency equipment is in place and ready for use.',
    photos: [],
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await login(page, 'manager');
  await page
    .getByRole('button', { name: `Open ${orders[1].reference}: ${orders[1].title}`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Manager review', exact: true })).toBeVisible();
  await save('notebook-report.png');
  await context.close();
});
