import { test, expect } from "@playwright/test";

const archiveApps = [
  "365LOOKS", "ARCHITECTURE", "BLACKBOOK", "EVERYDAYS", "FIGHTPOSTERS",
  "GALANACCI", "GTHEFIGHTER", "GVERSE", "PUGILISM", "RENAISSANCE",
  "WARRIORSOFBOXING"
];

for (const app of archiveApps) {
  test(`${app} keeps the favicon watermark above its viewer without blocking input`, async ({ page }) => {
    const response = await page.goto(`/SS/${app}/index.html`, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const watermark = await page.evaluate(() => {
      const surface = document.querySelector("body > main");
      const inScene = surface.classList.contains("experience");
      const style = getComputedStyle(surface, "::after");
      const alternate = getComputedStyle(surface, "::before");
      const slider = document.querySelector(".scrubber, .artwork-scrubber");
      return {
        inScene,
        content: style.content,
        image: style.backgroundImage,
        repeat: style.backgroundRepeat,
        size: style.backgroundSize,
        positionX: style.backgroundPositionX,
        viewportWidth: window.innerWidth,
        left: parseFloat(style.left),
        right: parseFloat(style.right),
        top: parseFloat(style.top),
        bottom: parseFloat(style.bottom),
        blendMode: style.mixBlendMode,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: Number(style.zIndex),
        sliderZIndex: slider ? Number(getComputedStyle(slider).zIndex) : null,
        viewportHeight: window.innerHeight,
        alternateImage: alternate.backgroundImage,
        alternatePositionX: alternate.backgroundPositionX,
        alternateMask: alternate.maskImage || alternate.webkitMaskImage,
        mask: style.maskImage || style.webkitMaskImage,
        instruction: (() => {
          const hint = document.querySelector(".viewer-hint, .interaction-hint");
          if (!hint) return null;
          return {
            top: hint.getBoundingClientRect().top,
            zIndex: Number(getComputedStyle(hint).zIndex)
          };
        })()
      };
    });
    expect(watermark.content).not.toBe("none");
    expect(watermark.image).toContain("/assets/favicon.svg");
    expect(Number(watermark.opacity)).toBeLessThanOrEqual(0.12);
    expect(watermark.blendMode).toBe("difference");
    expect(watermark.pointerEvents).toBe("none");
    expect(watermark.position).toBe("fixed");
    expect(watermark.zIndex).toBe(watermark.inScene ? 2 : 101);
    expect(watermark.repeat).toBe("repeat");
    expect(watermark.positionX).toBe("50%");
    expect(watermark.alternateImage).toContain("/assets/favicon.svg");
    expect(watermark.alternatePositionX).not.toBe(watermark.positionX);
    expect(watermark.mask).toContain("repeating-linear-gradient");
    expect(watermark.alternateMask).toContain("repeating-linear-gradient");
    expect(watermark.left).toBe(0);
    expect(watermark.right).toBe(0);
    expect(watermark.top).toBe(0);
    expect(watermark.bottom).toBe(0);
    const tileSize = parseFloat(watermark.size);
    const columns = Math.floor((watermark.viewportWidth - watermark.left - watermark.right) / tileSize);
    const rows = (watermark.viewportHeight - watermark.top - watermark.bottom) / tileSize;
    expect(columns).toBeGreaterThanOrEqual(watermark.viewportWidth <= 680 ? 2 : 6);
    expect(rows).toBeCloseTo(5, 1);
    if (watermark.sliderZIndex !== null) {
      expect(watermark.sliderZIndex).toBeGreaterThan(watermark.zIndex);
    }
    if (watermark.instruction !== null) {
      expect(watermark.instruction.zIndex).toBeGreaterThan(watermark.zIndex);
    }
  });
}
