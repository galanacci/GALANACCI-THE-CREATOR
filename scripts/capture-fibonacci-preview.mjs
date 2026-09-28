import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const palette = process.argv[2] || 'prism';
const output = resolve(root, process.argv[3] || 'assets/fibonacci-preview.png');
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          oscillator.frequency.value = 110;
          gain.gain.value = 0;
          oscillator.connect(gain);
          gain.connect(destination);
          oscillator.start();
          await context.resume();
          window.thumbnailAudio = { context, gain };
          return destination.stream;
        }
      }
    });
  });

  await page.goto(pathToFileURL(resolve(root, 'experiments/FIBONACCI/index.html')).href);
  await page.locator('#palette-button').click();
  await page.locator(`[data-palette="${palette}"]`).click();
  await page.getByRole('button', { name: 'TAP TO START' }).click();
  await page.waitForFunction(() => Boolean(window.thumbnailAudio));
  await page.addStyleTag({ content: '#palette-control, #microphone-status, #fullscreen-button { visibility: hidden !important; }' });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.thumbnailAudio.gain.gain.value = 0.85; });
  // The chosen seed sits near the middle of the spiral. Capture as the sound
  // ripple crosses it, rather than at an arbitrary frame of the animation.
  await page.waitForFunction(() => Number(document.querySelectorAll('#fibonacci-dots circle')[1250].getAttribute('r')) > 2, { timeout: 4000 });
  await page.screenshot({ path: output, animations: 'disabled' });
  console.log(output);
} finally {
  await browser.close();
}
