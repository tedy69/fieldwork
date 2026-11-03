import { expect, test } from '@playwright/test';

test('the light journal gives account tasks one heading and keeps real navigation usable at every width', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open your notebook');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'light',
    );
  }
  const demo = page.getByText('Running the local demo?', { exact: true });
  await demo.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.demo-note code')).toBeVisible();
  await demo.click();
  await expect(page.locator('.demo-note code')).toBeHidden();
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
  await expect(nav).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, heading] of [
      ['Sites & checklists', 'Sites & checklists'],
      ['Sync outbox', 'Sync outbox'],
      ['Work orders', 'Work orders'],
    ]) {
      const button = nav.getByRole('button', { name: new RegExp(`^${name}`) });
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  const header = await page.locator('.sidebar').boundingBox();
  const destinations = await nav.boundingBox();
  expect(destinations!.y).toBeGreaterThanOrEqual(header!.y);
  expect(destinations!.y + destinations!.height).toBeLessThanOrEqual(header!.y + header!.height);
  await page.getByRole('button', { name: 'Find work', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Find work', exact: true })).toBeFocused();
});

test('inspection progress describes actual locally retained answers and is not a submission claim', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  const progress = page.locator('.inspection-progress');
  await expect(progress).toHaveText('0 of 4 checks recorded');
  await page.getByRole('radio', { name: 'Pass', exact: true }).first().check();
  await expect(progress).toHaveText('1 of 4 checks recorded');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /^Open FW-001:/ }).click();
  await expect(progress).toHaveText('1 of 4 checks recorded');
  await expect(page.getByRole('radio', { name: 'Pass', exact: true }).first()).toBeChecked();
  await expect(page.locator('.detail-heading .status')).toHaveText('Assigned');
});
