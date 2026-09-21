# GALANACCI OS browser regression suite

This suite protects the current OS behavior without adding test hooks to the
production HTML, CSS, or JavaScript.

## Run locally

```powershell
npm install
npm test
```

The configuration uses the locally installed Chrome browser. Set
`PLAYWRIGHT_USE_BUNDLED_CHROMIUM=1` when running against a Playwright-managed
Chromium installation instead.

## Update approved visual baselines

```powershell
npm run test:update-screenshots
```

Review every PNG under `tests/visual-baselines/` before committing an update.
