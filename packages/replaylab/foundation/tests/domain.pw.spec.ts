import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

import {
  ACTOR_IDS,
  MAX_PHASES,
  createCandidate,
  createFrame,
  getRegisterCandidates,
  migrateReplayRoot,
  readRegister,
  readReplaySnapshot,
  seedReplayRoot,
  type ActorId,
  type Pose,
} from '../src/domain';

function cloneDoc(source: Y.Doc, guid: string) {
  const clone = new Y.Doc({ guid });
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(source));
  return clone;
}

function seedDoc() {
  const doc = new Y.Doc({ guid: 'domain-fixture' });
  seedReplayRoot(doc.getMap('replay'), ['cue-1', 'cue-2']);
  return doc;
}

function replaceObserved(
  doc: Y.Doc,
  register: Y.Map<unknown>,
  id: string,
  value: Pose
) {
  const candidates = getRegisterCandidates(register);
  const observed = [...candidates.keys()];
  const next = createCandidate(id, value, String(doc.clientID), id);
  doc.transact(() => {
    for (const candidateId of observed) candidates.delete(candidateId);
    candidates.set(next.id, next.candidate);
  }, doc.clientID);
}

function poseRegister(doc: Y.Doc, actorId: ActorId) {
  const replay = doc.getMap<unknown>('replay');
  const snapshot = readReplaySnapshot(replay);
  const frames = replay.get('frames') as Y.Map<Y.Map<unknown>>;
  const frame = frames.get(snapshot.phases[0]!.id)!;
  const poses = frame.get('poses') as Y.Map<Y.Map<unknown>>;
  return poses.get(actorId)!;
}

test('v1 schema enforces ten players, complete bounded poses, derived ball, IDs, and phase caps', () => {
  const doc = seedDoc();
  const replay = doc.getMap<unknown>('replay');
  const snapshot = readReplaySnapshot(replay, 'Property fixture');

  expect(snapshot.actors).toHaveLength(10);
  expect(snapshot.phases).toHaveLength(2);
  expect(snapshot.actors.some(actor => actor.id === ('ball' as ActorId))).toBe(false);
  expect(snapshot.phases[0]!.ballPose).toEqual({ x: 129, y: 106 });
  expect(Object.keys(snapshot.phases[0]!.poses)).toEqual([...ACTOR_IDS]);

  const frames = replay.get('frames') as Y.Map<Y.Map<unknown>>;
  const poses = snapshot.phases[0]!.poses;
  for (let index = 2; index < MAX_PHASES; index += 1) {
    const id = `phase-${index + 1}`;
    frames.set(
      id,
      createFrame(id, `b${String(index).padStart(2, '0')}`, `cue-${index + 1}`, poses, 'offense-1', null, {
        actorId: 'test',
        commandId: `cap-${index}`,
      })
    );
  }
  expect(readReplaySnapshot(replay).phases).toHaveLength(MAX_PHASES);

  frames.set(
    'phase-over-cap',
    createFrame('phase-over-cap', 'z9', 'cue-over-cap', poses, 'offense-1', null, {
      actorId: 'test',
      commandId: 'cap-overflow',
    })
  );
  expect(() => readReplaySnapshot(replay)).toThrow('2–12 phases');

  expect(() =>
    createFrame('bad-bounds', 'z8', 'cue-bad', {
      ...poses,
      'offense-1': { x: -1, y: 100 },
    }, 'offense-1', null, { actorId: 'test', commandId: 'bad' })
  ).toThrow('outside the half-court');
});

test('candidate registers preserve unseen concurrent poses and converge deterministically', () => {
  const base = seedDoc();
  const left = cloneDoc(base, 'replica-left');
  const right = cloneDoc(base, 'replica-right');

  replaceObserved(left, poseRegister(left, 'offense-1'), 'left:candidate', { x: 220, y: 170 });
  replaceObserved(right, poseRegister(right, 'offense-1'), 'right:candidate', { x: 310, y: 210 });

  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'remote');
  Y.applyUpdate(right, leftUpdate, 'remote');

  const leftProjection = readRegister(poseRegister(left, 'offense-1'), 'pose');
  const rightProjection = readRegister(poseRegister(right, 'offense-1'), 'pose');
  expect(leftProjection).toEqual(rightProjection);
  expect(leftProjection.candidates.map(candidate => candidate.id)).toEqual([
    'left:candidate',
    'right:candidate',
  ]);
  expect(leftProjection.value).toEqual({ x: 310, y: 210 });
});

test('observed-set resolution removes known candidates but preserves a concurrent unseen resolution', () => {
  const base = seedDoc();
  const left = cloneDoc(base, 'resolution-left');
  const right = cloneDoc(base, 'resolution-right');
  replaceObserved(left, poseRegister(left, 'offense-1'), 'left:resolution', { x: 240, y: 180 });
  replaceObserved(right, poseRegister(right, 'offense-1'), 'right:resolution', { x: 340, y: 240 });

  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate, 'remote');
  Y.applyUpdate(right, leftUpdate, 'remote');

  replaceObserved(left, poseRegister(left, 'offense-1'), 'left:chosen', { x: 280, y: 200 });
  replaceObserved(right, poseRegister(right, 'offense-1'), 'right:chosen', { x: 300, y: 220 });
  const resolvedLeft = Y.encodeStateAsUpdate(left);
  const resolvedRight = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, resolvedRight, 'remote');
  Y.applyUpdate(right, resolvedLeft, 'remote');

  expect(readRegister(poseRegister(left, 'offense-1'), 'pose').candidates).toHaveLength(2);
  expect(readRegister(poseRegister(right, 'offense-1'), 'pose')).toEqual(
    readRegister(poseRegister(left, 'offense-1'), 'pose')
  );
});

test('Slice 0 proof structure migrates deterministically and the v1 entry point is idempotent', () => {
  const finalDoc = seedDoc();
  const finalSnapshot = readReplaySnapshot(finalDoc.getMap('replay'));
  const legacyDoc = new Y.Doc({ guid: 'legacy-slice0' });
  const replay = legacyDoc.getMap<unknown>('replay');
  const actors = new Y.Map<Y.Map<unknown>>();
  for (const actor of finalSnapshot.actors) {
    const actorMap = new Y.Map<unknown>();
    actorMap.set('team', actor.team);
    actorMap.set('number', actor.number);
    actors.set(actor.id, actorMap);
  }
  const phases = new Y.Array<Y.Map<unknown>>();
  for (const phase of finalSnapshot.phases) {
    const legacyFrame = new Y.Map<unknown>();
    legacyFrame.set('id', phase.id);
    legacyFrame.set('cueBlockId', phase.cueBlockId);
    const poses = new Y.Map<Y.Map<unknown>>();
    for (const actorId of ACTOR_IDS) {
      const candidate = new Y.Map<unknown>();
      candidate.set('x', phase.poses[actorId].x);
      candidate.set('y', phase.poses[actorId].y);
      const candidates = new Y.Map<Y.Map<unknown>>();
      candidates.set(`legacy-${actorId}`, candidate);
      const register = new Y.Map<unknown>();
      register.set('activeCandidateId', `legacy-${actorId}`);
      register.set('candidates', candidates);
      poses.set(actorId, register);
    }
    legacyFrame.set('poses', poses);
    phases.push([legacyFrame]);
  }
  replay.set('schemaVersion', 1);
  replay.set('actors', actors);
  replay.set('phases', phases);

  expect(migrateReplayRoot(replay)).toEqual({ migrated: true, from: 'slice0-proof', to: 'v1' });
  const artifacts = replay.get('migrationArtifacts');
  expect(artifacts).toBeInstanceOf(Y.Map);
  const recovery = JSON.parse((artifacts as Y.Map<unknown>).get('slice0-proof') as string);
  expect(recovery.phases).toHaveLength(2);
  expect(replay.has('phases')).toBe(false);
  const migrated = readReplaySnapshot(replay);
  expect(migrated.phases.map(phase => phase.poses)).toEqual(
    finalSnapshot.phases.map(phase => phase.poses)
  );
  expect(migrateReplayRoot(replay)).toEqual({ migrated: false, from: 'v1', to: 'v1' });
});
