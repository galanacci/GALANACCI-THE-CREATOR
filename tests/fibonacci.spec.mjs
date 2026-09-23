import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

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

  const firstSeed = frame.locator("#fibonacci-container circle").first();
  const before = await firstSeed.getAttribute("cx");
  if (mobile) await frame.getByRole("button", { name: "TAP TO START" }).tap();
  else await frame.getByRole("button", { name: "TAP TO START" }).click();
  await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeHidden();
  await expect(frame.locator("#microphone-status")).toBeEmpty();
  await expect.poll(() => firstSeed.getAttribute("cx")).not.toBe(before);
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
    const firstSeed = frame.locator("#fibonacci-container circle").first();
    const before = await firstSeed.getAttribute("cx");
    let dialogs = 0;
    page.on("dialog", async (dialog) => { dialogs += 1; await dialog.dismiss(); });
    await frame.getByRole("button", { name: "TAP TO START" }).tap();

    await expect(frame.locator("#microphone-status")).toContainText("VISUAL PREVIEW");
    await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeHidden();
    await expect.poll(() => firstSeed.getAttribute("cx")).not.toBe(before);
    expect(dialogs).toBe(0);
  });
}

test("FIBONACCI.EXE fullscreen button enters and exits without starting or pausing audio", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);
  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const row = folder.locator('[data-label="FIBONACCI.EXE"]');
  if (mobile) await row.tap();
  else await row.dblclick();

  const frame = page.frameLocator("#experiment-frame");
  const fullscreen = frame.getByRole("button", { name: "Enter fullscreen" });
  await expect(fullscreen).toBeVisible();
  if (mobile) await fullscreen.tap();
  else await fullscreen.click();

  const exit = frame.getByRole("button", { name: "Exit fullscreen" });
  await expect(exit).toHaveAttribute("aria-pressed", "true");
  await expect(frame.getByRole("button", { name: "TAP TO START" })).toBeVisible();
  if (mobile) await exit.tap();
  else await exit.click();
  await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
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
  await frame.getByRole("button", { name: "Enter fullscreen" }).tap();
  await expect(appWindow).toHaveClass(/is-fibonacci-expanded/);
  await expect(appWindow.locator(".experiment-window__chrome")).toBeHidden();
  await frame.getByRole("button", { name: "Exit fullscreen" }).tap();
  await expect(appWindow).not.toHaveClass(/is-fibonacci-expanded/);
  await expect(appWindow.locator(".experiment-window__chrome")).toBeVisible();
});
