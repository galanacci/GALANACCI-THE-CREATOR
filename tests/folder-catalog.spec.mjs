import { test, expect } from "./fixtures/test.mjs";
import { FOLDER_CATALOG } from "../js/folder-catalog.js";
import { openDesktop } from "./helpers/desktop.mjs";

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
      await expect(link).toHaveAttribute("data-app-type", entry.type);
      const response = await page.request.get(new URL(entry.href, page.url()).href);
      expect(response.ok(), entry.href).toBe(true);
    }
  }

  const slugs = Object.values(FOLDER_CATALOG).flat().map((entry) => entry.shareSlug);
  expect(new Set(slugs).size).toBe(slugs.length);
});
