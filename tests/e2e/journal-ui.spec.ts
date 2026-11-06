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
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const row = page.getByRole('button', { name: /^Open FW-001:/ });
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAccessibleDescription('Draft saved on this device');
  await row.press('Enter');
  const progress = page.locator('.inspection-progress');
  await expect(progress).toHaveText('0 of 4 checks recorded');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Pass', exact: true }).first().check();
  await expect(progress).toHaveText('1 of 4 checks recorded');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(row).toHaveAccessibleDescription('Draft saved on this device');
  await expect(row.locator('.draft-mark svg[aria-hidden=true]')).toBeVisible();
  await row.press('Enter');
  await expect(progress).toHaveText('1 of 4 checks recorded');
  await expect(page.getByRole('radio', { name: 'Pass', exact: true }).first()).toBeChecked();
  await expect(page.locator('.detail-heading .status')).toHaveText('Assigned');
});

test('inspection Back restores the work list and keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 680 });
  await page.goto('/?previous');
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const row = page.getByRole('button', { name: /^Open FW-001:/ });
  await page.getByLabel('Search work orders').fill('FW-001');
  await row.press('Enter');
  const title = page.getByRole('heading', { name: 'Morning safety walkthrough' });
  const back = page
    .locator('article > header')
    .getByRole('button', { name: 'Back to work orders' });
  await expect(title).toBeFocused();
  await expect(back).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/previous/);
  await expect(row).toBeFocused();
  await expect(page.getByLabel('Search work orders')).toHaveValue('FW-001');
  await page.goForward();
  await expect(title).toBeFocused();
  await page.locator('.skip-link').press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(title).toBeVisible();
  await back.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(row).toBeFocused();
  await expect(page).not.toHaveURL(/previous/);
  await page.goForward();
  await expect(title).toBeFocused();
  await back.press('Enter');
  await expect(row).toBeFocused();
});

test('the phone navigation leaves room for focused site setup controls', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Workspace' });
  await nav.getByRole('button', { name: 'Sites & checklists' }).press('Enter');
  const coordinates = page.getByRole('button', { name: 'Add coordinates for Hilltop reservoir' });
  const closure = page.getByRole('button', { name: 'Edit closure dates for Hilltop reservoir' });
  await coordinates.focus();
  await page.keyboard.press(
    browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab',
  );
  await expect(closure).toBeFocused();
  await expect
    .poll(() =>
      closure.evaluate((control) => {
        const nav = document.querySelector('.sidebar nav')!;
        return control.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top;
      }),
    )
    .toBe(true);
});

test('a failed local draft write keeps the edit visible without claiming it was saved', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('worker@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Open FW-002:/ }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.drafts?.['demo-2']) {
        IDBObjectStore.prototype.put = put;
        this.transaction.abort();
        throw new DOMException('Synthetic draft write failure', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  const summary = page.getByLabel('Inspection summary', { exact: true });
  await summary.fill('Synthetic inspection notes');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Your draft could not be saved' }),
  ).toBeVisible();
  await expect(summary).toHaveValue('Synthetic inspection notes');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toHaveCount(0);
  await summary.fill('Synthetic inspection notes updated');
  await expect(page.getByText('Draft saved on this device', { exact: true })).toBeVisible();
  await expect(page.getByText('Your draft could not be saved', { exact: false })).toHaveCount(0);
});
