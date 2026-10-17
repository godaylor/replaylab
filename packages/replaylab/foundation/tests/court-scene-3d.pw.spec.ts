import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

import { courtBallHeight3D, courtScenePoses3D, hitTestCourtScene3D, inverseCourtPoint3D, projectCourtPoint3D } from '../src/court-scene-3d';
import { deriveBallPose, readReplaySnapshot, seedReplayRoot } from '../src/domain';
import { projectPlayback } from '../src/playback';

function fixture() {
  const doc = new Y.Doc({ guid: 'court-scene-projection' });
  const replay = doc.getMap<unknown>('replay');
  seedReplayRoot(replay, ['cue-1', 'cue-2']);
  return { doc, snapshot: readReplaySnapshot(replay) };
}

test('3D camera keeps canonical bounds and full-height actors inside desktop and narrow views', () => {
  for (const [width, height] of [[1440, 760], [840, 460], [390, 360], [320, 260]]) {
    const near = projectCourtPoint3D(width!, height!, { x: 20, y: 230 });
    const basket = projectCourtPoint3D(width!, height!, { x: 774, y: 230 });
    expect(basket.x).toBeGreaterThan(near.x);
    for (const x of [20, 820]) for (const y of [20, 440]) for (const z of [0, 76]) {
      const point = projectCourtPoint3D(width!, height!, { x, y }, z);
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(width!);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(height!);
      expect(point.scale).toBeGreaterThan(0);
    }
  }
});

test('inverse camera round-trips the floor through resizing and preserves out-of-court capture coordinates', () => {
  for (const [width, height] of [[1440, 760], [840, 460], [390, 360], [320, 260]]) {
    for (const x of [-50, 20, 420, 820, 900]) for (const y of [-40, 20, 230, 440, 500]) {
      const projected = projectCourtPoint3D(width!, height!, { x, y });
      const inverse = inverseCourtPoint3D(width!, height!, projected);
      expect(inverse).not.toBeNull();
      expect(inverse!.x).toBeCloseTo(x, 8);
      expect(inverse!.y).toBeCloseTo(y, 8);
    }
  }
  expect(inverseCourtPoint3D(0, 460, { x: 20, y: 20 })).toBeNull();
  expect(inverseCourtPoint3D(840, -460, { x: 20, y: 20 })).toBeNull();
  expect(inverseCourtPoint3D(Infinity, 460, { x: 20, y: 20 })).toBeNull();
  expect(inverseCourtPoint3D(840, 460, { x: NaN, y: 20 })).toBeNull();
  expect(inverseCourtPoint3D(840, 460, { x: 20, y: Infinity })).toBeNull();
});

test('3D draft changes only projected poses and carries its possessed ball without mutating the snapshot', () => {
  const { doc, snapshot } = fixture();
  const before = Y.encodeStateAsUpdate(doc);
  const beforeSnapshot = JSON.stringify(snapshot);
  const phase = snapshot.phases[0]!;
  const scene = { snapshot, phaseIndex: 0, draft: { entityId: 'offense-1' as const, pose: { x: 550, y: 300 } } };
  const projected = courtScenePoses3D(scene);
  expect(projected.poses['offense-1']).toEqual(scene.draft.pose);
  expect(projected.ballPose).toEqual(deriveBallPose(projected.poses, 'offense-1', null));
  const torso = projectCourtPoint3D(840, 460, scene.draft.pose, 47);
  expect(hitTestCourtScene3D(840, 460, scene, torso.x, torso.y)).toBe('offense-1');
  const ball = projectCourtPoint3D(840, 460, projected.ballPose, courtBallHeight3D(scene));
  expect(hitTestCourtScene3D(840, 460, scene, ball.x, ball.y)).toBe('ball');
  const other = courtScenePoses3D({ snapshot, draft: { entityId: 'offense-2', pose: { x: 700, y: 400 } } });
  expect(other.ballPose).toEqual(phase.ballPose);
  const loose = courtScenePoses3D({ snapshot, draft: { entityId: 'ball', pose: { x: 600, y: 200 } } });
  expect(loose.ballPose).toEqual({ x: 600, y: 200 });
  expect(JSON.stringify(snapshot)).toBe(beforeSnapshot);
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  doc.destroy();
});

test('3D body picking resolves overlapping silhouettes from the front and rejects invalid input', () => {
  const { doc, snapshot } = fixture();
  const phase = snapshot.phases[0]!;
  // Isolate two adjacent athletes without deriving the expectation from the hit function.
  for (const actor of snapshot.actors) phase.poses[actor.id] = { x: 100 + actor.number * 50, y: 30 };
  phase.poses['offense-2'] = { x: 500, y: 280 };
  phase.poses['defense-2'] = { x: 500, y: 290 };
  const scene = { snapshot, phaseIndex: 0 };
  const frontTorso = projectCourtPoint3D(840, 460, phase.poses['defense-2'], 43);
  expect(hitTestCourtScene3D(840, 460, scene, frontTorso.x, frontTorso.y)).toBe('defense-2');
  const frontHead = projectCourtPoint3D(840, 460, phase.poses['defense-2'], 72);
  expect(hitTestCourtScene3D(840, 460, scene, frontHead.x, frontHead.y)).toBe('defense-2');
  const frontFeet = projectCourtPoint3D(840, 460, phase.poses['defense-2'], 3);
  expect(hitTestCourtScene3D(840, 460, scene, frontFeet.x, frontFeet.y)).toBe('defense-2');
  expect(hitTestCourtScene3D(840, 460, scene, NaN, 200)).toBeNull();
  expect(hitTestCourtScene3D(0, 460, scene, 100, 200)).toBeNull();
  doc.destroy();
});

test('3D watch selection uses displayed player/ball geometry without changing canonical poses', () => {
  const { doc, snapshot } = fixture();
  const before = Y.encodeStateAsUpdate(doc);
  const scene = { snapshot, phaseIndex: 0 };
  const pose = snapshot.phases[0]!.poses['offense-1'];
  const chest = projectCourtPoint3D(840, 460, pose, 47);
  expect(hitTestCourtScene3D(840, 460, scene, chest.x, chest.y)).toBe('offense-1');
  const ball = projectCourtPoint3D(840, 460, snapshot.phases[0]!.ballPose, courtBallHeight3D(scene));
  expect(hitTestCourtScene3D(840, 460, scene, ball.x, ball.y)).toBe('ball');
  expect(hitTestCourtScene3D(840, 460, scene, 0, 0)).toBeNull();
  expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  doc.destroy();
});

test('ball flight height is deterministic and reduced motion disables cosmetic dribbling', () => {
  const { doc, snapshot } = fixture();
  const first = snapshot.phases[0]!;
  const last = snapshot.phases[1]!;
  last.possession.value = 'offense-2';
  const frame = projectPlayback(snapshot, 750);
  expect(courtBallHeight3D({ snapshot, frame })).toBeCloseTo(69);
  expect(courtBallHeight3D({ snapshot, frame })).toBe(courtBallHeight3D({ snapshot, frame }));
  last.possession.value = first.possession.value;
  const path = { points: [first.poses['offense-1'], last.poses['offense-1']] };
  snapshot.actions.push({ id: 'dribble-height', fromFrameId: first.id, toFrameId: last.id, actorId: 'offense-1', targetActorId: null, type: 'dribble', archived: false, adjacency: 'valid', path: { winnerId: 'path', value: path, candidates: [{ id: 'path', value: path, actorId: 'test', commandId: 'test' }] } });
  const dribbleFrame = projectPlayback(snapshot, 750);
  expect(courtBallHeight3D({ snapshot, frame: dribbleFrame })).toBeLessThanOrEqual(34);
  expect(courtBallHeight3D({ snapshot, frame: dribbleFrame, motionReduced: true })).toBe(35);
  doc.destroy();
});
