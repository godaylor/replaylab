import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

function target(name: string) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    database: `replaylab-slice6-${name}-${suffix}`,
    playId: `slice6-${name}-${suffix}`,
  };
}

async function openApp(page: Page, input: ReturnType<typeof target>) {
  await page.goto(`/app/play/${encodeURIComponent(input.playId)}/edit?db=${encodeURIComponent(input.database)}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('clone-first migration keeps the original database and pre-migration artifact across interruption', async ({ page }) => {
  const input = target('migration');
  await openApp(page, target('host'));

  const evidence = await page.evaluate(async ({ database, playId }) => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const writeRaw = (dbName: string, id: string, update: Uint8Array) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('collection', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const databaseHandle = request.result;
        const transaction = databaseHandle.transaction('collection', 'readwrite');
        transaction.objectStore('collection').put({ id, updates: [{ timestamp: Date.now(), update }] });
        transaction.oncomplete = () => { databaseHandle.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const readRaw = (dbName: string, id: string) => new Promise<number[]>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const databaseHandle = request.result;
        const transaction = databaseHandle.transaction('collection', 'readonly');
        const get = transaction.objectStore('collection').get(id);
        get.onsuccess = () => {
          databaseHandle.close();
          resolve(Array.from(get.result.updates[0].update as Uint8Array));
        };
      };
    });

    const legacy = Facade.createMemory(playId);
    legacy.replayRoot.delete('actions');
    const bytes = legacy.encode();
    legacy.close();
    await writeRaw(database, playId, bytes);
    const before = await readRaw(database, playId);
    let interruption: { issue?: string; recovery?: boolean } = {};
    try {
      await Facade.open({ dbName: database, playId, migrationFault: 'after-target-write' });
    } catch (error) {
      interruption = {
        issue: (error as { issue?: string }).issue,
        recovery: Boolean((error as { recoveryJson?: string }).recoveryJson),
      };
    }
    const after = await readRaw(database, playId);
    const reopened = await Facade.open({ dbName: database, playId });
    const result = {
      interruption,
      originalUnchanged: JSON.stringify(before) === JSON.stringify(after),
      migrated: reopened.migrationResult.migrated,
      diagnostics: reopened.recoveryDiagnostics,
    };
    reopened.close();
    return result;
  }, input);

  expect(evidence.interruption).toEqual({ issue: 'migration', recovery: true });
  expect(evidence.originalUnchanged).toBe(true);
  expect(evidence.migrated).toBe(true);
  expect(evidence.diagnostics.previousDatabase).toBe(input.database);
  expect(evidence.diagnostics.recoverySnapshotCount).toBeGreaterThanOrEqual(2);
});

test('corrupt main storage restores the latest immutable snapshot read-only and quota denial still exports bytes', async ({ page }) => {
  const corrupt = target('corrupt');
  const quota = target('quota');
  await openApp(page, target('host-recovery'));

  const evidence = await page.evaluate(async ({ corrupt, quota }) => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const writeRaw = (dbName: string, id: string, update: Uint8Array) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('collection', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const databaseHandle = request.result;
        const transaction = databaseHandle.transaction('collection', 'readwrite');
        transaction.objectStore('collection').put({ id, updates: [{ timestamp: Date.now(), update }] });
        transaction.oncomplete = () => { databaseHandle.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });

    const healthy = await Facade.open({ dbName: corrupt.database, playId: corrupt.playId });
    healthy.renamePlay('Last valid recovery');
    await healthy.flush();
    await healthy.checkpointRecovery(true);
    healthy.close();
    await writeRaw(corrupt.database, corrupt.playId, new Uint8Array([0xff, 0x00, 0x7f]));
    let corruptResult: { issue?: string; title?: string; readOnly?: boolean } = {};
    try {
      await Facade.open({ dbName: corrupt.database, playId: corrupt.playId });
    } catch (error) {
      const recoveryJson = (error as { recoveryJson?: string }).recoveryJson!;
      const preview = await Facade.previewRecovery(recoveryJson);
      corruptResult = {
        issue: (error as { issue?: string }).issue,
        title: preview.snapshot.title,
        readOnly: preview.readOnly,
      };
      preview.close();
    }

    const legacy = Facade.createMemory(quota.playId);
    legacy.replayRoot.delete('actions');
    const legacyUpdate = legacy.encode();
    legacy.close();
    await writeRaw(quota.database, quota.playId, legacyUpdate);
    const originalAdd = IDBObjectStore.prototype.add;
    let quotaResult: { issue?: string; portable?: boolean } = {};
    IDBObjectStore.prototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'snapshots') throw new DOMException('Synthetic quota denial', 'QuotaExceededError');
      return originalAdd.apply(this, args);
    };
    try {
      await Facade.open({ dbName: quota.database, playId: quota.playId });
    } catch (error) {
      quotaResult = {
        issue: (error as { issue?: string }).issue,
        portable: Boolean((error as { recoveryJson?: string }).recoveryJson),
      };
    } finally {
      IDBObjectStore.prototype.add = originalAdd;
    }
    return { corruptResult, quotaResult };
  }, { corrupt, quota });

  expect(evidence.corruptResult).toEqual({
    issue: 'corrupt',
    title: 'Last valid recovery',
    readOnly: true,
  });
  expect(evidence.quotaResult).toEqual({ issue: 'quota', portable: true });
});

test('portable recovery validates checksum, imports into a separate database, and diagnostics contain no document content', async ({ page }) => {
  const input = target('portable');
  await openApp(page, input);

  const evidence = await page.evaluate(async () => {
    const app = window.replayLabApp!;
    app.facade.renamePlay('Private recovery title');
    await app.facade.flush();
    const serialized = await app.facade.exportRecovery();
    const parsed = JSON.parse(serialized) as { updateBase64: string };
    parsed.updateBase64 = `${parsed.updateBase64[0] === 'A' ? 'B' : 'A'}${parsed.updateBase64.slice(1)}`;
    let tamperRejected = false;
    try {
      await app.ReplayLabEditorFacade.previewRecovery(JSON.stringify(parsed));
    } catch {
      tamperRejected = true;
    }
    const imported = await app.ReplayLabEditorFacade.importRecoveryCopy(serialized);
    const copy = await app.ReplayLabEditorFacade.open({ dbName: imported.databaseName, playId: imported.playId });
    const result = {
      tamperRejected,
      importedTitle: copy.snapshot.title,
      separateDatabase: imported.databaseName !== app.facade.recoveryDiagnostics.activeDatabase,
      diagnostics: JSON.stringify(app.facade.recoveryDiagnostics),
    };
    copy.close();
    return result;
  });

  expect(evidence.tamperRejected).toBe(true);
  expect(evidence.importedTitle).toBe('Private recovery title');
  expect(evidence.separateDatabase).toBe(true);
  expect(evidence.diagnostics).not.toContain('Private recovery title');
  expect(evidence.diagnostics).not.toContain('updateBase64');
});

test('future schema opens an explicit read-only recovery route with portable export', async ({ page }) => {
  const input = target('future');
  await openApp(page, target('host-future'));
  await page.evaluate(async ({ database, playId }) => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const future = Facade.createMemory(playId);
    future.replayRoot.set('schemaVersion', 99);
    const update = future.encode();
    future.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('collection', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const databaseHandle = request.result;
        const transaction = databaseHandle.transaction('collection', 'readwrite');
        transaction.objectStore('collection').put({ id: playId, updates: [{ timestamp: Date.now(), update }] });
        transaction.oncomplete = () => { databaseHandle.close(); resolve(); };
      };
    });
  }, input);

  await page.goto(`/app/play/${encodeURIComponent(input.playId)}/edit?db=${encodeURIComponent(input.database)}`);
  const banner = page.locator('[data-recovery-state="future-schema"]');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-recovery-preview', 'false');
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveAttribute('readonly', '');
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axeWindow = window as typeof window & {
      axe: { run(context?: string): Promise<{ violations: Array<{ id: string; impact: string | null }> }> };
    };
    const result = await axeWindow.axe.run('.storage-error');
    return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
  });
  expect(violations).toEqual([]);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Recovery file' }).focus();
  await page.getByRole('button', { name: 'Recovery file' }).press('Enter');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.replaylab-recovery.json');
});

test('bounded pagehide flush keeps the last committed gesture after abrupt tab close', async ({ context, page }) => {
  const input = target('pagehide');
  await openApp(page, input);
  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.focus();
  await actor.press('ArrowRight');
  await page.close();

  const reopened = await context.newPage();
  await openApp(reopened, input);
  await expect(reopened.locator('[data-actor-id="offense-1"]')).toContainText('x 115 · y 125');
});
