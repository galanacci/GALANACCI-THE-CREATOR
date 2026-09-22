import { test, expect } from "./fixtures/test.mjs";
import {
  STABLE_POSITIONS,
  dragBy,
  openDesktop,
  seedDesktop,
  shortcut,
  storedPosition
} from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop persistence contract");
  await seedDesktop(page);
  await openDesktop(page);
});

test("dragged desktop shortcut position survives a reload", async ({ page }) => {
  const icon = shortcut(page, "PoG.EXE");
  await dragBy(page, icon, 96, 176);

  const saved = await storedPosition(page, "pog-exe");
  expect(saved).not.toEqual(STABLE_POSITIONS["pog-exe"]);

  await page.reload();
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
  expect(await storedPosition(page, "pog-exe")).toEqual(saved);

  const transform = await icon.evaluate((element) => element.style.transform);
  expect(transform).toContain(`${saved.x}px`);
  expect(transform).toContain(`${saved.y}px`);
});

test("passive browser resize does not permanently destroy stored positions", async ({ page }) => {
  const original = { x: 1120, y: 640 };
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: "gtc:desktop-position:pog-exe", value: original });
  await page.reload();
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);

  await page.setViewportSize({ width: 760, height: 600 });
  expect(await storedPosition(page, "pog-exe")).toEqual(original);

  await page.setViewportSize({ width: 1440, height: 900 });

  expect(await storedPosition(page, "pog-exe")).toEqual(original);
});
