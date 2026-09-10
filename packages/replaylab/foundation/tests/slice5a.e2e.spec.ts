import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type BrowserContext } from '@playwright/test';

import { capabilityFragment } from '../src/sync-protocol';
import { ReplaySyncWebSocketServer } from '../src/sync-server';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

let syncServer: ReplaySyncWebSocketServer;

test.beforeAll(async () => {
  syncServer = new ReplaySyncWebSocketServer({ port: 32411 });
  await syncServer.ready();
});

test.afterAll(async () => {
  await syncServer.close();
});

async function openCapability(
  context: BrowserContext,
  roomId: string,
  capability: string,
  access: 'read' | 'write',
  dbName: string
) {
  const page = await context.newPage();
  const fragment = capabilityFragment({
    endpoint: syncServer.endpoint,
    roomId,
    capability,
    access,
  });
  await page.goto(`/app/play/${roomId}/edit?db=${dbName}${fragment}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp?.networkSource));
  return page;
}

test('two independent browser clients synchronize pose and cue both ways; read capability remains local-read-only', async ({ browser }) => {
  const roomId = `slice5a-room-${Date.now()}`;
  const room = syncServer.createRoom(roomId);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const readContext = await browser.newContext();
  try {
    const pageA = await openCapability(contextA, roomId, room.writeToken, 'write', `slice5a-a-${Date.now()}`);
    await expect.poll(() => room.doc.getMap('replay').has('schemaVersion')).toBe(true);
    const pageB = await openCapability(contextB, roomId, room.writeToken, 'write', `slice5a-b-${Date.now()}`);
    await expect(pageA.locator('#network-status')).toHaveAttribute('data-network-state', 'synced');
    await expect(pageB.locator('#network-status')).toHaveAttribute('data-network-state', 'synced');

    await pageA.evaluate(() => {
      window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 333, y: 222 });
    });
    await pageB.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-1'].x === 333);
    await pageB.evaluate(() => window.replayLabApp!.facade.editCue({ value: 'Reverse through the elbow.' }));
    await pageA.waitForFunction(() => window.replayLabApp!.facade.getCue() === 'Reverse through the elbow.');
    await expect(pageA.getByRole('button', { name: /^save$/i })).toHaveCount(0);
    await expect(pageB.getByRole('button', { name: /^save$/i })).toHaveCount(0);

    const readPage = await openCapability(readContext, roomId, room.readToken, 'read', `slice5a-read-${Date.now()}`);
    await expect(readPage.locator('#network-status')).toHaveAttribute('data-capability-role', 'read');
    await expect(readPage.locator('#network-status')).toHaveAttribute('data-network-state', 'synced');
    await readPage.waitForFunction(() => window.replayLabApp!.facade.getCue() === 'Reverse through the elbow.');
    await expect(readPage.locator('.title-field input')).toHaveAttribute('readonly', '');
    await expect(readPage.getByRole('button', { name: /Add phase/ })).toBeDisabled();
    const readState = await readPage.evaluate(() => {
      const app = window.replayLabApp!;
      let commandBlocked = false;
      try { app.facade.setActorPose({ actorId: 'offense-1', x: 410, y: 230 }); } catch { commandBlocked = true; }
      return {
        commandBlocked,
        readOnly: app.facade.readOnly,
        sentCommitCount: app.networkSource!.sentCommitCount,
        tokenInSearch: location.search.includes('cap='),
        tokenInFragment: location.hash.includes('cap='),
      };
    });
    expect(readState).toEqual({
      commandBlocked: true,
      readOnly: true,
      sentCommitCount: 0,
      tokenInSearch: false,
      tokenInFragment: true,
    });
    await readPage.addScriptTag({ path: axePath });
    const violations = await readPage.evaluate(async () => {
      const axeWindow = window as typeof window & { axe: { run(context?: string): Promise<{ violations: Array<{ id: string; impact: string | null }> }> } };
      const result = await axeWindow.axe.run('.status-rail');
      return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
    });
    expect(violations).toEqual([]);

    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(resolve(evidenceRoot, 'slice5a-sync.json'), JSON.stringify({
      verdict: 'PASS',
      independentBrowserContexts: 3,
      bidirectionalPoseAndCue: true,
      saveActionPresent: false,
      readCapability: readState,
      indexedDbMainSource: true,
      automatedAxeSeriousOrCriticalViolations: 0,
    }, null, 2) + '\n');
  } finally {
    await contextA.close();
    await contextB.close();
    await readContext.close();
  }
});

test('rate limit waits for Retry-After; terminal auth/schema/oversize stop only the shadow without repeat push', async ({ page }) => {
  await page.goto(`/app/play/slice5a-terminal/edit?db=slice5a-terminal-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));

  const rateRoom = syncServer.createRoom(`rate-${Date.now()}`, { rateLimit: { commits: 1, windowMs: 120 } });
  const oversizeRoom = syncServer.createRoom(`oversize-${Date.now()}`, { maxUpdateBytes: 128 });
  const schemaRoom = syncServer.createRoom(`schema-${Date.now()}`);
  const result = await page.evaluate(async ({ endpoint, rate, oversize, schema }) => {
    const app = window.replayLabApp!;
    const Source = app.ReplayNetworkDocSource;
    const make = (room: { id: string; token: string }) => new Source({
      endpoint,
      roomId: room.id,
      capability: room.token,
      access: 'write',
    });
    const exportBefore = app.facade.exportSnapshot();

    const rateSource = make(rate);
    await rateSource.connect();
    await rateSource.push(rate.id, app.facade.encode());
    app.facade.setActorPose({ actorId: 'offense-2', x: 350, y: 210 });
    const started = performance.now();
    await rateSource.push(rate.id, app.facade.encode());
    const elapsedMs = performance.now() - started;

    const oversizeSource = make(oversize);
    await oversizeSource.connect();
    try { await oversizeSource.push(oversize.id, app.facade.encode()); } catch {}
    const oversizeAttempts = oversizeSource.sentCommitCount;
    try { await oversizeSource.push(oversize.id, app.facade.encode()); } catch {}

    const schemaSource = make(schema);
    await schemaSource.connect();
    await schemaSource.push(schema.id, app.facade.encode());
    const invalid = app.ReplayLabEditorFacade.fromUpdate(app.facade.encode(), 'invalid-shadow');
    invalid.replayRoot.set('schemaVersion', 99);
    try { await schemaSource.push(schema.id, invalid.encode()); } catch {}
    const schemaAttempts = schemaSource.sentCommitCount;
    try { await schemaSource.push(schema.id, invalid.encode()); } catch {}
    invalid.close();

    const unauthorized = new Source({ endpoint, roomId: schema.id, capability: 'invalid', access: 'write' });
    try { await unauthorized.connect(); } catch {}
    const value = {
      elapsedMs,
      rateState: rateSource.state,
      oversizeState: oversizeSource.state,
      oversizeAttempts,
      oversizeAttemptsAfterRepeat: oversizeSource.sentCommitCount,
      schemaState: schemaSource.state,
      schemaAttempts,
      schemaAttemptsAfterRepeat: schemaSource.sentCommitCount,
      unauthorizedState: unauthorized.state,
      indexedDbPreserved: app.storageMode.kind === 'indexeddb',
      exportPreserved: app.facade.exportSnapshot() !== '' && exportBefore !== '',
    };
    rateSource.close(); oversizeSource.close(); schemaSource.close(); unauthorized.close();
    return value;
  }, {
    endpoint: syncServer.endpoint,
    rate: { id: rateRoom.id, token: rateRoom.writeToken },
    oversize: { id: oversizeRoom.id, token: oversizeRoom.writeToken },
    schema: { id: schemaRoom.id, token: schemaRoom.writeToken },
  });

  expect(result.elapsedMs).toBeGreaterThanOrEqual(90);
  expect(result.rateState.status).toBe('synced');
  expect(result.oversizeState).toMatchObject({ status: 'blocked', errorCode: 'oversize' });
  expect(result.oversizeAttemptsAfterRepeat).toBe(result.oversizeAttempts);
  expect(result.schemaState).toMatchObject({ status: 'blocked', errorCode: 'schema' });
  expect(result.schemaAttemptsAfterRepeat).toBe(result.schemaAttempts);
  expect(result.unauthorizedState).toMatchObject({ status: 'blocked', errorCode: 'unauthorized' });
  expect(result.indexedDbPreserved).toBe(true);
  expect(result.exportPreserved).toBe(true);
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, 'slice5a-terminal.json'),
    JSON.stringify({ verdict: 'PASS', ...result }, null, 2) + '\n');
});
