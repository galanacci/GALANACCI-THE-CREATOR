import { test, expect } from "./fixtures/test.mjs";
import {
  dragBy,
  openDesktop,
  openFolder,
  seedDesktop
} from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }) => {
  await seedDesktop(page);
  await openDesktop(page);
});

for (const label of ["APPS", "SS"]) {
  test(`${label} folder opens, drags, resizes and closes on desktop`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop window mechanics");

    const folder = await openFolder(page, label, false);
    const beforeDrag = await folder.boundingBox();
    await dragBy(page, folder.locator(".folder-window__chrome"), 64, 48);
    const afterDrag = await folder.boundingBox();

    expect(afterDrag.x).toBeGreaterThan(beforeDrag.x + 40);
    expect(afterDrag.y).toBeGreaterThan(beforeDrag.y + 25);

    const beforeResize = await folder.boundingBox();
    await dragBy(page, folder.locator('[data-resize="se"]'), 72, 56);
    const afterResize = await folder.boundingBox();

    expect(afterResize.width).toBeGreaterThan(beforeResize.width + 45);
    expect(afterResize.height).toBeGreaterThan(beforeResize.height + 35);

    await folder.getByRole("button", { name: new RegExp(`Close ${label}`) }).click();
    await expect(folder).toBeHidden();
    await expect(folder).toHaveAttribute("aria-hidden", "true");
  });
}

test("mobile folder opens, keeps usable content and drags", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile window mechanics");

  const folder = await openFolder(page, "APPS", true);
  await expect(folder.locator(".app-list__row")).toHaveCount(2);

  const beforeDrag = await folder.boundingBox();
  await dragBy(page, folder.locator(".folder-window__chrome"), 20, 28);
  const afterDrag = await folder.boundingBox();

  expect(afterDrag.y).not.toBe(beforeDrag.y);
});

test("mobile folder resizes from its visible corner handle", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile window mechanics");

  const folder = await openFolder(page, "APPS", true);
  const beforeResize = await folder.boundingBox();
  await dragBy(page, folder.locator('[data-resize="se"]'), -48, -48);
  const afterResize = await folder.boundingBox();

  expect(afterResize.width).toBeLessThan(beforeResize.width - 20);
  expect(afterResize.height).toBeLessThan(beforeResize.height - 20);
});

test("mobile folder close button remains tappable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile window mechanics");

  const folder = await openFolder(page, "APPS", true);
  await folder
    .getByRole("button", { name: "Close APPS folder" })
    .tap({ timeout: 2_000 });
  await expect(folder).toBeHidden();
});

test("internal .EXE opens in iframe and closing it preserves the folder", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", isMobile);
  const row = folder.locator("[data-app-link]").first();

  if (isMobile) {
    await row.tap();
  } else {
    await row.dblclick();
  }

  const appWindow = page.locator("#experiment-window");
  await expect(appWindow).toBeVisible();
  await expect(page.locator("#experiment-frame")).toHaveAttribute(
    "data-app-url",
    /experiments\/2\(XY-T\)\/index\.html$/
  );
  await expect(folder).toBeVisible();

  const close = appWindow.getByRole("button", { name: "Close app" });
  if (isMobile) await close.tap();
  else await close.click();

  await expect(appWindow).toBeHidden();
  await expect(page.locator("#experiment-frame")).toHaveAttribute("data-app-url", "about:blank");
  await expect(folder).toBeVisible();
  await expect(row).toBeFocused();
});

test("GTHEFIGHTER.EXE is listed in SS and opens as an internal 3D app", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "SS", isMobile);
  const row = folder.locator('[data-label="GTHEFIGHTER.EXE"]');

  await expect(row).toBeVisible();
  await expect(row).toContainText("2021");
  await expect(row).toContainText("GALANACCI");

  if (isMobile) await row.dispatchEvent("click");
  else await row.dblclick();

  const appWindow = page.locator("#experiment-window");
  await expect(appWindow).toBeVisible();
  await expect(page.locator("#experiment-window-title")).toHaveText("GTHEFIGHTER.EXE");
  await expect(page.locator("#experiment-frame")).toHaveAttribute(
    "data-app-url",
    /SS\/GTHEFIGHTER\/index\.html$/
  );
  await expect(folder).toBeVisible();

  const appFrame = page.frameLocator("#experiment-frame");
  await expect(appFrame.locator("#frame-viewer")).toBeVisible();
  await expect(appFrame.locator(".experience")).toHaveClass(/is-ready/, {
    timeout: 15_000
  });
  await expect(appFrame.locator(".collection-info")).toContainText(
    "A DIGITAL ART COLLECTION EXPLORING BOXING'S GREATS."
  );
});

test("keyboard opens and closes folders with focus restoration", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop keyboard contract");

  const appsShortcut = page.locator(".desktop-shortcut", { hasText: "APPS" });
  await appsShortcut.focus();
  await page.keyboard.press("Enter");

  const folder = page.locator('[data-folder-window="apps"]');
  const closeButton = folder.getByRole("button", { name: "Close APPS folder" });
  await expect(folder).toBeVisible();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(folder).toBeHidden();
  await expect(appsShortcut).toBeFocused();
});

test("keyboard closes an iframe app and returns focus to its row", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop keyboard contract");

  const folder = await openFolder(page, "APPS", false);
  const row = folder.locator("[data-app-link]").first();
  await row.focus();
  await page.keyboard.press("Enter");

  const appWindow = page.locator("#experiment-window");
  await expect(appWindow).toBeVisible();
  await expect(
    appWindow.getByRole("button", { name: "Close app" })
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(appWindow).toBeHidden();
  await expect(folder).toBeVisible();
  await expect(row).toBeFocused();
});

test("mobile close and confirmation controls meet touch target size", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile touch target contract");

  const folder = await openFolder(page, "APPS", true);
  const closeBox = await folder
    .getByRole("button", { name: "Close APPS folder" })
    .boundingBox();

  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
});
