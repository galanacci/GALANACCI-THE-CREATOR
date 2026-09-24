import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

async function watchRipple(seed) {
  await seed.evaluate((element) => {
    element.dataset.pulsed = "false";
    element.dataset.maxRadius = element.getAttribute("r") || "0";
    const observer = new MutationObserver(() => {
      const radius = Number(element.getAttribute("r"));
      if (radius > Number(element.dataset.maxRadius)) element.dataset.maxRadius = String(radius);
      if (radius > 0.7) {
        element.dataset.pulsed = "true";
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ["r"] });
  });
}

async function rotationAngle(dots) {
  const transform = await dots.getAttribute("transform");
  return Number(transform?.match(/^rotate\(([-\d.]+)/)?.[1] || 0);
}

function angularDistance(from, to) {
  return (to - from + 360) % 360;
}

test("FIBONACCI.EXE opens from APPS without a watermark and animates after start", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const destination = context.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        }
      }
    });
  });
  await seedDesktop(page);
  await openDesktop(page);

  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const row = folder.locator('[data-label="FIBONACCI.EXE"]');
  await expect(row).toContainText("2024");
  await expect(row).toContainText("An audio visualiser inspired by Fibonacci.");

  if (mobile) await row.tap();
  else await row.dblclick();

  await expect(page.locator("#experiment-frame")).toHaveAttribute("allow", /microphone/);
  await expect(page.locator("#experiment-frame")).toHaveAttribute("src", /experiments\/FIBONACCI\/index\.html$/);
  const frame = page.frameLocator("#experiment-frame");
  await expect(frame.locator("#fibonacci-container circle")).toHaveCount(5000);
  await expect(frame.locator(".watermark, .watermark-container")).toHaveCount(0);

  const waveSeed = frame.locator("#fibonacci-container circle").nth(500);
  const outerSeed = frame.locator("#fibonacci-container circle").nth(4500);
  const dots = frame.locator("#fibonacci-dots");
  const rotationBefore = await dots.getAttribute("transform");
  await watchRipple(waveSeed);
  await watchRipple(outerSeed);
  if (mobile) await frame.getByRole("button", { name: "TAP TO START" }).tap();
  else await frame.getByRole("button", { name: "TAP TO START" }).click();
  await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeHidden();
  await expect(frame.locator("#microphone-status")).toBeEmpty();
  await expect(waveSeed).toHaveAttribute("data-pulsed", "true");
  await expect(outerSeed).toHaveAttribute("data-pulsed", "true");
  await expect.poll(() => dots.getAttribute("transform")).not.toBe(rotationBefore);
  await expect(frame.locator("#fibonacci-container")).toHaveCSS("cursor", "default");
});

test("FIBONACCI.EXE makes loud sounds visibly larger than quiet sounds", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          gain.gain.value = 0.05;
          oscillator.connect(gain);
          gain.connect(destination);
          oscillator.start();
          void context.resume();
          window.testMicrophoneGain = gain;
          return destination.stream;
        }
      }
    });
  });
  await seedDesktop(page);
  await openDesktop(page);
  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const row = folder.locator('[data-label="FIBONACCI.EXE"]');
  if (mobile) await row.tap();
  else await row.dblclick();

  const frame = page.frameLocator("#experiment-frame");
  const innerSeed = frame.locator("#fibonacci-container circle").nth(50);
  const outerSeed = frame.locator("#fibonacci-container circle").nth(4500);
  const dots = frame.locator("#fibonacci-dots");
  await watchRipple(innerSeed);
  await watchRipple(outerSeed);
  if (mobile) await frame.getByRole("button", { name: "TAP TO START" }).tap();
  else await frame.getByRole("button", { name: "TAP TO START" }).click();
  await expect.poll(() => frame.locator("body").evaluate(() => Boolean(window.testMicrophoneGain))).toBe(true);
  await expect(innerSeed).toHaveAttribute("data-pulsed", "true");
  await frame.locator("body").evaluate(() => { window.testMicrophoneGain.gain.value = 0; });
  await page.waitForTimeout(1600); // Let the quiet wave leave the viewport.
  const quietAngle = await rotationAngle(dots);
  await page.waitForTimeout(400);
  const quietRotation = angularDistance(quietAngle, await rotationAngle(dots));
  const quietPeak = Number(await innerSeed.getAttribute("data-max-radius"));
  await innerSeed.evaluate((element) => { element.dataset.maxRadius = "0"; });
  await outerSeed.evaluate((element) => { element.dataset.maxRadius = "0"; });
  await frame.locator("body").evaluate(() => { window.testMicrophoneGain.gain.value = 0.8; });
  await expect.poll(async () => Number(await innerSeed.getAttribute("data-max-radius"))).toBeGreaterThan(quietPeak * 2);
  await page.waitForTimeout(300); // Let the rotation ease up to the louder signal.
  const loudAngle = await rotationAngle(dots);
  await page.waitForTimeout(400);
  const loudRotation = angularDistance(loudAngle, await rotationAngle(dots));
  expect(loudRotation).toBeGreaterThan(quietRotation * 2);
  await frame.locator("body").evaluate(() => { window.testMicrophoneGain.gain.value = 0; });
  await expect.poll(async () => Number(await outerSeed.getAttribute("data-max-radius"))).toBeGreaterThan(0.7);
  const innerPeak = Number(await innerSeed.getAttribute("data-max-radius"));
  const outerPeak = Number(await outerSeed.getAttribute("data-max-radius"));
  expect(innerPeak).toBeGreaterThan(outerPeak * 1.5);
});

for (const unavailable of ["missing API", "denied permission"]) {
  test(`FIBONACCI.EXE keeps animating without microphone: ${unavailable}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile microphone fallback");
    await page.addInitScript((scenario) => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: scenario === "missing API"
          ? undefined
          : { getUserMedia: async () => { throw new DOMException("Denied", "NotAllowedError"); } }
      });
    }, unavailable);
    await seedDesktop(page);
    await openDesktop(page);
    const folder = await openFolder(page, "APPS", true);
    await folder.locator('[data-label="FIBONACCI.EXE"]').tap();

    const frame = page.frameLocator("#experiment-frame");
    const waveSeed = frame.locator("#fibonacci-container circle").nth(500);
    await watchRipple(waveSeed);
    let dialogs = 0;
    page.on("dialog", async (dialog) => { dialogs += 1; await dialog.dismiss(); });
    await frame.getByRole("button", { name: "TAP TO START" }).tap();

    await expect(frame.locator("#microphone-status")).toContainText("VISUAL PREVIEW");
    await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeHidden();
    await expect(waveSeed).toHaveAttribute("data-pulsed", "true");
    expect(dialogs).toBe(0);
  });
}

test("FIBONACCI.EXE colour choices update the visual without starting playback", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);
  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const row = folder.locator('[data-label="FIBONACCI.EXE"]');
  if (mobile) await row.tap();
  else await row.dblclick();

  const frame = page.frameLocator("#experiment-frame");
  const colour = frame.getByRole("button", { name: "COLOUR" });
  if (mobile) await colour.tap();
  else await colour.click();
  await expect(colour).toHaveAttribute("aria-expanded", "true");
  const prism = frame.getByRole("button", { name: "PRISM" });
  if (mobile) await prism.tap();
  else await prism.click();
  await expect(frame.locator('[data-palette="prism"]')).toHaveAttribute("aria-pressed", "true");
  await expect(frame.locator("#fibonacci-container circle").nth(100)).toHaveAttribute("fill", /hsl\(/);
  await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeVisible();
});

test("FIBONACCI.EXE fullscreen button enters and exits without starting or pausing audio", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);
  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const row = folder.locator('[data-label="FIBONACCI.EXE"]');
  if (mobile) await row.tap();
  else await row.dblclick();

  const frame = page.frameLocator("#experiment-frame");
  const colour = frame.getByRole("button", { name: "COLOUR" });
  if (mobile) await colour.tap();
  else await colour.click();
  await expect(colour).toHaveAttribute("aria-expanded", "true");
  const fullscreen = frame.getByRole("button", { name: "Enter fullscreen" });
  await expect(fullscreen).toBeVisible();
  if (mobile) await fullscreen.tap();
  else await fullscreen.click();

  const exit = frame.getByRole("button", { name: "Exit fullscreen" });
  await expect(exit).toHaveAttribute("aria-pressed", "true");
  await expect(frame.locator("#palette-control")).toBeHidden();
  await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeVisible();
  if (mobile) await exit.tap();
  else await exit.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  await expect(colour).toBeVisible();
  await expect(colour).toHaveAttribute("aria-expanded", "false");
});

test("FIBONACCI.EXE expands within the OS when native fullscreen is unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile fullscreen fallback");
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: undefined });
    Object.defineProperty(Element.prototype, "webkitRequestFullscreen", { configurable: true, value: undefined });
  });
  await seedDesktop(page);
  await openDesktop(page);
  const folder = await openFolder(page, "APPS", true);
  await folder.locator('[data-label="FIBONACCI.EXE"]').tap();

  const appWindow = page.locator("#experiment-window");
  const frame = page.frameLocator("#experiment-frame");
  await frame.getByRole("button", { name: "COLOUR" }).tap();
  await frame.getByRole("button", { name: "Enter fullscreen" }).tap();
  await expect(appWindow).toHaveClass(/is-fibonacci-expanded/);
  await expect(appWindow.locator(".experiment-window__chrome")).toBeHidden();
  await expect(frame.locator("#palette-control")).toBeHidden();
  await frame.getByRole("button", { name: "Exit fullscreen" }).tap();
  await expect(appWindow).not.toHaveClass(/is-fibonacci-expanded/);
  await expect(appWindow.locator(".experiment-window__chrome")).toBeVisible();
  await expect(frame.getByRole("button", { name: "COLOUR" })).toBeVisible();
});
