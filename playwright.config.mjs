import { defineConfig } from "@playwright/test";

const chromeChannel = process.env.PLAYWRIGHT_USE_BUNDLED_CHROMIUM
  ? undefined
  : "chrome";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  timeout: 20_000,
  expect: {
    timeout: 6_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.015
    }
  },
  snapshotPathTemplate: "{testDir}/visual-baselines/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: chromeChannel,
    colorScheme: "dark",
    locale: "en-GB",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false
      }
    },
    {
      name: "mobile-chromium",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true
      }
    }
  ],
  webServer: {
    command: "node tests/support/static-server.mjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 10_000
  }
});
