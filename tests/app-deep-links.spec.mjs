import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }) => {
  await seedDesktop(page);
});

test("first-visit app link waits for boot and WELCOME", async ({ page }) => {
  test.setTimeout(25_000);
  await page.goto("/?app=interviews");

  await expect(page.locator("#gtc-os-boot")).toBeVisible();
  await expect(page.locator("#experiment-window")).toBeHidden();
  await expect(page.locator("#gtc-os-boot")).toHaveCount(0, { timeout: 6_000 });
  await expect(page.getByRole("dialog", { name: "WELCOME!" })).toBeVisible();
  await expect(page.locator("#experiment-window")).toBeHidden();

  await page.locator(".portfolio-notice__ok").click();
  await expect(page.locator("#experiment-window")).toBeVisible();
  await expect(page.locator("#experiment-window-title")).toHaveText("INTERVIEWS.EXE");
  await expect(page.locator("#experiment-frame")).toHaveAttribute(
    "data-app-url",
    /SS\/INTERVIEWS\/index\.html/
  );
});

test("direct app link reloads, and closing returns to the desktop URL", async ({ page }) => {
  await page.goto("/?entry=pog");
  await page.goto("/?app=gthefighter");
  await expect(page.locator("#experiment-window")).toBeVisible();
  await page.reload();
  await expect(page.locator("#experiment-window")).toBeVisible();
  await expect(page.locator("#experiment-window-title")).toHaveText("GTHEFIGHTER.EXE");

  await page.locator("[data-close-experiment]").click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.locator("#experiment-window")).toBeHidden();
});

test("opening an app in a folder updates the URL and Back closes it", async ({ page }, testInfo) => {
  await openDesktop(page);
  const folder = await openFolder(page, "SS", testInfo.project.name === "mobile-chromium");
  const app = folder.locator('[data-label="INTERVIEWS.EXE"]');
  if (testInfo.project.name === "mobile-chromium") await app.tap();
  else await app.dblclick();

  await expect(page).toHaveURL("http://127.0.0.1:4173/?app=interviews");
  await expect(page.locator("#experiment-window")).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.locator("#experiment-window")).toBeHidden();
  await expect(folder).toBeVisible();
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL("http://127.0.0.1:4173/?app=interviews");
  await expect(page.locator("#experiment-window")).toBeVisible();
});

test("unknown app IDs cannot load arbitrary iframe URLs", async ({ page }) => {
  await page.goto("/?entry=pog");
  await page.goto("/?app=https://example.com");
  await expect(page.locator("#experiment-window")).toBeHidden();
  await expect(page.locator("#experiment-frame")).not.toHaveAttribute("src", /example/);
});

test("share entry has app-specific metadata and opens inside the OS", async ({ page, request }) => {
  const response = await request.get("/share/interviews/");
  expect(response.ok()).toBeTruthy();
  const html = await response.text();
  expect(html).toContain('content="INTERVIEWS.EXE | GALANACCI OS"');
  expect(html).toContain('content="Recorded interviews and conversations."');

  await page.goto("/?entry=pog");
  await page.goto("/share/interviews/");
  await expect(page).toHaveURL("http://127.0.0.1:4173/?app=interviews");
  await expect(page.locator("#experiment-window")).toBeVisible();
});

test("Share offers the app-specific social entry URL", async ({ page }) => {
  await page.goto("/?entry=pog");
  await page.goto("/?app=interviews");
  await expect(page.locator("#experiment-window")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => { window.__sharedApp = data; }
    });
  });

  await page.getByRole("button", { name: "Share app link" }).click();
  const shared = await page.evaluate(() => window.__sharedApp);
  expect(shared.title).toBe("INTERVIEWS.EXE");
  expect(shared.url).toBe("http://127.0.0.1:4173/share/interviews/");
});

test("special-character app IDs remain shareable", async ({ page, request }) => {
  const response = await request.get("/share/2(xy%2Bt)/");
  expect(response.ok()).toBeTruthy();
  await page.goto("/?entry=pog");
  await page.goto("/share/2(xy%2Bt)/");
  await expect(page).toHaveURL(/\?app=2%28xy%2Bt%29|\?app=2\(xy%2Bt\)/);
  await expect(page.locator("#experiment-window-title")).toHaveText("2(XY+T).EXE");
});

test("SHARE uses the same hover treatment as the close control", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Hover is a desktop interaction");
  await page.goto("/?entry=pog");
  await page.goto("/?app=interviews");
  const share = page.locator("[data-share-experiment]");
  const close = page.locator("[data-close-experiment]");
  await share.hover();
  const shareStyle = await share.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    color: getComputedStyle(button).color
  }));
  await close.hover();
  const closeStyle = await close.evaluate((button) => ({
    background: getComputedStyle(button).backgroundColor,
    color: getComputedStyle(button).color
  }));
  expect(shareStyle).toEqual(closeStyle);
});
