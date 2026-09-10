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
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('pointer draw, Escape cancel, and keyboard dialog create actions without pointermove history', async ({ page }) => {
  await open(page, 'slice2a-action-parity');
  const canvas = page.locator('#court');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Court has no visible bounds');
  const point = (x: number, y: number) => ({
    x: bounds.x + (x / 840) * bounds.width,
    y: bounds.y + (y / 460) * bounds.height,
  });

  await page.getByRole('button', { name: /^cut C$/i }).click();
  const start = point(110, 125);
  const end = point(320, 190);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('[data-action-id]')).toHaveCount(1);
  await expect(page.locator('#court')).toHaveAttribute('data-projection-count', '12');

  await page.getByRole('button', { name: /^dribble D$/i }).click();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(point(420, 230).x, point(420, 230).y, { steps: 4 });
  await canvas.press('Escape');
  await page.mouse.up();
  await expect(page.locator('[data-action-id]')).toHaveCount(1);
  await expect(page.locator('#live-region')).toContainText('cancelled');

  const dialogButton = page.getByRole('button', { name: 'Keyboard action…' });
  await dialogButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').press('Escape');
  await expect(dialogButton).toBeFocused();

  await dialogButton.click();
  await page.getByRole('dialog').locator('select').first().selectOption('dribble');
  await page.getByLabel('End x').fill('360');
  await page.getByLabel('End y').fill('220');
  await page.getByRole('button', { name: 'Create action' }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(2);

  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(1);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(0);
});

test('cue blocks are mouse-free, IME-safe, and undo as one rich-text unit', async ({ page }) => {
  await open(page, 'slice2a-cue');
  const firstText = page.getByLabel('Cue block 1 text');
  await firstText.focus();
  await firstText.fill('Смена стороны');
  await page.getByLabel('Cue block 1 type').selectOption('bullet');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByLabel('Cue block 1 link').fill('https://example.com/cue');
  await page.getByRole('button', { name: 'Add cue block' }).click();
  await page.getByLabel('Cue block 2 type').selectOption('number');
  await page.getByLabel('Cue block 2 text').fill('Finish at rim');

  await firstText.dispatchEvent('compositionstart');
  await firstText.evaluate(element => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, isComposing: true }));
  });
  await firstText.dispatchEvent('compositionend');
  await expect(page.locator('[data-phase-index]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Apply cue' }).click();
  const cue = await page.evaluate(() => window.replayLabApp!.facade.getCueDocument());
  expect(cue.blocks.map(block => block.type)).toEqual(['bullet', 'number']);
  expect(cue.blocks[0]!.runs[0]!.bold).toBe(true);
  expect(cue.blocks[0]!.runs[0]!.link).toBe('https://example.com/cue');

  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(firstText).toHaveValue('Start in horns.');
  await expect(firstText).toBeFocused();
});

test('action and cue editor pass axe with reduced motion and expose semantic evidence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'slice2a-accessibility');
  await page.getByRole('button', { name: 'Keyboard action…' }).click();
  await page.getByRole('button', { name: 'Create action' }).click();
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(): Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> };
    };
    const result = await axeWindow.axe.run();
    return result.violations
      .filter(item => item.impact === 'critical' || item.impact === 'serious')
      .map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
  });
  expect(violations).toEqual([]);
  const reducedMotion = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  expect(reducedMotion).toBe(true);
  const ariaSnapshot = await page.locator('.app-shell').ariaSnapshot();
  expect(ariaSnapshot).toContain('Actions from this phase');
  expect(ariaSnapshot).toContain('Cue');
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    resolve(evidenceRoot, 'slice2a-accessibility.json'),
    JSON.stringify({ reducedMotion, automatedAxeSeriousOrCriticalViolations: 0, ariaSnapshot }, null, 2) + '\n'
  );
});
