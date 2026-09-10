import * as Y from 'yjs';

import {
  assertActionPath,
  assertPoseInBounds,
  createCandidate,
  getRegisterCandidates,
  type ActionPath,
  type Pose,
  type Possession,
  type ReplaySnapshot,
} from './domain';
import type { ResolveConflictInput } from './conflicts';

export type ConflictResolutionDraft = {
  mutate(): void;
  selection: {
    phaseId: string;
    entityId: string;
    focusTarget: 'court' | 'lineup' | 'action';
  };
};

function getFrameMap(replayRoot: Y.Map<unknown>, frameId: string) {
  const frames = replayRoot.get('frames');
  const frame = frames instanceof Y.Map ? frames.get(frameId) : undefined;
  if (!(frame instanceof Y.Map)) throw new Error(`Missing frame ${frameId}`);
  return frame;
}

export function buildConflictResolution(
  replayRoot: Y.Map<unknown>,
  snapshot: ReplaySnapshot,
  input: ResolveConflictInput,
  provenance: { actorId: string; commandId: string }
): ConflictResolutionDraft {
  let register: Y.Map<unknown>;
  let candidates: Array<{ id: string; value: Pose | Possession | ActionPath }>;
  let selection: ConflictResolutionDraft['selection'];

  if (input.target.kind === 'action-path') {
    const actionId = input.target.actionId;
    const actionSnapshot = snapshot.actions.find(action => action.id === actionId);
    if (!actionSnapshot) throw new Error(`Missing action ${input.target.actionId}`);
    const actions = replayRoot.get('actions');
    const action = actions instanceof Y.Map ? actions.get(actionSnapshot.id) : undefined;
    const path = action instanceof Y.Map ? action.get('path') : undefined;
    if (!(path instanceof Y.Map)) throw new Error('Missing action path register');
    register = path;
    candidates = actionSnapshot.path.candidates;
    selection = {
      phaseId: actionSnapshot.fromFrameId,
      entityId: actionSnapshot.id,
      focusTarget: 'action',
    };
  } else {
    const frame = snapshot.phases[input.target.phaseIndex];
    if (!frame) throw new Error(`Missing phase ${input.target.phaseIndex}`);
    const frameMap = getFrameMap(replayRoot, frame.id);
    if (input.target.kind === 'pose') {
      const poses = frameMap.get('poses');
      const pose = poses instanceof Y.Map ? poses.get(input.target.actorId) : undefined;
      if (!(pose instanceof Y.Map)) throw new Error('Missing pose register');
      register = pose;
      candidates = frame.poseRegisters[input.target.actorId].candidates;
      selection = { phaseId: frame.id, entityId: input.target.actorId, focusTarget: 'lineup' };
    } else if (input.target.kind === 'possession') {
      const possession = frameMap.get('possession');
      if (!(possession instanceof Y.Map)) throw new Error('Missing possession register');
      register = possession;
      candidates = frame.possession.candidates;
      selection = { phaseId: frame.id, entityId: 'ball', focusTarget: 'court' };
    } else {
      const looseBall = frameMap.get('looseBallPose');
      if (!(looseBall instanceof Y.Map) || !frame.looseBallPose) {
        throw new Error('Missing loose-ball register');
      }
      register = looseBall;
      candidates = frame.looseBallPose.candidates;
      selection = { phaseId: frame.id, entityId: 'ball', focusTarget: 'court' };
    }
  }

  if (candidates.length < 2) throw new Error('Conflict is already resolved');
  const selectedValue = input.derivedValue ?? candidates.find(
    candidate => candidate.id === input.candidateId
  )?.value;
  if (selectedValue === undefined) throw new Error('Unknown conflict candidate');

  if (input.target.kind === 'possession') {
    if (typeof selectedValue !== 'string') throw new Error('Possession resolution is invalid');
    if (selectedValue === 'loose') {
      throw new Error('Resolve the loose-ball pose before choosing loose possession');
    }
  } else if (input.target.kind === 'action-path') {
    if (typeof selectedValue === 'string' || !('points' in selectedValue)) {
      throw new Error('Action-path resolution is invalid');
    }
    assertActionPath(selectedValue);
  } else {
    if (typeof selectedValue === 'string' || 'points' in selectedValue) {
      throw new Error('Pose resolution is invalid');
    }
    assertPoseInBounds(selectedValue);
  }

  const registerCandidates = getRegisterCandidates(register);
  const observedCandidateIds = [...registerCandidates.keys()];
  const nextCandidate = createCandidate(
    `${provenance.commandId}:candidate`,
    selectedValue,
    provenance.actorId,
    provenance.commandId
  );
  return {
    selection,
    mutate() {
      for (const candidateId of observedCandidateIds) registerCandidates.delete(candidateId);
      registerCandidates.set(nextCandidate.id, nextCandidate.candidate);
    },
  };
}
