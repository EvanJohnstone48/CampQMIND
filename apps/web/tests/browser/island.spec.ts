import { expect, test } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { demoSnapshot } from '../../src/net/demo';
import { walkHeight } from '../../src/features/world/landscape';
import { ACTIVE_BOUNDS, OVERVIEW } from '../../src/features/world/camera';

test('island renders, a resident can be selected, playback pauses, and night arrives', async ({ page }) => {
  // This full walkthrough includes audio, tracking, inspection and a real clock
  // transition; software WebGL takes longer than the individual scene checks.
  test.setTimeout(75000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Motherlode', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.population strong')).toHaveText('100');
  await expect(page.getByRole('combobox', { name: 'Select a miner' }).locator('option')).toHaveCount(101);
  await expect(page.getByText('The valley couldn’t open')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause world' }).click();
  const time = await page.getByRole('progressbar').getAttribute('aria-valuenow');
  await page.waitForTimeout(600);
  expect(await page.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(time);
  await page.screenshot({ path: 'test-results/island-day.png' });
  // Project a stationary copper worker into the fixed demo overview, rather than
  // guessing screen coordinates for a resident that is still walking at startup.
  const resident = demoSnapshot((Number(time) - 8) * 10).miners[11];
  const camera = new PerspectiveCamera(OVERVIEW.fov, 1440 / 900, 0.1, 650);
  const pose = await page.locator('canvas').getAttribute('data-camera-position');
  const target = await page.locator('canvas').getAttribute('data-camera-target');
  camera.position.fromArray(pose!.split(',').map(Number)); camera.lookAt(new Vector3().fromArray(target!.split(',').map(Number))); camera.updateMatrixWorld();
  const screen = new Vector3(resident.position[0], walkHeight(...resident.position) + 0.67, resident.position[1] + 0.25).project(camera);
  await page.mouse.click((screen.x + 1) * 720, (1 - screen.y) * 450);
  await expect(page.getByRole('complementary', { name: 'Selected miner' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Select a miner' }).selectOption('demo-0');
  await expect(page.getByRole('complementary', { name: 'Selected miner' })).toContainText('Ada');
  await expect(page.getByRole('complementary', { name: 'Selected miner' })).toContainText('Miner');
  await page.getByRole('button', { name: 'Take a closer look' }).click();
  await page.waitForTimeout(1100);
  await page.screenshot({ path: 'test-results/island-resident.png' });
  await page.getByRole('button', { name: 'Show journey' }).click();
  await page.getByRole('button', { name: 'Follow this miner' }).click();
  await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume world' }).click();
  await page.mouse.move(720, 450); await page.mouse.down();
  await page.mouse.move(780, 470, { steps: 6 }); await page.mouse.up();
  await page.mouse.wheel(0, -200);
  await expect(page.getByRole('button', { name: 'Stop following', exact: true })).toBeVisible();
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Pause world' }).click();
  await page.waitForTimeout(1800);
  const trackedTime = Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'));
  const trackedMiner = demoSnapshot((trackedTime - 8) * 10).miners[0];
  const tracked = (await page.locator('canvas').getAttribute('data-camera-target'))!.split(',').map(Number);
  expect(Math.hypot(tracked[0] - trackedMiner.position[0], tracked[2] - trackedMiner.position[1])).toBeLessThan(0.8);
  await page.screenshot({ path: 'test-results/island-follow.png' });
  await page.getByRole('button', { name: 'Stop following', exact: true }).click();
  await page.waitForTimeout(600);
  const stopped = (await page.locator('canvas').getAttribute('data-camera-target'))!.split(',').map(Number);
  expect(Math.hypot(stopped[0] - tracked[0], stopped[2] - tracked[2])).toBeLessThan(0.25);
  await page.getByRole('button', { name: 'Visit their chalet' }).click();
  await expect(page.getByRole('complementary', { name: 'Selected building' })).toContainText('5 beds');
  await expect(page.getByRole('complementary', { name: 'Selected building' })).toContainText('5 residents');
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Selected miner' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.getByRole('combobox', { name: 'Weather', exact: true }).selectOption('clear');
  await page.getByRole('button', { name: '12×', exact: true }).click();
  await page.getByRole('button', { name: 'Resume world' }).click();
  await expect(page.locator('main.night')).toBeVisible({ timeout: 18000 });
  await page.getByRole('button', { name: 'Pause world' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/island-night.png' });
  expect(errors).toEqual([]);
});

test('weather, building selection and bounded camera remain interactive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause world' }).click();
  await expect(page.getByRole('combobox', { name: 'Select a chalet' }).locator('option')).toHaveCount(25);
  await page.getByRole('combobox', { name: 'Select a chalet' }).selectOption('home-23');
  await expect(page.getByRole('complementary', { name: 'Selected building' })).toContainText('Alder chalet 4');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/island-chalet.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Riverside works' }).click();
  await expect(page.getByRole('complementary', { name: 'Selected building' })).toContainText('28 work spaces');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/island-foundry.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset camera' }).click();
  for (const [value, label] of [['rain', 'Passing shower'], ['snow', 'Alpine flurries'], ['fog', 'Valley mist']]) {
    await page.getByRole('combobox', { name: 'Weather', exact: true }).selectOption(value);
    await expect(page.locator('.weather-status')).toHaveText(label);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `test-results/island-${value}.png` });
  }
  await page.getByRole('combobox', { name: 'Weather', exact: true }).selectOption('clear');
  for (const end of [[1350, 650], [350, 800], [1000, 150]]) {
    await page.mouse.move(700, 450); await page.mouse.down({ button: 'right' });
    await page.mouse.move(end[0], end[1], { steps: 10 }); await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 1800); await page.waitForTimeout(400);
    for (const attribute of ['data-camera-position', 'data-camera-target']) {
      const coordinates = (await page.locator('canvas').getAttribute(attribute))!.split(',').map(Number);
      expect(coordinates[0]).toBeGreaterThanOrEqual(ACTIVE_BOUNDS.minX);
      expect(coordinates[0]).toBeLessThanOrEqual(ACTIVE_BOUNDS.maxX);
      expect(coordinates[2]).toBeGreaterThanOrEqual(ACTIVE_BOUNDS.minZ);
      expect(coordinates[2]).toBeLessThanOrEqual(ACTIVE_BOUNDS.maxZ);
    }
  }
  await page.screenshot({ path: 'test-results/island-boundary.png' });
  expect(errors).toEqual([]);
});

test('mobile view keeps controls on-screen, and places can be explored', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause world' }).click();
  await page.getByRole('button', { name: 'Goldpeak mine' }).click();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await page.waitForTimeout(1100);
  for (const name of ['Labels', 'Reset camera', 'Resume world']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeInViewport();
  }
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(width.content).toBe(width.viewport);
  await page.screenshot({ path: 'test-results/island-mobile.png' });
});

test('the town can be viewed from every side and both mines stay accessible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Pause world' }).click();
  await page.getByRole('combobox', { name: 'Weather', exact: true }).selectOption('clear');
  for (let side = 0; side < 4; side++) {
    await page.waitForTimeout(650);
    await page.screenshot({ path: `test-results/valley-surroundings-${side}.png` });
    await page.mouse.move(720, 450); await page.mouse.down();
    await page.mouse.move(945, 450, { steps: 12 }); await page.mouse.up();
  }
  for (const name of ['Copper ridge', 'Goldpeak mine']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Selected building' })).toContainText(name);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/valley-${name === 'Copper ridge' ? 'copper' : 'gold'}-entrances.png` });
  }
  expect(errors).toEqual([]);
});
