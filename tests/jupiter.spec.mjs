import { test, expect } from './fixtures/test.mjs';
import { openDesktop, openFolder } from './helpers/desktop.mjs';

test('JUPITER.EXE opens from APPS and its visual keeps moving through colour changes', async ({ page }, testInfo) => {
  await openDesktop(page);
  const folder = await openFolder(page, 'APPS', testInfo.project.name === 'mobile-chromium');
  const entry = folder.locator('[data-label="JUPITER.EXE"]');
  await expect(entry).toContainText('2026');
  if (testInfo.project.name === 'mobile-chromium') await entry.tap();
  else await entry.dblclick();
  await expect(page.locator('#experiment-window-title')).toHaveText('JUPITER.EXE');

  const app = page.frameLocator('#experiment-frame');
  const video = app.locator('#source-video');
  await expect(app.locator('#visual')).toHaveClass(/is-ready/, { timeout: 12_000 });
  await expect.poll(() => video.evaluate((element) => [element.videoWidth, element.videoHeight])).toEqual([1080, 1920]);
  await expect.poll(() => video.evaluate((element) => element.currentTime), { timeout: 12_000 }).toBeGreaterThan(0.1);
  const firstTime = await video.evaluate((element) => element.currentTime);
  await video.evaluate((element) => element.pause());
  const originalFrame = await app.locator('#visual').screenshot();
  await app.locator('#colour-toggle').click();
  const scale = app.locator('#effect-scale');
  await scale.evaluate((element) => {
    element.value = '50';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(app.locator('#scale-value')).toHaveText('50%');
  await page.waitForTimeout(100);
  const softenedFrame = await app.locator('#visual').screenshot();
  expect(softenedFrame.equals(originalFrame)).toBe(false);
  await scale.evaluate((element) => {
    element.value = '200';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(app.locator('#scale-value')).toHaveText('200%');
  await page.waitForTimeout(100);
  const enlargedFrame = await app.locator('#visual').screenshot();
  expect(enlargedFrame.equals(originalFrame)).toBe(false);
  expect(enlargedFrame.equals(softenedFrame)).toBe(false);
  await app.locator('#scale-reset').click();
  await expect(scale).toHaveValue('100');
  await app.locator('#palette').selectOption('electric');
  await expect(app.locator('#colour-stops')).toBeHidden();
  await page.waitForTimeout(100);
  const recolouredFrame = await app.locator('#visual').screenshot();
  expect(recolouredFrame.equals(originalFrame)).toBe(false);
  await app.locator('#palette').selectOption('custom');
  await expect(app.locator('#colour-stops')).toBeVisible();
  await app.locator('[data-stop="2"]').fill('#00ff88');
  await video.evaluate((element) => element.play());
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(firstTime);
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('loop', true);
});

test('JUPITER.EXE fullscreen shows an icon and hides the controls', async ({ page }) => {
  await page.goto('/experiments/JUPITER/index.html');
  await expect(page.locator('#visual')).toHaveClass(/is-ready/, { timeout: 12_000 });
  await expect(page.locator('.viewer__name')).toHaveCount(0);
  await expect(page.locator('#playback-status')).toHaveClass(/sr-only/);
  await expect(page.locator('#fullscreen svg')).toBeVisible();
  await page.locator('#colour-toggle').click();
  await expect(page.locator('#colour-panel')).toBeVisible();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#colour-toggle')).toBeHidden();
  await expect(page.locator('#colour-panel')).toBeHidden();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#colour-toggle')).toBeVisible();
});

test('JUPITER.EXE switches visuals without losing colour and detail settings', async ({ page }) => {
  await page.goto('/experiments/JUPITER/index.html');
  const video = page.locator('#source-video');
  const canvas = page.locator('#visual');
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 12_000 });
  await page.locator('#colour-toggle').click();
  await page.locator('#palette').selectOption('electric');
  await page.locator('#effect-scale').fill('150');
  await page.locator('#visual-source').selectOption('vessel-red');
  await expect.poll(() => video.evaluate((element) => new URL(element.currentSrc).pathname)).toMatch(/\/vessel-red\.mp4$/);
  await expect.poll(() => video.evaluate((element) => [element.videoWidth, element.videoHeight])).toEqual([1080, 1920]);
  await expect.poll(() => video.evaluate((element) => element.duration)).toBeGreaterThan(16);
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 12_000 });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
  await expect(page.locator('#palette')).toHaveValue('electric');
  await expect(page.locator('#effect-scale')).toHaveValue('150');
  await expect(page.locator('#playback-status')).toHaveText('VESSEL RED / LOOP');
  await video.evaluate((element) => element.pause());
  const electricFrame = await canvas.screenshot();
  await page.locator('#palette').selectOption('original');
  await page.waitForTimeout(100);
  const originalFrame = await canvas.screenshot();
  expect(originalFrame.equals(electricFrame)).toBe(false);
  await video.evaluate((element) => { element.currentTime = element.duration - 0.25; return element.play(); });
  await expect.poll(() => video.evaluate((element) => element.currentTime), { timeout: 5_000 }).toBeLessThan(1);
  await page.locator('#visual-source').selectOption('coral-burn');
  await expect.poll(() => video.evaluate((element) => new URL(element.currentSrc).pathname)).toMatch(/\/coral-burn\.mp4$/);
  await expect(canvas).toHaveClass(/is-ready/, { timeout: 12_000 });
  await expect(page.locator('#playback-status')).toHaveText('CORAL BURN / LOOP');
});

test('JUPITER.EXE wraps its loop without leaving a frozen frame', async ({ page }) => {
  await page.goto('/experiments/JUPITER/index.html');
  const video = page.locator('#source-video');
  await expect(page.locator('#visual')).toHaveClass(/is-ready/, { timeout: 12_000 });
  await video.evaluate((element) => { element.currentTime = element.duration - 0.25; });
  await expect.poll(() => video.evaluate((element) => element.currentTime), { timeout: 5_000 }).toBeLessThan(1);
  await expect(page.locator('#visual')).toHaveClass(/is-ready/);
});

test('a normal touch resumes the visual after playback pauses', async ({ page }, testInfo) => {
  await page.goto('/experiments/JUPITER/index.html');
  await expect(page.locator('#visual')).toHaveClass(/is-ready/, { timeout: 12_000 });
  await page.locator('#source-video').evaluate((element) => element.pause());
  await expect(page.locator('#playback-status')).toHaveText('TOUCH TO PLAY');
  if (testInfo.project.name === 'mobile-chromium') await page.locator('.viewer').tap({ position: { x: 100, y: 150 } });
  else await page.locator('.viewer').click({ position: { x: 100, y: 150 } });
  await expect.poll(() => page.locator('#source-video').evaluate((element) => element.currentTime), { timeout: 12_000 }).toBeGreaterThan(0.1);
  await expect(page.locator('#visual')).toHaveClass(/is-ready/);
});
