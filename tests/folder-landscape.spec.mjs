import { test, expect } from "./fixtures/test.mjs";
import { dragBy, openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

for (const device of [
  { name: "phone", width: 844, height: 390 },
  { name: "tablet", width: 1024, height: 768 }
]) {
  for (const name of ["APPS", "SS"]) {
    test(`${device.name} landscape ${name} folder keeps its list and controls usable`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "mobile-chromium", "Touch landscape layout");
      await page.setViewportSize({ width: device.width, height: device.height });
      await seedDesktop(page);
      await openDesktop(page);
      const folder = await openFolder(page, name, true);
      const body = folder.locator(".app-folder-body");
      const toolbar = folder.locator(".app-folder-toolbar");
      const frame = await folder.boundingBox();
      const list = await body.boundingBox();
      const controls = await toolbar.boundingBox();

      expect(frame.x).toBeGreaterThanOrEqual(8);
      expect(frame.width).toBeLessThanOrEqual(600);
      expect(frame.x).toBeGreaterThanOrEqual(40);
      expect(frame.y).toBeGreaterThanOrEqual(8);
      expect(frame.x + frame.width).toBeLessThanOrEqual(device.width - 8);
      expect(frame.y + frame.height).toBeLessThanOrEqual(device.height - 8);
      expect(list.height).toBeGreaterThanOrEqual(110);
      expect(controls.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
      expect(controls.y + controls.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      await expect(folder.getByRole("button", { name: new RegExp(`Close ${name}`) })).toBeVisible();
      await expect(folder.locator(".app-list__row").first()).toBeInViewport();

      const rowOverflow = await body.evaluate((node) => node.scrollWidth - node.clientWidth);
      expect(rowOverflow).toBeLessThanOrEqual(1);
      await expect(page).toHaveScreenshot(`${device.name}-${name.toLowerCase()}-landscape.png`);
    });
  }
}

test("a dragged folder stays reachable after rotating to landscape", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Touch orientation change");
  await seedDesktop(page);
  await openDesktop(page);
  const folder = await openFolder(page, "SS", true);
  await dragBy(page, folder.locator(".folder-window__chrome"), 0, 120);
  await page.setViewportSize({ width: 844, height: 390 });

  const frame = await folder.boundingBox();
  expect(frame.x).toBeGreaterThanOrEqual(8);
  expect(frame.y).toBeGreaterThanOrEqual(8);
  expect(frame.x + frame.width).toBeLessThanOrEqual(836);
  expect(frame.y + frame.height).toBeLessThanOrEqual(382);
  await folder.getByRole("button", { name: "Close SS folder" }).tap();
  await expect(folder).toBeHidden();
});
