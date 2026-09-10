import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import * as Y from 'yjs';

export const REPLAY_SCHEMA_VERSION = 1 as const;
export const MIN_PHASES = 2;
export const MAX_PHASES = 12;
export const MAX_ACTIONS_PER_TRANSITION = 30;
export const MAX_ACTION_PATH_POINTS = 64;
export const COURT_BOUNDS = { minX: 20, maxX: 820, minY: 20, maxY: 440 } as const;

export const ACTOR_IDS = [
  'offense-1',
  'offense-2',
  'offense-3',
  'offense-4',
  'offense-5',
  'defense-1',
  'defense-2',
  'defense-3',
  'defense-4',
  'defense-5',
] as const;

export type ActorId = (typeof ACTOR_IDS)[number];
export type Team = 'offense' | 'defense';
export type Pose = { x: number; y: number };
export type Possession = ActorId | 'loose';
export const ACTION_TYPES = ['cut', 'pass', 'dribble', 'screen'] as const;
export type TacticalActionType = (typeof ACTION_TYPES)[number];
export type ActionPath = { points: Pose[] };

export type CandidateProjection<T> = {
  id: string;
  value: T;
  actorId: string;
  commandId: string;
};

export type RegisterProjection<T> = {
  winnerId: string;
  value: T;
  candidates: CandidateProjection<T>[];
};

export type ReplayFrameSnapshot = {
  id: string;
  rank: string;
  cueBlockId: string;
  durationMs: number;
  holdMs: number;
  poses: Record<ActorId, Pose>;
  poseRegisters: Record<ActorId, RegisterProjection<Pose>>;
  possession: RegisterProjection<Possession>;
  looseBallPose: RegisterProjection<Pose> | null;
  ballPose: Pose;
};

export type ReplayActionSnapshot = {
  id: string;
  fromFrameId: string;
  toFrameId: string;
  actorId: ActorId;
  type: TacticalActionType;
  targetActorId: ActorId | null;
  path: RegisterProjection<ActionPath>;
  archived: boolean;
  adjacency: 'valid' | 'needs-repair';
};

export type ReplaySnapshot = {
  schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  title: string;
  actors: Array<{ id: ActorId; team: Team; number: number; label: string }>;
  phases: ReplayFrameSnapshot[];
  actions: ReplayActionSnapshot[];
  conflictCount: number;
};

export type MigrationResult = {
  migrated: boolean;
  from: 'slice0-proof' | 'slice1-v1' | 'v1';
  to: 'v1';
};

type CandidateValue = Pose | Possession | ActionPath;

function isFinitePose(value: unknown): value is Pose {
  if (!value || typeof value !== 'object') return false;
  const pose = value as Partial<Pose>;
  return Number.isFinite(pose.x) && Number.isFinite(pose.y);
}

export function assertPoseInBounds(pose: Pose) {
  if (!isFinitePose(pose)) throw new Error('Actor coordinates must be finite');
  if (
    pose.x < COURT_BOUNDS.minX ||
    pose.x > COURT_BOUNDS.maxX ||
    pose.y < COURT_BOUNDS.minY ||
    pose.y > COURT_BOUNDS.maxY
  ) {
    throw new Error('Actor pose is outside the half-court');
  }
}

export function assertActionPath(path: ActionPath) {
  if (
    !path ||
    !Array.isArray(path.points) ||
    path.points.length < 2 ||
    path.points.length > MAX_ACTION_PATH_POINTS
  ) {
    throw new Error(`Action path must contain 2–${MAX_ACTION_PATH_POINTS} points`);
  }
  for (const point of path.points) assertPoseInBounds(point);
}

export function assertActionActors(input: {
  type: TacticalActionType;
  actorId: ActorId;
  targetActorId?: ActorId | null;
}) {
  if (!ACTION_TYPES.includes(input.type)) throw new Error('Unknown tactical action');
  if (!ACTOR_IDS.includes(input.actorId)) throw new Error('Unknown action actor');
  const requiresTarget = input.type === 'pass' || input.type === 'screen';
  if (requiresTarget && !input.targetActorId) {
    throw new Error(`${input.type} requires a target player`);
  }
  if (!requiresTarget && input.targetActorId) {
    throw new Error(`${input.type} does not accept a target player`);
  }
  if (
    input.targetActorId &&
    (!ACTOR_IDS.includes(input.targetActorId) || input.targetActorId === input.actorId)
  ) {
    throw new Error('Action target must be a different known player');
  }
  if (
    input.type === 'pass' &&
    (!input.actorId.startsWith('offense-') ||
      !input.targetActorId?.startsWith('offense-'))
  ) {
    throw new Error('Passes must connect two offense players');
  }
}

function writeCandidateValue(candidate: Y.Map<unknown>, value: CandidateValue) {
  if (typeof value === 'string') {
    candidate.set('value', value);
    return;
  }
  if ('points' in value) {
    assertActionPath(value);
    const path = new Y.Map<unknown>();
    const points = new Y.Array<Y.Map<number>>();
    points.push(
      value.points.map(point => {
        const pointMap = new Y.Map<number>();
        pointMap.set('x', point.x);
        pointMap.set('y', point.y);
        return pointMap;
      })
    );
    path.set('points', points);
    candidate.set('value', path);
    return;
  }
  const pose = new Y.Map<number>();
  pose.set('x', value.x);
  pose.set('y', value.y);
  candidate.set('value', pose);
}

export function createCandidate(
  id: string,
  value: CandidateValue,
  actorId: string,
  commandId: string
) {
  const candidate = new Y.Map<unknown>();
  candidate.set('actorId', actorId);
  candidate.set('commandId', commandId);
  writeCandidateValue(candidate, value);
  return { id, candidate };
}

export function createRegister(
  id: string,
  value: CandidateValue,
  actorId = 'seed',
  commandId = 'seed'
) {
  const register = new Y.Map<unknown>();
  const candidates = new Y.Map<Y.Map<unknown>>();
  const entry = createCandidate(id, value, actorId, commandId);
  candidates.set(entry.id, entry.candidate);
  register.set('candidates', candidates);
  return register;
}

function readCandidateValue(
  candidate: Y.Map<unknown>,
  kind: 'pose' | 'possession' | 'path'
): CandidateValue {
  const value = candidate.get('value');
  if (kind === 'pose') {
    if (!(value instanceof Y.Map)) throw new Error('Pose candidate has no value map');
    const pose = { x: value.get('x'), y: value.get('y') };
    if (!isFinitePose(pose)) throw new Error('Pose candidate is invalid');
    assertPoseInBounds(pose);
    return pose;
  }
  if (kind === 'path') {
    if (!(value instanceof Y.Map)) throw new Error('Path candidate has no value map');
    const pointsValue = value.get('points');
    if (!(pointsValue instanceof Y.Array)) {
      throw new Error('Path candidate has no point array');
    }
    const path = {
      points: pointsValue.toArray().map((point, index) => {
        if (!(point instanceof Y.Map)) throw new Error(`Path point ${index} is invalid`);
        const pose = { x: point.get('x'), y: point.get('y') };
        if (!isFinitePose(pose)) throw new Error(`Path point ${index} is invalid`);
        return pose;
      }),
    };
    assertActionPath(path);
    return path;
  }
  if (value !== 'loose' && !ACTOR_IDS.includes(value as ActorId)) {
    throw new Error('Possession candidate is invalid');
  }
  return value as Possession;
}

export function readRegister(register: Y.Map<unknown>, kind: 'pose'): RegisterProjection<Pose>;
export function readRegister(
  register: Y.Map<unknown>,
  kind: 'possession'
): RegisterProjection<Possession>;
export function readRegister(
  register: Y.Map<unknown>,
  kind: 'path'
): RegisterProjection<ActionPath>;
export function readRegister(
  register: Y.Map<unknown>,
  kind: 'pose' | 'possession' | 'path'
): RegisterProjection<CandidateValue> {
  const candidates = register.get('candidates');
  if (!(candidates instanceof Y.Map) || candidates.size === 0) {
    throw new Error('Candidate register must contain at least one candidate');
  }
  const projected = [...candidates.entries()]
    .map(([id, candidate]) => {
      if (!(candidate instanceof Y.Map)) throw new Error(`Invalid candidate ${id}`);
      const actorId = candidate.get('actorId');
      const commandId = candidate.get('commandId');
      if (typeof actorId !== 'string' || typeof commandId !== 'string') {
        throw new Error(`Candidate ${id} is missing provenance`);
      }
      return {
        id,
        value: readCandidateValue(candidate, kind),
        actorId,
        commandId,
      };
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
  const winner = projected.at(-1);
  if (!winner) throw new Error('Candidate register projection failed');
  return { winnerId: winner.id, value: winner.value, candidates: projected };
}

export function getRegisterCandidates(register: Y.Map<unknown>) {
  const candidates = register.get('candidates');
  if (!(candidates instanceof Y.Map) || candidates.size === 0) {
    throw new Error('Candidate register must contain candidates');
  }
  return candidates as Y.Map<Y.Map<unknown>>;
}

export function deriveBallPose(
  poses: Record<ActorId, Pose>,
  possession: Possession,
  looseBallPose: Pose | null
) {
  if (possession === 'loose') {
    if (!looseBallPose) throw new Error('Loose possession requires a loose-ball pose');
    return looseBallPose;
  }
  const holder = poses[possession];
  return {
    x: Math.min(COURT_BOUNDS.maxX, holder.x + 19),
    y: Math.max(COURT_BOUNDS.minY, holder.y - 19),
  };
}

function readActors(actorsMap: Y.Map<unknown>) {
  if (actorsMap.size !== ACTOR_IDS.length) {
    throw new Error('A play must contain exactly ten players');
  }
  return ACTOR_IDS.map((id, index) => {
    const actor = actorsMap.get(id);
    if (!(actor instanceof Y.Map)) throw new Error(`Missing actor ${id}`);
    const team = actor.get('team');
    const number = actor.get('number');
    const label = actor.get('label');
    const expectedTeam = index < 5 ? 'offense' : 'defense';
    if (
      team !== expectedTeam ||
      !Number.isInteger(number) ||
      typeof label !== 'string' ||
      label.length > 24
    ) {
      throw new Error(`Invalid actor ${id}`);
    }
    return { id, team: team as Team, number: number as number, label };
  });
}

export function readReplaySnapshot(
  replay: Y.Map<unknown>,
  title = 'Untitled play'
): ReplaySnapshot {
  if (replay.get('schemaVersion') !== REPLAY_SCHEMA_VERSION) {
    throw new Error('Unsupported replay schemaVersion');
  }
  const actorsMap = replay.get('actors');
  const framesMap = replay.get('frames');
  const actionsMap = replay.get('actions');
  if (
    !(actorsMap instanceof Y.Map) ||
    !(framesMap instanceof Y.Map) ||
    !(actionsMap instanceof Y.Map)
  ) {
    throw new Error('Replay root is structurally incomplete');
  }
  if (framesMap.size < MIN_PHASES || framesMap.size > MAX_PHASES) {
    throw new Error(`A play must contain ${MIN_PHASES}–${MAX_PHASES} phases`);
  }

  const actors = readActors(actorsMap);
  const phases = [...framesMap.entries()]
    .map(([frameId, frame]) => {
      if (!(frame instanceof Y.Map)) throw new Error(`Invalid frame ${frameId}`);
      const id = frame.get('id');
      const rank = frame.get('rank');
      const cueBlockId = frame.get('cueBlockId');
      const durationMs = frame.get('durationMs');
      const holdMs = frame.get('holdMs');
      const poseRegisters = frame.get('poses');
      const possessionValue = frame.get('possession');
      if (
        id !== frameId ||
        typeof rank !== 'string' ||
        !rank ||
        typeof cueBlockId !== 'string' ||
        !Number.isInteger(durationMs) ||
        !Number.isInteger(holdMs) ||
        !(poseRegisters instanceof Y.Map) ||
        !(possessionValue instanceof Y.Map)
      ) {
        throw new Error(`Invalid frame ${frameId}`);
      }
      if (poseRegisters.size !== ACTOR_IDS.length) {
        throw new Error(`Frame ${frameId} must contain ten complete poses`);
      }
      const poses = Object.create(null) as Record<ActorId, Pose>;
      const registers = Object.create(null) as Record<
        ActorId,
        RegisterProjection<Pose>
      >;
      for (const actorId of ACTOR_IDS) {
        const register = poseRegisters.get(actorId);
        if (!(register instanceof Y.Map)) {
          throw new Error(`Missing pose ${frameId}/${actorId}`);
        }
        const projected = readRegister(register, 'pose');
        poses[actorId] = projected.value;
        registers[actorId] = projected;
      }
      const possession = readRegister(possessionValue, 'possession');
      const looseValue = frame.get('looseBallPose');
      const looseBallPose =
        looseValue instanceof Y.Map ? readRegister(looseValue, 'pose') : null;
      if ((possession.value === 'loose') !== Boolean(looseBallPose)) {
        throw new Error(`Frame ${frameId} has inconsistent loose-ball state`);
      }
      return {
        id,
        rank,
        cueBlockId,
        durationMs: durationMs as number,
        holdMs: holdMs as number,
        poses,
        poseRegisters: registers,
        possession,
        looseBallPose,
        ballPose: deriveBallPose(
          poses,
          possession.value,
          looseBallPose?.value ?? null
        ),
      } satisfies ReplayFrameSnapshot;
    })
    .toSorted(
      (left, right) =>
        left.rank.localeCompare(right.rank) || left.id.localeCompare(right.id)
    );

  const phaseIndexById = new Map(
    phases.map((phase, index) => [phase.id, index] as const)
  );
  const transitionCounts = new Map<string, number>();
  const actions = [...actionsMap.entries()]
    .map(([actionId, action]) => {
      if (!(action instanceof Y.Map)) throw new Error(`Invalid action ${actionId}`);
      const id = action.get('id');
      const fromFrameId = action.get('fromFrameId');
      const toFrameId = action.get('toFrameId');
      const actorId = action.get('actorId');
      const type = action.get('type');
      const targetValue = action.get('targetActorId');
      const pathValue = action.get('path');
      const archived = action.get('archived') ?? false;
      if (
        id !== actionId ||
        typeof fromFrameId !== 'string' ||
        typeof toFrameId !== 'string' ||
        !phaseIndexById.has(fromFrameId) ||
        !phaseIndexById.has(toFrameId) ||
        !ACTOR_IDS.includes(actorId as ActorId) ||
        !ACTION_TYPES.includes(type as TacticalActionType) ||
        (targetValue !== undefined && targetValue !== null &&
          !ACTOR_IDS.includes(targetValue as ActorId)) ||
        !(pathValue instanceof Y.Map) ||
        typeof archived !== 'boolean'
      ) {
        throw new Error(`Invalid action ${actionId}`);
      }
      const targetActorId = (targetValue ?? null) as ActorId | null;
      assertActionActors({
        type: type as TacticalActionType,
        actorId: actorId as ActorId,
        targetActorId,
      });
      const transitionKey = `${fromFrameId}->${toFrameId}`;
      const transitionCount = (transitionCounts.get(transitionKey) ?? 0) + 1;
      if (transitionCount > MAX_ACTIONS_PER_TRANSITION) {
        throw new Error(`Transition ${transitionKey} exceeds the action cap`);
      }
      transitionCounts.set(transitionKey, transitionCount);
      const fromIndex = phaseIndexById.get(fromFrameId)!;
      const toIndex = phaseIndexById.get(toFrameId)!;
      return {
        id,
        fromFrameId,
        toFrameId,
        actorId: actorId as ActorId,
        type: type as TacticalActionType,
        targetActorId,
        path: readRegister(pathValue, 'path'),
        archived,
        adjacency: toIndex === fromIndex + 1 ? 'valid' : 'needs-repair',
      } satisfies ReplayActionSnapshot;
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));

  const conflictCount = phases.reduce((count, phase) => {
    const poseConflicts = ACTOR_IDS.reduce(
      (sum, actorId) =>
        sum + (phase.poseRegisters[actorId].candidates.length > 1 ? 1 : 0),
      0
    );
    const possessionConflict = phase.possession.candidates.length > 1 ? 1 : 0;
    const ballConflict =
      phase.looseBallPose && phase.looseBallPose.candidates.length > 1 ? 1 : 0;
    return count + poseConflicts + possessionConflict + ballConflict;
  }, 0);
  const actionConflicts = actions.reduce(
    (count, action) => count + (action.path.candidates.length > 1 ? 1 : 0),
    0
  );

  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    title,
    actors,
    phases,
    actions,
    conflictCount: conflictCount + actionConflicts,
  };
}

export function createActionRecord(
  input: {
    id: string;
    fromFrameId: string;
    toFrameId: string;
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId?: ActorId | null;
    path: ActionPath;
  },
  provenance: { actorId: string; commandId: string }
) {
  if (!input.id || !input.fromFrameId || !input.toFrameId) {
    throw new Error('Action IDs and transition are required');
  }
  if (input.fromFrameId === input.toFrameId) {
    throw new Error('Action transition must connect two different phases');
  }
  assertActionActors(input);
  assertActionPath(input.path);
  const action = new Y.Map<unknown>();
  action.set('id', input.id);
  action.set('fromFrameId', input.fromFrameId);
  action.set('toFrameId', input.toFrameId);
  action.set('actorId', input.actorId);
  action.set('type', input.type);
  if (input.targetActorId) action.set('targetActorId', input.targetActorId);
  action.set(
    'path',
    createRegister(
      `${provenance.commandId}:path`,
      input.path,
      provenance.actorId,
      provenance.commandId
    )
  );
  action.set('archived', false);
  return action;
}

function seedActors() {
  const actors = new Y.Map<Y.Map<unknown>>();
  ACTOR_IDS.forEach((id, index) => {
    const actor = new Y.Map<unknown>();
    actor.set('team', index < 5 ? 'offense' : 'defense');
    actor.set('number', (index % 5) + 1);
    actor.set(
      'label',
      index < 5 ? `O${(index % 5) + 1}` : `D${(index % 5) + 1}`
    );
    actors.set(id, actor);
  });
  return actors;
}

export function createFrame(
  id: string,
  rank: string,
  cueBlockId: string,
  poses: Record<ActorId, Pose>,
  possession: Possession,
  looseBallPose: Pose | null,
  provenance: { actorId: string; commandId: string }
) {
  const frame = new Y.Map<unknown>();
  const poseRegisters = new Y.Map<Y.Map<unknown>>();
  for (const actorId of ACTOR_IDS) {
    assertPoseInBounds(poses[actorId]);
    poseRegisters.set(
      actorId,
      createRegister(
        `${provenance.commandId}:pose:${actorId}`,
        poses[actorId],
        provenance.actorId,
        provenance.commandId
      )
    );
  }
  frame.set('id', id);
  frame.set('rank', rank);
  frame.set('cueBlockId', cueBlockId);
  frame.set('durationMs', 900);
  frame.set('holdMs', 300);
  frame.set('poses', poseRegisters);
  frame.set(
    'possession',
    createRegister(
      `${provenance.commandId}:possession`,
      possession,
      provenance.actorId,
      provenance.commandId
    )
  );
  if (possession === 'loose') {
    if (!looseBallPose) throw new Error('Loose possession requires a pose');
    assertPoseInBounds(looseBallPose);
    frame.set(
      'looseBallPose',
      createRegister(
        `${provenance.commandId}:ball`,
        looseBallPose,
        provenance.actorId,
        provenance.commandId
      )
    );
  }
  return frame;
}

export function seedReplayRoot(
  replay: Y.Map<unknown>,
  cueBlockIds: [string, string]
) {
  const ranks = generateNKeysBetween(null, null, MIN_PHASES);
  const frames = new Y.Map<Y.Map<unknown>>();
  for (let phaseIndex = 0; phaseIndex < MIN_PHASES; phaseIndex += 1) {
    const poses = Object.create(null) as Record<ActorId, Pose>;
    ACTOR_IDS.forEach((actorId, actorIndex) => {
      const row = actorIndex < 5 ? 0 : 1;
      const column = actorIndex % 5;
      poses[actorId] = {
        x: 110 + column * 135 + phaseIndex * (row === 0 ? 20 : -10),
        y: 125 + row * 185 + (column % 2) * 25,
      };
    });
    const id = `phase-${phaseIndex + 1}`;
    frames.set(
      id,
      createFrame(
        id,
        ranks[phaseIndex]!,
        cueBlockIds[phaseIndex]!,
        poses,
        'offense-1',
        null,
        { actorId: 'seed', commandId: `seed-${phaseIndex + 1}` }
      )
    );
  }
  replay.set('schemaVersion', REPLAY_SCHEMA_VERSION);
  replay.set('actors', seedActors());
  replay.set('frames', frames);
  replay.set('actions', new Y.Map<Y.Map<unknown>>());
}

function readLegacyPose(register: Y.Map<unknown>) {
  const activeCandidateId = register.get('activeCandidateId');
  const candidates = register.get('candidates');
  if (typeof activeCandidateId !== 'string' || !(candidates instanceof Y.Map)) {
    throw new Error('Legacy pose register is invalid');
  }
  const candidate = candidates.get(activeCandidateId);
  if (!(candidate instanceof Y.Map)) throw new Error('Legacy active pose is missing');
  const pose = { x: candidate.get('x'), y: candidate.get('y') };
  if (!isFinitePose(pose)) throw new Error('Legacy active pose is invalid');
  assertPoseInBounds(pose);
  return pose;
}

export function migrateReplayRoot(replay: Y.Map<unknown>): MigrationResult {
  if (replay.get('schemaVersion') !== REPLAY_SCHEMA_VERSION) {
    throw new Error('Unsupported replay schemaVersion');
  }
  if (replay.get('frames') instanceof Y.Map) {
    if (!(replay.get('actions') instanceof Y.Map)) {
      const addActions = () => replay.set('actions', new Y.Map<Y.Map<unknown>>());
      if (replay.doc) {
        replay.doc.transact(addActions, 'replaylab:migration');
      } else {
        addActions();
      }
      readReplaySnapshot(replay);
      return { migrated: true, from: 'slice1-v1', to: 'v1' };
    }
    readReplaySnapshot(replay);
    return { migrated: false, from: 'v1', to: 'v1' };
  }
  const phases = replay.get('phases');
  const actors = replay.get('actors');
  if (!(phases instanceof Y.Array) || !(actors instanceof Y.Map)) {
    throw new Error('Replay document cannot be migrated');
  }
  if (phases.length < MIN_PHASES || phases.length > MAX_PHASES) {
    throw new Error('Legacy replay phase count is outside v1 caps');
  }
  if (actors.size !== ACTOR_IDS.length) {
    throw new Error('Legacy replay must contain exactly ten players');
  }
  const actorLabels: Array<[Y.Map<unknown>, string]> = [];
  ACTOR_IDS.forEach((actorId, index) => {
    const actor = actors.get(actorId);
    const expectedTeam = index < 5 ? 'offense' : 'defense';
    const expectedNumber = (index % 5) + 1;
    if (
      !(actor instanceof Y.Map) ||
      actor.get('team') !== expectedTeam ||
      actor.get('number') !== expectedNumber
    ) {
      throw new Error(`Legacy actor ${actorId} is invalid`);
    }
    const label = actor.get('label');
    if (label !== undefined && (typeof label !== 'string' || label.length > 24)) {
      throw new Error(`Legacy actor ${actorId} label is invalid`);
    }
    actorLabels.push([actor, typeof label === 'string' ? label : `${expectedTeam === 'offense' ? 'O' : 'D'}${expectedNumber}`]);
  });
  const artifactsValue = replay.get('migrationArtifacts');
  if (artifactsValue !== undefined && !(artifactsValue instanceof Y.Map)) {
    throw new Error('Legacy migration artifacts are invalid');
  }
  const recoveryArtifact = JSON.stringify({
    schemaVersion: replay.get('schemaVersion'),
    actors: actors.toJSON(),
    phases: phases.toJSON(),
  });
  const ranks = generateNKeysBetween(null, null, phases.length);
  const frames = new Y.Map<Y.Map<unknown>>();
  const seenFrameIds = new Set<string>();
  phases.toArray().forEach((legacyFrame, index) => {
    if (!(legacyFrame instanceof Y.Map)) {
      throw new Error(`Legacy phase ${index + 1} is invalid`);
    }
    const id = legacyFrame.get('id');
    const cueBlockId = legacyFrame.get('cueBlockId');
    const legacyPoses = legacyFrame.get('poses');
    if (
      typeof id !== 'string' ||
      typeof cueBlockId !== 'string' ||
      !(legacyPoses instanceof Y.Map)
    ) {
      throw new Error(`Legacy phase ${index + 1} is incomplete`);
    }
    if (seenFrameIds.has(id)) {
      throw new Error(`Legacy phase id ${id} is duplicated`);
    }
    seenFrameIds.add(id);
    const poses = Object.create(null) as Record<ActorId, Pose>;
    for (const actorId of ACTOR_IDS) {
      const legacyRegister = legacyPoses.get(actorId);
      if (!(legacyRegister instanceof Y.Map)) {
        throw new Error(`Legacy pose ${actorId} is missing`);
      }
      poses[actorId] = readLegacyPose(legacyRegister);
    }
    frames.set(
      id,
      createFrame(
        id,
        ranks[index]!,
        cueBlockId,
        poses,
        'offense-1',
        null,
        { actorId: 'migration', commandId: `migration-${id}` }
      )
    );
  });
  const applyMigration = () => {
    for (const [actor, label] of actorLabels) {
      actor.set('label', label);
    }
    const artifacts: Y.Map<unknown> =
      artifactsValue instanceof Y.Map
        ? artifactsValue
        : new Y.Map<unknown>();
    if (!(artifactsValue instanceof Y.Map)) {
      replay.set('migrationArtifacts', artifacts);
    }
    if (!artifacts.has('slice0-proof')) {
      artifacts.set('slice0-proof', recoveryArtifact);
    }
    replay.set('frames', frames);
    replay.delete('phases');
    replay.set('actions', new Y.Map<Y.Map<unknown>>());
  };
  if (replay.doc) {
    replay.doc.transact(applyMigration, 'replaylab:migration');
  } else {
    applyMigration();
  }
  readReplaySnapshot(replay);
  return { migrated: true, from: 'slice0-proof', to: 'v1' };
}

export function rankAfter(phases: ReplayFrameSnapshot[], phaseIndex: number) {
  const current = phases[phaseIndex];
  if (!current) throw new Error(`Missing phase ${phaseIndex}`);
  const next = phases[phaseIndex + 1];
  return generateKeyBetween(current.rank, next?.rank ?? null);
}
export function rankForReorder(
  phases: ReplayFrameSnapshot[],
  phaseId: string,
  targetIndex: number
) {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= phases.length) {
    throw new Error('Reorder target is outside the phase timeline');
  }
  const sourceIndex = phases.findIndex(phase => phase.id === phaseId);
  if (sourceIndex < 0) throw new Error(`Missing phase ${phaseId}`);
  if (sourceIndex === targetIndex) return phases[sourceIndex]!.rank;
  const remaining = phases.filter(phase => phase.id !== phaseId);
  const before = remaining[targetIndex - 1];
  const after = remaining[targetIndex];
  return generateKeyBetween(before?.rank ?? null, after?.rank ?? null);
}

