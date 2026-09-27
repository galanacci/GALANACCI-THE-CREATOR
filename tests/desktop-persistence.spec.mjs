import { test, expect } from "./fixtures/test.mjs";
import { dragBy, openDesktop, shortcut } from "./helpers/desktop.mjs";

test("viewers cannot move shortcuts or the poster", async ({ page }) => {
  await openDesktop(page);
  const icon = shortcut(page, "PoG.EXE");
  const poster = page.locator("[data-desktop-poster]");
  const iconBefore = await icon.getAttribute("style");
  const posterBefore = await poster.getAttribute("style");

  await dragBy(page, icon, 96, -64);
  await dragBy(page, poster, -80, 48);

  await expect(icon).toHaveAttribute("style", iconBefore);
  await expect(poster).toHaveAttribute("style", posterBefore);
  expect(await page.evaluate(() => localStorage.getItem("gtc:desktop-position:pog-exe"))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem("gtc:desktop-poster-position"))).toBeNull();
});

test("viewers see the published arrangement", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop published profile");
  await page.route("**/js/desktop-layout.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      desktop: {
        shortcuts: {
          "pog-exe": { x: .45, y: .55 },
          "experiments-folder": { x: .05, y: .25 },
          "ss-folder": { x: .05, y: .75 }
        },
        poster: { x: .8, y: .08 }
      },
      mobile: {}
    })
  }));
  await openDesktop(page);
  const icon = await shortcut(page, "PoG.EXE").boundingBox();
  expect(icon.x).toBeGreaterThan(page.viewportSize().width * .35);
  expect(icon.y).toBeGreaterThan(page.viewportSize().height * .4);
});

test("local editor can arrange and save a desktop layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop editor gesture");
  let savedPayload;
  await page.route("**/__layout/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"editor":true}' })
  );
  await page.route("**/__layout/save", async (route) => {
    savedPayload = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"saved":true}' });
  });
  await page.goto("/?entry=pog&layout=edit");
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Local layout editor" })).toBeVisible();

  const icon = shortcut(page, "PoG.EXE");
  const poster = page.locator("[data-desktop-poster]");
  const iconBefore = await icon.boundingBox();
  const posterBefore = await poster.boundingBox();
  await dragBy(page, icon, 96, -64);
  await dragBy(page, poster, -80, 48);
  expect((await icon.boundingBox()).x).toBeGreaterThan(iconBefore.x + 40);
  expect((await poster.boundingBox()).x).toBeLessThan(posterBefore.x - 40);

  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.getByRole("status")).toContainText("SAVED");
  expect(savedPayload.profile).toBe("desktop");
  expect(Object.keys(savedPayload.shortcuts)).toEqual([
    "pog-exe", "experiments-folder", "ss-folder"
  ]);
  expect(savedPayload.poster.x).toBeGreaterThan(0);
  expect(savedPayload.poster.x).toBeLessThan(1);
  expect(await page.evaluate(() => localStorage.getItem("gtc:desktop-position:pog-exe"))).toBeNull();
});

test("local editor saves the mobile layout separately", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout profile");
  let savedPayload;
  await page.route("**/__layout/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"editor":true}' })
  );
  await page.route("**/__layout/save", async (route) => {
    savedPayload = JSON.parse(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"saved":true}' });
  });

  await page.goto("/?entry=pog&layout=edit");
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
  await expect(page.locator(".layout-editor__profile")).toHaveText("EDIT MOBILE");
  await page.getByRole("button", { name: "SAVE" }).click();
  await expect(page.getByRole("status")).toContainText("MOBILE SAVED");
  expect(savedPayload.profile).toBe("mobile");
  expect(Object.keys(savedPayload.shortcuts)).toHaveLength(3);
  expect(savedPayload.poster.x).toBeGreaterThan(0);
});

test("editor URL alone cannot unlock the live-style preview", async ({ page }) => {
  await page.goto("/?entry=pog&layout=edit");
  await expect(page.locator(".desktop-shortcut.is-ready")).toHaveCount(3);
  await expect(page.locator(".layout-editor")).toHaveCount(0);
  const icon = shortcut(page, "PoG.EXE");
  const before = await icon.getAttribute("style");
  await dragBy(page, icon, 96, -64);
  await expect(icon).toHaveAttribute("style", before);
});
