import { expect, test } from '@playwright/test';

test('compact actions retain names, touch targets, keyboard hints and real destinations', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of [
      'Sync now',
      'Sign out',
      'Find work',
      'Search server',
      'Recurring batches',
      'Assign recurring work',
    ]) {
      const action = page.getByRole('button', { name, exact: true });
      await expect(action).toBeVisible();
      await expect(action.locator('svg')).toBeVisible();
      expect((await action.textContent())!.trim()).toBe('');
      const rect = await action.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const finder = page.getByRole('button', { name: 'Find work', exact: true });
    await finder.focus();
    await expect(page.getByRole('tooltip')).toContainText('Find work');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(finder).toBeFocused();
    const server = page.getByRole('button', { name: 'Search server', exact: true });
    await server.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(server).toBeFocused();
  }
  await page.locator('.order-row').first().click();
  const back = page.getByRole('button', { name: 'Back to work orders', exact: true });
  await expect(back.locator('svg')).toBeVisible();
  await back.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work orders');
  expect(errors).toEqual([]);
});
