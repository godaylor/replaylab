import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.env.REPLAYLAB_CAPTURE_ORIGIN ?? 'http://127.0.0.1:32400';
const parsed = new URL(origin);
const local = parsed.hostname === '127.0.0.1' && +parsed.port >= 32400 && +parsed.port <= 32499;
if (!local && parsed.origin !== 'https://replaylab-godaylor.onrender.com') throw new Error('Use an isolated local ReplayLab port or the existing public ReplayLab service');
const label = process.env.REPLAYLAB_CAPTURE_LABEL ?? 'after';
if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid capture label');
const output = resolve('docs/design');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const locale of ['ru', 'en']) {
    for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['mobile-narrow', 320, 900]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addInitScript(value => localStorage.setItem('replaylab:locale', value), locale);
      const page = await context.newPage();
      await page.goto(`${origin}/app/play/design-${label}-${locale}-${device}/edit?lesson=1&db=design-${label}-${Date.now()}`);
      await page.locator('[data-app-ready="true"]').waitFor();
      await writeFile(resolve(output, `${label}-${device}-${locale}-geometry.json`), JSON.stringify(await page.evaluate(() => ({
        width: innerWidth, height: innerHeight,
        court: document.querySelector('#court').getBoundingClientRect().toJSON(),
        timeline: document.querySelector('.timeline').getBoundingClientRect().toJSON(),
        overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 20).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
      })), null, 2));
      await page.screenshot({ path: resolve(output, `${label}-${device}-${locale}.png`), fullPage: true });
      if (device === 'desktop') {
        await page.goto(origin);
        await page.locator('.home-intro').waitFor();
        await page.screenshot({ path: resolve(output, `${label}-home-${locale}.png`), fullPage: true });
      }
      await context.close();
    }
  }
} finally { await browser.close(); }
