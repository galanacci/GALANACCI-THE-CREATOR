import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const dataUrl = (path, mime) =>
  `data:${mime};base64,${readFileSync(resolve(root, path)).toString("base64")}`;

const poster = dataUrl("assets/posters/reps-in-da-gym.jpg", "image/jpeg");
const mark = dataUrl("assets/favicon.svg", "image/svg+xml");
const pixelFont = dataUrl("assets/fonts/w95fa.woff2", "font/woff2");

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><style>
      @font-face { font-family: W95; src: url('${pixelFont}') format('woff2'); }
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; margin: 0; }
      body {
        position: relative; overflow: hidden; color: #050505; background: #ead1b2;
        background-image: linear-gradient(rgba(0,0,0,.12) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,0,0,.12) 1px, transparent 1px);
        background-size: 16px 16px;
      }
      .panel { position: absolute; inset: 26px; border: 2px solid #050505; background: rgba(234,209,178,.92); }
      .mast { position: absolute; top: 52px; left: 54px; display: flex; align-items: center; gap: 18px; }
      .mark { width: 74px; height: 74px; display: grid; place-items: center; background: #050505; }
      .mark img { width: 60px; height: 60px; }
      .eyebrow { font: 20px W95, monospace; letter-spacing: .13em; }
      h1 { position: absolute; top: 191px; left: 55px; width: 585px; margin: 0;
        font: bold 83px/.9 Georgia, serif; letter-spacing: -.065em; }
      .rule { position: absolute; left: 55px; bottom: 146px; width: 580px; height: 2px; background: #050505; }
      .subtitle { position: absolute; left: 55px; bottom: 72px; font: 20px/1.25 W95, monospace;
        letter-spacing: .055em; }
      .poster-shadow { position: absolute; left: 700px; top: 83px; width: 404px; height: 404px;
        background: rgba(0,0,0,.2); transform: translate(13px, 13px); }
      .poster { position: absolute; left: 700px; top: 83px; width: 404px; height: 404px;
        object-fit: cover; border: 2px solid #050505; }
      .tape { position: absolute; top: 68px; left: 848px; width: 110px; height: 27px;
        transform: rotate(-2deg); background: rgba(234,209,178,.6); border: 1px solid rgba(0,0,0,.12); }
      .index { position: absolute; right: 57px; bottom: 38px; font: 19px W95, monospace; }
    </style></head><body><main class="panel">
      <div class="mast"><span class="mark"><img src="${mark}" alt=""></span><span class="eyebrow">GALANACCI OS / 26</span></div>
      <h1>GALANACCI<br>THE CREATOR</h1>
      <div class="rule"></div>
      <div class="subtitle">WORLD BUILDING / EXPERIMENTS / ARCHIVES<br>THE WORK BEHIND PIONEERS OF GREATNESS</div>
      <div class="poster-shadow"></div><img class="poster" src="${poster}" alt=""><div class="tape"></div>
      <div class="index">GALANACCI.COM</div>
    </main></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(root, "assets", "share", "home.png") });
} finally {
  await browser.close();
}
