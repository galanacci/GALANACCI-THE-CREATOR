import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder } from "./helpers/desktop.mjs";

test("UNCUT loads its 3D workspace and changes episodes inside the CRT", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/SS/UNCUT/index.html");
  await expect(page.locator("#documentary-scene")).toHaveClass(/is-ready/, { timeout: 25_000 });
  await expect(page.locator(".documentary-renderer")).toBeVisible();
  await expect(page.locator("#documentary-crt-player")).toHaveClass(/is-playing/, { timeout: 8_000 });
  await expect(page.locator("#documentary-crt-player iframe")).toHaveCount(1);
  await expect(page.locator("#documentary-crt-controls")).toBeVisible();

  const firstSource = await page.locator("#documentary-crt-player iframe").getAttribute("src");
  await page.locator("#documentary-crt-archive-toggle").click();
  await expect(page.locator("#documentary-crt-archive-menu")).toBeVisible();
  await expect(page.locator(".documentary-crt-episode-option").first()).toBeVisible();
  await page.locator("#documentary-crt-archive-toggle").click();
  await page.locator("#documentary-crt-previous").click();
  await expect(page.locator("#documentary-crt-player iframe")).not.toHaveAttribute("src", firstSource, { timeout: 5_000 });
  await expect(page.locator("#documentary-crt-player")).not.toHaveClass(/is-tuning/, { timeout: 5_000 });
  expect(await page.locator(".documentary-crt-glass").evaluate((glass) => getComputedStyle(glass).clipPath))
    .toBe(await page.locator("#documentary-crt-player").evaluate((player) => getComputedStyle(player).clipPath));
  await expect(page.locator("body")).not.toContainText("PIONEERS OF GREATNESS");
});

test("UNCUT opens from SS and closing it returns to the folder", async ({ page }, testInfo) => {
  await openDesktop(page);
  const folder = await openFolder(page, "SS", testInfo.project.name === "mobile-chromium");
  const row = folder.locator('[data-label="UNCUT.EXE"]');
  await expect(row).toContainText("A weekly video journal.");
  await folder.locator("[data-folder-type]").selectOption("video");
  await expect(folder.locator(".app-list__row:visible")).toHaveCount(1);
  await expect(row).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") await row.tap();
  else await row.dblclick();
  const appWindow = page.locator("#experiment-window");
  await expect(appWindow).toBeVisible();
  await expect(page.locator("#experiment-frame")).toHaveAttribute("data-app-url", /SS\/UNCUT\/index\.html/);
  await appWindow.getByRole("button", { name: "Close app" }).click();
  await expect(appWindow).toBeHidden();
  await expect(folder).toBeVisible();
});

test("UNCUT has a share entry back into GALANACCI OS", async ({ page }) => {
  const response = await page.request.get("/share/uncut/");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain("UNCUT.EXE | GALANACCI OS");
  expect(html).toContain("/?app=uncut");
});
