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

test("mobile interview tabs and controls stay within one screen", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout only");

  for (const height of [844, 667]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

    for (const type of ["youtube", "spotify"]) {
      await page.locator(`[data-format-tab='${type}']`).click();
      await page.locator("[data-next]").click();
      await expect(page.locator(".broadcast__archive-heading")).toBeHidden();

      const layout = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        return {
          scrollY: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          tabsTop: box(".broadcast__tabs").top,
          controlsBottom: box(".broadcast__controls").bottom,
          archiveBottom: box(".broadcast__archive").bottom,
          footerBottom: box(".broadcast__footer").bottom
        };
      });

      expect(layout.scrollY).toBe(0);
      expect(layout.scrollHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
      expect(layout.tabsTop).toBe(0);
      expect(layout.controlsBottom).toBeLessThan(layout.archiveBottom);
      expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);

      const titleLayout = await page.locator(".broadcast__tape").first().evaluate((tape) => {
        const title = tape.querySelector(".broadcast__tape-name").getBoundingClientRect();
        const reel = tape.closest(".broadcast__reel").getBoundingClientRect();
        return { titleTop: title.top, titleBottom: title.bottom, reelBottom: reel.bottom };
      });
      expect(titleLayout.titleBottom).toBeGreaterThan(titleLayout.titleTop);
      expect(titleLayout.titleBottom).toBeLessThanOrEqual(titleLayout.reelBottom - 1);
    }
  }
});

test("mobile archive stops at its first and last thumbnail", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile reel only");
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

  const reel = page.locator(".broadcast__reel");
  await reel.evaluate((element) => { element.scrollLeft = 100_000; });
  const atEnd = await reel.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    maxScroll: element.scrollWidth - element.clientWidth,
    lastRight: element.querySelector(".broadcast__tape:last-child").getBoundingClientRect().right,
    reelRight: element.getBoundingClientRect().right
  }));
  expect(atEnd.scrollLeft).toBeLessThanOrEqual(atEnd.maxScroll + 1);
  expect(atEnd.lastRight).toBeGreaterThanOrEqual(atEnd.reelRight - 1);

  await reel.evaluate((element) => { element.scrollLeft = -100_000; });
  const atStart = await reel.evaluate((element) => ({
    scrollLeft: element.scrollLeft,
    firstLeft: element.querySelector(".broadcast__tape:first-child").getBoundingClientRect().left,
    reelLeft: element.getBoundingClientRect().left
  }));
  expect(atStart.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(atStart.firstLeft).toBeLessThanOrEqual(atStart.reelLeft + 1);
});

test("repeated mobile touch swipes cannot pass the archive endpoints", async ({ page }, testInfo) => {
  test.setTimeout(30_000);
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile touch reel only");
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

  const reel = page.locator(".broadcast__reel");
  await expect(reel).toHaveCSS("overflow-x", "auto");
  const bounds = await reel.boundingBox();
  const y = bounds.y + bounds.height / 2;
  const left = bounds.x + 35;
  const right = bounds.x + bounds.width - 35;
  const client = await page.context().newCDPSession(page);
  const swipe = async (from, to) => {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart", touchPoints: [{ x: from, y, id: 1 }]
    });
    for (let step = 1; step <= 8; step += 1) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from + (to - from) * step / 8, y, id: 1 }]
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  const position = () => reel.evaluate((element) => ({
    left: element.scrollLeft,
    max: Math.max(0, Math.ceil(
      element.querySelector(".broadcast__tape:last-child").getBoundingClientRect().right -
      element.firstElementChild.getBoundingClientRect().left - element.clientWidth
    )),
    firstLeft: element.querySelector(".broadcast__tape:first-child").getBoundingClientRect().left,
    lastRight: element.querySelector(".broadcast__tape:last-child").getBoundingClientRect().right,
    reelLeft: element.getBoundingClientRect().left,
    reelRight: element.getBoundingClientRect().right
  }));

  await reel.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  for (let attempt = 0; attempt < 3; attempt += 1) await swipe(right, left);
  const atEnd = await position();
  expect(atEnd.left).toBeGreaterThanOrEqual(atEnd.max - 1);
  expect(atEnd.lastRight).toBeGreaterThanOrEqual(atEnd.reelRight - 1);
  await page.locator("[data-format-tab='spotify']").click();
  await expect(page.locator(".broadcast__tape").first()).toBeInViewport();
  await client.detach();
});

test("mobile player and navigation stay in place across interviews", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile layout only");

  for (const height of [844, 667]) {
    await page.setViewportSize({ width: 390, height });
    await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

    const geometry = async () => page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { top: box.top, left: box.left, width: box.width, height: box.height };
      };
      return {
        player: rect(".broadcast__screen-bezel"),
        prev: rect("[data-prev]"),
        next: rect("[data-next]")
      };
    });

    const initial = await geometry();
    for (let index = 0; index < 4; index += 1) {
      await page.locator("[data-next]").click();
      const afterNext = await geometry();
      for (const part of ["player", "prev", "next"]) {
        for (const edge of ["top", "left", "width", "height"]) {
          expect(Math.abs(afterNext[part][edge] - initial[part][edge])).toBeLessThan(1);
        }
      }
    }
  }
});

test("switching from the end of videos keeps audio thumbnails in view", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile reel only");
  await page.goto("/SS/INTERVIEWS/index.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });

  const reel = page.locator(".broadcast__reel");
  await reel.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await page.locator("[data-format-tab='spotify']").click();
  await expect(page.locator(".broadcast__tape")).toHaveCount(2);

  const audioLayout = await reel.evaluate((element) => {
    const visible = element.getBoundingClientRect();
    const first = element.querySelector(".broadcast__tape:first-child").getBoundingClientRect();
    return {
      scrollLeft: element.scrollLeft,
      maxScroll: element.scrollWidth - element.clientWidth,
      firstLeft: first.left,
      firstRight: first.right,
      reelLeft: visible.left,
      reelRight: visible.right
    };
  });
  expect(audioLayout.scrollLeft).toBeGreaterThanOrEqual(0);
  expect(audioLayout.scrollLeft).toBeLessThanOrEqual(audioLayout.maxScroll + 1);
  expect(audioLayout.firstLeft).toBeLessThan(audioLayout.reelRight);
  expect(audioLayout.firstRight).toBeGreaterThan(audioLayout.reelLeft);

  await page.locator("[data-format-tab='youtube']").click();
  await expect(page.locator(".broadcast__tape")).toHaveCount(6);
  await page.locator("[data-format-tab='spotify']").click();
  await expect(page.locator(".broadcast__tape").first()).toBeInViewport();
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
  await expect(page.locator("#experiment-frame")).toHaveAttribute("data-app-url", /SS\/INTERVIEWS\/index\.html$/);
  await expect(page.locator("#experiment-frame")).toHaveAttribute("allow", /autoplay/);
  const app = page.frameLocator("#experiment-frame");
  await expect(app.locator("[data-loading]")).toHaveClass(/is-hidden/, { timeout: 20_000 });
  await expect(app.locator("iframe#youtube-player")).toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    const embeddedLayout = await app.locator("body").evaluate((body) => ({
      scrollHeight: body.ownerDocument.documentElement.scrollHeight,
      viewportHeight: body.ownerDocument.defaultView.innerHeight,
      tabsTop: body.querySelector(".broadcast__tabs").getBoundingClientRect().top
    }));
    expect(embeddedLayout.scrollHeight).toBeLessThanOrEqual(embeddedLayout.viewportHeight + 1);
    expect(embeddedLayout.tabsTop).toBe(0);
  }
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
