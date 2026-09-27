import { test, expect } from "./fixtures/test.mjs";
import { openDesktop } from "./helpers/desktop.mjs";

test("first-time visitors can find contact details without losing the desktop layout", async ({ page }) => {
  await openDesktop(page);

  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toContain("an evolving archive");
  expect(description).not.toContain("Ã");

  const trigger = page.getByRole("button", { name: "Open information and contact details" });
  await expect(trigger.getByText("INFO/CONTACT")).toBeVisible();
  const bounds = await trigger.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);

  await trigger.click();
  await expect(page.getByRole("link", { name: "ENQUIRIES@GALANACCI.COM" })).toHaveAttribute(
    "href",
    "mailto:enquiries@galanacci.com"
  );
});
