import { test, expect } from "./fixtures/test.mjs";
import { FOLDER_CATALOG } from "../js/folder-catalog.js";
import { openDesktop, openFolder } from "./helpers/desktop.mjs";

test("folder catalogue renders every app with its metadata and working local path", async ({ page }) => {
  await openDesktop(page);

  for (const [folder, entries] of Object.entries(FOLDER_CATALOG)) {
    const rows = page.locator(`[data-folder-window="${folder}"] .app-list__row`);
    await expect(rows).toHaveCount(entries.length);

    for (const entry of entries) {
      // Query by data-label directly: folder sorting can change DOM order.
      const link = page.locator(`[data-folder-window="${folder}"] [data-app-link][data-label="${entry.label}"]`);
      await expect(link).toHaveCount(1);
      await expect(link.locator(".app-list__description")).toHaveText(entry.description);
      await expect(link.locator(".gtc-date-cell")).toHaveText(entry.year);
      await expect(link.locator(".app-list__preview")).toHaveAttribute("src", entry.preview);
      await expect(link).toHaveAttribute("data-app-type", entry.type);
      const response = await page.request.get(new URL(entry.href, page.url()).href);
      expect(response.ok(), entry.href).toBe(true);
      if (!entry.preview.startsWith("https://")) {
        const previewResponse = await page.request.get(new URL(entry.preview, page.url()).href);
        expect(previewResponse.ok(), entry.preview).toBe(true);
      }
    }
  }

  const slugs = Object.values(FOLDER_CATALOG).flat().map((entry) => entry.shareSlug);
  expect(new Set(slugs).size).toBe(slugs.length);
});

test("both folders show image-led cards without changing app links", async ({ page }, testInfo) => {
  await openDesktop(page);
  for (const folder of ["apps", "ss"]) {
    const mobile = testInfo.project.name === "mobile-chromium";
    const label = folder === "apps" ? "APPS" : "SS";
    await openFolder(page, label, mobile);
    const list = page.locator(`[data-folder-window="${folder}"] .app-list`);
    await expect(list).toHaveCSS("display", "grid");
    const cards = list.locator(".app-list__row");
    await expect(cards.first()).toHaveCSS("display", "flex");
    await expect(cards.first().locator(".app-list__preview")).toHaveCSS("object-fit", "cover");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    if (mobile) expect(second.y).toBeGreaterThan(first.y + first.height);
    else expect(Math.abs(second.y - first.y)).toBeLessThan(2);
    await page.locator(`[data-folder-window="${folder}"] [data-close-folder]`).click();
  }
});
