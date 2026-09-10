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
  | { kind: 'memory-error'; message: string };

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
    if (matchMedia('(max-width: 47.9375rem)').matches) return 'mobile';
    if (matchMedia('(max-width: 73.6875rem)').matches) return 'tablet';
    return 'desktop';
  };
  const [mode, setMode] = useState<ResponsiveMode>(getMode);
  useEffect(() => {
    const tablet = matchMedia('(max-width: 73.6875rem)');
    const mobile = matchMedia('(max-width: 47.9375rem)');
    const update = () => setMode(getMode());
    tablet.addEventListener('change', update);
    mobile.addEventListener('change', update);
    return () => {
      tablet.removeEventListener('change', update);
      mobile.removeEventListener('change', update);
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
  const { t } = useI18n();
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
  });
  renderOptionsRef.current = {
    selectedId: props.selectedId,
    selectedActionId: props.selectedActionId,
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
  }, [props.snapshot, props.playback, props.selectedId, props.selectedActionId]);

  const toCourtPose = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clampPose({
      x: ((event.clientX - bounds.left) / bounds.width) * event.currentTarget.width,
      y: ((event.clientY - bounds.top) / bounds.height) * event.currentTarget.height,
    });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pose = toCourtPose(event);
    props.playback.pause();
    props.playback.goToPhase(props.phaseIndex);
    if (props.activeTool !== 'select') {
      if (props.readOnly || props.selectedId === 'ball') return;
      const phase = snapshotRef.current.phases[phaseIndexRef.current];
      if (!phase || !snapshotRef.current.phases[phaseIndexRef.current + 1]) return;
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      actionRef.current = {
        actorId: props.selectedId,
        pointerId: event.pointerId,
        path: { points: [phase.poses[props.selectedId], pose] },
      };
      props.coordinator.setContext('court.drawingAction');
      gfxRef.current?.project(snapshotRef.current, phaseIndexRef.current, {
        selectedId: props.selectedId,
        selectedActionId: props.selectedActionId,
        actionDraft: { type: props.activeTool, path: actionRef.current.path },
      });
      return;
    }
    const entityId = gfxRef.current?.hitTest(pose.x, pose.y);
    if (!entityId) return;
    props.onSelect(entityId);
    event.currentTarget.focus();
    if (props.readOnly) return;
    const phase = snapshotRef.current.phases[phaseIndexRef.current];
    if (entityId === 'ball' && phase?.possession.value !== 'loose') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { entityId, pose, pointerId: event.pointerId };
    props.coordinator.setContext('court.draggingActor');
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
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
    <div className="court-frame">
      <div className="court-scorebug" aria-hidden="true">
        <span>{t('offense').toUpperCase()}</span>
        <strong>5 × 5</strong>
        <span>{t('defense').toUpperCase()}</span>
      </div>
      <canvas
        ref={canvasRef}
        id="court"
        data-testid="court"
        width={840}
        height={460}
        tabIndex={0}
        aria-label={t('courtEditorLabel')}
        onFocus={() => props.coordinator.setContext('court.actorSelected')}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={event => finishPointer(event, true)}
        onPointerCancel={event => finishPointer(event, false)}
      />
      <PresenceLayer source={props.awarenessSource} />
      <p className="court-help">
        {t('courtHelp')}
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
}) {
  const { t } = useI18n();
  const canonicalIds = props.snapshot.phases.map(phase => phase.id);
  const selectedPhaseId = props.snapshot.phases[props.phaseIndex]?.id;
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const pointerRef = useRef<{ phaseId: string; pointerId: number } | null>(null);
  const displayIds = previewIds ?? canonicalIds;

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
          <h2 id="timeline-heading">{t('phases')}</h2>
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
                aria-label={t('phasePosition', { number: index + 1, position: index + 1, total: displayIds.length, lifted: lifted ? t('liftedSuffix') : '' })}
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
              <span>{t('phaseCard', { number: index + 1 })}</span>
              <small>{phase.possession.value === 'loose' ? t('looseBall') : phase.possession.value}</small>
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
  const online = useOnlineState();
  const shellState = useOfflineShellState();
  const { state: storageRetention, requestPersistence } = useStorageRetention();
  const readOnly = storageMode.kind !== 'indexeddb' || facade.readOnly;
  const canMoveActors = !readOnly && responsiveMode !== 'mobile';
  const canEditCue = !readOnly && responsiveMode !== 'mobile';
  const canAuthorStructure = !readOnly && responsiveMode === 'desktop';
  const demoMode = new URLSearchParams(location.search).get('demo') === '1';
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<ProjectionEntityId>('offense-1');
  const [announcement, setAnnouncement] = useState(() => t('localPlayReady'));
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem('replaylab:onboarding-complete') !== 'true';
    } catch {
      return true;
    }
  });
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | TacticalActionType>('select');
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
  reactRenderCount.current += 1;

  const completeOnboarding = useCallback(() => {
    if (!showOnboarding) return;
    setShowOnboarding(false);
    try {
      window.localStorage.setItem('replaylab:onboarding-complete', 'true');
    } catch {
      // The guide still closes for this session.
    }
  }, [showOnboarding]);

  useEffect(() => playback.setSnapshot(snapshot), [playback, revision]);
  useEffect(() => () => playback.destroy(), [playback]);
  useEffect(() => {
    if (responsiveMode !== 'desktop') setActiveTool('select');
  }, [responsiveMode]);
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
    setSelectedId(entityId);
    setSelectedActionId(null);
    facade.setSelectionSnapshot({
      phaseId: activePhase.id,
      entityId,
      focusTarget: entityId === 'ball' ? 'court' : 'lineup',
    });
    awarenessSource?.publish({
      selection: { phaseId: activePhase.id, entityId },
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
        completeOnboarding();
        void flushLocal();
        return result;
      } catch (error) {
        console.error('ReplayLab command rejected', error);
        setAnnouncement(t('commandFailed'));
        return undefined;
      }
    },
    [completeOnboarding, flushLocal, phaseIndex, playback, readOnly, t]
  );

  const nudge = useCallback(
    (entityId: ProjectionEntityId, dx: number, dy: number) => {
      if (!canMoveActors) {
        setAnnouncement(t('mobileReviewBody'));
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
        () => facade.setActorPose({ phaseIndex, actorId: entityId, ...next })
      );
    },
    [canMoveActors, facade, locale, phaseIndex, runCommand, t]
  );

  const addPhase = useCallback(() => {
    if (!canAuthorStructure) return;
    const frameId = runCommand(t('phaseAdded'), () =>
      facade.addPhaseAfter(phaseIndex)
    );
    if (!frameId) return;
    const index = facade.snapshot.phases.findIndex(phase => phase.id === frameId);
    if (index >= 0) {
      setPhaseIndex(index);
      playback.goToPhase(index);
    }
  }, [canAuthorStructure, facade, phaseIndex, playback, runCommand, t]);

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
    if (!facade.canUndo) return;
    runCommand(t('undid'), () => facade.undo());
  }, [facade, runCommand, t]);

  const redo = useCallback(() => {
    if (!facade.canRedo) return;
    runCommand(t('redid'), () => facade.redo());
  }, [facade, runCommand, t]);

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
        () => facade.setActorPose({ phaseIndex, actorId: entityId, ...pose })
      );
    }
  };

  const createTacticalAction = (input: {
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId: ActorId | null;
    path: ActionPath;
  }) => {
    const actionId = runCommand(t('actionCreated', { action: actionLabel(locale, input.type) }), () =>
      facade.createAction({ phaseIndex, ...input })
    );
    if (!actionId) return;
    setSelectedActionId(actionId);
    setSelectedId(input.actorId);
    setActiveTool('select');
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

  return (
    <div
      className="app-shell"
      data-app-ready="true"
      data-local-source={facade.loadedFromIndexedDB ? 'indexeddb' : 'seed'}
      data-react-render-count={reactRenderCount.current}
    >
      <header className="command-bar">
        <a className="brand" href="/" aria-label={t('brandHome')}>
          <span className="brand-mark" aria-hidden="true">RL</span>
          <span><strong>ReplayLab</strong><small>{t('brandTagline')}</small></span>
        </a>
        <label className="title-field">
          <span className="sr-only">{t('playName')}</span>
          <input
            value={titleDraft}
            maxLength={80}
            readOnly={readOnly || responsiveMode !== 'desktop'}
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
          <nav className="history-controls" aria-label={t('history')}>
            <button type="button" className="icon-button" disabled={readOnly || responsiveMode === 'mobile' || !facade.canUndo} onClick={undo}>
              {t('undo')} <kbd>⌘Z</kbd>
            </button>
            <button type="button" className="icon-button" disabled={readOnly || responsiveMode === 'mobile' || !facade.canRedo} onClick={redo}>
              {t('redo')}
            </button>
          </nav>
          <div className="language-switcher" role="group" aria-label={t('language')}>
            <button type="button" aria-pressed={locale === 'ru'} onClick={() => setLocale('ru')}>{t('languageRu')}</button>
            <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{t('languageEn')}</button>
          </div>
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
        <NetworkStatus source={networkSource} online={online} />
        {snapshot.conflictCount > 0 ? (
          <span className="status-pill status-review">{t('needsReview', { count: snapshot.conflictCount })}</span>
        ) : null}
        <span className="status-meta">{t('phaseProgress', { current: phaseIndex + 1, total: snapshot.phases.length })}</span>
        <button className="status-action" type="button" onClick={() => downloadSnapshot(facade)}>
          {t('exportJson')}
        </button>
        <button
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
        <input
          ref={recoveryInputRef}
          hidden
          type="file"
          accept=".json,.replaylab-recovery.json,application/json"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            void file.text().then(serialized => ReplayLabEditorFacade.importRecoveryCopy(serialized)).then(result => {
              const next = new URL(`/app/play/${encodeURIComponent(result.playId)}/edit`, location.origin);
              next.searchParams.set('db', result.databaseName);
              location.assign(next);
            }).catch(error => {
              setAnnouncement(t('recoveryRejected', { reason: (error as Error).message }));
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
        <strong>{responsiveMode === 'mobile' ? t('mobileReviewTitle') : responsiveMode === 'tablet' ? t('tabletModeTitle') : t('desktopMode')}</strong>
        {responsiveMode === 'mobile' ? <span>{t('mobileReviewBody')}</span> : responsiveMode === 'tablet' ? <span>{t('tabletModeBody')}</span> : null}
      </section>

      {showOnboarding && canMoveActors ? (
        <aside className="onboarding-strip" aria-labelledby="onboarding-heading">
          <span className="eyebrow">{t('onboardingEyebrow')}</span>
          <strong id="onboarding-heading">{t('onboardingTitle')}</strong>
          <span>{t('onboardingBody')}</span>
        </aside>
      ) : null}

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
              <span className="eyebrow">{t('basketballHalfCourt')}</span>
              <h1 id="court-heading">{t('formationBoard')}</h1>
            </div>
            <span className="phase-chip">{t('phaseChip', { number: String(phaseIndex + 1).padStart(2, '0') })}</span>
          </div>
          {canAuthorStructure ? <div className="action-tools" role="toolbar" aria-label={t('courtTools')}>
            <button type="button" aria-pressed={activeTool === 'select'} onClick={() => setActiveTool('select')}>{t('select')} <kbd>V</kbd></button>
            {(['cut', 'pass', 'dribble', 'screen'] as const).map(type => (
              <button
                key={type}
                type="button"
                aria-pressed={activeTool === type}
                disabled={readOnly || phaseIndex >= snapshot.phases.length - 1 || selectedId === 'ball'}
                onClick={() => {
                  setActiveTool(type);
                  setAnnouncement(t('actionToolDraw', { action: actionLabel(locale, type) }));
                }}
              >
                {actionLabel(locale, type)} <kbd>{type[0]!.toUpperCase()}</kbd>
              </button>
            ))}
            <button
              ref={actionDialogButtonRef}
              type="button"
              disabled={readOnly || phaseIndex >= snapshot.phases.length - 1 || selectedId === 'ball'}
              onClick={() => {
                coordinatorRef.current.setContext('modal');
                setActionDialogOpen(true);
              }}
            >
              {t('keyboardAction')}
            </button>
          </div> : null}
          <CourtStage
            facade={facade}
            snapshot={snapshot}
            phaseIndex={phaseIndex}
            selectedId={selectedId}
            selectedActionId={selectedActionId}
            activeTool={activeTool}
            readOnly={!canMoveActors}
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
        </section>

        <aside className="semantic-panel" aria-labelledby="lineup-heading">
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
        </aside>
      </main>

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

      <PlaybackControls
        controller={playback}
        snapshot={snapshot}
        getCue={index => facade.getCue(index)}
        onPhaseSelected={setPhaseIndex}
        onPresentationChange={setPresenting}
      />

      <PhaseTimeline
        snapshot={snapshot}
        phaseIndex={phaseIndex}
        readOnly={readOnly}
        canReorder={canAuthorStructure}
        canAdd={canAuthorStructure}
        onSelect={index => {
          playback.pause();
          playback.goToPhase(index);
          setPhaseIndex(index);
          setAnnouncement(t('phaseSelected', { number: index + 1 }));
        }}
        onReorder={reorderPhase}
        onAnnounce={setAnnouncement}
        onAdd={addPhase}
        coordinator={coordinatorRef.current}
      />

      {canAuthorStructure && actionDialogOpen && selectedId !== 'ball' ? (
        <ActionDialog
          snapshot={snapshot}
          phaseIndex={phaseIndex}
          initialActorId={selectedId}
          onClose={closeActionDialog}
          onCreate={input => {
            const start = snapshot.phases[phaseIndex]!.poses[input.actorId];
            createTacticalAction({
              actorId: input.actorId,
              type: input.type,
              targetActorId: input.targetActorId,
              path: { points: [start, clampPose({ x: input.x, y: input.y })] },
            });
            closeActionDialog(false);
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
  const { t } = useI18n();
  return (
    <main className="empty-route">
      <span className="brand-mark" aria-hidden="true">RL</span>
      <p className="eyebrow">{t('emptyEyebrow')}</p>
      <h1>{t('emptyTitle')}</h1>
      <p>{t('emptyBody')}</p>
      <a className="button button-accent" href="/app/play/demo-play/edit?demo=1">{t('openSeededPlay')}</a>
    </main>
  );
}
