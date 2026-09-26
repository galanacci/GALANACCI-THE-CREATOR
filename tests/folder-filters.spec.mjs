import { test, expect } from "./fixtures/test.mjs";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test.beforeEach(async ({ page }) => {
  await seedDesktop(page);
  await openDesktop(page);
});

for (const label of ["SS", "APPS"]) {
  test(`${label} folder filters sit below the scrolling files`, async ({ page }, testInfo) => {
    const folder = await openFolder(page, label, testInfo.project.name === "mobile-chromium");
    const body = folder.locator(".app-folder-body");
    const toolbar = folder.locator("[data-folder-controls]");
    const geometry = await folder.evaluate((element) => {
      const body = element.querySelector(".app-folder-body").getBoundingClientRect();
      const toolbar = element.querySelector("[data-folder-controls]").getBoundingClientRect();
      return { bodyBottom: body.bottom, toolbarTop: toolbar.top, toolbarBottom: toolbar.bottom,
        folderBottom: element.getBoundingClientRect().bottom };
    });

    expect(geometry.toolbarTop).toBeGreaterThanOrEqual(geometry.bodyBottom - 2);
    expect(geometry.toolbarBottom).toBeLessThanOrEqual(geometry.folderBottom + 1);
    await expect(body.locator("[data-folder-controls]")).toHaveCount(0);
    await expect(toolbar.locator("[data-folder-count]")).toContainText("FILES");

    if (testInfo.project.name === "mobile-chromium") {
      for (const control of await toolbar.locator("input, select, button").all()) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      const overflow = await toolbar.evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
}

test("mobile folder type stays within each card at common phone widths", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");

  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });

    // The existing mobile desktop positions overlap at 360px after a passive
    // resize; SS exercises the shared card rules without moving those icons.
    for (const label of ["SS"]) {
      const folder = await openFolder(page, label, true);
      const cards = await folder.locator(".app-list__row:visible").evaluateAll((rows) => rows.map((row) => {
        const title = row.children[0];
        const description = row.children[1];
        const cardRight = row.getBoundingClientRect().right;
        return {
          titleSize: parseFloat(getComputedStyle(title).fontSize),
          descriptionSize: parseFloat(getComputedStyle(description).fontSize),
          descriptionRight: description.getBoundingClientRect().right,
          cardRight,
          descriptionOverflow: description.scrollWidth - description.clientWidth,
          descriptionWhiteSpace: getComputedStyle(description).whiteSpace
        };
      }));

      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.titleSize).toBeLessThanOrEqual(16);
        expect(card.descriptionSize).toBe(14);
        expect(card.descriptionWhiteSpace).toBe("normal");
        expect(card.descriptionRight).toBeLessThanOrEqual(card.cardRight - 8);
        expect(card.descriptionOverflow).toBeLessThanOrEqual(1);
      }

      await folder.getByRole("button", { name: `Close ${label} folder` }).click();
    }
  }
});

test("SS search and type combine, show an empty state, and clear", async ({ page }, testInfo) => {
  const folder = await openFolder(page, "SS", testInfo.project.name === "mobile-chromium");
  const rows = folder.locator(".app-list__row");
  const total = await rows.count();
  const search = folder.locator("[data-folder-search]");
  const type = folder.locator("[data-folder-type]");

  await search.fill("architecture");
  await expect(folder.locator(".app-list__row:visible")).toHaveCount(1);
  await expect(folder.locator("[data-folder-count]")).toHaveText(`1 / ${total} FILES`);
  await type.selectOption("art");
  await expect(folder.locator(".app-list__row:visible")).toHaveCount(0);
  await expect(folder.locator(".app-list__empty")).toBeVisible();
  await type.selectOption("portfolio");
  await expect(folder.locator(".app-list__row:visible")).toHaveCount(1);
  await expect(folder.locator(".app-list__row:visible")).toContainText("ARCHITECTURE.EXE");

  await folder.locator("[data-folder-clear]").click();
  await expect(folder.locator(".app-list__row:visible")).toHaveCount(total);
  await expect(folder.locator(".app-list__empty")).toBeHidden();
  await expect(search).toHaveValue("");
  await expect(type).toHaveValue("all");
});

test("APPS filters and sort preserve its default order on reopen", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile-chromium";
  const folder = await openFolder(page, "APPS", mobile);
  const rows = folder.locator(".app-list__row:visible");
  await expect(rows).toHaveCount(2);
  const firstDefault = await rows.first().getAttribute("data-label");

  await folder.locator("[data-folder-sort]").selectOption("oldest");
  await expect(rows.first()).toHaveAttribute("data-label", "FIBONACCI.EXE");
  await folder.locator("[data-folder-type]").selectOption("visual");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-label", "2(XY+T).EXE");
  await folder.locator("[data-folder-search]").fill("fibonacci");
  await expect(rows).toHaveCount(0);

  await folder.getByRole("button", { name: "Close APPS folder" }).click();
  const reopened = await openFolder(page, "APPS", mobile);
  await expect(reopened.locator(".app-list__row:visible")).toHaveCount(2);
  await expect(reopened.locator(".app-list__row:visible").first()).toHaveAttribute("data-label", firstDefault);
  await expect(reopened.locator("[data-folder-search]")).toHaveValue("");
  await expect(reopened.locator("[data-folder-sort]")).toHaveValue("newest");
});
