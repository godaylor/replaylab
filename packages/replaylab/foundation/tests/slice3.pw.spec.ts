import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

import { readReplaySnapshot, seedReplayRoot } from '../src/domain';
import {
  ReplayPlaybackController,
  playbackDuration,
  playbackPhaseStarts,
  projectPlayback,
} from '../src/playback';

function snapshot() {
  const doc = new Y.Doc({ guid: 'slice3-playback' });
  const replay = doc.getMap<unknown>('replay');
  seedReplayRoot(replay, ['cue-1', 'cue-2']);
  return readReplaySnapshot(replay);
}

test('deterministic playback derives exact holds, interpolation, and phase boundaries', () => {
  const replay = snapshot();
  expect(playbackPhaseStarts(replay)).toEqual([0, 1200]);
  expect(playbackDuration(replay)).toBe(1500);
  expect(projectPlayback(replay, 0).poses['offense-1']).toEqual({ x: 110, y: 125 });
  expect(projectPlayback(replay, 300).transitionProgress).toBe(0);
  const midpoint = projectPlayback(replay, 750);
  expect(midpoint.phaseIndex).toBe(0);
  expect(midpoint.nextPhaseIndex).toBe(1);
  expect(midpoint.transitionProgress).toBeCloseTo(0.5, 8);
  expect(midpoint.poses['offense-1']).toEqual({ x: 120, y: 125 });
  expect(midpoint.ballPose).toEqual({ x: 139, y: 106 });
  expect(projectPlayback(replay, 1200).phaseIndex).toBe(1);
  expect(projectPlayback(replay, Number.POSITIVE_INFINITY).playheadMs).toBe(1500);
});

test('scheduler stops while hidden/stationary and reduced motion advances discretely', () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;
  const controller = new ReplayPlaybackController(
    snapshot(),
    callback => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    handle => callbacks.delete(handle)
  );

  controller.play();
  expect(callbacks.size).toBe(1);
  controller.setRenderable(false);
  expect(controller.state).toBe('suspended');
  expect(callbacks.size).toBe(0);
  controller.setRenderable(true);
  expect(callbacks.size).toBe(1);
  const first = callbacks.entries().next().value as [number, FrameRequestCallback];
  callbacks.delete(first[0]);
  first[1](0);
  const second = callbacks.entries().next().value as [number, FrameRequestCallback];
  callbacks.delete(second[0]);
  second[1](16);
  expect(controller.playheadMs).toBe(16);
  controller.pause();
  expect(callbacks.size).toBe(0);

  controller.scrub(0);
  controller.setReducedMotion(true);
  controller.play();
  const reducedFirst = callbacks.entries().next().value as [number, FrameRequestCallback];
  callbacks.delete(reducedFirst[0]);
  reducedFirst[1](1000);
  const reducedSecond = callbacks.entries().next().value as [number, FrameRequestCallback];
  callbacks.delete(reducedSecond[0]);
  reducedSecond[1](1800);
  expect(controller.currentFrame.phaseIndex).toBe(1);
  expect(controller.currentFrame.transitionProgress).toBe(0);
  controller.destroy();
  expect(callbacks.size).toBe(0);
});
