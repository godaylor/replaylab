import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

import { courtBallHeight3D, hitTestCourtScene3D, projectCourtPoint3D } from '../src/court-scene-3d';
import { readReplaySnapshot, seedReplayRoot } from '../src/domain';
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
