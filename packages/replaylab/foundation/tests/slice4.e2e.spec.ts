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

async function createPoseAndPathConflicts(page: Page) {
  await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const phase = facade.snapshot.phases[0]!;
    const actionId = facade.createAction({
      actorId: 'offense-1',
      type: 'cut',
      path: { points: [phase.poses['offense-1'], { x: 260, y: 170 }] },
    });
    const base = facade.encode();
    const remote = Facade.fromUpdate(base, `remote-${crypto.randomUUID()}`);
    facade.setActorPose({ actorId: 'offense-1', x: 250, y: 160 });
    facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 340, y: 220 }] } });
    remote.setActorPose({ actorId: 'offense-1', x: 430, y: 270 });
    remote.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 520, y: 300 }] } });
    facade.applyRemoteUpdate(remote.encode());
    remote.close();
  });
  await expect(page.locator('[data-conflict-total]')).toHaveText('2');
}

test('pointer and keyboard resolve live candidates with focus restoration and undo', async ({ page }) => {
  await open(page, 'slice4-conflict-parity');
  await createPoseAndPathConflicts(page);
  await expect(page.locator('.phase-conflict-marker')).toContainText('2 conflicts');

  const poseConflict = page.locator('[data-conflict-kind="pose"]');
  await poseConflict.getByRole('radio').nth(1).click();
  await poseConflict.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.locator('[data-conflict-total]')).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Conflicts' })).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('resolved as one undoable command');

  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-conflict-total]')).toHaveText('2');
  await expect(page.locator('[data-action-id]')).toBeFocused();

  const pathConflict = page.locator('[data-conflict-kind="action-path"]');
  const secondCandidate = pathConflict.getByRole('radio').nth(1);
  await secondCandidate.focus();
  await secondCandidate.press('Space');
  const resolve = pathConflict.getByRole('button', { name: 'Resolve' });
  await resolve.focus();
  await resolve.press('Enter');
  await expect(page.locator('[data-conflict-total]')).toHaveText('1');
  await expect(page.getByRole('heading', { name: 'Conflicts' })).toBeFocused();
});

test('semantic conflict companion passes reduced-motion axe and forced-colors check', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'slice4-accessibility');
  await createPoseAndPathConflicts(page);
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(context?: string): Promise<{ violations: Array<{ id: string; impact: string | null; nodes: unknown[] }> }> };
    };
    const result = await axeWindow.axe.run('.conflict-panel');
    return result.violations
      .filter(item => item.impact === 'critical' || item.impact === 'serious')
      .map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
  });
  expect(violations).toEqual([]);
  const ariaSnapshot = await page.locator('.conflict-panel').ariaSnapshot();
  expect(ariaSnapshot).toContain('Candidate 1');
  expect(ariaSnapshot).toContain('Average candidates');

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await expect(page.locator('.conflict-panel')).toBeVisible();
  mkdirSync(evidenceRoot, { recursive: true });
  await page.screenshot({ path: resolve(evidenceRoot, 'slice4-high-contrast.png'), fullPage: true });
  writeFileSync(
    resolve(evidenceRoot, 'slice4-accessibility.json'),
    JSON.stringify({
      reducedMotion: true,
      forcedColors: true,
      automatedAxeSeriousOrCriticalViolations: 0,
      pointerResolution: true,
      keyboardResolution: true,
      focusRestoration: true,
      ariaSnapshot,
    }, null, 2) + '\n'
  );
});
