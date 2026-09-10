import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

function appUrl(label: string, demo = false) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `/app/play/slice7-${label}-${suffix}/edit?db=slice7-${label}-${suffix}${demo ? '&demo=1' : ''}`;
}

async function openApp(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('unknown saved locale falls back to Russian and RU/EN selection persists with localized metadata', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('slice7-locale-seeded')) return;
    localStorage.setItem('replaylab:locale', 'upstream-unknown');
    sessionStorage.setItem('slice7-locale-seeded', 'true');
  });
  const url = appUrl('locale');
  await openApp(page, url);

  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page).toHaveTitle('ReplayLab — редактор баскетбольных комбинаций');
  await expect(page.getByRole('heading', { name: 'Тактическая доска' })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'ReplayLab — локальный редактор баскетбольных комбинаций');
  mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: resolve(evidenceRoot, 'slice7-ru.png'), fullPage: true });

  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle('ReplayLab — basketball play editor');
  await expect(page.getByRole('heading', { name: 'Formation board' })).toBeVisible();
  await page.screenshot({ path: resolve(evidenceRoot, 'slice7-en.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => localStorage.setItem('replaylab:locale', 'xx'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { name: 'Тактическая доска' })).toBeVisible();
});

test('desktop, tablet, and mobile expose only their documented authoring capabilities', async ({ page }) => {
  const url = appUrl('responsive');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, url);
  await expect(page.locator('[data-responsive-mode="desktop"]')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Court tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add phase' })).toBeEnabled();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.locator('[data-responsive-mode="tablet"]')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Court tools' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add phase' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Cue block 1 text' })).toBeEditable();
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveAttribute('readonly', '');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-responsive-mode="mobile"]')).toBeVisible();
  await expect(page.locator('.onboarding-strip')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Cue block 1 text' })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Play tactic' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lineup' })).toBeVisible();
  const reflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(reflow.width).toBeLessThanOrEqual(reflow.viewport);

  mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: resolve(evidenceRoot, 'slice7-mobile-en.png'), fullPage: true });
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: resolve(evidenceRoot, 'slice7-mobile-ru.png'), fullPage: true });

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(): Promise<{ violations: Array<{ id: string; impact: string | null }> }> };
    };
    const result = await axeWindow.axe.run();
    return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  });
  expect(violations).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.onboarding-strip')).toBeVisible();
});

test('portfolio route shows the deterministic runbook and first successful edit dismisses onboarding', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('replaylab:onboarding-complete'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, appUrl('demo', true));

  await expect(page.locator('.demo-runbook')).toContainText('ReplayLab in 60 seconds');
  await expect(page.locator('.onboarding-strip')).toContainText('Move one player to make this play yours.');
  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.focus();
  await actor.press('ArrowRight');
  await expect(page.locator('.onboarding-strip')).toHaveCount(0);
  await expect(page.locator('#persistence-status')).toContainText(/Saved locally|Saving locally/);
});

test('unapplied rich cue survives unrelated document/status renders and commits before reload', async ({ page }) => {
  await openApp(page, appUrl('cue-draft'));
  const cue = page.getByRole('textbox', { name: 'Cue block 1 text' });
  await cue.fill('Keep this unapplied draft');
  await page.evaluate(async () => {
    window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 200, y: 160 });
    await window.replayLabApp!.facade.flush();
  });
  await expect(cue).toHaveValue('Keep this unapplied draft');
  await page.getByRole('button', { name: 'Apply cue' }).click();
  await page.evaluate(() => window.replayLabApp!.facade.flush());
  await page.reload();
  await expect(cue).toHaveValue('Keep this unapplied draft');
});
