import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

function authoringUrl(name: string, database = `replaylab-${name}-${Date.now()}`) {
  return {
    database,
    url: `/app/play/${name}/edit?db=${database}`,
  };
}

async function waitUntilReady(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('pointer drag and keyboard nudge are parity paths for one durable pose command each', async ({ page }) => {
  const target = authoringUrl('pointer-keyboard');
  await waitUntilReady(page, target.url);
  const canvas = page.locator('#court');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('Court has no visible bounds');
  const toClient = (x: number, y: number) => ({
    x: bounds.x + (x / 840) * bounds.width,
    y: bounds.y + (y / 460) * bounds.height,
  });

  const start = toClient(110, 125);
  const end = toClient(210, 185);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  const actor = page.locator('[data-actor-id="offense-1"]');
  await expect(actor).toContainText('x 210 · y 185');

  await actor.focus();
  await actor.press('ArrowRight');
  await expect(actor).toContainText('x 215 · y 185');
  await expect(page.locator('#live-region')).toContainText('Offense 1 moved');

  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(actor).toContainText('x 210 · y 185');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(actor).toContainText('x 110 · y 125');
});

test('two tabs converge through the IndexedDB source BroadcastChannel without save action', async ({ context, page }) => {
  const target = authoringUrl('two-tab');
  const second = await context.newPage();
  await Promise.all([
    waitUntilReady(page, target.url),
    waitUntilReady(second, target.url),
  ]);

  const firstActor = page.locator('[data-actor-id="defense-1"]');
  await firstActor.focus();
  await firstActor.press('Shift+ArrowLeft');
  await expect(firstActor).toContainText('x 60 · y 310');
  await expect(second.locator('[data-actor-id="defense-1"]')).toContainText(
    'x 60 · y 310',
    { timeout: 10_000 }
  );

  const secondActor = second.locator('[data-actor-id="offense-2"]');
  await secondActor.focus();
  await secondActor.press('ArrowDown');
  await expect(page.locator('[data-actor-id="offense-2"]')).toContainText(
    'x 245 · y 155',
    { timeout: 10_000 }
  );
  await second.close();
});

test('semantic companion, focus model, announcements, and axe scan cover authoring controls', async ({ page }) => {
  const target = authoringUrl('accessibility');
  await waitUntilReady(page, target.url);

  await expect(page.getByRole('heading', { name: 'Formation board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lineup' })).toBeVisible();
  await expect(page.locator('[data-actor-id]')).toHaveCount(10);
  await expect(page.getByRole('combobox', { name: 'Possession' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Phase 1/ })).toHaveAttribute('aria-current', 'step');

  const actor = page.locator('[data-actor-id="offense-3"]');
  await actor.focus();
  await expect(actor).toBeFocused();
  await actor.press('ArrowUp');
  await expect(page.locator('#live-region')).toContainText('Offense 3 moved');

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(): Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> };
    };
    const result = await axeWindow.axe.run();
    return result.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.length,
    }));
  });
  expect(violations.filter(item => item.impact === 'critical' || item.impact === 'serious')).toEqual([]);

  const ariaSnapshot = await page.locator('.app-shell').ariaSnapshot();
  const report = {
    generatedAt: new Date().toISOString(),
    automatedAxeSeriousOrCriticalViolations: 0,
    keyboardSmoke: ['focus offense-3', 'ArrowUp', 'polite move announcement'],
    screenReaderAudio: 'NOT RUN: Windows Computer Use helper failed twice with sandbox ACL; AT tree captured below.',
    ariaSnapshot,
  };
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    resolve(evidenceRoot, 'slice1a-accessibility.json'),
    JSON.stringify(report, null, 2) + String.fromCharCode(10)
  );
  await page.screenshot({
    path: resolve(evidenceRoot, 'slice1a-ui.png'),
    fullPage: true,
    animations: 'disabled',
  });
});

test('storage failure is explicit, read-only, and exposes export instead of claiming durability', async ({ page }) => {
  await waitUntilReady(
    page,
    `/app/play/storage-failure/edit?db=failure-${Date.now()}&storage=unavailable`
  );
  await expect(page.getByRole('alert')).toContainText('Local storage did not open');
  await expect(page.locator('#persistence-status')).toContainText('Read-only recovery copy');
  await expect(page.getByRole('button', { name: /Add phase/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();
  await expect(page.locator('[data-app-ready="true"]')).toHaveAttribute('data-local-source', 'seed');
});
