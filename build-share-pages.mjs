import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { FOLDER_CATALOG } from "./js/folder-catalog.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const apps = Object.values(FOLDER_CATALOG).flat().map((entry) => [
  entry.shareSlug,
  entry.label,
  entry.shareDescription || entry.description
]);

const escapeHtml = (value) => value.replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const imageDirectory = resolve(root, "assets", "share");
mkdirSync(imageDirectory, { recursive: true });

for (const [slug, label, description] of apps) {
  const directory = resolve(root, "share", slug);
  const shareUrl = `https://galanacci.com/share/${encodeURIComponent(slug)}/`;
  const appUrl = `/?app=${encodeURIComponent(slug)}`;
  const title = `${label} | GALANACCI OS`;
  const titleSize = label.length > 19 ? 52 : label.length > 15 ? 64 : 76;
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1200px; height: 630px; }
    body { background-color: #000; background-image: linear-gradient(rgba(234,209,178,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(234,209,178,.2) 1px, transparent 1px); background-size: 24px 24px; color: #ead1b2; font-family: Georgia, serif; }
    main { position: absolute; inset: 36px; border: 2px solid #ead1b2; background: rgba(0,0,0,.84); padding: 54px; display: flex; flex-direction: column; justify-content: space-between; }
    header, footer { font: 600 21px Arial, sans-serif; letter-spacing: .18em; }
    h1 { margin: 0 0 22px; font-size: ${titleSize}px; line-height: 1; letter-spacing: -.04em; overflow-wrap: anywhere; }
    p { margin: 0; font: 25px/1.35 Arial, sans-serif; max-width: 900px; }
    footer { border-top: 1px solid #ead1b2; padding-top: 22px; font-size: 16px; }
  </style></head><body><main><header>GALANACCI OS / ARCHIVE</header><section><h1>${escapeHtml(label)}</h1><p>${escapeHtml(description)}</p></section><footer>OPEN THE EXPERIENCE ↗</footer></main></body></html>`);
  await page.screenshot({ path: resolve(imageDirectory, `${slug}.png`) });
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${shareUrl}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:image" content="https://galanacci.com/assets/share/${encodeURIComponent(slug)}.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</head>
<body>
  <p>Opening <a href="${appUrl}">${escapeHtml(label)} in GALANACCI OS</a>...</p>
</body>
</html>
`, "utf8");
}

await browser.close();
