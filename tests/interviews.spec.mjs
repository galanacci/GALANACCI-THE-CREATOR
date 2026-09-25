import { expect, test } from "@playwright/test";
import { openDesktop, openFolder, seedDesktop } from "./helpers/desktop.mjs";

test("INTERVIEWS switches between usable YouTube and Spotify embeds", async ({ page }) => {
  test.setTimeout(45_000);

  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });
  await expect(page.locator("[data-archive-count]")).toContainText("INTERVIEWS");
  await expect(page.locator(".broadcast__tape-name").first()).toContainText("Galanacci - The designer using his talent");
  await expect(page.locator(".broadcast__tape-name").nth(1)).toContainText("Galanacci, Artist, Fashion Designer");
  await expect(page.locator("[data-format-tab='youtube']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".broadcast__masthead")).toHaveCount(0);
  await expect(page.locator("[data-error]")).toBeHidden();

  const youtube = page.locator("iframe#youtube-player");
  await expect(youtube).toBeVisible();
  await expect.poll(async () => (await youtube.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  await expect(youtube).toHaveAttribute("src", /youtube\.com\/embed/);
  await youtube.click();
  await expect.poll(async () => youtube.contentFrame().locator("video").evaluate((video) => video.currentTime).catch(() => 0), {
    timeout: 12_000
  }).toBeGreaterThan(0);

  await page.locator("[data-format-tab='spotify']").click();
  await expect(page.locator("[data-archive-count]")).toHaveText("2 INTERVIEWS");
  await expect(page.locator("[data-archive-heading]")).toHaveText("AUDIO ARCHIVE");
  await expect(page.locator(".broadcast__tape")).toHaveCount(2);
  await page.locator(".broadcast__tape").last().click();
  await expect(page.locator("[data-source-label]")).toHaveText("SPOTIFY AUDIO");
  await expect(page.locator("[data-spotify-stage]")).toBeVisible();
  await expect(page.locator("[data-video-link]")).toBeHidden();
  await expect(page.locator("[data-audio-link]")).toBeVisible();
  const spotify = page.locator('iframe[src*="open.spotify.com/embed/episode/5oMcZP4TcyfBcocAZm5ObR"]');
  await expect(spotify).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await spotify.boundingBox())?.height ?? 0).toBeGreaterThan(100);

  await page.locator("[data-format-tab='youtube']").click();
  await expect(page.locator("[data-source-label]")).toHaveText("YOUTUBE VIDEO");
  await expect(page.locator("[data-archive-count]")).toContainText("INTERVIEWS");
  await expect(page.locator("[data-archive-heading]")).toHaveText("VIDEO ARCHIVE");
  await expect(spotify).toHaveCount(0);
  await expect(youtube).toBeVisible();
  await expect(page.locator("[data-error]")).toBeHidden();
});

test("previous and next controls remain equal in size while browsing", async ({ page }) => {
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

  const prev = page.locator("[data-prev]");
  const next = page.locator("[data-next]");
  const widths = async () => [
    (await prev.boundingBox()).width,
    (await next.boundingBox()).width
  ];
  const initial = await widths();
  await next.click();
  const afterNext = await widths();
  await prev.click();
  const afterPrev = await widths();

  for (const pair of [initial, afterNext, afterPrev]) {
    expect(Math.abs(pair[0] - pair[1])).toBeLessThan(1);
  }
  expect(Math.abs(initial[0] - afterNext[0])).toBeLessThan(1);
  expect(Math.abs(initial[0] - afterPrev[0])).toBeLessThan(1);
});

test("the Shawn Porter interview shows its custom title and starts at two minutes", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

  const target = page.locator('.broadcast__tape:has(img[src*="0V5YGV_Elh4"])');
  await expect(target).toBeVisible();
  await expect(target.locator(".broadcast__tape-name")).toHaveText("Interview with Shawn Porter at TPWP");
  await target.click();
  await expect(page.locator("[data-current-title]")).toHaveText("Interview with Shawn Porter at TPWP");

  const youtube = page.locator("iframe#youtube-player");
  await expect.poll(async () => youtube.contentFrame().locator("video").evaluate((video) => video.currentTime).catch(() => 0), {
    timeout: 20_000
  }).toBeGreaterThan(115);

  const targetIndex = Number(await target.getAttribute("data-index"));
  await page.locator(".broadcast__tape").nth(targetIndex - 1).click();
  await expect.poll(async () => youtube.contentFrame().locator("video").evaluate((video) => video.currentTime).catch(() => Infinity), {
    timeout: 20_000
  }).toBeLessThan(10);

  await page.locator("[data-next]").click();
  await expect(page.locator("[data-current-title]")).toHaveText("Interview with Shawn Porter at TPWP");
  await expect.poll(async () => youtube.contentFrame().locator("video").evaluate((video) => video.currentTime).catch(() => 0), {
    timeout: 20_000
  }).toBeGreaterThan(115);
});

test("INTERVIEWS opens inside the OS app window", async ({ page }, testInfo) => {
  await seedDesktop(page);
  await openDesktop(page);

  const folder = await openFolder(page, "SS", testInfo.project.name === "mobile-chromium");
  const row = folder.locator('[data-label="INTERVIEWS.EXE"]');
  if (testInfo.project.name === "mobile-chromium") await row.tap();
  else await row.dblclick();

  await expect(page.locator("#experiment-window")).toBeVisible();
  await expect(page.locator("#experiment-frame")).toHaveAttribute("src", /SS\/INTERVIEWS\/index\.html$/);
  await expect(page.locator("#experiment-frame")).toHaveAttribute("allow", /autoplay/);
  const app = page.frameLocator("#experiment-frame");
  await expect(app.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });
  await expect(app.locator("iframe#youtube-player")).toBeVisible();
  await app.locator("[data-format-tab='spotify']").click();
  await app.locator(".broadcast__tape").last().click();
  await expect(app.locator("[data-source-label]")).toHaveText("SPOTIFY AUDIO");
  await expect(app.locator('iframe[src*="open.spotify.com/embed/episode/5oMcZP4TcyfBcocAZm5ObR"]')).toBeVisible({ timeout: 15_000 });
});

test("Spotify plays on first selection and stops when switching to YouTube", async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await page.locator("[data-format-tab='spotify']").click();
  await expect(page.locator("[data-loading]")).toBeHidden();
  await page.locator(".broadcast__tape").last().click();
  const spotify = page.locator('iframe[src*="open.spotify.com/embed/episode/5oMcZP4TcyfBcocAZm5ObR"]');
  await expect(spotify).toBeVisible();
  const frame = spotify.contentFrame();
  await expect(frame.getByRole("button", { name: "Play", exact: true })).toBeVisible({ timeout: 15_000 });
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect(frame.getByRole("button", { name: "Pause", exact: true })).toBeVisible({ timeout: 10_000 });

  await page.locator("[data-format-tab='youtube']").click();
  await expect(spotify).toHaveCount(0);
  await expect(page.locator("iframe#youtube-player")).toBeVisible();
});
