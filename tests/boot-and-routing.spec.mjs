import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, seedDesktop, shortcut } from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }) => {
  await seedDesktop(page);
});

test("normal direct visit shows boot, then desktop, then WELCOME", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#gtc-os-boot")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/gtc-os-boot-active/);
  await expect(page.locator("#portfolio-notice-layer")).toBeHidden();

  await expect(page.locator("#gtc-os-boot")).toHaveCount(0, { timeout: 6_000 });
  await expect(page.locator("#gtc-desktop")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "WELCOME!" })).toBeVisible();
});

test("?entry=pog bypasses boot and WELCOME and cleans the return URL", async ({ page }) => {
  await openDesktop(page);

  await expect(page.locator("#gtc-os-boot")).toHaveCount(0);
  await expect(page.locator("#portfolio-notice-layer")).toBeHidden();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.locator("html")).toHaveClass(/gtc-entry-from-pog/);
});

test("PoG.EXE launches the production PoG entry URL", async ({ page }, testInfo) => {
  await page.route("https://pioneersofgreatness.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>PoG launch captured</title>"
    });
  });

  await openDesktop(page);
  const pogShortcut = shortcut(page, "PoG.EXE");

  expect(
    await page.evaluate(() => sessionStorage.getItem("gtc:pog-return-pending"))
  ).toBeNull();

  if (testInfo.project.name === "mobile-chromium") {
    await pogShortcut.tap();
  } else {
    await pogShortcut.dblclick();
  }

  await expect(page).toHaveURL("https://pioneersofgreatness.com/?entry=galanacci");
});

test("PoG return architecture expects https://galanacci.com/?entry=pog", async ({ page, request }) => {
  const response = await request.get("/CNAME");
  expect(response.ok()).toBeTruthy();
  const productionHost = (await response.text()).trim();

  expect(`https://${productionHost}/?entry=pog`).toBe(
    "https://galanacci.com/?entry=pog"
  );

  await page.goto("/?entry=pog");
  await expect(page.locator("#gtc-desktop")).toBeVisible();
  await expect(page.locator("#gtc-os-boot")).toHaveCount(0);
});

test("back and forward navigation clears launch locks and stale overlays", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop launch uses double click");
  test.setTimeout(35_000);

  const settleReturnedDesktop = async () => {
    await expect(page.locator("#gtc-desktop")).toBeVisible();

    if (await page.locator("#gtc-os-boot").count()) {
      await expect(page.locator("#gtc-os-boot")).toHaveCount(0, {
        timeout: 6_000
      });
    }

    const notice = page.locator("#portfolio-notice-layer");
    if (await notice.isVisible()) {
      await notice.locator("[data-close-portfolio-notice]").last().click();
    }
  };

  await page.route("https://pioneersofgreatness.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>PoG</title><p>PoG route fixture</p>"
    });
  });

  await openDesktop(page);
  await shortcut(page, "PoG.EXE").dblclick();
  await expect(page).toHaveURL(/pioneersofgreatness\.com/);

  await page.goBack();
  await settleReturnedDesktop();
  expect(
    await page.evaluate(() => sessionStorage.getItem("gtc:pog-return-pending"))
  ).toBeNull();
  await expect(page.locator("html")).not.toHaveClass(/gtc-return-from-pog/);
  await expect(page.locator("#launch-transition")).toBeHidden();
  await expect(page.locator("#experiment-window")).toBeHidden();

  await shortcut(page, "APPS").dblclick();
  await expect(page.locator('[data-folder-window="apps"]')).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/pioneersofgreatness\.com/);
  await page.goBack();
  await settleReturnedDesktop();
  await expect(page.locator("#launch-transition")).toBeHidden();
  await expect(page.locator("#experiment-window")).toBeHidden();
});
