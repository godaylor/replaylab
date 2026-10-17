import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { ReplayLabEditorFacade } from './facade';
import type {
  ActionPath,
  ActorId,
  Pose,
  Possession,
  ReplaySnapshot,
  TacticalActionType,
} from './domain';
import type { RichCueDocument } from './cue';
import type { ReplayAwarenessSource } from './awareness';
import { ActionDialog } from './action-dialog';
import { PlayHome } from './home';
import { SharePlay } from './share-play';
import { CourtMiniature, ToolGlyph } from './court-miniature';
import { Brand, ThemeSwitch } from './brand';
import { PlayStory } from './play-story';
import { exampleStepName, PICK_ROLL_IDS } from './pick-roll';
import { CourtLegend, PracticeGuide } from './practice-guide';
import { RichCueEditor } from './rich-cue-editor';
import {
  ReplayLabGfxAdapter,
  type ProjectionEntityId,
} from './gfx';
import { InputCoordinator } from './input';
import { ReplayPlaybackController } from './playback';
import { PlaybackControls } from './playback-controls';
import { ConflictPanel } from './conflict-panel';
import type { ReplayNetworkDocSource } from './network-source';
import { NetworkStatus } from './network-status';
import { PresenceLayer, PresencePanel } from './presence';
import {
  offlineShellLabel,
  storageRetentionLabel,
  useOfflineShellState,
  useStorageRetention,
} from './offline';
import { actionLabel, actorLabel, teamLabel, useI18n } from './i18n';

export type AppStorageMode =
  | { kind: 'indexeddb'; loadedFromIndexedDB: boolean }
  | {
      kind: 'recovery';
      issue: 'corrupt' | 'future-schema' | 'migration' | 'quota';
      message: string;
      recoveryJson: string;
      previewAvailable: boolean;
    }
  | { kind: 'memory-error'; message: string; cause?: 'room' | 'local' };

type ReplayLabAppProps = {
  facade: ReplayLabEditorFacade;
  storageMode: AppStorageMode;
  networkSource?: ReplayNetworkDocSource;
  awarenessSource?: ReplayAwarenessSource;
};

type LocalSaveState = 'saved' | 'pending' | 'failed' | 'memory';

type CommandSet = {
  addPhase(): void;
  undo(): void;
  redo(): void;
  previousPhase(): void;
  nextPhase(): void;
  selectTool(): void;
  actionTool(type: TacticalActionType): void;
};

const EMPTY_COMMANDS: CommandSet = {
  addPhase() {},
  undo() {},
  redo() {},
  previousPhase() {},
  nextPhase() {},
  selectTool() {},
  actionTool() {},
};

function clampPose(pose: Pose): Pose {
  return {
    x: Math.min(820, Math.max(20, pose.x)),
    y: Math.min(440, Math.max(20, pose.y)),
  };
}

function phaseConflictCount(snapshot: ReplaySnapshot, phaseId: string) {
  const phase = snapshot.phases.find(item => item.id === phaseId);
  if (!phase) return 0;
  const poseCount = snapshot.actors.reduce(
    (count, actor) => count + (phase.poseRegisters[actor.id].candidates.length > 1 ? 1 : 0),
    0
  );
  return poseCount +
    (phase.possession.candidates.length > 1 ? 1 : 0) +
    (phase.looseBallPose && phase.looseBallPose.candidates.length > 1 ? 1 : 0) +
    snapshot.actions.reduce((count, action) =>
      count + (action.fromFrameId === phaseId && action.path.candidates.length > 1 ? 1 : 0), 0);
}

function useFacadeRevision(facade: ReplayLabEditorFacade) {
  return useSyncExternalStore(
    listener => facade.onUpdated(listener),
    () => facade.revision,
    () => facade.revision
  );
}

function useOnlineState() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function saveStateLabel(state: LocalSaveState, t: ReturnType<typeof useI18n>['t']) {
  switch (state) {
    case 'pending':
      return t('savingLocally');
    case 'failed':
      return t('localSaveFailed');
    case 'memory':
      return t('memoryOnly');
    default:
      return t('savedLocally');
  }
}

function closeDisclosureOnEscape(event: ReactKeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== 'Escape' || !event.currentTarget.open) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.open = false;
  event.currentTarget.querySelector('summary')?.focus();
}

function downloadSnapshot(facade: ReplayLabEditorFacade) {
  const blob = new Blob([facade.exportSnapshot()], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${facade.snapshot.title.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase() || 'play'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
function downloadRecoveryFile(serialized: string, title: string) {
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase() || 'play'}.replaylab-recovery.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function recoveryIssueLabel(
  issue: Extract<AppStorageMode, { kind: 'recovery' }>['issue'],
  t: ReturnType<typeof useI18n>['t']
) {
  if (issue === 'migration') return t('migrationInterrupted');
  if (issue === 'corrupt') return t('localPlayCorrupt');
  if (issue === 'future-schema') return t('futureSchema');
  return t('recoveryUnavailable');
}

type ResponsiveMode = 'desktop' | 'tablet' | 'mobile';

function useResponsiveMode(): ResponsiveMode {
  const getMode = (): ResponsiveMode => {
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) return 'desktop';
    if (matchMedia('(max-width: 47.9375rem)').matches) return 'mobile';
    if (matchMedia('(max-width: 73.6875rem)').matches) return 'tablet';
    return 'desktop';
  };
  const [mode, setMode] = useState<ResponsiveMode>(getMode);
  useEffect(() => {
    const tablet = matchMedia('(max-width: 73.6875rem)');
    const mobile = matchMedia('(max-width: 47.9375rem)');
    const precise = matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setMode(getMode());
    tablet.addEventListener('change', update);
    mobile.addEventListener('change', update);
    precise.addEventListener('change', update);
    return () => {
      tablet.removeEventListener('change', update);
      mobile.removeEventListener('change', update);
      precise.removeEventListener('change', update);
    };
  }, []);
  return mode;
}


function CourtStage(props: {
  facade: ReplayLabEditorFacade;
  snapshot: ReplaySnapshot;
  phaseIndex: number;
  selectedId: ProjectionEntityId;
  selectedActionId: string | null;
  activeTool: 'select' | TacticalActionType;
  readOnly: boolean;
  presentation: 'plan' | '3d';
  onFeedback(message: string): void;
  onSelect(entityId: ProjectionEntityId): void;
  onCreateAction(input: {
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId: ActorId | null;
    path: ActionPath;
  }): void;
  onCancelAction(): void;
  onCommitPose(entityId: ProjectionEntityId, pose: Pose): void;
  onNudge(entityId: ProjectionEntityId, dx: number, dy: number): void;
  coordinator: InputCoordinator;
  playback: ReplayPlaybackController;
  awarenessSource?: ReplayAwarenessSource;
}) {
  const { t, locale } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gfxRef = useRef<ReplayLabGfxAdapter | null>(null);
  const snapshotRef = useRef(props.snapshot);
  const phaseIndexRef = useRef(props.phaseIndex);
  const dragRef = useRef<{
    entityId: ProjectionEntityId;
    pose: Pose;
    pointerId: number;
  } | null>(null);
  const actionRef = useRef<{
    actorId: ActorId;
    pointerId: number;
    path: ActionPath;
  } | null>(null);

  snapshotRef.current = props.snapshot;
  const renderOptionsRef = useRef({
    selectedId: props.selectedId,
    selectedActionId: props.selectedActionId,
    presentation: props.presentation,
  });
  renderOptionsRef.current = {
    selectedId: props.selectedId,
    selectedActionId: props.selectedActionId,
    presentation: props.presentation,
  };
  phaseIndexRef.current = props.phaseIndex;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gfx = new ReplayLabGfxAdapter(props.facade.surface, canvas);
    gfxRef.current = gfx;
    const unsubscribe = props.playback.onFrame(frame => {
      gfx.projectPlayback(snapshotRef.current, frame, renderOptionsRef.current);
    });
    return () => {
      unsubscribe();
      gfx.destroy();
      gfxRef.current = null;
    };
  }, [props.facade, props.playback]);

  useEffect(() => {
    gfxRef.current?.projectPlayback(
      props.snapshot,
      props.playback.currentFrame,
      renderOptionsRef.current
    );
  }, [props.snapshot, props.playback, props.selectedId, props.selectedActionId, props.presentation]);

  const toCourtPose = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clampPose({
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pose = toCourtPose(event);
    // A click during playback first pauses the scene. Starting a drag against
    // an interpolated pose could otherwise edit the previously selected phase.
    if (props.playback.playing) { props.playback.pause(); return; }
    if (props.presentation === '3d') {
      const entity = gfxRef.current?.hitTestPresentation(pose.x, pose.y);
      if (entity) props.onSelect(entity);
      event.currentTarget.focus({ preventScroll: true });
      return;
    }
    props.playback.pause();
    props.playback.goToPhase(props.phaseIndex);
    if (props.activeTool !== 'select') {
      if (props.readOnly) return;
      const phase = snapshotRef.current.phases[phaseIndexRef.current];
      if (!phase || !snapshotRef.current.phases[phaseIndexRef.current + 1]) return;
      const hit = gfxRef.current?.hitTest(pose.x, pose.y);
      const actorId = hit === 'ball' && phase.possession.value !== 'loose' ? phase.possession.value : hit;
      if (!actorId || actorId === 'ball') {
        props.onFeedback(locale === 'ru' ? 'Начните линию на игроке.' : 'Start the line on a player.');
        return;
      }
      if ((props.activeTool === 'pass' || props.activeTool === 'dribble') && phase.possession.value !== actorId) {
        props.onFeedback(locale === 'ru' ? 'Начните это действие на игроке с мячом.' : 'Start this action on the ball holder.');
        return;
      }
      props.onSelect(actorId);
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      actionRef.current = {
        actorId,
        pointerId: event.pointerId,
        path: { points: [phase.poses[actorId], pose] },
      };
      props.coordinator.setContext('court.drawingAction');
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: actorId,
        selectedActionId: props.selectedActionId,
        actionDraft: { type: props.activeTool, path: actionRef.current.path },
      });
      return;
    }
    const entityId = gfxRef.current?.hitTest(pose.x, pose.y);
    if (!entityId) return;
    props.onSelect(entityId);
    event.currentTarget.focus({ preventScroll: true });
    if (props.readOnly) return;
    const phase = snapshotRef.current.phases[phaseIndexRef.current];
    if (entityId === 'ball' && phase?.possession.value !== 'loose') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { entityId, pose, pointerId: event.pointerId };
    props.coordinator.setContext('court.draggingActor');
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (props.presentation === '3d') return;
    const action = actionRef.current;
    const drag = dragRef.current;
    const presencePose = toCourtPose(event);
    props.awarenessSource?.publish({
      pointer: { phaseId: snapshotRef.current.phases[phaseIndexRef.current]!.id, ...presencePose },
      gesture: drag
        ? { phaseId: snapshotRef.current.phases[phaseIndexRef.current]!.id, entityId: drag.entityId, ...presencePose }
        : action
          ? { phaseId: snapshotRef.current.phases[phaseIndexRef.current]!.id, entityId: action.actorId, ...presencePose }
          : null,
    });
    if (action && action.pointerId === event.pointerId) {
      const pose = presencePose;
      const previous = action.path.points.at(-1)!;
      if (Math.hypot(pose.x - previous.x, pose.y - previous.y) >= 8) {
        action.path = { points: [...action.path.points.slice(0, 63), pose] };
      } else {
        action.path = { points: [...action.path.points.slice(0, -1), pose] };
      }
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: props.selectedId,
        selectedActionId: props.selectedActionId,
        actionDraft: { type: props.activeTool as TacticalActionType, path: action.path },
      });
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.pose = presencePose;
    gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
      draft: { entityId: drag.entityId, pose: drag.pose },
      selectedId: drag.entityId,
      selectedActionId: props.selectedActionId,
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>, commit: boolean) => {
    props.awarenessSource?.publish({ gesture: null });
    const action = actionRef.current;
    if (action && action.pointerId === event.pointerId) {
      actionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      props.coordinator.setContext('court.actorSelected');
      if (commit) {
        const last = action.path.points.at(-1)!;
        const hit = gfxRef.current?.hitTest(last.x, last.y);
        props.onCreateAction({
          actorId: action.actorId,
          type: props.activeTool as TacticalActionType,
          targetActorId: hit && hit !== 'ball' && hit !== action.actorId ? hit : null,
          path: action.path,
        });
      } else {
        props.onCancelAction();
      }
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: props.selectedId,
        selectedActionId: props.selectedActionId,
      });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    props.coordinator.setContext('court.actorSelected');
    if (commit) props.onCommitPose(drag.entityId, drag.pose);
    else {
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: drag.entityId,
        selectedActionId: props.selectedActionId,
      });
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === 'Escape' && actionRef.current) {
      event.preventDefault();
      actionRef.current = null;
      props.coordinator.setContext('court.actorSelected');
      props.onCancelAction();
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: props.selectedId,
        selectedActionId: props.selectedActionId,
      });
      return;
    }
    if (props.readOnly) return;
    const step = event.shiftKey ? 50 : 5;
    const offsets: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    props.onNudge(props.selectedId, offset[0], offset[1]);
  };

  return (
    <div className="court-frame" data-presentation={props.presentation}>
      <div className="court-scorebug" aria-hidden="true">
        <span>{t('offense').toUpperCase()}</span>
        <strong>5 × 5</strong>
        <span>{t('defense').toUpperCase()}</span>
      </div>
      <canvas
        ref={canvasRef}
        id="court"
        data-testid="court"
        data-presentation={props.presentation}
        width={840}
        height={460}
        tabIndex={0}
        aria-label={props.presentation === '3d' ? (locale === 'ru' ? 'Трёхмерный просмотр комбинации. Игроки и действия доступны в списке ниже.' : 'Three-dimensional play review. Players and actions are available in the list below.') : t('courtEditorLabel')}
        onFocus={() => props.coordinator.setContext('court.actorSelected')}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={event => finishPointer(event, true)}
        onPointerCancel={event => finishPointer(event, false)}
      />
      {props.presentation === 'plan' && <PresenceLayer source={props.awarenessSource} />}
      <p className="court-help">
        {props.presentation === '3d' ? (locale === 'ru' ? 'Просмотр не меняет комбинацию. Запустите её или выберите шаг; для изменений включите «Редактировать».' : 'Review does not change the play. Press Play or choose a step; switch to Edit play to make changes.') : t('courtHelp')}
      </p>
    </div>
  );
}

function PhaseTimeline(props: {
  snapshot: ReplaySnapshot;
  phaseIndex: number;
  readOnly: boolean;
  onSelect(index: number): void;
  onReorder(phaseId: string, targetIndex: number): void;
  onAnnounce(message: string): void;
  onAdd(): void;
  coordinator: InputCoordinator;
  canReorder: boolean;
  canAdd: boolean;
  playback: ReplayPlaybackController;
}) {
  const { t, locale } = useI18n();
  const canonicalIds = props.snapshot.phases.map(phase => phase.id);
  const selectedPhaseId = props.snapshot.phases[props.phaseIndex]?.id;
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const pointerRef = useRef<{ phaseId: string; pointerId: number } | null>(null);
  const displayIds = previewIds ?? canonicalIds;
  useEffect(() => props.playback.onFrame(frame => {
    document.querySelectorAll<HTMLButtonElement>('.phase-card').forEach(button => {
      const active = button.dataset.phaseId === props.snapshot.phases[frame.phaseIndex]?.id;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }), [props.playback, props.snapshot]);

  const setPreview = (ids: string[] | null) => {
    previewRef.current = ids;
    setPreviewIds(ids);
  };

  const focusPhase = (phaseId: string) => {
    const canonicalIndex = props.snapshot.phases.findIndex(phase => phase.id === phaseId);
    if (canonicalIndex >= 0) props.onSelect(canonicalIndex);
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-phase-id="${phaseId}"]`)?.focus();
    });
  };

  const movePreview = (phaseId: string, targetIndex: number) => {
    const current = [...(previewRef.current ?? canonicalIds)];
    const sourceIndex = current.indexOf(phaseId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    current.splice(sourceIndex, 1);
    current.splice(targetIndex, 0, phaseId);
    setPreview(current);
    const targetRelation = targetIndex < sourceIndex ? t('before') : t('after');
    props.onAnnounce(
      t('movingPhase', { source: sourceIndex + 1, relation: targetRelation, target: targetIndex + 1, position: targetIndex + 1, total: current.length })
    );
  };

  const finishReorder = (phaseId: string, cancelled: boolean) => {
    const order = previewRef.current ?? canonicalIds;
    const targetIndex = order.indexOf(phaseId);
    pointerRef.current = null;
    setLiftedId(null);
    setPreview(null);
    props.coordinator.setContext('timeline.focused');
    if (cancelled) {
      props.onAnnounce(t('reorderCancelled'));
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-phase-id="${phaseId}"]`)?.focus();
      });
    } else {
      props.onReorder(phaseId, targetIndex);
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-phase-id="${phaseId}"]`)?.focus();
      });
    }
  };

  return (
    <section className="timeline" aria-labelledby="timeline-heading">
      <div className="section-heading-row">
        <div>
          <span className="eyebrow">{t('formationSequence')}</span>
          <h2 id="timeline-heading">{locale === 'ru' ? 'Шаги комбинации' : t('phases')}</h2>
        </div>
        <button
          className="button button-accent"
          type="button"
          disabled={props.readOnly || !props.canAdd || props.snapshot.phases.length >= 12}
          title={!props.canAdd ? t('unsupportedHere') : undefined}
          onClick={props.onAdd}
        >
          {t('addPhase')} <kbd>F</kbd>
        </button>
      </div>
      <ol className="phase-filmstrip">
        {displayIds.map((phaseId, index) => {
          const phase = props.snapshot.phases.find(item => item.id === phaseId)!;
          const lifted = phaseId === liftedId;
          return (
            <li key={phase.id} data-preview-index={index}>
              <button
                type="button"
                className={`${phaseId === selectedPhaseId ? 'phase-card is-active' : 'phase-card'}${lifted ? ' is-lifted' : ''}`}
                data-phase-index={index}
                data-phase-id={phase.id}
                aria-current={phaseId === selectedPhaseId ? 'step' : undefined}
                aria-label={`${t('phasePosition', { number: index + 1, position: index + 1, total: displayIds.length, lifted: lifted ? t('liftedSuffix') : '' })}${exampleStepName(phase.id, locale, props.snapshot) ? ` · ${exampleStepName(phase.id, locale, props.snapshot)}` : ''}`}
                tabIndex={phaseId === selectedPhaseId ? 0 : -1}
                onFocus={() => props.coordinator.setContext(lifted ? 'timeline.reordering' : 'timeline.focused')}
                onClick={() => {
                  const canonicalIndex = props.snapshot.phases.findIndex(item => item.id === phase.id);
                  if (canonicalIndex >= 0) props.onSelect(canonicalIndex);
                }}
                onPointerDown={event => {
                  if (props.readOnly || !props.canReorder || event.button !== 0) return;
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointerRef.current = { phaseId, pointerId: event.pointerId };
                  setLiftedId(phaseId);
                  setPreview([...canonicalIds]);
                  props.coordinator.setContext('timeline.reordering');
                  props.onAnnounce(t('liftedPhase', { number: index + 1, position: index + 1, total: canonicalIds.length }));
                }}
                onPointerMove={event => {
                  const pointer = pointerRef.current;
                  if (!pointer || pointer.pointerId !== event.pointerId) return;
                  const target = [...document.querySelectorAll<HTMLButtonElement>('[data-phase-id]')]
                    .toSorted((left, right) => {
                      const leftRect = left.getBoundingClientRect();
                      const rightRect = right.getBoundingClientRect();
                      return Math.abs(leftRect.left + leftRect.width / 2 - event.clientX) - Math.abs(rightRect.left + rightRect.width / 2 - event.clientX);
                    })[0];
                  const targetId = target?.dataset.phaseId;
                  const order = previewRef.current ?? canonicalIds;
                  const targetIndex = targetId ? order.indexOf(targetId) : -1;
                  if (targetIndex >= 0 && order.indexOf(pointer.phaseId) !== targetIndex) movePreview(pointer.phaseId, targetIndex);
                }}
                onPointerUp={event => {
                  const pointer = pointerRef.current;
                  if (!pointer || pointer.pointerId !== event.pointerId) return;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  finishReorder(pointer.phaseId, false);
                }}
                onPointerCancel={event => {
                  const pointer = pointerRef.current;
                  if (!pointer || pointer.pointerId !== event.pointerId) return;
                  finishReorder(pointer.phaseId, true);
                }}
                onKeyDown={event => {
                  if (!lifted) {
                    if (event.key === ' ' && !props.readOnly && props.canReorder) {
                      event.preventDefault();
                      setLiftedId(phaseId);
                      setPreview([...canonicalIds]);
                      props.coordinator.setContext('timeline.reordering');
                      props.onAnnounce(t('liftedPhaseKeyboard', { number: index + 1, position: index + 1, total: canonicalIds.length }));
                      return;
                    }
                    if (event.key === 'ArrowLeft' && index > 0) {
                      event.preventDefault();
                      focusPhase(displayIds[index - 1]!);
                    }
                    if (event.key === 'ArrowRight' && index < displayIds.length - 1) {
                      event.preventDefault();
                      focusPhase(displayIds[index + 1]!);
                    }
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    finishReorder(phaseId, true);
                    return;
                  }
                  if (event.key === ' ' || event.key === 'Enter') {
                    event.preventDefault();
                    finishReorder(phaseId, false);
                    return;
                  }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const direction = event.key === 'ArrowLeft' ? -1 : 1;
                    movePreview(phaseId, Math.max(0, Math.min(displayIds.length - 1, index + direction)));
                  }
                }}
            >
              <span className="phase-number">{String(index + 1).padStart(2, '0')}</span>
              <span>{exampleStepName(phase.id, locale, props.snapshot) ?? t('phaseCard', { number: index + 1 })}</span>
              <CourtMiniature phase={phase} actors={props.snapshot.actors} />
              <small>{phase.possession.value === 'loose' ? t('looseBall') : t('heldBy', { actor: actorLabel(locale, phase.possession.value) })}</small>
              {phaseConflictCount(props.snapshot, phase.id) > 0 ? (
                <span className="phase-conflict-marker">{t('conflictsCount', { count: phaseConflictCount(props.snapshot, phase.id) })}</span>
              ) : null}
            </button>
          </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ReplayLabApp({ facade, storageMode, networkSource, awarenessSource }: ReplayLabAppProps) {
  const { locale, setLocale, t } = useI18n();
  const responsiveMode = useResponsiveMode();
  const revision = useFacadeRevision(facade);
  const snapshot = facade.snapshot;
  const isExample = snapshot.phases.some(phase => PICK_ROLL_IDS.includes(phase.id as typeof PICK_ROLL_IDS[number]));
  const online = useOnlineState();
  const shellState = useOfflineShellState();
  const { state: storageRetention, requestPersistence } = useStorageRetention();
  const readOnly = storageMode.kind !== 'indexeddb' || facade.readOnly;
  const [workbenchMode, setWorkbenchMode] = useState<'watch' | 'edit'>(() =>
    readOnly || responsiveMode === 'mobile' || new URLSearchParams(location.search).get('watch') === '1' ? 'watch' : 'edit');
  const watching = workbenchMode === 'watch' || responsiveMode === 'mobile';
  const canMoveActors = !readOnly && !watching;
  const canEditCue = !readOnly && !watching;
  const canAuthorStructure = !readOnly && !watching && responsiveMode === 'desktop';
  const demoMode = new URLSearchParams(location.search).get('demo') === '1';
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<ProjectionEntityId>('offense-1');
  const [announcement, setAnnouncement] = useState(() => t('localPlayReady'));
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | TacticalActionType>('select');
  const [drawingFeedback, setDrawingFeedback] = useState('');
  const [nextIntent, setNextIntent] = useState<'move' | 'draw' | 'phase' | 'play' | 'extend' | 'reopen'>('move');
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const actionDialogButtonRef = useRef<HTMLButtonElement>(null);
  const [titleDraft, setTitleDraft] = useState(snapshot.title);
  const [titleDirty, setTitleDirty] = useState(false);
  const [titleRecovery, setTitleRecovery] = useState<string | null>(null);
  const [retainedTitles, setRetainedTitles] = useState(() => {
    try { return facade.emergencyJournal?.scan().entries.filter(entry => entry.body.kind === 'draft' && entry.body.entity === 'title') ?? []; }
    catch { return []; }
  });
  const cancelTitleRef = useRef(false);
  const recoveryInputRef = useRef<HTMLInputElement>(null);
  const [recoveryImportFailed, setRecoveryImportFailed] = useState(false);
  const [saveState, setSaveState] = useState<LocalSaveState>(
    readOnly ? 'memory' : 'saved'
  );
  const flushSequence = useRef(0);
  const coordinatorRef = useRef(new InputCoordinator());
  const commandsRef = useRef<CommandSet>(EMPTY_COMMANDS);
  const reactRenderCount = useRef(0);
  const playbackRef = useRef<ReplayPlaybackController | null>(null);
  if (!playbackRef.current) {
    playbackRef.current = new ReplayPlaybackController(snapshot);
  }
  const playback = playbackRef.current;
  const changeWorkbenchMode = (mode: 'watch' | 'edit') => {
    playback.pause();
    setActiveTool('select');
    setWorkbenchMode(mode);
    const url = new URL(location.href);
    if (mode === 'watch') url.searchParams.set('watch', '1');
    else url.searchParams.delete('watch');
    history.replaceState(history.state, '', url);
    if (mode === 'edit') playback.goToPhase(playback.currentFrame.phaseIndex);
  };
  reactRenderCount.current += 1;


  useEffect(() => playback.setSnapshot(snapshot), [playback, revision]);
  useEffect(() => playback.onState(state => {
    if (state === 'paused') setPhaseIndex(playback.currentFrame.phaseIndex);
  }), [playback]);
  useLayoutEffect(() => {
    // Undo restores the editing selection separately from the playhead. Keep
    // the paused canvas on that same keyframe, without rewinding an in-phase
    // scrub position or writing derived playback state to the document.
    if (!playback.playing && phaseIndex < snapshot.phases.length && playback.currentFrame.phaseIndex !== phaseIndex) playback.goToPhase(phaseIndex);
  }, [phaseIndex, playback, snapshot.phases.length]);
  useEffect(() => () => playback.destroy(), [playback]);
  useEffect(() => {
    if (responsiveMode !== 'desktop') setActiveTool('select');
  }, [responsiveMode]);
  useEffect(() => setDrawingFeedback(''), [activeTool, phaseIndex, locale]);
  useEffect(() => {
    if (window.replayLabApp) window.replayLabApp.playbackController = playback;
  }, [playback]);

  const activePhase = snapshot.phases[phaseIndex] ?? snapshot.phases[0]!;

  useEffect(() => {
    if (phaseIndex >= snapshot.phases.length) {
      setPhaseIndex(snapshot.phases.length - 1);
    }
  }, [phaseIndex, snapshot.phases.length]);

  useEffect(() => {
    if (!titleDirty) setTitleDraft(snapshot.title);
  }, [snapshot.title, titleDirty]);

  useEffect(() => {
    const restored = facade.takeRestoredSelection();
    if (!restored) return;
    const restoredPhaseIndex = snapshot.phases.findIndex(
      phase => phase.id === restored.phaseId
    );
    if (restoredPhaseIndex >= 0) setPhaseIndex(restoredPhaseIndex);
    if (restored.entityId === 'ball' || snapshot.actors.some(actor => actor.id === restored.entityId)) {
      setSelectedId(restored.entityId as ProjectionEntityId);
      setSelectedActionId(null);
    } else if (restored.entityId) {
      setSelectedActionId(restored.entityId);
    }
    requestAnimationFrame(() => {
      const selector =
        restored.focusTarget === 'court'
          ? '#court'
          : restored.focusTarget === 'timeline'
            ? `[data-phase-id="${restored.phaseId}"]`
            : restored.focusTarget === 'cue'
              ? '[data-focus-target="cue"] textarea'
              : restored.focusTarget === 'action'
                ? `[data-action-id="${restored.entityId}"]`
                : `[data-actor-id="${restored.entityId}"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  }, [facade, revision, snapshot.actors, snapshot.phases]);

  const selectEntity = (entityId: ProjectionEntityId) => {
    const editingPhase = playback.playing ? facade.snapshot.phases[playback.currentFrame.phaseIndex]! : activePhase;
    playback.pause();
    setSelectedId(entityId);
    setSelectedActionId(null);
    facade.setSelectionSnapshot({
      phaseId: editingPhase.id,
      entityId,
      focusTarget: entityId === 'ball' ? 'court' : 'lineup',
    });
    awarenessSource?.publish({
      selection: { phaseId: editingPhase.id, entityId },
    });
  };

  const flushLocal = useCallback(async () => {

    if (readOnly) return;
    const sequence = ++flushSequence.current;
    setSaveState('pending');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      await facade.flush(controller.signal);
      if (sequence === flushSequence.current) setSaveState('saved');
    } catch {
      if (sequence === flushSequence.current) setSaveState('failed');
    } finally {
      window.clearTimeout(timeout);
    }
  }, [facade, readOnly]);

  const runCommand = useCallback(
    <T,>(message: string, command: () => T): T | undefined => {
      if (readOnly) {
        setAnnouncement(t('editingUnavailable'));
        return undefined;
      }
      try {
        playback.pause();
        playback.goToPhase(phaseIndex);
        const result = command();
        setAnnouncement(message);
        void flushLocal();
        return result;
      } catch (error) {
        console.error('ReplayLab command rejected', error);
        setAnnouncement(t('commandFailed'));
        return undefined;
      }
    },
    [flushLocal, phaseIndex, playback, readOnly, t]
  );

  const nudge = useCallback(
    (entityId: ProjectionEntityId, dx: number, dy: number) => {
      if (!canMoveActors) {
        setAnnouncement(t('mobileReviewBody'));
        return;
      }
      if (playback.playing) {
        playback.pause();
        setAnnouncement(locale === 'ru' ? 'Воспроизведение остановлено. Теперь стрелки перемещают игрока в показанной расстановке.' : 'Playback paused. The arrow keys now move the player in the visible formation.');
        return;
      }
      const phase = facade.snapshot.phases[phaseIndex];
      if (!phase) return;
      if (entityId === 'ball') {
        if (phase.possession.value !== 'loose') {
          setAnnouncement(t('chooseLooseBall'));
          return;
        }
        const next = clampPose({ x: phase.ballPose.x + dx, y: phase.ballPose.y + dy });
        runCommand(
          t('ballMoved', { x: Math.round(next.x), y: Math.round(next.y) }),
          () => facade.setLooseBallPose({ phaseIndex, ...next })
        );
        return;
      }
      const pose = phase.poses[entityId];
      const next = clampPose({ x: pose.x + dx, y: pose.y + dy });
      runCommand(
        t('actorMoved', { actor: actorLabel(locale, entityId), x: Math.round(next.x), y: Math.round(next.y) }),
        () => { facade.setActorPose({ phaseIndex, actorId: entityId, ...next }); setNextIntent('draw'); }
      );
    },
    [canMoveActors, facade, locale, phaseIndex, playback, runCommand, t]
  );

  const addPhase = useCallback(() => {
    if (!canAuthorStructure) return;
    const frameId = runCommand(locale === 'ru' ? 'Шаг добавлен в конец. Нарисуйте движение к нему.' : 'Step appended. Draw the movement to it.', () =>
      facade.addPhaseAfter(facade.snapshot.phases.length - 1)
    );
    if (!frameId) return;
    setNextIntent('extend');
    const index = facade.snapshot.phases.findIndex(phase => phase.id === frameId);
    if (index >= 0) {
      // Keep the newly created transition's start selected. Selecting the new
      // final endpoint would immediately disable drawing and invite an endless
      // add-another-phase loop instead of a usable next action.
      setPhaseIndex(Math.max(0, index - 1));
      playback.goToPhase(Math.max(0, index - 1));
    }
  }, [canAuthorStructure, facade, phaseIndex, playback, runCommand, locale]);

  const reorderPhase = useCallback(
    (phaseId: string, targetIndex: number) => {
      if (!canAuthorStructure) return;
      facade.setSelectionSnapshot({
        phaseId,
        entityId: phaseId,
        focusTarget: 'timeline',
      });
      const changed = runCommand(
        t('phaseMoved', { position: targetIndex + 1, total: facade.snapshot.phases.length }),
        () => facade.reorderPhase({ phaseId, targetIndex })
      );
      if (!changed) return;
      const nextIndex = facade.snapshot.phases.findIndex(phase => phase.id === phaseId);
      if (nextIndex >= 0) {
        setPhaseIndex(nextIndex);
        playback.goToPhase(nextIndex);
      }
    },
    [canAuthorStructure, facade, playback, runCommand, t]
  );

  const undo = useCallback(() => {
    if (!canMoveActors || !facade.canUndo) return;
    runCommand(t('undid'), () => facade.undo());
  }, [canMoveActors, facade, runCommand, t]);

  const redo = useCallback(() => {
    if (!canMoveActors || !facade.canRedo) return;
    runCommand(t('redid'), () => facade.redo());
  }, [canMoveActors, facade, runCommand, t]);

  commandsRef.current = {
    addPhase: canAuthorStructure ? addPhase : () => undefined,
    undo,
    redo,
    previousPhase: () => {
      playback.pause();
      setPhaseIndex(playback.step(-1));
    },
    nextPhase: () => {
      playback.pause();
      setPhaseIndex(playback.step(1));
    },
    selectTool: () => { setActiveTool('select'); setAnnouncement(t('selectToolActive')); },
    actionTool: type => {
      if (!canAuthorStructure) return;
      const holder = snapshot.phases[playback.currentFrame.phaseIndex]!.possession.value;
      playback.pause();
      if ((type === 'pass' || type === 'dribble') && holder !== 'loose') setSelectedId(holder);
      setActiveTool(type);
      setAnnouncement(t('actionToolActive', { action: actionLabel(locale, type) }));
    },
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      coordinatorRef.current.handle(event, commandsRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commitPointerPose = (entityId: ProjectionEntityId, pose: Pose) => {
    if (entityId === 'ball') {
      runCommand(t('ballMoved', { x: Math.round(pose.x), y: Math.round(pose.y) }), () =>
        facade.setLooseBallPose({ phaseIndex, ...pose })
      );
    } else {
      runCommand(
        t('actorMoved', { actor: actorLabel(locale, entityId), x: Math.round(pose.x), y: Math.round(pose.y) }),
        () => { facade.setActorPose({ phaseIndex, actorId: entityId, ...pose }); setNextIntent('draw'); }
      );
    }
  };

  const createTacticalAction = (input: {
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId: ActorId | null;
    path: ActionPath;
  }) => {
    if ((input.type === 'pass' || input.type === 'dribble') && activePhase.possession.value !== input.actorId) {
      setAnnouncement(locale === 'ru' ? 'Для передачи или ведения выберите игрока с мячом. При свободном мяче сначала назначьте владельца.' : 'Choose the ball holder for a pass or dribble. Assign possession first if the ball is loose.');
      return false;
    }
    const path = input.type === 'pass' && input.targetActorId ? { points: [...input.path.points.slice(0, -1), snapshot.phases[phaseIndex + 1]!.poses[input.targetActorId]] } : input.path;
    const actionId = runCommand(t('actionCreated', { action: actionLabel(locale, input.type) }), () =>
      facade.createAction({ phaseIndex, ...input, path, applyEndpoint: true })
    );
    if (!actionId) return false;
    setNextIntent('phase');
    setSelectedActionId(actionId);
    setSelectedId(input.actorId);
    setActiveTool('select');
    return true;
  };

  const commitCue = (document: RichCueDocument) => {
    facade.setSelectionSnapshot({
      phaseId: activePhase.id,
      entityId: activePhase.cueBlockId,
      focusTarget: 'cue',
    });
    return runCommand(t('cueUpdated'), () => {
      facade.replaceCueDocument({ phaseIndex, document });
      return !facade.emergencyJournal?.error;
    });
  };

  const closeActionDialog = (cancelled: boolean) => {
    setActionDialogOpen(false);
    coordinatorRef.current.setContext('court.actorSelected');
    if (cancelled) setAnnouncement(t('actionCancelled'));
    requestAnimationFrame(() => actionDialogButtonRef.current?.focus());
  };

  const clearTitleDraft = () => {
    for (const entry of [...retainedTitles.filter(entry => entry.body.session === titleRecovery), ...(facade.emergencyJournal?.scan().entries.filter(entry => entry.body.session === facade.emergencyJournal!.session && entry.body.kind === 'draft' && entry.body.entity === 'title') ?? [])]) facade.emergencyJournal?.removeUnchanged(entry);
    setRetainedTitles(current => current.filter(entry => entry.body.session !== titleRecovery));
    setTitleRecovery(null);
    setTitleDirty(false);
  };
  const editTitleDraft = (value: string) => {
    try { facade.emergencyJournal?.write('draft', 'title', JSON.stringify(value)); }
    catch { setAnnouncement(t('draftStorageFailed')); }
    setTitleDirty(true);
    setTitleDraft(value);
  };
  const commitTitle = () => {
    if (cancelTitleRef.current) { cancelTitleRef.current = false; return; }
    if (!canAuthorStructure) return;
    const committed = titleDraft.trim() === snapshot.title || runCommand(t('playRenamed', { title: titleDraft.trim() }), () => {
      facade.renamePlay(titleDraft);
      return !facade.emergencyJournal?.error;
    });
    if (committed) { try { clearTitleDraft(); } catch { setAnnouncement(t('draftStorageFailed')); } }
  };

  const changePossession = (value: Possession) => {
    if (!canAuthorStructure) return;
    runCommand(
      value === 'loose' ? t('possessionLoose') : t('possessionActor', { actor: actorLabel(locale, value) }),
      () => facade.setPossession({ phaseIndex, value })
    );
    if (value === 'loose') setSelectedId('ball');
  };

  if (storageMode.kind === 'memory-error' && storageMode.cause === 'room') return <main className="room-unavailable" data-app-ready="true">
    <a className="brand" href="/">ReplayLab</a>
    <div className="language-switcher" role="group" aria-label={t('language')}>
      <button aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>RU</button>
      <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
    </div>
    <h1>{locale === 'ru' ? 'Не удалось открыть общую комнату' : 'Could not open the shared room'}</h1>
    <p role="alert">{locale === 'ru' ? 'Сервер комнаты недоступен или ссылка не даёт доступа. В этом браузере ещё нет локальной копии этой комнаты. Повторите попытку после восстановления связи или проверьте ссылку у автора.' : 'The room server is unavailable or the link does not grant access. This browser has no local copy of this room yet. Retry when connected or check the invitation with its author.'}</p>
    <p>{locale === 'ru' ? 'Другие локальные комбинации доступны на главной. Их данные не изменены.' : 'Your other local plays are available from Home. Their data is unchanged.'}</p>
    <button className="button button-accent" onClick={() => location.reload()}>{locale === 'ru' ? 'Попробовать снова' : 'Try again'}</button>
    <a className="button" href="/">{locale === 'ru' ? 'Открыть локальные комбинации' : 'Open local plays'}</a>
  </main>;

  const playbackControls = <PlaybackControls
    controller={playback}
    snapshot={snapshot}
    getCue={index => facade.getCue(index)}
    onPhaseSelected={setPhaseIndex}
    onPresentationChange={setPresenting}
    restartFromBeginning={nextIntent !== 'reopen' && nextIntent !== 'move'}
    onPlaybackStarted={() => setNextIntent('reopen')}
  />;

  return (
    <div
      className="app-shell"
      data-input-mode={responsiveMode}
      data-workbench-mode={watching ? 'watch' : 'edit'}
      data-app-ready="true"
      data-local-source={facade.loadedFromIndexedDB ? 'indexeddb' : 'seed'}
      data-react-render-count={reactRenderCount.current}
    >
      <header className="command-bar">
        <Brand />
        <label className="title-field">
          <span className="sr-only">{t('playName')}</span>
          <input
            value={titleDraft}
            maxLength={80}
            readOnly={!canAuthorStructure}
            onChange={event => editTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                cancelTitleRef.current = true;
                try { clearTitleDraft(); } catch { setAnnouncement(t('draftStorageFailed')); }
                setTitleDraft(snapshot.title);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <div className="command-actions">
          {storageMode.kind === 'indexeddb' && <SharePlay facade={facade} />}
          <nav className="history-controls" aria-label={t('history')}>
            <button type="button" className="icon-button" disabled={!canMoveActors || !facade.canUndo} onClick={undo}>
              {t('undo')} <kbd>{navigator.platform.includes('Mac') ? '⌘Z' : 'Ctrl Z'}</kbd>
            </button>
            <button type="button" className="icon-button" disabled={!canMoveActors || !facade.canRedo} onClick={redo}>
              {t('redo')}
            </button>
          </nav>
          <div className="language-switcher" role="group" aria-label={t('language')}>
            <button type="button" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>{t('languageRu')}</button>
            <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{t('languageEn')}</button>
          </div>
          <ThemeSwitch />
        </div>
      </header>

      <section className="status-rail" aria-label={t('documentStatus')}>
        {titleDirty ? <span role="status">{t('draftPending')}</span> : null}
        {retainedTitles.filter(entry => !retainedTitles.some(other => other.body.session === entry.body.session && other.body.sequence > entry.body.sequence)).map((entry, index) => <button className="status-action" type="button" disabled={!canAuthorStructure} key={entry.key} onClick={() => {
          try { const value = JSON.parse(entry.body.payload); if (typeof value !== 'string' || value.length > 80) throw new Error('Invalid title draft'); setTitleRecovery(entry.body.session); editTitleDraft(value); } catch { setAnnouncement(t('draftStorageFailed')); }
        }}>{t('restoreTitleDraft', { number: index + 1 })}</button>)}
        <span className={`status-pill status-${saveState}`} id="persistence-status" role="status" data-loaded-from-indexed-db={String(facade.loadedFromIndexedDB)}>
          <i aria-hidden="true" /> {saveStateLabel(saveState, t)}
        </span>
        <details className="storage-details" onKeyDown={closeDisclosureOnEscape}><summary aria-label={locale === 'ru' ? 'Хранение и офлайн' : 'Storage & offline'}><span className="storage-label">{locale === 'ru' ? 'Хранение и офлайн' : 'Storage & offline'}</span><span className="storage-symbol" aria-hidden="true">ⓘ</span></summary><div className="storage-details-body">
        <span
          id="shell-status"
          className={`status-pill ${shellState === 'ready' ? 'status-saved' : shellState === 'checking' ? 'status-pending' : shellState === 'update-ready' ? 'status-review' : 'status-failed'}`}
          role="status"
          data-shell-state={shellState}
        >
          <i aria-hidden="true" /> {offlineShellLabel(shellState, locale)}
        </span>
        {!readOnly ? (
          <span
            id="durability-status"
            className={`status-pill ${storageRetention === 'persisted' ? 'status-saved' : storageRetention === 'checking' || storageRetention === 'requesting' ? 'status-pending' : storageRetention === 'denied' || storageRetention === 'error' ? 'status-failed' : 'status-review'}`}
            role="status"
            data-storage-retention={storageRetention}
          >
            <i aria-hidden="true" /> {storageRetentionLabel(storageRetention, locale)}
            {storageRetention === 'evictable' || storageRetention === 'denied' ? (
              <button
                className="status-inline-action"
                type="button"
                onClick={() => void requestPersistence()}
              >
                {t('keepOffline')}
              </button>
            ) : null}
          </span>
        ) : null}
        </div></details>
        <NetworkStatus source={networkSource} online={online} />
        {snapshot.conflictCount > 0 ? (
          <span className="status-pill status-review">{t('needsReview', { count: snapshot.conflictCount })}</span>
        ) : null}
        <span className="status-meta">{t('phaseProgress', { current: phaseIndex + 1, total: snapshot.phases.length })}</span>
        <details className="file-tools" onKeyDown={closeDisclosureOnEscape} open={storageMode.kind !== 'indexeddb' || saveState === 'failed' || recoveryImportFailed}><summary aria-label={locale === 'ru' ? 'Файл и резервная копия' : 'File & backup'}><span className="file-label">{locale === 'ru' ? 'Файл и резервная копия' : 'File & backup'}</span><span className="file-short-label" aria-hidden="true">{locale === 'ru' ? 'Файл' : 'File'}</span></summary><div className="file-tools-body">
        <p>{locale === 'ru' ? 'Изменения сохраняются автоматически. Файл восстановления — полная переносимая копия; JSON — данные для чтения.' : 'Edits save automatically. A recovery file is a full portable copy; JSON is for inspection.'}</p>
        {recoveryImportFailed && <p className="import-error" role="alert">{locale === 'ru' ? 'Не удалось проверить или открыть файл восстановления. Файл может быть повреждён, его версия не поддерживается или хранилище недоступно. Исходная комбинация не изменена. Сохраните файл и повторите попытку.' : 'Could not verify or open the recovery file. It may be damaged, use an unsupported version, or storage may be unavailable. The original play is unchanged. Keep the file and try again.'}</p>}
        <button className="status-action export-json" type="button" onClick={() => downloadSnapshot(facade)}>
          {t('exportJson')}
        </button>
        <button
          id="export-recovery"
          className="status-action"
          type="button"
          onClick={() => void (storageMode.kind === 'recovery'
            ? Promise.resolve(storageMode.recoveryJson)
            : facade.exportRecovery()).then(serialized => {
              downloadRecoveryFile(serialized, snapshot.title);
              setAnnouncement(t('portableRecoveryExported'));
            })}
        >
          {t('recoveryFile')}
        </button>
        <button className="status-action" type="button" onClick={() => recoveryInputRef.current?.click()}>
          {t('openRecovery')}
        </button>
        </div></details>
        <input
          ref={recoveryInputRef}
          hidden
          type="file"
          accept=".json,.replaylab-recovery.json,application/json"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            event.currentTarget.value = '';
            setRecoveryImportFailed(false);
            void file.text().then(serialized => ReplayLabEditorFacade.importRecoveryCopy(serialized)).then(result => {
              const next = new URL(`/app/play/${encodeURIComponent(result.playId)}/edit`, location.origin);
              next.searchParams.set('db', result.databaseName);
              location.assign(next);
            }).catch(() => {
              setRecoveryImportFailed(true);
            });
          }}
        />
      </section>
      <PresencePanel
        source={awarenessSource}
        playback={playback}
        snapshot={snapshot}
        presenting={presenting}
        onPhaseSelected={setPhaseIndex}
        onAnnounce={setAnnouncement}
      />

      <section className={`mode-notice mode-${responsiveMode}`} aria-live="polite" data-responsive-mode={responsiveMode}>
        <strong>{watching ? t('mobileReviewTitle') : responsiveMode === 'tablet' ? t('tabletModeTitle') : t('desktopMode')}</strong>
        {responsiveMode === 'mobile' ? <span>{t('mobileReviewBody')}</span> : responsiveMode === 'tablet' ? <span>{t('tabletModeBody')}</span> : null}
      </section>

      {demoMode ? (
        <aside className="demo-runbook" aria-labelledby="demo-heading">
          <span className="eyebrow">{t('demoEyebrow')}</span>
          <strong id="demo-heading">{t('demoTitle')}</strong>
          <ol><li>{t('demoCore')}</li><li>{t('demoProof')}</li></ol>
          <small>{t('demoResilient')}</small>
        </aside>
      ) : null}

      {storageMode.kind === 'memory-error' ? (
        <section className="storage-error" role="alert">
          <strong>{t('localStorageFailedTitle')}</strong>
          <span>{t('localStorageFailedBody', { reason: t('localStorageGenericReason') })}</span>
        </section>
      ) : null}

      <main className="authoring-grid">
      {storageMode.kind === 'recovery' ? (
        <section
          className="storage-error"
          role="alert"
          data-recovery-state={storageMode.issue}
          data-recovery-preview={String(storageMode.previewAvailable)}
        >
          <strong>{recoveryIssueLabel(storageMode.issue, t)}.</strong>
          <span>{t('recoveryBody', {
            reason: recoveryIssueLabel(storageMode.issue, t),
            detail: storageMode.previewAvailable ? t('recoveryPreview') : t('recoveryBytes'),
          })}</span>
        </section>
      ) : null}

        <section className="court-panel" aria-labelledby="court-heading" data-playback-viewport>
          <div className="section-heading-row court-heading-row">
            <div>
              <span className="eyebrow">{isExample ? (locale === 'ru' ? 'ПРИМЕР · ВЫВЕСТИ №5 К КОЛЬЦУ' : 'EXAMPLE · GET 5 TO THE RIM') : t('basketballHalfCourt')}</span>
              <h1 id="court-heading">{isExample ? (locale === 'ru' ? 'Пик-н-ролл' : 'Pick & roll') : t('formationBoard')}</h1>
            </div>
            <div className="workbench-switch" role="group" aria-label={locale === 'ru' ? 'Режим площадки' : 'Court mode'}>
              <button type="button" aria-pressed={watching} onClick={() => changeWorkbenchMode('watch')}>{locale === 'ru' ? 'Смотреть · 3D' : 'Watch · 3D'}</button>
              {!readOnly && responsiveMode !== 'mobile' && <button type="button" aria-pressed={!watching} onClick={() => { changeWorkbenchMode('edit'); setAnnouncement(locale === 'ru' ? 'Перетащите игрока или выберите движение и нарисуйте его от игрока.' : 'Drag a player, or choose a movement and draw from a player.'); }}>{locale === 'ru' ? 'Редактировать' : 'Edit play'}</button>}
            </div>
          </div>
          <PlayStory snapshot={snapshot} controller={playback} phaseIndex={phaseIndex} cue={index => facade.getCue(index)} />
          {watching && playbackControls}
          {canAuthorStructure ? <div className="action-tools" role="toolbar" aria-label={t('courtTools')}>
            <button type="button" aria-pressed={activeTool === 'select'} onClick={() => setActiveTool('select')}><ToolGlyph type="select" />{t('select')} <kbd>V</kbd></button>
            {(['cut', 'pass', 'dribble', 'screen'] as const).map(type => (
              <button
                key={type}
                type="button"
                aria-pressed={activeTool === type}
                disabled={readOnly || phaseIndex >= snapshot.phases.length - 1 || selectedId === 'ball'}
                onClick={() => {
                  const holder = snapshot.phases[playback.currentFrame.phaseIndex]!.possession.value;
                  playback.pause();
                  if ((type === 'pass' || type === 'dribble') && holder !== 'loose') setSelectedId(holder);
                  setActiveTool(type);
                  setAnnouncement(t('actionToolDraw', { action: actionLabel(locale, type) }));
                }}
              >
                <ToolGlyph type={type} />{actionLabel(locale, type)} <kbd>{type[0]!.toUpperCase()}</kbd>
              </button>
            ))}
            <button
              ref={actionDialogButtonRef}
              type="button"
              disabled={readOnly || phaseIndex >= snapshot.phases.length - 1 || selectedId === 'ball'}
              onClick={() => {
                const index = playback.currentFrame.phaseIndex;
                playback.pause();
                if (index >= snapshot.phases.length - 1) {
                  setAnnouncement(locale === 'ru' ? 'Это финал. Добавьте шаг, чтобы нарисовать продолжение.' : 'This is the finish. Add a step to draw the next movement.');
                  return;
                }
                coordinatorRef.current.setContext('modal');
                setActionDialogOpen(true);
              }}
            >
              {t('keyboardAction')}
            </button>
          </div> : null}
          <p className="drawing-help" role="status">{drawingFeedback || (watching ? (locale === 'ru' ? 'Нажмите «Старт» — игроки покажут комбинацию.' : 'Press Play to see the players run the play.') : !canAuthorStructure ? (locale === 'ru' ? 'Перетащите игрока. Движения рисуются на компьютере.' : 'Drag a player. Draw movements on desktop.') : activeTool !== 'select' ? (locale === 'ru' ? `${actionLabel(locale, activeTool)}: начните на игроке, проведите линию, отпустите. Escape — отмена.` : `${actionLabel(locale, activeTool)}: start on a player, draw, release. Escape cancels.`) : nextIntent === 'extend' ? (locale === 'ru' ? `Шаг ${phaseIndex + 1} → ${phaseIndex + 2}: нарисуйте движение к новому шагу.` : `Step ${phaseIndex + 1} → ${phaseIndex + 2}: draw a movement to the new step.`) : phaseIndex >= snapshot.phases.length - 1 ? (locale === 'ru' ? 'Это финал. «Добавить шаг» создаст продолжение.' : 'This is the finish. Add step to continue the play.') : nextIntent === 'phase' ? (locale === 'ru' ? 'Движение готово. Нажмите «Старт», чтобы проверить.' : 'Movement ready. Press Play to check it.') : nextIntent === 'draw' ? (locale === 'ru' ? 'Теперь выберите движение и нарисуйте линию от игрока.' : 'Now choose a movement and draw a line from a player.') : (locale === 'ru' ? 'Перетащите игрока. Чтобы задать движение, выберите инструмент выше.' : 'Drag a player. To add movement, choose a tool above.'))}</p>
          <CourtStage
            facade={facade}
            snapshot={snapshot}
            phaseIndex={phaseIndex}
            selectedId={selectedId}
            selectedActionId={selectedActionId}
            activeTool={activeTool}
            readOnly={!canMoveActors}
            presentation={watching ? '3d' : 'plan'}
            onFeedback={message => { setDrawingFeedback(message); setAnnouncement(message); }}
            onSelect={entityId => {
              selectEntity(entityId);
              setAnnouncement(entityId === 'ball' ? t('ballSelected') : t('actorSelected', { actor: actorLabel(locale, entityId) }));
            }}
            onCreateAction={createTacticalAction}
            onCancelAction={() => setAnnouncement(t('actionDrawingCancelled'))}
            onCommitPose={commitPointerPose}
            onNudge={nudge}
            coordinator={coordinatorRef.current}
            playback={playback}
            awarenessSource={awarenessSource}
          />
          <CourtLegend />
          {!watching && playbackControls}
        </section>

        <PhaseTimeline
          snapshot={snapshot} phaseIndex={phaseIndex} readOnly={readOnly}
          canReorder={canAuthorStructure} canAdd={canAuthorStructure}
          onSelect={index => {
            setNextIntent('reopen');
            playback.pause(); playback.goToPhase(index); setPhaseIndex(index);
            setAnnouncement(t('phaseSelected', { number: index + 1 }));
          }}
          onReorder={reorderPhase} onAnnounce={setAnnouncement} onAdd={addPhase}
          coordinator={coordinatorRef.current}
          playback={playback}
        />

        <aside className="semantic-panel" aria-labelledby="lineup-heading">
          <details className="player-controls" open={!isExample}>
          <summary>{locale === 'ru' ? 'Игроки и действия · клавиатура' : 'Players & actions · keyboard'}</summary>
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">{t('semanticCompanion')}</span>
              <h2 id="lineup-heading">{t('lineup')}</h2>
            </div>
            <span className="entity-count">{t('actorsAndBall')}</span>
          </div>

          <label className="possession-field">
            <span>{t('possession')}</span>
            <select
              value={activePhase.possession.value}
              disabled={!canAuthorStructure}
              onChange={event => changePossession(event.target.value as Possession)}
            >
              {snapshot.actors.map(actor => (
                <option key={actor.id} value={actor.id}>{actor.label} · {teamLabel(locale, actor.team)}</option>
              ))}
              <option value="loose">{t('looseBall')}</option>
            </select>
          </label>

          <section className="action-list" aria-labelledby="actions-heading">
            <div className="section-heading-row">
              <h3 id="actions-heading">{t('actionsFromPhase')}</h3>
              <span className="entity-count">{snapshot.actions.filter(action => !action.archived && action.fromFrameId === activePhase.id).length}</span>
            </div>
            <ol>
              {snapshot.actions.filter(action => !action.archived && action.fromFrameId === activePhase.id).map(action => (
                <li key={action.id}>
                  <button
                    type="button"
                    className={selectedActionId === action.id ? 'action-row is-selected' : 'action-row'}
                    data-action-id={action.id}
                    aria-pressed={selectedActionId === action.id}
                    onFocus={() => coordinatorRef.current.setContext('court.actorSelected')}
                    onClick={() => {
                      setSelectedActionId(action.id);
                      setSelectedId(action.actorId);
                      facade.setSelectionSnapshot({ phaseId: activePhase.id, entityId: action.id, focusTarget: 'action' });
                    }}
                  >
                    <strong>{actionLabel(locale, action.type)}</strong>
                    <span>{actorLabel(locale, action.actorId)}{action.targetActorId ? ` → ${actorLabel(locale, action.targetActorId)}` : ''}</span>
                    {action.path.candidates.length > 1 ? <span className="conflict-badge">{t('pathConflict')}</span> : null}
                    {action.adjacency === 'needs-repair' ? <span className="repair-badge">{t('adjacencyRepair')}</span> : null}
                  </button>
                  {canAuthorStructure && <button type="button" aria-label={locale === 'ru' ? `Удалить действие ${actionLabel(locale, action.type)} ${actorLabel(locale, action.actorId)}` : `Delete action ${actionLabel(locale, action.type)} ${actorLabel(locale, action.actorId)}`} onClick={() => {
                    runCommand(locale === 'ru' ? 'Действие удалено. Его можно вернуть кнопкой «Отменить».' : 'Action deleted. Undo restores it.', () => facade.archiveAction(action.id));
                    setSelectedActionId(null);
                    document.querySelector<HTMLElement>(`[data-actor-id="${action.actorId}"]`)?.focus();
                  }}>{locale === 'ru' ? 'Удалить действие' : 'Delete action'}</button>}
                </li>
              ))}
            </ol>
          </section>

          {(['offense', 'defense'] as const).map(team => (
            <section key={team} className="team-group" aria-labelledby={`${team}-heading`}>
              <h3 id={`${team}-heading`}>{teamLabel(locale, team)}</h3>
              <ol>
                {snapshot.actors.filter(actor => actor.team === team).map(actor => {
                  const pose = activePhase.poses[actor.id];
                  const conflicted = activePhase.poseRegisters[actor.id].candidates.length > 1;
                  return (
                    <li key={actor.id}>
                      <button
                        type="button"
                        className={selectedId === actor.id ? 'lineup-row is-selected' : 'lineup-row'}
                        data-actor-id={actor.id}
                        aria-pressed={selectedId === actor.id}
                        onClick={() => selectEntity(actor.id)}
                        onFocus={() => coordinatorRef.current.setContext('court.actorSelected')}
                        onKeyDown={event => {
                          const step = event.shiftKey ? 50 : 5;
                          const offset: Partial<Record<string, [number, number]>> = {
                            ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
                          };
                          const delta = offset[event.key];
                          if (!delta) return;
                          event.preventDefault();
                          setSelectedId(actor.id);
                          nudge(actor.id, delta[0], delta[1]);
                        }}
                      >
                        <span className={`token token-${team}`}>{actor.number}</span>
                        <span><strong>{actor.label}</strong><small>x {Math.round(pose.x)} · y {Math.round(pose.y)}</small></span>
                        {activePhase.possession.value === actor.id ? <span className="possession-dot">{t('ball').toUpperCase()}</span> : null}
                        {conflicted ? <span className="conflict-badge">{t('conflicts')}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

          <section className="team-group ball-group" aria-labelledby="ball-heading">
            <h3 id="ball-heading">{t('ball')}</h3>
            <button
              type="button"
              className={selectedId === 'ball' ? 'lineup-row is-selected' : 'lineup-row'}
              aria-pressed={selectedId === 'ball'}
              onClick={() => selectEntity('ball')}
              onKeyDown={event => {
                const step = event.shiftKey ? 50 : 5;
                const offset: Partial<Record<string, [number, number]>> = {
                  ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
                };
                const delta = offset[event.key];
                if (!delta) return;
                event.preventDefault();
                nudge('ball', delta[0], delta[1]);
              }}
            >
              <span className="token token-ball" aria-hidden="true" />
              <span><strong>{activePhase.possession.value === 'loose' ? t('looseBall') : t('heldBy', { actor: actorLabel(locale, activePhase.possession.value) })}</strong><small>x {Math.round(activePhase.ballPose.x)} · y {Math.round(activePhase.ballPose.y)}</small></span>
            </button>
          </section>

          </details>
          <details className="cue-disclosure" open={!isExample}>
          <summary>{locale === 'ru' ? `Заметка тренера · шаг ${phaseIndex + 1}` : `Coach’s note · step ${phaseIndex + 1}`}</summary>
          <RichCueEditor
            key={activePhase.id}
            journal={facade.emergencyJournal}
            titleDraft={titleDraft}
            phaseId={activePhase.id}
            document={facade.getCueDocument(phaseIndex)}
            readOnly={!canEditCue}
            coordinator={coordinatorRef.current}
            onCommit={commitCue}
            onAnnounce={setAnnouncement}
          />
          </details>
        </aside>
      </main>
      <div className="coach-guidance"><PracticeGuide mode={responsiveMode} /></div>

      <ConflictPanel
        snapshot={snapshot}
        readOnly={!canAuthorStructure}
        onResolve={input => {
          runCommand(t('conflictResolved'), () => facade.resolveConflict(input));
        }}
        onPhaseSelected={index => {
          playback.pause();
          playback.goToPhase(index);
          setPhaseIndex(index);
          setAnnouncement(t('conflictPhaseSelected', { number: index + 1 }));
        }}
        onAnnounce={setAnnouncement}
      />

      <details className="transfer-help"><summary>{locale === 'ru' ? 'Сохранение и перенос на другое устройство' : 'Saving and moving to another device'}</summary><p>{locale === 'ru' ? 'Изменения сохраняются автоматически в этом браузере. Вернитесь на главную и откройте комбинацию в «Недавних». Для резервной копии скачайте «Файл восстановления»; «Открыть восстановление…» откроет его как отдельную локальную комбинацию. «Экспорт JSON» — данные для чтения. «Пригласить» создаёт общую комнату с копией комбинации: локальный оригинал остаётся здесь. Ссылка редактирования разрешает совместные изменения, ссылка просмотра — только просмотр. Храните их приватно. Очистка данных браузера удаляет локальные копии.' : 'Edits save automatically in this browser. Go home and reopen your play from Recent plays. Download a Recovery file for a backup; Open recovery… imports it as a separate local play. Export JSON is for inspection. Invite creates a shared room with a copy of this play; the local original remains here. Edit links allow collaboration; view links allow review only. Keep them private. Clearing browser data removes local copies.'}</p></details>

      {canAuthorStructure && actionDialogOpen && selectedId !== 'ball' ? (
        <ActionDialog
          snapshot={snapshot}
          phaseIndex={phaseIndex}
          initialActorId={selectedId}
          onClose={closeActionDialog}
          onCreate={input => {
            const start = snapshot.phases[phaseIndex]!.poses[input.actorId];
            const created = createTacticalAction({
              actorId: input.actorId,
              type: input.type,
              targetActorId: input.targetActorId,
              path: { points: [start, clampPose({ x: input.x, y: input.y })] },
            });
            if (created) closeActionDialog(false);
            return created;
          }}
        />
      ) : null}

      <div className="sr-only" aria-live="polite" aria-atomic="true" id="live-region">
        {announcement}
      </div>
      <div
        id="document-status"
        hidden
        data-phase-count={snapshot.phases.length}
        data-actor-count={snapshot.actors.length}
        data-conflict-count={snapshot.conflictCount}
        data-schema-version={snapshot.schemaVersion}
        data-recovery-issue={facade.recoveryIssue ?? ''}
        data-recovery-snapshot-count={facade.recoveryDiagnostics.recoverySnapshotCount}
        data-recovery-content-free="true"
      />
    </div>
  );
}

export function EmptyRoute() {
  return <PlayHome />;
}
