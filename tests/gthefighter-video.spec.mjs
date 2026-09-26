import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test.setTimeout(90_000);

async function openFighter(page) {
  await page.goto("/SS/GTHEFIGHTER/index.html");
  await expect(page.locator(".experience")).toHaveClass(/is-ready/, {
    timeout: 15_000
  });
}

async function videoState(page) {
  return page.evaluate(() => {
    const video = document.querySelector("#fighter-video");
    return {
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      networkState: video.networkState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight
    };
  });
}

test("artwork video advances and visibly updates the 3D screen", async ({ page }) => {
  await openFighter(page);

  const before = await videoState(page);
  const canvas = page.locator("#frame-viewer");
  const clip = await canvas.boundingBox();
  const firstFrame = await page.screenshot({ clip });
  await page.waitForTimeout(1_200);
  const after = await videoState(page);
  const secondFrame = await page.screenshot({ clip });

  expect(before.readyState).toBeGreaterThanOrEqual(2);
  expect(before.videoWidth).toBe(608);
  expect(before.videoHeight).toBe(1080);
  expect(after.paused).toBe(false);
  expect(after.currentTime).toBeGreaterThan(before.currentTime + .2);
  expect(Buffer.compare(firstFrame, secondFrame)).not.toBe(0);
});

test("artwork slider projects stills and returns to the motion artwork", async ({ page }) => {
  await openFighter(page);

  const canvas = page.locator("#frame-viewer");
  const clip = await canvas.boundingBox();
  const motionFrame = await page.screenshot({ clip });
  const slider = page.locator("#artwork-slider");

  await slider.evaluate((element) => {
    element.value = "30";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#artwork-current")).toHaveText("030");
  await expect.poll(async () => (await videoState(page)).paused).toBe(true);
  await page.waitForTimeout(700);

  const stillFrame = await page.screenshot({ clip });
  expect(Buffer.compare(motionFrame, stillFrame)).not.toBe(0);

  await slider.evaluate((element) => {
    element.value = "60";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#artwork-current")).toHaveText("060");
  await expect(page.locator("#artwork-total")).toHaveText("060");

  await slider.evaluate((element) => {
    element.value = "1";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#artwork-current")).toHaveText("001");
  await expect.poll(async () => (await videoState(page)).paused).toBe(false);
});

test("first pointer gesture resumes inline artwork playback", async ({ page }, testInfo) => {
  await openFighter(page);

  const paused = await page.evaluate(() => {
    const video = document.querySelector("#fighter-video");
    video.pause();
    return video.paused;
  });
  expect(paused).toBe(true);

  if (testInfo.project.name === "mobile-chromium") {
    await page.touchscreen.tap(12, 120);
  } else {
    await page.mouse.click(12, 120);
  }

  await expect.poll(async () => (await videoState(page)).paused).toBe(false);
});

test("OrbitControls interaction does not stop artwork playback", async ({ page }) => {
  await openFighter(page);
  const canvas = page.locator("#frame-viewer");
  const box = await canvas.boundingBox();
  const before = await videoState(page);

  await page.mouse.move(box.x + box.width * .42, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .55, {
    steps: 5
  });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const after = await videoState(page);
  expect(after.paused).toBe(false);
  expect(after.currentTime).toBeGreaterThan(before.currentTime + .25);
});

test("artwork restarts after reload and loops without freezing", async ({ page }) => {
  await openFighter(page);
  await page.reload();
  await expect(page.locator(".experience")).toHaveClass(/is-ready/, {
    timeout: 15_000
  });

  const before = await videoState(page);
  expect(before.paused).toBe(false);

  await page.evaluate(() => {
    const video = document.querySelector("#fighter-video");
    video.currentTime = Math.max(0, video.duration - .15);
  });
  await page.waitForTimeout(700);

  const after = await videoState(page);
  expect(after.paused).toBe(false);
  expect(after.currentTime).toBeLessThan(1.5);
});

test("iframe playback starts again after closing and reopening the app", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile-chromium";
  await seedDesktop(page);
  await openDesktop(page);
  const folder = await openFolder(page, "SS", isMobile);
  const row = folder.locator('[data-label="GTHEFIGHTER.EXE"]');
  const appWindow = page.locator("#experiment-window");
  const appFrame = page.frameLocator("#experiment-frame");

  const launch = async () => {
    if (isMobile) await row.dispatchEvent("click");
    else await row.dblclick();
    await expect(appWindow).toBeVisible();
    await expect(appFrame.locator(".experience")).toHaveClass(/is-ready/, {
      timeout: 20_000
    });
  };

  await launch();
  await appWindow.getByRole("button", { name: "Close app" }).click();
  await expect(appWindow).toBeHidden();
  await expect(page.locator("#experiment-frame")).toHaveAttribute("data-app-url", "about:blank");
  await expect(folder).toBeVisible();

  await launch();
  const before = await appFrame.locator("#fighter-video").evaluate((video) => video.currentTime);
  await page.waitForTimeout(700);
  const after = await appFrame.locator("#fighter-video").evaluate((video) => ({
    currentTime: video.currentTime,
    paused: video.paused
  }));
  expect(after.paused).toBe(false);
  expect(after.currentTime).toBeGreaterThan(before + .05);
});

test("history restoration resumes rendering and video playback", async ({ page }) => {
  await openFighter(page);
  await page.goto("/?entry=pog");
  await page.goBack();
  await expect(page.locator(".experience")).toHaveClass(/is-ready/, {
    timeout: 20_000
  });

  const before = await videoState(page);
  await page.waitForTimeout(700);
  const after = await videoState(page);
  expect(after.paused).toBe(false);
  expect(after.currentTime).toBeGreaterThan(before.currentTime + .05);
});
