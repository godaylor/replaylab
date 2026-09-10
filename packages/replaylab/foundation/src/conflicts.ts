import type {
  ActionPath,
  ActorId,
  CandidateProjection,
  Pose,
  Possession,
  ReplaySnapshot,
} from './domain';

export type SemanticConflictTarget =
  | { kind: 'pose'; phaseIndex: number; actorId: ActorId }
  | { kind: 'possession'; phaseIndex: number }
  | { kind: 'loose-ball'; phaseIndex: number }
  | { kind: 'action-path'; actionId: string };

export type SemanticConflict = {
  id: string;
  phaseId: string;
  phaseIndex: number;
  title: string;
  target: SemanticConflictTarget;
  candidates: CandidateProjection<Pose | Possession | ActionPath>[];
  derivedValue: Pose | ActionPath | null;
};

export type ResolveConflictInput = {
  target: SemanticConflictTarget;
  candidateId?: string;
  derivedValue?: Pose | ActionPath;
};

function averagePose(values: Pose[]): Pose {
  return {
    x: values.reduce((total, pose) => total + pose.x, 0) / values.length,
    y: values.reduce((total, pose) => total + pose.y, 0) / values.length,
  };
}

function deriveCandidateValue(
  candidates: CandidateProjection<Pose | Possession | ActionPath>[]
): Pose | ActionPath | null {
  const values = candidates.map(candidate => candidate.value);
  if (values.every(value => typeof value === 'object' && 'x' in value)) {
    return averagePose(values as Pose[]);
  }
  if (values.every(value => typeof value === 'object' && 'points' in value)) {
    const paths = values as ActionPath[];
    const pointCount = paths[0]?.points.length ?? 0;
    if (!pointCount || paths.some(path => path.points.length !== pointCount)) return null;
    return {
      points: Array.from({ length: pointCount }, (_, index) =>
        averagePose(paths.map(path => path.points[index]!))
      ),
    };
  }
  return null;
}

function makeConflict(
  input: Omit<SemanticConflict, 'derivedValue'>
): SemanticConflict {
  return { ...input, derivedValue: deriveCandidateValue(input.candidates) };
}

export function listSemanticConflicts(snapshot: ReplaySnapshot) {
  const conflicts: SemanticConflict[] = [];
  for (const [phaseIndex, phase] of snapshot.phases.entries()) {
    for (const actor of snapshot.actors) {
      const register = phase.poseRegisters[actor.id];
      if (register.candidates.length > 1) {
        conflicts.push(makeConflict({
          id: `pose:${phase.id}:${actor.id}`,
          phaseId: phase.id,
          phaseIndex,
          title: `Phase ${phaseIndex + 1} · ${actor.label} pose`,
          target: { kind: 'pose', phaseIndex, actorId: actor.id },
          candidates: register.candidates,
        }));
      }
    }
    if (phase.possession.candidates.length > 1) {
      conflicts.push(makeConflict({
        id: `possession:${phase.id}`,
        phaseId: phase.id,
        phaseIndex,
        title: `Phase ${phaseIndex + 1} · possession`,
        target: { kind: 'possession', phaseIndex },
        candidates: phase.possession.candidates,
      }));
    }
    if (phase.looseBallPose && phase.looseBallPose.candidates.length > 1) {
      conflicts.push(makeConflict({
        id: `loose-ball:${phase.id}`,
        phaseId: phase.id,
        phaseIndex,
        title: `Phase ${phaseIndex + 1} · loose-ball pose`,
        target: { kind: 'loose-ball', phaseIndex },
        candidates: phase.looseBallPose.candidates,
      }));
    }
  }
  for (const action of snapshot.actions) {
    if (action.archived || action.path.candidates.length < 2) continue;
    const phaseIndex = snapshot.phases.findIndex(phase => phase.id === action.fromFrameId);
    conflicts.push(makeConflict({
      id: `action-path:${action.id}`,
      phaseId: action.fromFrameId,
      phaseIndex,
      title: `Phase ${phaseIndex + 1} · ${action.type} path`,
      target: { kind: 'action-path', actionId: action.id },
      candidates: action.path.candidates,
    }));
  }
  return conflicts;
}

export function describeConflictCandidate(value: Pose | Possession | ActionPath) {
  if (typeof value === 'string') return value === 'loose' ? 'Loose ball' : value;
  if ('points' in value) {
    const start = value.points[0]!;
    const end = value.points.at(-1)!;
    return `${value.points.length} points · (${Math.round(start.x)}, ${Math.round(start.y)}) → (${Math.round(end.x)}, ${Math.round(end.y)})`;
  }
  return `x ${Math.round(value.x)} · y ${Math.round(value.y)}`;
}
