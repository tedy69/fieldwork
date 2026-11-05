import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { CreateOrderSeries, OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
test.use({ timezoneId: 'America/Los_Angeles' });
for (const { width, frequency, skipped, expectedDates } of [
  {
    width: 390,
    frequency: 'daily',
    skipped: ['2026-12-29', '2026-12-30'],
    expectedDates: ['2026-12-28', '2026-12-31', '2027-01-01'],
  },
  {
    width: 1440,
    frequency: 'daily',
    skipped: ['2026-12-29', '2026-12-30'],
    expectedDates: ['2026-12-28', '2026-12-31', '2027-01-01'],
  },
  {
    width: 390,
    frequency: 'biweekly',
    skipped: ['2027-01-11', '2027-01-25'],
    expectedDates: ['2026-12-28', '2027-02-08', '2027-02-22'],
  },
]) {
  test(`${frequency} skipped dates preview and survive declined and lost writes at ${width}px`, async ({
    page,
    context,
  }) => {
    const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => session.token);
    const title = `Synthetic ${frequency} site closure ${width}`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
    await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'Assign recurring work', exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const dialog = page.getByRole('dialog', { name: 'Assign recurring work', exact: true });
    await dialog.getByLabel('Work order title', { exact: true }).fill(title);
    await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
    await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption(frequency);
    await dialog.getByLabel('Due date', { exact: true }).fill('2026-12-28');
    await dialog.getByLabel('Occurrences', { exact: true }).fill('3');
    await dialog.getByText('Skip dates (optional)', { exact: true }).focus();
    await page.keyboard.press('Enter');
    const date = dialog.getByLabel('Date to skip', { exact: true });
    const add = dialog.getByRole('button', { name: 'Add date', exact: true });
    const assign = dialog.getByRole('button', { name: 'Assign 3 work orders', exact: true });
    await dialog.getByRole('button', { name: 'Choose a date to skip', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await date.fill('2026-12-28');
    await expect(
      dialog.getByText('Choose a skipped date after the first due date.', { exact: true }),
    ).toBeVisible();
    await expect(add).toBeDisabled();
    await expect(assign).toBeDisabled();
    for (const value of skipped) {
      await date.fill(value);
      await expect(assign).toBeDisabled();
      const disclosure = dialog.locator('summary').filter({ hasText: 'Skip dates' });
      await disclosure.click();
      await expect(disclosure).toContainText('Date not added');
      await expect(assign).toBeDisabled();
      await disclosure.click();
      await add.click();
      await expect(date).toBeFocused();
    }
    await date.fill(skipped[0]);
    await expect(
      dialog.getByText('This date is already in the list.', { exact: true }),
    ).toBeVisible();
    await expect(add).toBeDisabled();
    await date.clear();
    const remove = dialog.getByRole('button', {
      name: `Remove skipped date ${skipped[0]}`,
      exact: true,
    });
    expect(
      await remove.evaluate((node) => node.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(44);
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(date).toBeFocused();
    await date.fill(skipped[0]);
    await add.click();
    await dialog.getByLabel('Due date', { exact: true }).fill(skipped[0]);
    await expect(
      dialog.getByText(
        'Skipped dates must be after the first due date. Remove them or change the first date.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Assign work orders', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Due date', { exact: true }).fill('2026-12-28');
    const dates = dialog
      .getByRole('region', { name: 'Scheduled dates', exact: true })
      .locator('time');
    expect(
      await dates.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(expectedDates);
    await dates.last().scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath(`skip-dates-${width}.png`) });
    const requests: CreateOrderSeries[] = [];
    let receipt: OrderSeriesReceipt | undefined;
    await page.route('**/api/v1/work-order-series', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests.push(route.request().postDataJSON());
      if (requests.length === 1)
        await route.fulfill({
          status: 422,
          json: {
            error: {
              code: 'INVALID_ASSIGNMENT',
              message: 'Synthetic declined assignment. Choose an active worker.',
            },
          },
        });
      else if (requests.length === 2) {
        receipt = await (await route.fetch()).json();
        await route.abort('failed');
      } else await route.continue();
    });
    await assign.click();
    await dialog.getByRole('button', { name: 'Edit declined batch', exact: true }).click();
    expect(
      await dialog
        .getByRole('region', { name: 'Skipped dates', exact: true })
        .locator('time')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(skipped);
    await assign.click();
    await expect(
      dialog.getByRole('button', { name: 'Retry saved batch', exact: true }),
    ).toBeEnabled();
    expect(receipt?.orders.map((order) => order.dueDate)).toEqual(expectedDates);
    expect(receipt?.frequency).toBe(frequency);
    expect(requests[1].mutationId).not.toBe(requests[0].mutationId);
    expect(requests[1].skipDates).toEqual(skipped);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
    const skippedRegion = dialog.getByRole('region', { name: 'Skipped dates', exact: true });
    expect(
      await skippedRegion
        .locator('time')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(skipped);
    await expect(
      dialog.getByRole('button', { name: 'Retry saved batch', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await dialog.getByRole('button', { name: 'Retry saved batch', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toEqual(requests[1]);
    expect((await manager.searchOrders({ q: title })).total).toBe(3);
    await page.getByRole('button', { name: 'Back to work orders', exact: true }).click();
    await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Recurring batches', exact: true });
    const savedBatch = viewer.getByRole('button', {
      name: `View batch ${receipt!.id}: ${title}`,
      exact: true,
    });
    if (frequency === 'biweekly') await expect(savedBatch).toContainText('Every two weeks');
    await savedBatch.click();
    await expect(
      viewer.getByRole('region', { name: 'Skipped dates', exact: true }).locator('time'),
    ).toHaveCount(2);
    expect(
      await viewer
        .getByRole('region', { name: 'Skipped dates', exact: true })
        .locator('time')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(skipped);
    expect(errors).toEqual([]);
  });
}
