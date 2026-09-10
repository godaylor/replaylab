import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

async function waitForApp(page: Page, url: string) {
  await page.goto(url);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('stale client shell upgrade retains compatibility cache and cold-offline authoring', async ({}, testInfo: TestInfo) => {
  test.setTimeout(90_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const url = `${baseURL}/app/play/slice6-upgrade-${suffix}/edit?db=replaylab-slice6-upgrade-${suffix}`;
  const profile = mkdtempSync(join(tmpdir(), 'replaylab-slice6-upgrade-'));
  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      viewport: { width: 1440, height: 900 },
    });
    let page = context.pages()[0] ?? await context.newPage();
    await page.addInitScript(() => localStorage.setItem('replaylab:locale', 'en'));
    await waitForApp(page, url);
    await expect(page.locator('#shell-status')).toHaveAttribute('data-shell-state', /ready|update-ready/, { timeout: 30_000 });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    const upgrade = await page.evaluate(async () => {
      const previous = await caches.open('replaylab-shell-v1');
      await previous.put('/assets/stale-client.js', new Response('/* retained stale client asset */', {
        headers: { 'Content-Type': 'text/javascript' },
      }));
      const registration = await navigator.serviceWorker.register(`/sw.js?slice6=${Date.now()}`, {
        scope: '/',
        updateViaCache: 'none',
      });
      await new Promise<void>((resolve, reject) => {
        const worker = registration.installing ?? registration.waiting;
        if (!worker || worker.state === 'installed') { resolve(); return; }
        const timeout = window.setTimeout(() => reject(new Error('Upgrade worker install timed out')), 20_000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') { window.clearTimeout(timeout); resolve(); }
        });
      });
      const waiting = registration.waiting;
      if (waiting) {
        const changed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
        waiting.postMessage({ type: 'replaylab-activate-update' });
        await changed;
      }
      return {
        waitingWasHandled: Boolean(waiting),
        cacheNames: await caches.keys(),
        staleAssetRetained: Boolean(await caches.match('/assets/stale-client.js')),
      };
    });
    expect(upgrade.cacheNames).toContain('replaylab-shell-v3');
    expect(upgrade.cacheNames).toContain('replaylab-shell-v1');
    expect(upgrade.staleAssetRetained).toBe(true);

    await page.locator('[data-actor-id="offense-1"]').focus();
    await page.locator('[data-actor-id="offense-1"]').press('ArrowRight');
    await page.getByRole('textbox', { name: 'Cue block 1 text' }).fill('Offline upgrade cue');
    await page.getByRole('button', { name: 'Apply cue' }).click();
    await page.evaluate(() => window.replayLabApp!.facade.flush());
    await context.close();
    context = null;

    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      viewport: { width: 1440, height: 900 },
    });
    await context.setOffline(true);
    page = context.pages()[0] ?? await context.newPage();
    await waitForApp(page, url);
    await expect(page.locator('[data-actor-id]')).toHaveCount(10);
    await expect(page.locator('[data-actor-id="offense-1"]')).toContainText('x 115 · y 125');
    await expect(page.getByRole('textbox', { name: 'Cue block 1 text' })).toHaveValue('Offline upgrade cue');
    await page.locator('[data-actor-id="defense-1"]').focus();
    await page.locator('[data-actor-id="defense-1"]').press('ArrowDown');
    await page.getByRole('button', { name: 'Add phase' }).click();
    await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
    await page.evaluate(() => window.replayLabApp!.facade.flush());
    await page.reload();
    await page.locator('[data-app-ready="true"]').waitFor();
    await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
    await expect(page.locator('[data-actor-id="defense-1"]')).toContainText('y 315');

    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(resolve(evidenceRoot, 'slice6-offline-upgrade.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      verdict: 'PASS',
      browserVersion: context.browser()?.version() ?? 'persistent Chromium',
      fixedReplayLabPort: Number(new URL(baseURL).port),
      upgrade,
      coldOfflineChecks: ['ten actors', 'pose edit', 'rich cue', 'phase add', 'reload persistence'],
    }, null, 2) + String.fromCharCode(10));
  } finally {
    await context?.close();
    const tempRoot = resolve(tmpdir()).toLowerCase();
    const resolvedProfile = resolve(profile).toLowerCase();
    if (!resolvedProfile.startsWith(tempRoot + sep)) {
      throw new Error('Refusing to remove a persistent profile outside the temp directory');
    }
    rmSync(profile, { recursive: true, force: true });
  }
});
