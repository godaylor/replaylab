import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { seedReplayRoot, readReplaySnapshot, type ActionPath, type ReplaySnapshot } from '../src/domain';
import { projectPlayback } from '../src/playback';

function curvedSnapshot(): ReplaySnapshot {
  const doc = new Y.Doc();
  seedReplayRoot(doc.getMap('replay'), ['cue-1', 'cue-2']);
  const snapshot = readReplaySnapshot(doc.getMap('replay'));
  const path: ActionPath = { points: [{ x: 110, y: 125 }, { x: 110, y: 200 }, { x: 130, y: 200 }, { x: 130, y: 125 }] };
  snapshot.actions.push({ id: 'curve', actorId: 'offense-1', fromFrameId: 'phase-1', toFrameId: 'phase-2', type: 'dribble', targetActorId: null, path: { value: path, winnerId: 'path', candidates: [{ id: 'path', value: path, actorId: 'local', commandId: 'curve' }] }, archived: false, adjacency: 'valid' });
  doc.destroy();
  return snapshot;
}

test('resolved matching paths use deterministic distance interpolation and keep the ball with its holder without mutating the snapshot', () => {
  const snapshot = curvedSnapshot();
  const before = JSON.stringify(snapshot);
  const midpoint = projectPlayback(snapshot, 750);
  expect(midpoint.poses['offense-1']).toEqual({ x: 120, y: 200 });
  expect(midpoint.ballPose).toEqual({ x: 139, y: 181 });
  expect(projectPlayback(snapshot, 300).poses['offense-1']).toEqual({ x: 110, y: 125 });
  expect(projectPlayback(snapshot, 1200).poses['offense-1']).toEqual({ x: 130, y: 125 });
  expect(JSON.stringify(snapshot)).toBe(before);
});

test('stale, archived, competing and unresolved paths defer to canonical poses; zero-length segments stay finite', () => {
  const check = (mutate: (snapshot: ReplaySnapshot) => void) => {
    const snapshot = curvedSnapshot(); mutate(snapshot);
    expect(projectPlayback(snapshot, 750).poses['offense-1']).toEqual({ x: 120, y: 125 });
  };
  check(s => { s.actions[0]!.path.value.points.at(-1)!.x = 131; });
  check(s => { s.actions[0]!.archived = true; });
  check(s => { s.actions[0]!.adjacency = 'needs-repair'; });
  check(s => { s.actions.push({ ...s.actions[0]!, id: 'competing' }); });
  check(s => { s.actions[0]!.path.candidates.push({ ...s.actions[0]!.path.candidates[0]!, id: 'unresolved' }); });
  check(s => { s.actions[0]!.path.value.points = [{ x: 110, y: 125 }, { x: 110, y: 125 }, { x: 130, y: 125 }]; });
});

test('interactive endpoints undo with the action, preserve concurrent remote poses/possession, and reject invalid drafts before writing', async ({ page }) => {
  await page.goto(`/app/play/endpoint-proof/edit?db=endpoint-proof-${Date.now()}`);
  await page.locator('[data-app-ready]').waitFor();
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const seed = Facade.createMemory('endpoint-seed');
    const local = Facade.fromUpdate(seed.encode(), 'endpoint-local');
    const remote = Facade.fromUpdate(seed.encode(), 'endpoint-remote');
    const passLocal = Facade.fromUpdate(seed.encode(), 'pass-local');
    const passRemote = Facade.fromUpdate(seed.encode(), 'pass-remote');
    try {
      const start = seed.snapshot.phases[0]!.poses['offense-1'];
      local.createAction({ actorId: 'offense-1', type: 'cut', path: { points: [start, { x: 430, y: 200 }] }, applyEndpoint: true });
      const endpoint = local.snapshot.phases[1]!.poses['offense-1'];
      local.undo();
      const singleUndo = { actions: local.snapshot.actions.length, pose: local.snapshot.phases[1]!.poses['offense-1'] };
      local.redo();
      remote.setActorPose({ phaseIndex: 1, actorId: 'offense-1', x: 500, y: 240 });
      local.applyRemoteUpdate(remote.encode());
      const concurrent = local.snapshot.phases[1]!.poseRegisters['offense-1'].candidates.length;
      local.undo();
      const afterUndo = local.snapshot.phases[1]!.poseRegisters['offense-1'].candidates.map(c => c.value);
      passLocal.createAction({ actorId: 'offense-1', targetActorId: 'offense-2', type: 'pass', path: { points: [start, seed.snapshot.phases[1]!.poses['offense-2']] }, applyEndpoint: true });
      const recipient = passLocal.snapshot.phases[1]!.possession.value;
      passRemote.setPossession({ phaseIndex: 1, value: 'offense-3' });
      passLocal.applyRemoteUpdate(passRemote.encode()); passLocal.undo();
      const afterPassUndo = passLocal.snapshot.phases[1]!.possession.candidates.map(c => c.value);
      const encoded = Array.from(seed.encode()).join(',');
      let rejected = 0;
      for (const bad of [
        { actorId: 'offense-1' as const, type: 'cut' as const, path: { points: [start, { x: 9999, y: 200 }] }, applyEndpoint: true },
        { actorId: 'offense-2' as const, targetActorId: 'offense-3' as const, type: 'pass' as const, path: { points: [start, { x: 300, y: 200 }] }, applyEndpoint: true },
      ]) try { seed.createAction(bad); } catch { rejected++; }
      const untouched = encoded === Array.from(seed.encode()).join(',');
      seed.createAction({ actorId: 'offense-1', type: 'cut', path: { points: [start, { x: 430, y: 200 }] } });
      return { endpoint, singleUndo, concurrent, afterUndo, recipient, afterPassUndo, rejected, untouched, annotationPose: seed.snapshot.phases[1]!.poses['offense-1'] };
    } finally { seed.close(); local.close(); remote.close(); passLocal.close(); passRemote.close(); }
  });
  expect(result.endpoint).toEqual({ x: 430, y: 200 });
  expect(result.singleUndo).toEqual({ actions: 0, pose: { x: 130, y: 125 } });
  expect(result.concurrent).toBe(2);
  expect(result.afterUndo).toContainEqual({ x: 500, y: 240 });
  expect(result.afterUndo).not.toContainEqual({ x: 430, y: 200 });
  expect(result.recipient).toBe('offense-2');
  expect(result.afterPassUndo).toContain('offense-3');
  expect(result.afterPassUndo).not.toContain('offense-2');
  expect(result.rejected).toBe(2);
  expect(result.untouched).toBe(true);
  expect(result.annotationPose).toEqual({ x: 130, y: 125 });
});
