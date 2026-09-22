import { expect } from "../fixtures/test.mjs";

export const POSITION_PREFIX = "gtc:desktop-position:";

export const STABLE_POSITIONS = Object.freeze({
  "pog-exe": { x: 32, y: 32 },
  "experiments-folder": { x: 224, y: 32 },
  "ss-folder": { x: 416, y: 32 }
});

export async function seedDesktop(page, positions = STABLE_POSITIONS) {
  await page.addInitScript((seed) => {
    const marker = "gtc:test-position-seed";
    if (sessionStorage.getItem(marker) === "1") return;

    for (const [id, position] of Object.entries(seed)) {
      localStorage.setItem(
        `gtc:desktop-position:${id}`,
        JSON.stringify(position)
      );
    }

    sessionStorage.setItem(marker, "1");
  }, positions);
}

export async function openDesktop(page, { entryFromPog = true } = {}) {
  await page.goto(entryFromPog ? "/?entry=pog" : "/");
  await expect(page.locator("#gtc-desktop")).toBeVisible();
  await expect(page.locator(".desktop-shortcut")).toHaveCount(3);
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
}

export function shortcut(page, label) {
  return page.locator(".desktop-shortcut", { hasText: label });
}

export async function openFolder(page, label, isMobile) {
  const icon = shortcut(page, label);

  if (isMobile) {
    await icon.tap();
  } else {
    await icon.dblclick();
  }

  const target = label === "APPS" ? "apps" : "ss";
  const folder = page.locator(`[data-folder-window="${target}"]`);
  await expect(folder).toBeVisible();
  await expect(folder).toHaveAttribute("aria-hidden", "false");
  return folder;
}

export async function dragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Cannot drag an element without a bounding box");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 8 });
  await page.mouse.up();
}

export async function storedPosition(page, id) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    `${POSITION_PREFIX}${id}`
  );
}
