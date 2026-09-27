import { test, expect } from "./fixtures/test.mjs";
import { openDesktop } from "./helpers/desktop.mjs";

test("fresh desktop keeps the shortcuts bottom-left and poster top-right", async ({ page }, testInfo) => {
  await openDesktop(page);

  const viewport = page.viewportSize();
  const shortcuts = await page.locator(".desktop-shortcut").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON())
  );
  const poster = await page.locator("[data-desktop-poster]").boundingBox();

  expect(shortcuts).toHaveLength(3);
  expect(shortcuts[0].x).toBeLessThan(viewport.width * .2);
  expect(shortcuts[0].y).toBeGreaterThan(viewport.height * .4);
  expect(shortcuts[0].bottom).toBeLessThan(shortcuts[1].top);
  expect(shortcuts[1].bottom).toBeLessThan(shortcuts[2].top);
  expect(poster.x + poster.width / 2).toBeGreaterThan(viewport.width * .55);
  expect(poster.y).toBeLessThan(viewport.height * .2);
  expect(await page.evaluate(() => localStorage.getItem("gtc:desktop-position:pog-exe"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("gtc:desktop-poster-position"))).toBeNull();

  await expect(page).toHaveScreenshot(`default-${testInfo.project.name}.png`);
});

test("old visitor positions cannot override the published layout", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("gtc:legacy-default-seed") === "1") return;
    const legacy = {
      "pog-exe": { x: 32, y: 32 },
      "experiments-folder": { x: 32, y: 160 },
      "ss-folder": { x: 32, y: 288 }
    };
    for (const [id, position] of Object.entries(legacy)) {
      localStorage.setItem(`gtc:desktop-position:${id}`, JSON.stringify(position));
    }
    sessionStorage.setItem("gtc:legacy-default-seed", "1");
  });
  await openDesktop(page);
  const pog = await page.locator('[data-app-id="pog-exe"]').boundingBox();
  expect(pog.y).toBeGreaterThan(page.viewportSize().height * .4);
  expect(await page.evaluate(() => localStorage.getItem("gtc:desktop-position:pog-exe")))
    .toBe(JSON.stringify({ x: 32, y: 32 }));
});
