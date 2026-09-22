import { test, expect } from "./fixtures/test.mjs";
import {
  STABLE_POSITIONS,
  dragBy,
  openDesktop,
  seedDesktop,
  shortcut,
  storedPosition
} from "./helpers/desktop.mjs";

const rectanglesOverlap = (first, second) =>
  first.x < second.x + second.width
  && first.x + first.width > second.x
  && first.y < second.y + second.height
  && first.y + first.height > second.y;

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

test("desktop shortcuts settle on an unoccupied grid position", async ({ page }) => {
  const pog = shortcut(page, "PoG.EXE");
  const apps = shortcut(page, "APPS");
  const pogBefore = await pog.boundingBox();
  const appsBefore = await apps.boundingBox();

  if (!pogBefore || !appsBefore) {
    throw new Error("Desktop shortcuts must be visible before dragging");
  }

  const startX = pogBefore.x + pogBefore.width / 2;
  const startY = pogBefore.y + pogBefore.height / 2;
  const targetX = appsBefore.x + appsBefore.width / 2;
  const targetY = appsBefore.y + appsBefore.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });

  const pogDuringDrag = await pog.boundingBox();
  const appsDuringDrag = await apps.boundingBox();

  if (!pogDuringDrag || !appsDuringDrag) {
    throw new Error("Desktop shortcuts must remain visible while dragging");
  }

  expect(rectanglesOverlap(pogDuringDrag, appsDuringDrag)).toBe(false);

  await page.mouse.up();

  const pogAfter = await pog.boundingBox();
  const appsAfter = await apps.boundingBox();

  if (!pogAfter || !appsAfter) {
    throw new Error("Desktop shortcuts must remain visible after dragging");
  }

  expect(rectanglesOverlap(pogAfter, appsAfter)).toBe(false);

  const saved = await storedPosition(page, "pog-exe");
  expect(saved.x % 16).toBe(0);
  expect(saved.y % 16).toBe(0);

  await page.reload();
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
  expect(await storedPosition(page, "pog-exe")).toEqual(saved);
});

test("overlapping legacy positions are repaired once on load", async ({ page }) => {
  const collision = { x: 224, y: 32 };

  await page.evaluate((position) => {
    localStorage.setItem(
      "gtc:desktop-position:pog-exe",
      JSON.stringify(position)
    );
    localStorage.setItem(
      "gtc:desktop-position:experiments-folder",
      JSON.stringify(position)
    );
  }, collision);

  await page.reload();
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);

  const pogPosition = await storedPosition(page, "pog-exe");
  const appsPosition = await storedPosition(page, "experiments-folder");

  expect(pogPosition).not.toEqual(appsPosition);
  expect(appsPosition.x % 16).toBe(0);
  expect(appsPosition.y % 16).toBe(0);
});
