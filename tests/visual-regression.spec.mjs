import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }) => {
  await seedDesktop(page);
});

test("WELCOME dialog visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop visual baseline");

  await openDesktop(page, { entryFromPog: false });
  await expect(page.locator("#gtc-os-boot")).toHaveCount(0, { timeout: 6_000 });
  await expect(page.getByRole("dialog", { name: "WELCOME!" })).toBeVisible();
  await expect(page).toHaveScreenshot("welcome-dialog.png");
});

test("desktop after boot visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop visual baseline");

  await openDesktop(page, { entryFromPog: false });
  await expect(page.locator("#gtc-os-boot")).toHaveCount(0, { timeout: 6_000 });
  await page.locator("[data-close-portfolio-notice]").last().click();
  await expect(page.locator("#portfolio-notice-layer")).toBeHidden();
  await expect(page).toHaveScreenshot("desktop-after-boot.png");
});

for (const label of ["APPS", "SS"]) {
  test(`${label} folder visual baseline`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop visual baseline");

    await openDesktop(page);
    await openFolder(page, label, false);
    await expect(page).toHaveScreenshot(`${label.toLowerCase()}-folder.png`);
  });
}

test("mobile folder visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile visual baseline");

  await openDesktop(page);
  await openFolder(page, "APPS", true);
  await expect(page).toHaveScreenshot("mobile-folder-window.png");
});
