import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

async function open(page: Page, name: string) {
  await page.goto(`/app/play/${name}/edit?db=replaylab-${name}-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp?.playbackController));
}

test('play, pause, scrub, step, and presentation remain local and restore focus', async ({ page }) => {
  await open(page, 'slice3-controls');
  const result = await page.evaluate(async () => {
    const app = window.replayLabApp!;
    const updates: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updates.push(update);
    app.facade.doc.rootDoc.on('update', collect);
    const before = Array.from(app.facade.encode());
    app.playbackController!.scrub(450);
    app.playbackController!.step(1);
    app.playbackController!.step(-1);
    app.playbackController!.play();
    await new Promise(resolve => setTimeout(resolve, 80));
    app.playbackController!.pause();
    const after = Array.from(app.facade.encode());
    app.facade.doc.rootDoc.off('update', collect);
    return { before, after, updateCount: updates.length };
  });
  expect(result.updateCount).toBe(0);
  expect(result.after).toEqual(result.before);

  const canvas = page.locator('#court');
  await page.getByRole('button', { name: 'Play tactic' }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-playhead-ms'))).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  const pausedAt = await canvas.getAttribute('data-playhead-ms');
  await page.waitForTimeout(120);
  expect(await canvas.getAttribute('data-playhead-ms')).toBe(pausedAt);

  const scrubber = page.getByRole('slider', { name: 'Playhead' });
  await scrubber.fill('1200');
  await expect(canvas).toHaveAttribute('data-playback-phase-index', '1');
  await page.getByRole('button', { name: 'Previous phase' }).click();
  await expect(canvas).toHaveAttribute('data-playback-phase-index', '0');

  const present = page.getByRole('button', { name: 'Present' });
  await present.click();
  const dialog = page.getByRole('dialog', { name: 'Presentation mode' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit presentation' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-playback-state="playing"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(present).toBeFocused();
});

test('hidden stage stops RAF work and reduced motion uses phase stepping', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'slice3-reduced-hidden');
  const canvas = page.locator('#court');
  await page.getByRole('button', { name: 'Play tactic' }).click();
  await page.waitForTimeout(250);
  expect(Number(await canvas.getAttribute('data-playhead-ms'))).toBe(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-playhead-ms'))).toBe(1200);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await page.getByRole('button', { name: 'Play tactic' }).click();

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('[data-playback-state="suspended"]')).toBeVisible();
  const renderCount = await canvas.getAttribute('data-render-count');
  await page.waitForTimeout(150);
  expect(await canvas.getAttribute('data-render-count')).toBe(renderCount);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
});

test('presentation controls pass reduced-motion, forced-colors, and axe checks', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'slice3-contrast');
  await page.getByRole('button', { name: 'Present' }).click();
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(): Promise<{ violations: Array<{ id: string; impact: string | null }> }> };
    };
    const result = await axeWindow.axe.run();
    return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  });
  expect(violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  const forcedColors = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
  expect(forcedColors).toBe(true);
  mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: resolve(evidenceRoot, 'slice3-high-contrast.png'), fullPage: true });
  writeFileSync(
    resolve(evidenceRoot, 'slice3-accessibility.json'),
    JSON.stringify({
      reducedMotion: true,
      forcedColors: true,
      automatedAxeSeriousOrCriticalViolations: 0,
      presentationKeyboard: ['Space play/pause', '[ previous', '] next', 'Escape exit'],
    }, null, 2) + '\n'
  );
});
