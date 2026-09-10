import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

function target(name: string) {
  const database = 'replaylab-offline-' + name + '-' + Date.now();
  return {
    database,
    path: '/app/play/' + name + '/edit?db=' + database,
  };
}

async function waitForApp(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

async function waitForOfflineShell(page: Page) {
  try {
    await expect(page.locator('#shell-status')).toHaveAttribute(
      'data-shell-state',
      'ready',
      { timeout: 30_000 }
    );
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const retry = await navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(value => ({ ok: true, scope: value.scope }))
        .catch(value => ({
          ok: false,
          message: value instanceof Error ? value.message : String(value),
        }));
      return {
        controller: navigator.serviceWorker.controller?.state ?? 'missing',
        installing: registration?.installing?.state ?? 'missing',
        waiting: registration?.waiting?.state ?? 'missing',
        active: registration?.active?.state ?? 'missing',
        retry,
        cacheNames: await caches.keys(),
      };
    });
    throw new Error('Offline shell readiness failed: ' + JSON.stringify(diagnostic), { cause: error });
  }
}

test('service worker installs, activates, and caches the versioned production shell', async ({
  page,
}) => {
  const play = target('worker-smoke');
  await waitForApp(page, play.path);
  await waitForOfflineShell(page);

  const evidence = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const cacheNames = await caches.keys();
    const shellCache = await caches.open('replaylab-shell-v3');
    const cachedPaths = (await shellCache.keys()).map(request => new URL(request.url).pathname);
    return {
      activeState: registration?.active?.state ?? 'missing',
      scope: registration?.scope ?? 'missing',
      cacheNames,
      cachedPaths,
    };
  });

  expect(evidence.activeState).toBe('activated');
  expect(evidence.cacheNames).toContain('replaylab-shell-v3');
  expect(evidence.cachedPaths).toContain('/index.html');
  expect(evidence.cachedPaths.some(path => path.startsWith('/assets/'))).toBe(true);
});

test('persistent-storage denial is explicit and leaves IndexedDB authoring available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(StorageManager.prototype, 'persisted', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: () => Promise.resolve(false),
    });
  });
  const play = target('retention-denied');
  await waitForApp(page, play.path);

  const retention = page.locator('#durability-status');
  await expect(retention).toHaveAttribute('data-storage-retention', 'evictable');
  await page.getByRole('button', { name: 'Keep offline' }).click();
  await expect(retention).toHaveAttribute('data-storage-retention', 'denied');
  await expect(retention).toContainText('export recommended');

  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.focus();
  await actor.press('ArrowRight');
  await expect(actor).toContainText('x 115 · y 125');
  await expect(page.locator('#persistence-status')).toContainText('Saved locally');
});

test('service-worker registration failure never blocks an online local load', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
      configurable: true,
      value: () => Promise.reject(new Error('Synthetic registration failure')),
    });
  });
  const play = target('worker-failure');
  await waitForApp(page, play.path);

  await expect(page.locator('#shell-status')).toHaveAttribute(
    'data-shell-state',
    'error'
  );
  await expect(page.locator('#shell-status')).toContainText(
    'online load still works'
  );
  await expect(page.locator('[data-actor-id]')).toHaveCount(10);
  await expect(page.locator('#persistence-status')).toContainText('Saved locally');
});

test('cold browser restart stays editable offline and preserves reload plus local undo', async (
  {},
  testInfo: TestInfo
) => {
  test.setTimeout(60_000);
  const baseURL = String(testInfo.project.use.baseURL);
  const play = target('cold-restart');
  const profile = mkdtempSync(join(tmpdir(), 'replaylab-offline-'));
  let context: BrowserContext | null = null;
  let browserVersion = 'unknown';

  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    let page = context.pages()[0] ?? (await context.newPage());
    await page.addInitScript(() => localStorage.setItem('replaylab:locale', 'en'));
    await waitForApp(page, baseURL + play.path);
    await waitForOfflineShell(page);

    const actor = page.locator('[data-actor-id="offense-1"]');
    await actor.focus();
    await actor.press('ArrowRight');
    await expect(actor).toContainText('x 115 · y 125');
    await page.evaluate(() => window.replayLabApp?.facade.flush());
    browserVersion = context.browser()?.version() ?? 'persistent Chromium';
    await context.close();
    context = null;

    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      serviceWorkers: 'allow',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.setOffline(true);
    page = context.pages()[0] ?? (await context.newPage());
    await waitForApp(page, baseURL + play.path);

    await expect(page.locator('[data-app-ready="true"]')).toHaveAttribute(
      'data-local-source',
      'indexeddb'
    );
    await expect(page.locator('#network-status')).toHaveAttribute(
      'data-network-state',
      'offline'
    );
    await expect(page.locator('#shell-status')).toHaveAttribute(
      'data-shell-state',
      'ready'
    );
    const reopenedActor = page.locator('[data-actor-id="offense-1"]');
    await expect(reopenedActor).toContainText('x 115 · y 125');

    await reopenedActor.focus();
    await reopenedActor.press('ArrowDown');
    await expect(reopenedActor).toContainText('x 115 · y 130');
    await page.getByRole('button', { name: /Undo/ }).click();
    await expect(reopenedActor).toContainText('x 115 · y 125');

    await reopenedActor.press('ArrowDown');
    await expect(reopenedActor).toContainText('x 115 · y 130');
    await page.evaluate(() => window.replayLabApp?.facade.flush());
    await page.reload();
    await page.locator('[data-app-ready="true"]').waitFor();
    await expect(page.locator('[data-actor-id="offense-1"]')).toContainText(
      'x 115 · y 130'
    );

    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(
      resolve(evidenceRoot, 'slice1b-offline.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          verdict: 'PASS',
          browserVersion,
          viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
          flow: [
            'online visit and edit',
            'close persistent browser context',
            'relaunch same profile offline',
            'load cached shell and IndexedDB play',
            'offline edit and local undo',
            'offline edit and reload without loss',
          ],
        },
        null,
        2
      ) + String.fromCharCode(10)
    );
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

test('an active worker shows an explicit failure when shell cache and document are both absent', async ({
  context,
  page,
}) => {
  const installed = target('fallback-prime');
  await waitForApp(page, installed.path);
  await waitForOfflineShell(page);
  await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  });
  await page.close();

  await context.setOffline(true);
  const offlinePage = await context.newPage();
  const missing = target('never-opened');
  const response = await offlinePage.goto(missing.path);
  expect(response?.status()).toBe(503);
  await expect(
    offlinePage.locator('[data-offline-unavailable="true"]')
  ).toBeVisible();
  await expect(offlinePage.getByRole('heading')).toContainText(
    'недоступен офлайн'
  );
});
