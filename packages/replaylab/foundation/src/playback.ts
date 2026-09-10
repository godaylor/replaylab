import {
  ACTOR_IDS,
  type ActorId,
  type Pose,
  type ReplaySnapshot,
} from './domain';

export type PlaybackFrame = {
  playheadMs: number;
  totalDurationMs: number;
  phaseIndex: number;
  nextPhaseIndex: number | null;
  transitionProgress: number;
  poses: Record<ActorId, Pose>;
  ballPose: Pose;
  phaseLabel: string;
};

export type PlaybackState = 'paused' | 'playing' | 'suspended';

type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolatePose(left: Pose, right: Pose, progress: number): Pose {
  return {
    x: left.x + (right.x - left.x) * progress,
    y: left.y + (right.y - left.y) * progress,
  };
}

export function playbackPhaseStarts(snapshot: ReplaySnapshot) {
  const starts: number[] = [];
  let cursor = 0;
  snapshot.phases.forEach((phase, index) => {
    starts.push(cursor);
    cursor += phase.holdMs;
    if (index < snapshot.phases.length - 1) cursor += phase.durationMs;
  });
  return starts;
}

export function playbackDuration(snapshot: ReplaySnapshot) {
  const lastStart = playbackPhaseStarts(snapshot).at(-1) ?? 0;
  return lastStart + (snapshot.phases.at(-1)?.holdMs ?? 0);
}

export function projectPlayback(
  snapshot: ReplaySnapshot,
  requestedPlayheadMs: number
): PlaybackFrame {
  if (snapshot.phases.length === 0) throw new Error('Playback requires phases');
  const totalDurationMs = playbackDuration(snapshot);
  const playheadMs = clamp(requestedPlayheadMs, 0, totalDurationMs);
  let cursor = 0;
  let phaseIndex = snapshot.phases.length - 1;
  let nextPhaseIndex: number | null = null;
  let transitionProgress = 0;

  for (let index = 0; index < snapshot.phases.length; index += 1) {
    const phase = snapshot.phases[index]!;
    const holdEnd = cursor + phase.holdMs;
    if (playheadMs <= holdEnd || index === snapshot.phases.length - 1) {
      phaseIndex = index;
      break;
    }
    cursor = holdEnd;
    const transitionEnd = cursor + phase.durationMs;
    if (playheadMs < transitionEnd) {
      phaseIndex = index;
      nextPhaseIndex = index + 1;
      transitionProgress = clamp(
        (playheadMs - cursor) / Math.max(1, phase.durationMs),
        0,
        1
      );
      break;
    }
    cursor = transitionEnd;
  }

  const phase = snapshot.phases[phaseIndex]!;
  const next = nextPhaseIndex === null ? null : snapshot.phases[nextPhaseIndex]!;
  const poses = Object.create(null) as Record<ActorId, Pose>;
  for (const actorId of ACTOR_IDS) {
    poses[actorId] = next
      ? interpolatePose(
          phase.poses[actorId],
          next.poses[actorId],
          transitionProgress
        )
      : phase.poses[actorId];
  }
  const ballPose = next
    ? interpolatePose(phase.ballPose, next.ballPose, transitionProgress)
    : phase.ballPose;

  return {
    playheadMs,
    totalDurationMs,
    phaseIndex,
    nextPhaseIndex,
    transitionProgress,
    poses,
    ballPose,
    phaseLabel:
      nextPhaseIndex === null
        ? `Phase ${phaseIndex + 1}`
        : `Phase ${phaseIndex + 1} to ${nextPhaseIndex + 1}`,
  };
}

export class ReplayPlaybackController {
  private snapshotValue: ReplaySnapshot;
  private playheadValue = 0;
  private playingValue = false;
  private renderable = true;
  private reducedMotionValue = false;
  private frameHandle: number | null = null;
  private previousFrameAt: number | null = null;
  private reducedMotionElapsed = 0;
  private readonly frameListeners = new Set<(frame: PlaybackFrame) => void>();
  private readonly stateListeners = new Set<(state: PlaybackState) => void>();

  constructor(
    snapshot: ReplaySnapshot,
    private readonly requestFrame: FrameRequest = callback => window.requestAnimationFrame(callback),
    private readonly cancelFrame: FrameCancel = handle => window.cancelAnimationFrame(handle)
  ) {
    this.snapshotValue = snapshot;
  }

  get playheadMs() {
    return this.playheadValue;
  }

  get totalDurationMs() {
    return playbackDuration(this.snapshotValue);
  }

  get playing() {
    return this.playingValue;
  }

  get state(): PlaybackState {
    if (this.playingValue && !this.renderable) return 'suspended';
    return this.playingValue ? 'playing' : 'paused';
  }

  get frameScheduled() {
    return this.frameHandle !== null;
  }

  get currentFrame() {
    return projectPlayback(this.snapshotValue, this.playheadValue);
  }

  setSnapshot(snapshot: ReplaySnapshot) {
    this.snapshotValue = snapshot;
    this.playheadValue = clamp(this.playheadValue, 0, this.totalDurationMs);
    this.emitFrame();
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotionValue = reduced;
    this.reducedMotionElapsed = 0;
    if (reduced) {
      const frame = this.currentFrame;
      this.playheadValue = playbackPhaseStarts(this.snapshotValue)[frame.phaseIndex] ?? 0;
    }
    this.emitFrame();
  }

  setRenderable(renderable: boolean) {
    if (this.renderable === renderable) return;
    this.renderable = renderable;
    this.previousFrameAt = null;
    if (!renderable) this.cancelScheduledFrame();
    else if (this.playingValue) this.schedule();
    this.emitState();
  }

  play() {
    if (this.playingValue) return;
    if (this.playheadValue >= this.totalDurationMs) this.playheadValue = 0;
    this.playingValue = true;
    this.previousFrameAt = null;
    this.reducedMotionElapsed = 0;
    this.emitState();
    this.emitFrame();
    this.schedule();
  }

  pause() {
    if (!this.playingValue && this.frameHandle === null) return;
    this.playingValue = false;
    this.previousFrameAt = null;
    this.cancelScheduledFrame();
    this.emitState();
  }

  toggle() {
    if (this.playingValue) this.pause();
    else this.play();
  }

  scrub(playheadMs: number) {
    this.playheadValue = clamp(playheadMs, 0, this.totalDurationMs);
    this.previousFrameAt = null;
    this.reducedMotionElapsed = 0;
    this.emitFrame();
  }

  goToPhase(phaseIndex: number) {
    const starts = playbackPhaseStarts(this.snapshotValue);
    const playhead = starts[phaseIndex];
    if (playhead === undefined) throw new Error(`Missing playback phase ${phaseIndex}`);
    this.scrub(playhead);
  }

  step(direction: -1 | 1) {
    const starts = playbackPhaseStarts(this.snapshotValue);
    const frame = this.currentFrame;
    const phaseIndex = clamp(
      frame.phaseIndex + direction,
      0,
      this.snapshotValue.phases.length - 1
    );
    this.scrub(starts[phaseIndex] ?? 0);
    return phaseIndex;
  }

  onFrame(listener: (frame: PlaybackFrame) => void) {
    this.frameListeners.add(listener);
    listener(this.currentFrame);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  onState(listener: (state: PlaybackState) => void) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  destroy() {
    this.pause();
    this.frameListeners.clear();
    this.stateListeners.clear();
  }

  private readonly tick = (now: number) => {
    this.frameHandle = null;
    if (!this.playingValue || !this.renderable) return;
    const elapsed = this.previousFrameAt === null ? 0 : Math.max(0, now - this.previousFrameAt);
    this.previousFrameAt = now;
    if (this.reducedMotionValue) {
      this.reducedMotionElapsed += elapsed;
      if (this.reducedMotionElapsed >= 700) {
        this.reducedMotionElapsed %= 700;
        const before = this.currentFrame.phaseIndex;
        const after = this.step(1);
        if (before === after) this.pause();
      }
    } else {
      this.playheadValue = clamp(
        this.playheadValue + elapsed,
        0,
        this.totalDurationMs
      );
      this.emitFrame();
      if (this.playheadValue >= this.totalDurationMs) this.pause();
    }
    this.schedule();
  };

  private schedule() {
    if (!this.playingValue || !this.renderable || this.frameHandle !== null) return;
    this.frameHandle = this.requestFrame(this.tick);
  }

  private cancelScheduledFrame() {
    if (this.frameHandle === null) return;
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private emitFrame() {
    const frame = this.currentFrame;
    for (const listener of this.frameListeners) listener(frame);
  }

  private emitState() {
    const state = this.state;
    for (const listener of this.stateListeners) listener(state);
  }
}
