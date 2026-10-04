import { expect, test } from '@playwright/test';

const SERVER = 'ws://127.0.0.1:8790';

test('the live valley: world, minds, narrator and the Overseer all connected', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`/?server=${encodeURIComponent(SERVER)}`);

  // Lane 1 -> Lane 4: the server's world drives the 3D valley.
  await expect(page.locator('.live-badge')).toContainText('Live · shift');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.population strong')).toHaveText('100');
  const console_ = page.getByRole('complementary', { name: 'Valley console' });
  await expect(console_).toBeVisible();

  // Lane 2: every miner, with a brain and its reasoning.
  await console_.getByRole('tab', { name: 'Miners' }).click();
  await expect(console_.locator('.agents-table tbody tr')).toHaveCount(100);
  await expect(console_.locator('.agents-brain-fuzzy').first()).toBeVisible();
  await console_.locator('.agents-table tbody tr').first().click();
  // Selecting in the console selects in the valley too.
  await expect(page.getByRole('complementary', { name: 'Selected miner' })).toBeVisible();
  await expect(console_).toContainText('Rules that fired');

  // The Overseer: acts of god, powers on the selected miner, dials.
  await console_.getByRole('tab', { name: 'Overseer' }).click();
  await console_.getByRole('button', { name: 'Gold rush at Magpie Hole' }).click();
  await expect(console_.locator('.overseer-timeline')).toContainText('Gold is found');
  await console_.getByRole('button', { name: '⚡ Lightning' }).click();
  await expect(console_.locator('.overseer-timeline')).toContainText('Lightning strikes');
  await console_.getByText('bank', { exact: true }).click();
  const rate = console_.getByRole('slider', { name: 'Interest rate' });
  await rate.focus();
  await rate.press('ArrowRight');
  await expect(console_.locator('.overseer-timeline')).toContainText('interestRate');

  // The Oracle forks the world on the server and runs it both ways.
  await console_.getByRole('combobox', { name: 'Action to test' }).selectOption({ label: 'Drought' });
  await console_.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(console_.locator('.overseer-fork caption')).toContainText('Drought, after 20 shifts');

  // Lane 3: the narrator explains the gold rush, naming it as the cause.
  await console_.getByRole('tab', { name: /Narrator/ }).click();
  await expect(console_.locator('.narrator-card').filter({ hasText: /gold rush/i }).first()).toBeVisible({ timeout: 60000 });

  // Economy charts are drawn from the live metrics.
  await console_.getByRole('tab', { name: 'Economy' }).click();
  await expect(console_.locator('.spark')).toHaveCount(11);

  // Rewinding goes back in time on the server.
  await console_.getByRole('tab', { name: 'Overseer' }).click();
  const before = Number((await page.locator('.live-badge').innerText()).replace(/\D/g, ''));
  await console_.getByRole('spinbutton', { name: 'Shift to rewind to' }).fill('3');
  await console_.getByRole('button', { name: 'Rewind', exact: true }).click();
  await expect.poll(async () => Number((await page.locator('.live-badge').innerText()).replace(/\D/g, ''))).toBeLessThan(before);

  expect(errors).toEqual([]);
});
