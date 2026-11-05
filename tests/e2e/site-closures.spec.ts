import { expect, test } from '@playwright/test';
import { createClient } from '@fieldwork/sdk';

test('managers resolve competing closure edits and copy later dates into a recurring batch', async ({
  page,
  context,
}) => {
  const base = 'http://127.0.0.1:4173';
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  const manager = createClient(base, () => session.token);
  const site = await manager.site('north');
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('manager@fieldwork.local');
  await page.getByLabel('Password', { exact: true }).fill('fieldwork-demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sites & checklists', exact: true }).click();
  const edit = page.getByRole('button', { name: `Edit closure dates for ${site.name}` });
  await edit.focus();
  await page.keyboard.press('Enter');
  const form = page.getByRole('form', { name: `Edit closure dates for ${site.name}` });
  const dates = form.getByLabel('Closure dates, one per line');
  await expect(dates).toBeFocused();
  await dates.fill('2027-02-29');
  const save = form.getByRole('button', { name: 'Save closure dates' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('distinct dates');
  const proposal = '2027-01-02\n2027-01-04\n2027-01-05\n2027-01-06';
  await dates.fill(proposal);
  await manager.updateSiteClosures(site.id, { expectedDates: [], dates: ['2026-12-25'] });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Site closure dates changed');
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Load saved dates' }).click();
  await expect(dates).toHaveValue(proposal);
  await expect(form.getByText('Saved dates: 2026-12-25', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await expect(form.getByText('Reconnect to save closure dates.')).toBeVisible();
  await expect(save).toBeDisabled();
  await context.setOffline(false);
  await save.click();
  await expect(form).toHaveCount(0);
  await expect(edit).toBeFocused();
  await expect((await manager.site(site.id)).closureDates).toEqual(proposal.split('\n'));
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: /^Work orders/ }).click();
  await page.getByRole('button', { name: 'Assign recurring work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign recurring work', exact: true });
  await dialog.getByLabel('Work order title').fill('Synthetic site calendar visit');
  await dialog.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('worker');
  const siteSelect = dialog.getByRole('combobox', { name: 'Site', exact: true });
  await siteSelect.selectOption(site.id);
  await dialog.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await dialog.getByLabel('Due date', { exact: true }).fill('2027-01-04');
  await dialog.getByLabel('Occurrences', { exact: true }).fill('3');
  await dialog.getByText('Skip dates (optional)', { exact: true }).click();
  const copy = dialog.getByRole('button', { name: 'Copy site closure dates' });
  await expect(dialog.getByText(/first date is marked closed/)).toBeVisible();
  const other = (await manager.catalog()).sites.find((entry) => entry.id !== site.id)!;
  await siteSelect.selectOption(other.id);
  await expect(copy).toHaveCount(0);
  await siteSelect.selectOption(site.id);
  await dialog.getByLabel('Due date', { exact: true }).fill('2027-01-03');
  await copy.focus();
  await page.keyboard.press('Enter');
  const skipped = dialog
    .getByRole('region', { name: 'Skipped dates', exact: true })
    .locator('time');
  await expect(skipped).toHaveCount(3);
  const scheduled = dialog
    .getByRole('region', { name: 'Scheduled dates', exact: true })
    .locator('time');
  expect(
    await scheduled.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
  ).toEqual(['2027-01-03', '2027-01-07', '2027-01-08']);
  const response = page.waitForResponse(
    (result) => result.url().endsWith('/work-order-series') && result.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Assign 3 work orders', exact: true }).click();
  const receipt = await (await response).json();
  expect(receipt.skipDates).toEqual(['2027-01-04', '2027-01-05', '2027-01-06']);
  await manager.updateSiteClosures(site.id, { expectedDates: proposal.split('\n'), dates: [] });
  expect((await manager.orderSeriesDetail(receipt.id)).skipDates).toEqual(receipt.skipDates);
});
