import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';
import type { CreateOrderSeries, OrderSeriesReceipt } from '@fieldwork/contracts';

const baseURL = 'http://127.0.0.1:4173';
const endpoint = '**/api/v1/work-order-series';
test.use({ timezoneId: 'America/Los_Angeles' });
for (const width of [390, 1440]) {
  test(`monthly batches preview, recover offline and retain planned dates at ${width}px`, async ({
    page,
    context,
  }) => {
    const session = await createClient(baseURL).login('manager@fieldwork.local', 'fieldwork-demo');
    const manager = createClient(baseURL, () => session.token);
    const title = `Synthetic monthly schedule ${width}`;
    const expectedDates = ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'];
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
    const dates = dialog
      .getByRole('region', { name: 'Scheduled dates', exact: true })
      .locator('time');
    await dialog.getByLabel('Work order title', { exact: true }).fill(title);
    await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
    await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('monthly');
    await dialog.getByLabel('Occurrences', { exact: true }).fill('4');
    await expect(
      dialog.getByText(
        'Repeats on the original day of the month. Shorter months use their last day.',
        { exact: true },
      ),
    ).toBeVisible();
    await dialog.getByLabel('Due date', { exact: true }).fill('9999-12-31');
    await expect(
      dialog.getByRole('heading', { name: 'Choose a valid schedule', exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Assign work orders', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Due date', { exact: true }).fill('2027-01-31');
    expect(
      await dates.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(expectedDates);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dates.last().scrollIntoViewIfNeeded();
    await expect(dates.first()).toBeVisible();
    await expect(dates.last()).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`monthly-preview-${width}.png`),
      fullPage: false,
    });
    const requests: CreateOrderSeries[] = [];
    let receipt: OrderSeriesReceipt | undefined;
    await page.route(endpoint, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        receipt = await (await route.fetch()).json();
        await route.abort('failed');
      } else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Assign 4 work orders', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Retry saved batch', exact: true }),
    ).toBeEnabled();
    expect(receipt?.orders.map((order) => order.dueDate)).toEqual(expectedDates);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'Recover recurring batch', exact: true }).click();
    await expect(dialog.getByText('Monthly · 4 work orders', { exact: true })).toBeVisible();
    expect(
      await dates.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
    ).toEqual(expectedDates);
    await expect(
      dialog.getByRole('button', { name: 'Retry saved batch', exact: true }),
    ).toBeDisabled();
    await context.setOffline(false);
    await dialog.getByRole('button', { name: 'Retry saved batch', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect((await manager.searchOrders({ q: title })).total).toBe(4);
    const first = receipt!.orders[0];
    await manager.rescheduleOrder(first.id, { baseVersion: 1, dueDate: '2027-02-02' });
    expect(await manager.createOrderSeries(requests[0])).toEqual(receipt);
    await page.getByRole('button', { name: 'Back to work orders', exact: true }).click();
    await page.getByRole('button', { name: 'Recurring batches', exact: true }).click();
    const viewer = page.getByRole('dialog', { name: 'Recurring batches', exact: true });
    const row = viewer.getByRole('button', {
      name: `View batch ${receipt!.id}: ${title}`,
      exact: true,
    });
    await expect(row).toContainText('Monthly');
    await row.click();
    const firstRow = viewer
      .getByRole('region', { name: 'Selected recurring batch', exact: true })
      .locator('.series-orders > li')
      .first();
    await expect(firstRow.locator('time').first()).toHaveAttribute('datetime', '2027-01-31');
    await expect(firstRow.locator('time').last()).toHaveAttribute('datetime', '2027-02-02');
    await firstRow
      .getByRole('button', { name: `Open batch order ${first.reference}: ${title}`, exact: true })
      .click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`monthly-order-${width}.png`),
      fullPage: true,
    });
  });
}
