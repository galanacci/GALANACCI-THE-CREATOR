import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test("desktop info opens with the exact copy and usable links", async ({ page }) => {
  await seedDesktop(page);
  await openDesktop(page);

  const trigger = page.getByRole("button", { name: "Open information and contact details" });
  const dialog = page.getByRole("dialog", { name: "INFORMATION" });
  await expect(trigger).toBeVisible();
  await expect(dialog).toBeHidden();
  await trigger.click();

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "REPS IN DA GYM, REPS IN DA STUDIO" })).toBeVisible();
  await expect(dialog.locator(".desktop-info-window__bio")).toHaveText("I’m GALANACCI. I come from architecture, but my work now moves across fashion, art, storytelling and world-building. I’m building PIONEERS OF GREATNESS; a fashion brand rooted in boxing culture and the pursuit of greatness. GALANACCI THE CREATOR is the identity behind the work, and this OS documents the process, experiments and evolution behind the journey.");
  await expect(dialog.getByText("MANILA-BORN, LONDON-BASED")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "@PIONEERSOFGREATNESS" }))
    .toHaveAttribute("href", "https://www.instagram.com/pioneersofgreatness/");
  await expect(dialog.getByRole("link", { name: "Email enquiries@galanacci.com" }))
    .toHaveAttribute("href", "mailto:enquiries@galanacci.com");
  await expect(dialog.getByRole("link", { name: "Instagram @galanacci" }))
    .toHaveAttribute("href", "https://www.instagram.com/galanacci/");
  await expect(dialog.getByRole("link", { name: "TikTok @galanacci" }))
    .toHaveAttribute("href", "https://www.tiktok.com/@galanacci");
  await expect(dialog.locator(".desktop-info-window__socials svg")).toHaveCount(3);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("desktop info stays within the viewport and closes with its window control", async ({ page }) => {
  await seedDesktop(page);
  await openDesktop(page);
  await page.locator("#desktop-info-trigger").click();

  const dialog = page.locator(".desktop-info-window");
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);

  await dialog.getByRole("button", { name: "Close information" }).click();
  await expect(page.locator("#desktop-info-layer")).toBeHidden();
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
});

test("info, poster, and folder windows share the hard-edged OS shadow", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);

  await page.locator("#desktop-info-trigger").click();
  const infoShadow = await page.locator(".desktop-info-window").evaluate((node) => getComputedStyle(node).boxShadow);
  expect(infoShadow).not.toBe("none");
  await page.locator("[data-close-desktop-info]").click();

  const poster = page.locator(".desktop-poster");
  await expect(poster).toHaveCSS("box-shadow", infoShadow);
  await expect(poster).toHaveCSS("filter", "none");

  const folder = await openFolder(page, "APPS", testInfo.project.name === "mobile-chromium");
  await expect(folder).toHaveCSS("box-shadow", infoShadow);
});

test("information window visual baseline", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);
  await page.locator("#desktop-info-trigger").click();
  await expect(page.locator("#desktop-info-layer")).toBeVisible();
  const name = testInfo.project.name === "mobile-chromium"
    ? "mobile-information.png"
    : "desktop-information.png";
  await expect(page).toHaveScreenshot(name);
});
