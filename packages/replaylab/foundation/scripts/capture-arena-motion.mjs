import assert from 'node:assert/strict';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.REPLAYLAB_CAPTURE_ORIGIN ?? 'http://127.0.0.1:32421';
const url = new URL(origin);
if (url.hostname !== '127.0.0.1' || +url.port < 32400 || +url.port > 32499) throw new Error('Use an isolated local ReplayLab port');
const output = resolve('docs/design');
const videoDirectory = resolve(`tmp/arena-motion-${Date.now()}`);
await mkdir(output, { recursive: true });
const report = { generatedAt: new Date().toISOString(), origin, status: 'FAIL', chrome: 'not checked', browserVersion: '', networkScope: 'This Windows host only; fresh browser context, not the owner’s existing Chrome profile; no controlled VPN/Russia environment', failures: [], checks: [] };
let browser;
try {
  try { browser = await chromium.launch({ channel: 'chrome' }); report.chrome = 'installed Google Chrome'; }
  catch { report.chrome = 'installed Chrome unavailable to automation; recording uses bundled Chromium'; browser = await chromium.launch(); }
  report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: videoDirectory, size: { width: 1440, height: 1000 } } });
  await context.addInitScript(() => { localStorage.setItem('replaylab:locale', 'ru'); localStorage.setItem('replaylab:theme', 'dark'); });
  const page = await context.newPage();
  page.on('requestfailed', request => report.failures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) report.failures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  const video = page.video();
  const started = Date.now();
  assert.equal((await page.goto(origin)).status(), 200);
  await page.locator('.play-showcase').waitFor();
  await page.waitForTimeout(4000);
  const first = await page.locator('[data-piece="offense-5"]').getAttribute('transform');
  await page.waitForTimeout(400);
  assert.notEqual(await page.locator('[data-piece="offense-5"]').getAttribute('transform'), first);
  report.checks.push('animated home in a fresh browser profile');
  await page.getByRole('button', { name: 'Разобрать пик-н-ролл', exact: true }).click();
  await page.locator('[data-app-ready]').waitFor();
  assert.equal(await page.locator('#document-status').getAttribute('data-phase-count'), '4');
  await page.waitForTimeout(1600);
  await page.getByRole('button', { name: 'Воспроизвести комбинацию', exact: true }).click();
  await page.getByRole('button', { name: 'Приостановить воспроизведение', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Воспроизвести комбинацию', exact: true }).waitFor({ timeout: 14000 });
  report.checks.push('complete four-step playback, named steps and live explanation');
  await page.locator('[data-phase-id="pickroll-screen"]').click();
  await page.locator('.player-controls > summary').click();
  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.click(); await actor.press('ArrowRight');
  assert.match(await actor.textContent(), /x 305/);
  await page.getByRole('button', { name: /Отменить/ }).click();
  assert.match(await actor.textContent(), /x 300/);
  report.checks.push('keyboard movement and local undo');
  await page.locator('.player-controls > summary').click();
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.evaluate(() => document.fonts.check('500 24px Oswald')), true);
  await page.waitForTimeout(Math.max(500, 30000 - (Date.now() - started)));
  await page.screenshot({ path: resolve(output, 'arena-chrome-proof.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(report.failures, []);
  report.checks.push('no failed HTTP assets, self-hosted Cyrillic font and light theme');
  await context.close();
  await copyFile(await video.path(), resolve(output, 'arena-motion.webm'));
  report.status = 'PASS';
} finally {
  await browser?.close();
  await writeFile(resolve(output, 'arena-browser-check.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
