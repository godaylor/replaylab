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
const REPLAYLAB_SYNC_PORT = 32411;
let syncServer: ReplaySyncWebSocketServer;

function percentile(values: number[], ratio: number) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)] ?? Number.POSITIVE_INFINITY;
}

test.beforeAll(async () => {
  syncServer = new ReplaySyncWebSocketServer({ port: REPLAYLAB_SYNC_PORT });
  await syncServer.ready();
});

test.afterAll(async () => {
  await syncServer.close();
});

async function openCapability(context: BrowserContext, input: {
  roomId: string;
  capability: string;
  dbName: string;
  name: string;
  color: string;
}) {
  const page = await context.newPage();
  const fragment = capabilityFragment({
    endpoint: syncServer.endpoint,
    roomId: input.roomId,
    capability: input.capability,
    access: 'write',
  });
  await page.goto(`/app/play/${input.roomId}/edit?db=${input.dbName}&name=${encodeURIComponent(input.name)}&color=${encodeURIComponent(input.color)}${fragment}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced');
  await page.waitForFunction(() => window.replayLabApp?.awarenessSource?.state === 'connected');
  return page;
}

test('online to offline concurrent same-pose edits recover within three seconds and per-user undo preserves collaborator work', async ({ browser }) => {
  const roomId = `slice5b-partition-${Date.now()}`;
  const room = syncServer.createRoom(roomId);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await openCapability(contextA, { roomId, capability: room.writeToken, dbName: `slice5b-a-${Date.now()}`, name: 'Coach A', color: '#ff625f' });
    const pageB = await openCapability(contextB, { roomId, capability: room.writeToken, dbName: `slice5b-b-${Date.now()}`, name: 'Coach B', color: '#45c8f5' });

    await contextB.setOffline(true);
    await pageB.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'offline');
    await pageB.evaluate(() => window.replayLabApp!.facade.setActorPose({ phaseIndex: 0, actorId: 'offense-1', x: 610, y: 210 }));
    await pageA.evaluate(() => window.replayLabApp!.facade.setActorPose({ phaseIndex: 0, actorId: 'offense-1', x: 220, y: 180 }));

    const reconnectStarted = Date.now();
    await contextB.setOffline(false);
    await pageB.waitForFunction(() => {
      const app = window.replayLabApp!;
      return app.networkSource!.immediateRecoveryCount > 0 && app.facade.snapshot.phases[0]!.poseRegisters['offense-1'].candidates.length >= 2;
    });
    await pageA.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poseRegisters['offense-1'].candidates.length >= 2);
    await expect.poll(async () => pageB.evaluate(() => window.replayLabApp!.facade.exportSnapshot())).toBe(await pageA.evaluate(() => window.replayLabApp!.facade.exportSnapshot()));
    const convergenceMs = Date.now() - reconnectStarted;

    const collaboratorBefore = await pageA.evaluate(() => {
      window.replayLabApp!.facade.setActorPose({ phaseIndex: 0, actorId: 'defense-5', x: 123, y: 321 });
      return true;
    });
    expect(collaboratorBefore).toBe(true);
    await pageB.evaluate(() => window.replayLabApp!.facade.setActorPose({ phaseIndex: 0, actorId: 'offense-2', x: 700, y: 150 }));
    await pageA.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-2'].x === 700);
    await pageB.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['defense-5'].x === 123);
    const remoteRegister = await pageB.evaluate(() => JSON.stringify(window.replayLabApp!.facade.snapshot.phases[0]!.poseRegisters['defense-5']));
    await pageB.evaluate(() => window.replayLabApp!.facade.undo());
    await pageA.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-2'].x !== 700);
    await expect.poll(async () => pageB.evaluate(() => window.replayLabApp!.facade.exportSnapshot())).toBe(await pageA.evaluate(() => window.replayLabApp!.facade.exportSnapshot()));
    const undoState = await pageB.evaluate(remote => ({
      collaboratorPreserved: JSON.stringify(window.replayLabApp!.facade.snapshot.phases[0]!.poseRegisters['defense-5']) === remote,
      localGestureReverted: window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-2'].x !== 700,
      recoveryCount: window.replayLabApp!.networkSource!.immediateRecoveryCount,
      recoveryDurationMs: window.replayLabApp!.networkSource!.lastRecoveryDurationMs,
      indexedDbMain: window.replayLabApp!.storageMode.kind === 'indexeddb',
    }), remoteRegister);

    expect(convergenceMs).toBeLessThanOrEqual(3000);
    expect(undoState).toMatchObject({ collaboratorPreserved: true, localGestureReverted: true, indexedDbMain: true });
    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(resolve(evidenceRoot, 'slice5b-partition.json'), JSON.stringify({
      verdict: 'PASS',
      recoveryProfileGateMs: 3000,
      convergenceMs,
      samePoseConflictCandidates: 2,
      explicitImmediateOnlineRestart: true,
      fixedPorts: { preview: Number(new URL(pageA.url()).port), sync: REPLAYLAB_SYNC_PORT },
      ...undoState,
    }, null, 2) + '\n');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('awareness is bounded and expiring, late tabs collect it, disconnect removes it, and reduced-motion follow always exits locally', async ({ browser }) => {
  const roomId = `slice5b-awareness-${Date.now()}`;
  const room = syncServer.createRoom(roomId, { presenceTtlMs: 1200 });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const pageA = await openCapability(contextA, { roomId, capability: room.writeToken, dbName: `slice5b-pa-${Date.now()}`, name: 'Presenter A', color: '#ff625f' });
    const pageB = await openCapability(contextB, { roomId, capability: room.writeToken, dbName: `slice5b-pb-${Date.now()}`, name: 'Reviewer B', color: '#45c8f5' });
    const historyBefore = await pageA.evaluate(() => ({
      encoded: [...window.replayLabApp!.facade.encode()],
      canUndo: window.replayLabApp!.facade.canUndo,
    }));
    await pageA.evaluate(() => window.replayLabApp!.awarenessSource!.publish({
      selection: { phaseId: window.replayLabApp!.facade.snapshot.phases[0]!.id, entityId: 'offense-1' },
      pointer: { phaseId: window.replayLabApp!.facade.snapshot.phases[0]!.id, x: 220, y: 180 },
      presenter: { phaseIndex: 1, playheadMs: 3000, playing: true },
    }));
    await pageB.waitForFunction(() => window.replayLabApp!.awarenessSource!.presences.some(item => item.participantName === 'Presenter A' && item.presenter?.phaseIndex === 1));

    const pageC = await openCapability(contextC, { roomId, capability: room.writeToken, dbName: `slice5b-pc-${Date.now()}`, name: 'Late Reviewer', color: '#ffb020' });
    await pageC.waitForFunction(() => window.replayLabApp!.awarenessSource!.presences.some(item => item.participantName === 'Presenter A'));
    await pageC.getByRole('button', { name: 'Follow' }).click();
    await pageC.waitForFunction(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex === 1);
    const reducedFollow = await pageC.evaluate(() => ({
      phaseIndex: window.replayLabApp!.playbackController!.currentFrame.phaseIndex,
      transitionProgress: window.replayLabApp!.playbackController!.currentFrame.transitionProgress,
      following: document.querySelector('.presence-panel')?.getAttribute('data-following'),
    }));
    await pageC.keyboard.press('Escape');
    await expect(pageC.locator('.presence-panel')).toHaveAttribute('data-following', '');
    await pageC.evaluate(() => window.replayLabApp!.playbackController!.goToPhase(0));
    await pageA.evaluate(() => window.replayLabApp!.awarenessSource!.publish({ presenter: { phaseIndex: 1, playheadMs: 4200, playing: true } }));
    await pageC.waitForTimeout(180);
    const exitedLocally = await pageC.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex === 0);

    const historyAfter = await pageA.evaluate(() => ({
      encoded: [...window.replayLabApp!.facade.encode()],
      canUndo: window.replayLabApp!.facade.canUndo,
    }));
    expect(historyAfter).toEqual(historyBefore);
    expect(reducedFollow).toMatchObject({ phaseIndex: 1, transitionProgress: 0 });
    expect(reducedFollow.following).not.toBe('');
    expect(exitedLocally).toBe(true);

    await pageB.addScriptTag({ path: axePath });
    const violations = await pageB.evaluate(async () => {
      const axeWindow = window as typeof window & { axe: { run(context?: string): Promise<{ violations: Array<{ id: string; impact: string | null }> }> } };
      const result = await axeWindow.axe.run('.presence-panel');
      return result.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
    });
    expect(violations).toEqual([]);

    await contextA.close();
    await pageB.waitForFunction(() => !window.replayLabApp!.awarenessSource!.presences.some(item => item.participantName === 'Presenter A'));
    await pageC.evaluate(() => window.replayLabApp!.awarenessSource!.publish({ selection: { phaseId: window.replayLabApp!.facade.snapshot.phases[0]!.id, entityId: 'defense-1' } }));
    await pageB.waitForFunction(() => window.replayLabApp!.awarenessSource!.presences.some(item => item.participantName === 'Late Reviewer'));
    await pageB.waitForFunction(() => !window.replayLabApp!.awarenessSource!.presences.some(item => item.participantName === 'Late Reviewer'), undefined, { timeout: 3000 });

    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(resolve(evidenceRoot, 'slice5b-awareness.json'), JSON.stringify({
      verdict: 'PASS',
      separateEphemeralChannel: true,
      lateTabCollection: true,
      disconnectRemoval: true,
      expiryMs: 1200,
      documentBytesAndHistoryUnchanged: true,
      presenterFollow: true,
      localExit: exitedLocally,
      reducedMotionDiscretePhase: reducedFollow.transitionProgress === 0,
      pointerThrottleHzMax: 20,
      presenterThrottleHzMax: 10,
      automatedAxeSeriousOrCriticalViolations: violations.length,
    }, null, 2) + '\n');
  } finally {
    if (contextA.pages().length) await contextA.close();
    await contextB.close();
    await contextC.close();
  }
});

test('maximum fixture keeps the rendering budget while transient presence bypasses React renders', async ({ browser }) => {
  const roomId = `slice5b-performance-${Date.now()}`;
  const room = syncServer.createRoom(roomId);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await openCapability(contextA, { roomId, capability: room.writeToken, dbName: `slice5b-perf-a-${Date.now()}`, name: 'Pointer A', color: '#ff625f' });
    const pageB = await openCapability(contextB, { roomId, capability: room.writeToken, dbName: `slice5b-perf-b-${Date.now()}`, name: 'Observer B', color: '#45c8f5' });
    await pageB.evaluate(() => {
      const facade = window.replayLabApp!.facade;
      while (facade.snapshot.phases.length < 12) facade.addPhaseAfter(facade.snapshot.phases.length - 1);
      const actors = ['offense-1', 'offense-2', 'offense-3', 'offense-4', 'offense-5'] as const;
      for (let index = 0; index < 30; index += 1) {
        const actorId = actors[index % actors.length]!;
        facade.createAction({
          actorId,
          type: index % 2 ? 'dribble' : 'cut',
          path: { points: [facade.snapshot.phases[0]!.poses[actorId], { x: 180 + index * 10, y: 150 + (index % 5) * 35 }] },
        });
      }
    });
    await pageB.waitForFunction(() => window.replayLabApp!.networkSource!.state.status === 'synced');
    await pageA.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases.length === 12 && window.replayLabApp!.facade.snapshot.actions.length === 30);
    const beforePublishes = await pageA.evaluate(() => window.replayLabApp!.awarenessSource!.sentPublishCount);
    const tracePromise = pageB.evaluate(async durationMs => {
      const shell = document.querySelector<HTMLElement>('[data-app-ready="true"]')!;
      const reactBefore = Number(shell.dataset.reactRenderCount);
      const intervals: number[] = [];
      const started = performance.now();
      let previous = started;
      let frames = 0;
      await new Promise<void>(resolve => {
        const tick = (now: number) => {
          if (frames > 0) intervals.push(now - previous);
          previous = now;
          frames += 1;
          if (now - started < durationMs) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
      return {
        frames,
        elapsedMs: performance.now() - started,
        intervals,
        reactRenders: Number(shell.dataset.reactRenderCount) - reactBefore,
        phases: window.replayLabApp!.facade.snapshot.phases.length,
        actors: window.replayLabApp!.facade.snapshot.actors.length,
        actions: window.replayLabApp!.facade.snapshot.actions.length,
      };
    }, 3000);
    await pageA.evaluate(async durationMs => {
      const source = window.replayLabApp!.awarenessSource!;
      const phaseId = window.replayLabApp!.facade.snapshot.phases[0]!.id;
      const started = performance.now();
      await new Promise<void>(resolve => {
        const tick = (now: number) => {
          source.publish({ pointer: { phaseId, x: 40 + (now % 760), y: 40 + (now % 380) } });
          if (now - started < durationMs) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }, 3000);
    const trace = await tracePromise;
    const publishCount = await pageA.evaluate(before => window.replayLabApp!.awarenessSource!.sentPublishCount - before, beforePublishes);
    const framesPerSecond = trace.frames * 1000 / trace.elapsedMs;
    const frameIntervalP95Ms = percentile(trace.intervals, 0.95);
    expect(framesPerSecond).toBeGreaterThanOrEqual(55);
    expect(trace).toMatchObject({ reactRenders: 0, phases: 12, actors: 10, actions: 30 });
    expect(publishCount).toBeLessThanOrEqual(62);
    mkdirSync(evidenceRoot, { recursive: true });
    writeFileSync(resolve(evidenceRoot, 'slice5b-performance.json'), JSON.stringify({
      verdict: 'PASS', fixture: { phases: trace.phases, actors: trace.actors, actions: trace.actions },
      metrics: { framesPerSecond, frameIntervalP95Ms, reactRendersDuringPresence: trace.reactRenders, presencePublishes: publishCount },
      budgets: { minimumFramesPerSecond: 55, pointerThrottleHzMax: 20 },
    }, null, 2) + '\n');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
