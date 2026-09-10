import type { SerializedXYWH } from '@blocksuite/global/gfx';
import {
  GfxLocalElementModel,
  type SurfaceBlockModel,
} from '@blocksuite/std/gfx';

import type {
  ActorId,
  ActionPath,
  Pose,
  ReplaySnapshot,
  TacticalActionType,
  Team,
} from './domain';
import type { PlaybackFrame } from './playback';

export type ProjectionEntityId = ActorId | 'ball';

class ReplayProjectionElement extends GfxLocalElementModel {
  override readonly type = 'replaylab:projection';

  constructor(
    surface: SurfaceBlockModel,
    readonly entityId: ProjectionEntityId,
    pose: Pose,
    readonly radius: number
  ) {
    super(surface);
    this.id = `projection:${entityId}`;
    this.setPose(pose);
  }

  setPose(pose: Pose) {
    this.xywh = JSON.stringify([
      pose.x - this.radius,
      pose.y - this.radius,
      this.radius * 2,
      this.radius * 2,
    ]) as SerializedXYWH;
  }
}

class ReplayActionProjectionElement extends GfxLocalElementModel {
  override readonly type = 'replaylab:action-projection';

  constructor(
    surface: SurfaceBlockModel,
    readonly actionId: string,
    path: ActionPath
  ) {
    super(surface);
    this.id = `action-projection:${actionId}`;
    this.setPath(path);
  }

  setPath(path: ActionPath) {
    const xs = path.points.map(point => point.x);
    const ys = path.points.map(point => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    this.xywh = JSON.stringify([
      minX - 8,
      minY - 8,
      Math.max(16, maxX - minX + 16),
      Math.max(16, maxY - minY + 16),
    ]) as SerializedXYWH;
  }
}

type ProjectionOptions = {
  draft?: { entityId: ProjectionEntityId; pose: Pose } | null;
  selectedId?: ProjectionEntityId | null;
  selectedActionId?: string | null;
  actionDraft?: {
    type: TacticalActionType;
    path: ActionPath;
  } | null;
  playback?: PlaybackFrame | null;
};

export class ReplayLabGfxAdapter {
  private readonly elements = new Map<ProjectionEntityId, ReplayProjectionElement>();
  private latestSnapshot: ReplaySnapshot | null = null;
  private readonly actionElements = new Map<
    string, ReplayActionProjectionElement
  >();
  private latestPhaseIndex = 0;
  private latestOptions: ProjectionOptions = {};
  private animationFrame: number | null = null;
  private renderCountValue = 0;

  constructor(
    private readonly surface: SurfaceBlockModel,
    private readonly canvas: HTMLCanvasElement
  ) {}

  project(
    snapshot: ReplaySnapshot,
    phaseIndex = 0,
    options: ProjectionOptions = {}
  ) {
    const resolvedPhaseIndex = options.playback?.phaseIndex ?? phaseIndex;
    const phase = snapshot.phases[resolvedPhaseIndex];
    if (!phase) throw new Error(`Missing phase ${phaseIndex}`);
    this.latestSnapshot = snapshot;
    this.latestPhaseIndex = resolvedPhaseIndex;
    this.latestOptions = options;

    for (const actor of snapshot.actors) {
      const pose =
        options.draft?.entityId === actor.id
          ? options.draft.pose
          : options.playback?.poses[actor.id] ?? phase.poses[actor.id];
      this.upsert(actor.id, pose, 20);
    }
    const ballPose =
      options.draft?.entityId === 'ball'
        ? options.draft.pose
        : options.playback?.ballPose ?? phase.ballPose;
    this.upsert('ball', ballPose, 9);

    const activeActionIds = new Set<string>();
    for (const action of snapshot.actions) {
      if (action.archived || action.fromFrameId !== phase.id) continue;
      activeActionIds.add(action.id);
      this.upsertAction(action.id, action.path.value);
    }
    for (const [actionId, element] of this.actionElements) {
      if (activeActionIds.has(actionId)) continue;
      this.surface.deleteLocalElement(element);
      this.actionElements.delete(actionId);
    }
    this.scheduleRender();
  }

  projectPlayback(
    snapshot: ReplaySnapshot,
    frame: PlaybackFrame,
    options: Omit<ProjectionOptions, 'playback'> = {}
  ) {
    this.project(snapshot, frame.phaseIndex, { ...options, playback: frame });
    this.renderNow();
  }

  hitTest(x: number, y: number): ProjectionEntityId | null {
    const ordered = [
      this.elements.get('ball'),
      ...[...this.elements.entries()]
        .filter(([id]) => id !== 'ball')
        .map(([, element]) => element),
    ];
    return (
      ordered.find(element =>
        element?.includesPoint(
          x,
          y,
          { useElementBound: true },
          undefined as never
        )
      )?.entityId ?? null
    );
  }

  renderNow() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.render();
  }

  destroy() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    for (const element of this.elements.values()) {
      this.surface.deleteLocalElement(element);
    }
    this.elements.clear();
    for (const element of this.actionElements.values()) {
      this.surface.deleteLocalElement(element);
    }
    this.actionElements.clear();
  }

  get projectionCount() {
    return this.elements.size + this.actionElements.size;
  }

  get localSurfaceCount() {
    return this.surface.localElementModels.size;
  }

  get renderCount() {
    return this.renderCountValue;
  }

  private upsert(entityId: ProjectionEntityId, pose: Pose, radius: number) {
    let element = this.elements.get(entityId);
    if (!element) {
      element = new ReplayProjectionElement(this.surface, entityId, pose, radius);
      this.surface.addLocalElement(element);
      this.elements.set(entityId, element);
    } else {
      element.setPose(pose);
    }
  }

  private upsertAction(actionId: string, path: ActionPath) {
    let element = this.actionElements.get(actionId);
    if (!element) {
      element = new ReplayActionProjectionElement(this.surface, actionId, path);
      this.surface.addLocalElement(element);
      this.actionElements.set(actionId, element);
    } else {
      element.setPath(path);
    }
  }

  private scheduleRender() {
    if (document.hidden || this.animationFrame !== null) return;
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = null;
      this.render();
    });
  }

  private render() {
    const snapshot = this.latestSnapshot;
    const phase = snapshot?.phases[this.latestPhaseIndex];
    const context = this.canvas.getContext('2d');
    if (!snapshot || !phase || !context) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#07131f';
    context.fillRect(0, 0, width, height);
    this.drawCourt(context, width, height);

    for (const action of snapshot.actions) {
      if (action.archived || action.fromFrameId !== phase.id) continue;
      const element = this.actionElements.get(action.id);
      if (!element || !this.isVisible(element)) continue;
      for (const candidate of action.path.candidates) {
        if (candidate.id === action.path.winnerId) continue;
        this.drawActionPath(context, action.type, candidate.value, false, true);
      }
      this.drawActionPath(
        context,
        action.type,
        action.path.value,
        this.latestOptions.selectedActionId === action.id,
        false
      );
    }
    if (this.latestOptions.actionDraft) {
      this.drawActionPath(
        context,
        this.latestOptions.actionDraft.type,
        this.latestOptions.actionDraft.path,
        true,
        true
      );
    }

    for (const actor of snapshot.actors) {
      const register = phase.poseRegisters[actor.id];
      for (const candidate of register.candidates) {
        if (candidate.id === register.winnerId) continue;
        this.drawConflictGhost(context, candidate.value, actor.team);
      }
    }

    for (const actor of snapshot.actors) {
      const element = this.elements.get(actor.id);
      if (!element || !this.isVisible(element)) continue;
      this.drawActor(
        context,
        element,
        actor.team,
        actor.number,
        this.latestOptions.selectedId === actor.id
      );
    }
    const ball = this.elements.get('ball');
    if (ball && this.isVisible(ball)) {
      this.drawBall(context, ball, this.latestOptions.selectedId === 'ball');
    }

    this.renderCountValue += 1;
    this.canvas.dataset.projection = 'replaylab-gfx-local-elements';
    this.canvas.dataset.projectionCount = String(this.projectionCount);
    this.canvas.dataset.renderCount = String(this.renderCountValue);
    this.canvas.dataset.playheadMs = String(
      Math.round(this.latestOptions.playback?.playheadMs ?? 0)
    );
    this.canvas.dataset.playbackPhaseIndex = String(this.latestPhaseIndex);
  }

  private isVisible(element: GfxLocalElementModel) {
    const bound = element.elementBound;
    return (
      bound.maxX >= 0 &&
      bound.maxY >= 0 &&
      bound.minX <= this.canvas.width &&
      bound.minY <= this.canvas.height
    );
  }

  private drawCourt(
    context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    context.save();
    context.strokeStyle = '#e6d9b6';
    context.lineWidth = 2;
    context.globalAlpha = 0.9;
    context.strokeRect(20, 20, width - 40, height - 40);
    // One offensive half-court: midcourt at left, one basket at right.
    // Linework is an original projection; existing normalized poses do not move.
    const centerY = height / 2;
    const basketX = width - 66;
    const freeThrowX = width - 280;
    context.beginPath();
    context.arc(20, centerY, 58, -Math.PI / 2, Math.PI / 2);
    context.stroke();
    context.strokeRect(freeThrowX, centerY - 76, 260, 152);
    context.beginPath();
    context.arc(freeThrowX, centerY, 58, Math.PI / 2, Math.PI * 1.5);
    context.stroke();
    context.beginPath();
    context.moveTo(width - 52, centerY - 25);
    context.lineTo(width - 52, centerY + 25);
    context.stroke();
    context.beginPath();
    context.arc(basketX, centerY, 10, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(width - 20, centerY - 186);
    context.lineTo(basketX, centerY - 186);
    context.ellipse(basketX, centerY, 370, 186, 0, -Math.PI / 2, -Math.PI * 1.5, true);
    context.lineTo(width - 20, centerY + 186);
    context.stroke();
    context.restore();
  }

  private drawActionPath(
    context: CanvasRenderingContext2D,
    type: TacticalActionType,
    path: ActionPath,
    selected: boolean,
    ghost: boolean
  ) {
    const first = path.points[0];
    const last = path.points.at(-1);
    const beforeLast = path.points.at(-2);
    if (!first || !last || !beforeLast) return;
    const colors: Record<TacticalActionType, string> = {
      cut: '#f7f1dc',
      pass: '#ffb020',
      dribble: '#ff625f',
      screen: '#45c8f5',
    };
    context.save();
    context.strokeStyle = selected ? '#ffffff' : colors[type];
    context.fillStyle = selected ? '#ffffff' : colors[type];
    context.lineWidth = selected ? 5 : 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = ghost ? 0.45 : 0.94;
    if (ghost || type === 'pass') context.setLineDash([9, 7]);
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of path.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
    if (type !== 'screen') {
      const angle = Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x);
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - 13 * Math.cos(angle - 0.5), last.y - 13 * Math.sin(angle - 0.5));
      context.lineTo(last.x - 13 * Math.cos(angle + 0.5), last.y - 13 * Math.sin(angle + 0.5));
      context.closePath();
      context.fill();
    } else {
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(last.x - 10, last.y - 10);
      context.lineTo(last.x + 10, last.y + 10);
      context.moveTo(last.x + 10, last.y - 10);
      context.lineTo(last.x - 10, last.y + 10);
      context.stroke();
    }
    context.restore();
  }

  private drawActor(
    context: CanvasRenderingContext2D,
    element: ReplayProjectionElement,
    team: Team,
    number: number,
    selected: boolean
  ) {
    const bound = element.elementBound;
    const [x, y] = bound.center;
    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.38)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 3;
    context.fillStyle = team === 'offense' ? '#ff625f' : '#45c8f5';
    context.strokeStyle = selected ? '#ffb020' : '#07131f';
    context.lineWidth = selected ? 5 : 3;
    context.beginPath();
    if (team === 'offense') {
      context.arc(x, y, bound.w / 2, 0, Math.PI * 2);
    } else {
      const radius = 7;
      context.roundRect(x - bound.w / 2, y - bound.h / 2, bound.w, bound.h, radius);
    }
    context.fill();
    context.stroke();
    context.shadowColor = 'transparent';
    context.fillStyle = '#07131f';
    context.font = '800 15px Bahnschrift, Arial Narrow, system-ui';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(number), x, y + 0.5);
    context.restore();
  }

  private drawBall(
    context: CanvasRenderingContext2D,
    element: ReplayProjectionElement,
    selected: boolean
  ) {
    const [x, y] = element.elementBound.center;
    context.save();
    context.fillStyle = '#ffb020';
    context.strokeStyle = selected ? '#ffffff' : '#07131f';
    context.lineWidth = selected ? 4 : 2;
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.strokeStyle = '#7a3d00';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 6, -1.2, 1.2);
    context.stroke();
    context.restore();
  }

  private drawConflictGhost(
    context: CanvasRenderingContext2D,
    pose: Pose,
    team: Team
  ) {
    context.save();
    context.globalAlpha = 0.36;
    context.setLineDash([4, 4]);
    context.strokeStyle = team === 'offense' ? '#ff625f' : '#45c8f5';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(pose.x, pose.y, 23, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}
