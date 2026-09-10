import { NoopLogger } from '@blocksuite/global/utils';
import type { Store } from '@blocksuite/store';
import type { SurfaceBlockModel } from '@blocksuite/std/gfx';
import { DocEngine, DocEngineStep, DocPeerStep, IndexedDBDocSource as KernelIndexedDBDocSource, type DocSource } from '@blocksuite/sync';
import * as Y from 'yjs';
import { EmergencyJournal, decodeUpdate } from './emergency-journal';

// Product-owned durability adapter for the approved kernel's collection schema.
// Explicitly commit as soon as the write is queued, then await transaction.done;
// a successful put request alone is not a durable save acknowledgement.
class IndexedDBDocSource extends KernelIndexedDBDocSource {
  override async push(docId: string, data: Uint8Array) {
    const db = await this.getDb();
    const transaction = db.transaction('collection', 'readwrite', { durability: 'strict' });
    try {
      const previous = await transaction.store.get(docId);
      const update = Y.mergeUpdates([...(previous?.updates.map(row => row.update) ?? []), data]);
      const written = transaction.store.put({ id: docId, updates: [{ timestamp: Date.now(), update }] });
      transaction.commit();
      await written;
      await transaction.done;
      this.channel.postMessage({ type: 'db-updated', payload: { docId, update: data } });
    } catch (error) {
      await transaction.done.catch(() => undefined);
      throw error;
    }
  }
}

import {
  ACTOR_IDS,
  REPLAY_SCHEMA_VERSION,
  MAX_PHASES,
  MAX_ACTIONS_PER_TRANSITION,
  type ActorId,
  type ActionPath,
  type MigrationResult,
  type Pose,
  type Possession,
  type ReplayFrameSnapshot,
  type TacticalActionType,
  assertPoseInBounds,
  createCandidate,
  assertActionActors,
  assertActionPath,
  createActionRecord,
  createFrame,
  createRegister,
  getRegisterCandidates,
  migrateReplayRoot,
  rankAfter,
  rankForReorder,
  readReplaySnapshot,
  seedReplayRoot,
} from './domain';
import { buildConflictResolution } from './conflict-command';
import { ReplayLabDoc } from './workspace';
import {
  ActiveDatabaseRegistry,
  RecoveryStore,
  ReplayOpenError,
  checksumBytes,
  classifyRecoveryIssue,
  createRecoveryArtifact,
  diagnosticsPayload,
  parseRecoveryArtifact,
  serializeRecoveryArtifact,
  type RecoveryArtifact,
  type RecoveryIssue,
} from './recovery';

import {
  type RichCueDelta,
  type RichCueDocument,
  plainTextCue,
  richCueFromDelta,
  richCuePlainText,
  richCueToDelta,
} from './cue';
export const DEFAULT_PLAY_ID = 'replaylab-local-play';
export const DEFAULT_DB_NAME = 'replaylab-local-v1';

type Persistence = {
  engine: DocEngine;
  source: IndexedDBDocSource;
  recoveryStore: RecoveryStore;
  registry: ActiveDatabaseRegistry;
  activeDatabase: string;
  previousDatabase: string | null;
};

type MutableText = {
  length: number;
  insert(value: string, index?: number): void;
  replace(index: number, length: number, value: string): void;
  toDelta(): RichCueDelta[];
  toString(): string;
  yText: Y.Text;
};

type RegisterDraft = {
  candidates: Y.Map<Y.Map<unknown>>;
  observedCandidateIds: string[];
  nextCandidate: ReturnType<typeof createCandidate>;
};

export type SelectionSnapshot = {
  phaseId: string;
  entityId: string;
  focusTarget: 'court' | 'lineup' | 'action' | 'cue' | 'timeline';
};

type SelectionHistoryEntry = {
  before: SelectionSnapshot | null;
  after: SelectionSnapshot | null;
};

function cloneSelection(selection: SelectionSnapshot | null) {
  return selection ? { ...selection } : null;
}

function findBlockModel<T>(store: Store, flavour: string) {
  const block = Object.values(store.blocks.peek()).find(
    candidate => candidate.model.flavour === flavour
  );
  if (!block) throw new Error(`Missing ${flavour} block`);
  return block.model as unknown as T;
}

function getFrameMap(replayRoot: Y.Map<unknown>, frame: ReplayFrameSnapshot) {
  const frames = replayRoot.get('frames');
  if (!(frames instanceof Y.Map)) throw new Error('Missing frames');
  const frameMap = frames.get(frame.id);
  if (!(frameMap instanceof Y.Map)) throw new Error(`Missing frame ${frame.id}`);
  return { frames: frames as Y.Map<Y.Map<unknown>>, frameMap };
}

export class ReplayLabEditorFacade {
  emergencyJournal?: EmergencyJournal;
  private readonly captureEmergency = () => this.emergencyJournal?.capture(this.encode());
  private readonly listeners = new Set<() => void>();
  private readonly titleText: MutableText;
  private readonly historySubscription: { unsubscribe(): void };
  private closed = false;
  private revisionValue = 0;
  private currentSelection: SelectionSnapshot | null = null;
  private restoredSelection: SelectionSnapshot | null = null;
  private readonly undoSelections: SelectionHistoryEntry[] = [];
  private readonly redoSelections: SelectionHistoryEntry[] = [];
  private readOnlyValue = false;
  private recoverySnapshotCountValue = 0;
  private lastRecoveryAtValue: number | null = null;
  private storageIssueValue: RecoveryIssue | null = null;
  private migrationDurationMsValue = 0;
  private lastRecoveryJsonValue: string | null = null;


  private constructor(
    readonly doc: ReplayLabDoc,
    readonly store: Store,
    readonly replayRoot: Y.Map<unknown>,
    readonly surface: SurfaceBlockModel,
    readonly loadedFromIndexedDB: boolean,
    readonly migrationResult: MigrationResult,
    readonly openedAt: number,
    private readonly persistence?: Persistence
  ) {
    this.titleText = findBlockModel<{ props: { title: MutableText } }>(
      store,
      'replaylab:page'
    ).props.title;
    replayRoot.observeDeep(this.emitUpdated);
    doc.yBlocks.observeDeep(this.emitUpdated);
    this.historySubscription = store.history.onUpdated.subscribe(this.emitUpdated);
  }

  static async open(options: {
    dbName?: string;
    playId?: string;
    networkSource?: DocSource & {
      configureImmediateRecovery?(binding: {
        docId: string; stateVector(): Uint8Array; missingUpdate(remoteState: Uint8Array): Uint8Array; applyRemote(update: Uint8Array): void;
      }): void;
    };
    readOnly?: boolean;
    migrationFault?: 'after-target-write' | 'after-journal-backup';
    seedContent?: { title: string; cueOne: string; cueTwo: string };
  } = {}) {
    const openedAt = performance.now();
    const playId = options.playId ?? DEFAULT_PLAY_ID;
    const baseDatabase = options.dbName ?? DEFAULT_DB_NAME;
    const registry = new ActiveDatabaseRegistry(baseDatabase);
    const recoveryStore = new RecoveryStore(baseDatabase);
    let activeDatabase = await registry.resolve(playId, baseDatabase);
    let previousDatabase: string | null = null;
    let source = new IndexedDBDocSource(activeDatabase);
    let migrationSource: IndexedDBDocSource | null = null;
    const rootDoc = new Y.Doc({ guid: playId });
    let persisted: Awaited<ReturnType<IndexedDBDocSource['pull']>> = null;
    let migrationResult: MigrationResult = { migrated: false, from: 'v1', to: 'v1' };
    let migrationDurationMs = 0;
    let preMigrationArtifact: RecoveryArtifact | null = null;
    try {
      try {
        persisted = await source.pull(playId, Y.encodeStateVector(rootDoc));
      } catch (error) {
        const latest = await recoveryStore.latestValid(playId);
        throw new ReplayOpenError(
          'corrupt',
          error instanceof Error ? error.message : 'The local play could not be read',
          latest ? serializeRecoveryArtifact(latest) : undefined
        );
      }
      if (persisted?.data.length) {
        try {
          Y.applyUpdate(rootDoc, persisted.data, 'replaylab:clone-open');
        } catch (error) {
          const latest = await recoveryStore.latestValid(playId);
          const damaged = await createRecoveryArtifact({
            playId,
            update: persisted.data,
            reason: 'corrupt',
            schemaVersion: null,
            sourceDatabase: activeDatabase,
          });
          throw new ReplayOpenError(
            'corrupt',
            error instanceof Error ? error.message : 'The local play update is corrupt',
            serializeRecoveryArtifact(latest ?? damaged)
          );
        }
        const replayRoot = rootDoc.getMap<unknown>('replay');
        const schemaVersion = replayRoot.get('schemaVersion');
        if (typeof schemaVersion === 'number' && schemaVersion > REPLAY_SCHEMA_VERSION) {
          preMigrationArtifact = await createRecoveryArtifact({
            playId,
            update: persisted.data,
            reason: 'pre-migration',
            schemaVersion,
            sourceDatabase: activeDatabase,
          });
          await recoveryStore.saveImmutable(preMigrationArtifact);
          throw new ReplayOpenError(
            'future-schema',
            `This play uses future schema ${schemaVersion}; ReplayLab supports ${REPLAY_SCHEMA_VERSION}`,
            serializeRecoveryArtifact(preMigrationArtifact)
          );
        }
        const needsMigration =
          replayRoot.has('phases') ||
          (replayRoot.has('frames') && !replayRoot.has('actions'));
        if (needsMigration) {
          preMigrationArtifact = await createRecoveryArtifact({
            playId,
            update: persisted.data,
            reason: 'pre-migration',
            schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : null,
            sourceDatabase: activeDatabase,
          });
          await recoveryStore.saveImmutable(preMigrationArtifact);
        }
        const migrationStartedAt = performance.now();
        migrationResult = this.migrateLoadedRoot(rootDoc);
        migrationDurationMs = performance.now() - migrationStartedAt;
        if (migrationResult.migrated) {
          const migratedUpdate = Y.encodeStateAsUpdate(rootDoc);
          const checksum = await checksumBytes(migratedUpdate);
          const targetDatabase = `${baseDatabase}:schema-v${REPLAY_SCHEMA_VERSION}:${checksum.slice(0, 12)}`;
          migrationSource = new IndexedDBDocSource(targetDatabase);
          await migrationSource.push(playId, migratedUpdate);
          const verified = await migrationSource.pull(playId, new Uint8Array());
          if (!verified?.data.length) throw new Error('Migrated database did not reopen');
          this.validateUpdate(verified.data, playId);
          if (options.migrationFault === 'after-target-write') {
            throw new ReplayOpenError(
              'migration',
              'Injected interruption after migrated copy write',
              preMigrationArtifact ? serializeRecoveryArtifact(preMigrationArtifact) : undefined
            );
          }
          await registry.activate(playId, targetDatabase, activeDatabase);
          previousDatabase = activeDatabase;
          await this.closeIndexedSource(source);
          source = migrationSource;
          migrationSource = null;
          activeDatabase = targetDatabase;
        }
      } else if (options.networkSource) {
        try {
          const remote = await options.networkSource.pull(playId, Y.encodeStateVector(rootDoc));
          if (remote?.data.length) Y.applyUpdate(rootDoc, remote.data, 'replaylab:network-bootstrap');
        } catch {
          // Network is a shadow: an unavailable bootstrap never replaces the local source.
        }
      }
      const journal = new EmergencyJournal(baseDatabase, playId);
      // Additive v0 -> v1 adoption: preserve exact existing bytes before recovery
      // or any journal marker. The collection database/schema is not replaced.
      if (persisted?.data.length) {
        const backup = await createRecoveryArtifact({ playId, update: persisted.data, reason: 'pre-migration', schemaVersion: REPLAY_SCHEMA_VERSION, sourceDatabase: activeDatabase });
        await recoveryStore.saveImmutable(backup);
        const verifiedBackup = (await recoveryStore.list(playId)).find(item => item.snapshotId === backup.snapshotId);
        if (!verifiedBackup) throw new Error('Journal adoption backup did not reopen');
        await parseRecoveryArtifact(serializeRecoveryArtifact(verifiedBackup));
        preMigrationArtifact = backup;
      }
      if (options.migrationFault === 'after-journal-backup') throw new ReplayOpenError('migration', 'Interrupted before journal adoption', preMigrationArtifact ? serializeRecoveryArtifact(preMigrationArtifact) : undefined);
      const journalRecords = journal.scan();
      let journalIssue = journalRecords.damaged.length > 0;
      for (const entry of journalRecords.latest.filter(entry => entry.body.kind === 'document')) {
        try {
          const update = decodeUpdate(entry.body.payload);
          this.validateUpdate(update, playId);
          const candidate = new Y.Doc();
          try {
            Y.applyUpdate(candidate, Y.encodeStateAsUpdate(rootDoc));
            Y.applyUpdate(candidate, update);
            this.validateUpdate(Y.encodeStateAsUpdate(candidate), playId);
          } finally { candidate.destroy(); }
          Y.applyUpdate(rootDoc, update, 'replaylab:emergency-recovery');
        } catch { journalIssue = true; }
      }
      if (journalIssue) {
        const artifact = await createRecoveryArtifact({ playId, update: Y.encodeStateAsUpdate(rootDoc), reason: 'corrupt', schemaVersion: REPLAY_SCHEMA_VERSION, sourceDatabase: activeDatabase });
        throw new ReplayOpenError('corrupt', 'Emergency journal damaged or newer than this client; original records retained', serializeRecoveryArtifact(artifact));
      }
      options.networkSource?.configureImmediateRecovery?.({
        docId: playId,
        stateVector: () => Y.encodeStateVector(rootDoc),
        missingUpdate: remoteState => Y.encodeStateAsUpdate(rootDoc, remoteState),
        applyRemote: update => Y.applyUpdate(rootDoc, update, 'replaylab:network-recovery'),
      });
      const engine = new DocEngine(rootDoc, source, options.networkSource ? [options.networkSource] : [], new NoopLogger());
      engine.start();
      // DocEngine's aggregate readiness includes network shadows. Opening a
      // local document must wait only for its authoritative IndexedDB peer.
      await new Promise<void>(resolve => {
        const check = () => {
          const main = engine.status.main;
          if (main && main.step > DocPeerStep.LoadingRootDoc) {
            subscription.unsubscribe();
            resolve();
          }
        };
        const subscription = engine.onStatusChange.subscribe(check);
        check();
      });
      const facade = ReplayLabEditorFacade.create(
        rootDoc,
        Boolean(persisted),
        migrationResult,
        openedAt,
        { engine, source, recoveryStore, registry, activeDatabase, previousDatabase },
        true,
        options.seedContent
      );
      facade.migrationDurationMsValue = migrationDurationMs;
      await facade.flush();
      await facade.checkpointRecovery(true);
      facade.emergencyJournal = journal;
      rootDoc.on('update', facade.captureEmergency);
      // Recovered foreign-writer slots stay as evidence: Web Storage has no
      // cross-tab compare-and-delete transaction. Only a writer ACKs its own.
      if (options.readOnly) facade.setReadOnly(true);
      return facade;
    } catch (error) {
      await this.closeIndexedSource(migrationSource);
      await this.closeIndexedSource(source);
      await registry.close();
      await recoveryStore.close();
      rootDoc.destroy();
      if (error instanceof ReplayOpenError) throw error;
      throw new ReplayOpenError(
        classifyRecoveryIssue(error),
        error instanceof Error ? error.message : 'ReplayLab could not open the local play',
        preMigrationArtifact ? serializeRecoveryArtifact(preMigrationArtifact) : undefined
      );
    }
  }

  private static validateUpdate(update: Uint8Array, playId: string) {
    const verificationDoc = new Y.Doc({ guid: `${playId}:verification` });
    Y.applyUpdate(verificationDoc, update);
    const migrationResult = this.migrateLoadedRoot(verificationDoc);
    if (migrationResult.migrated) throw new Error('Migrated copy is not at the current schema');
    const verification = ReplayLabEditorFacade.create(
      verificationDoc,
      false,
      migrationResult,
      performance.now(),
      undefined,
      false
    );
    verification.close();
  }

  private static async closeIndexedSource(source: IndexedDBDocSource | null) {
    if (!source) return;
    source.channel.close();
    try {
      (await source.getDb()).close();
    } catch {
      // Closing an unopened or failed database is best-effort cleanup only.
    }
  }

  static createMemory(
    playId = DEFAULT_PLAY_ID,
    seedContent?: { title: string; cueOne: string; cueTwo: string }
  ) {
    return ReplayLabEditorFacade.create(
      new Y.Doc({ guid: playId }),
      false,
      { migrated: false, from: 'v1', to: 'v1' },
      performance.now(),
      undefined,
      true,
      seedContent
    );
  }

  static fromUpdate(update: Uint8Array, playId = DEFAULT_PLAY_ID) {
    const rootDoc = new Y.Doc({ guid: playId });
    Y.applyUpdate(rootDoc, update);
    const migrationResult = this.migrateLoadedRoot(rootDoc);
    return ReplayLabEditorFacade.create(
      rootDoc,
      false,
      migrationResult,
      performance.now(),
      undefined,
      false
    );
  }

  private static migrateLoadedRoot(rootDoc: Y.Doc): MigrationResult {
    const replayRoot = rootDoc.getMap<unknown>('replay');
    if (!replayRoot.has('schemaVersion')) {
      return { migrated: false, from: 'v1', to: 'v1' };
    }
    return migrateReplayRoot(replayRoot);
  }

  private static create(
    rootDoc: Y.Doc,
    loadedFromIndexedDB: boolean,
    migrationResult: MigrationResult,
    openedAt: number,
    persistence?: Persistence,
    seedIfEmpty = true,
    seedContent = {
      title: 'Horns entry',
      cueOne: 'Start in horns.',
      cueTwo: 'Finish at the rim.',
    }
  ) {
    const doc = new ReplayLabDoc(rootDoc, rootDoc.guid);
    const store = doc.getStore();
    const replayRoot = rootDoc.getMap<unknown>('replay');

    if (!replayRoot.has('schemaVersion')) {
      if (!seedIfEmpty) throw new Error('Encoded replay did not contain a replay root');
      const rootId = store.addBlock('replaylab:page');
      const surfaceId = store.addBlock('replaylab:surface', {}, rootId);
      const cue1 = store.addBlock('replaylab:cue', { phaseId: 'phase-1' }, rootId);
      const cue2 = store.addBlock('replaylab:cue', { phaseId: 'phase-2' }, rootId);
      const rootTitle = store.getBlock(rootId)?.model as unknown as {
        props: { title: MutableText };
      };
      rootTitle.props.title.insert(seedContent.title, 0);
      const cueOneText = store.getBlock(cue1)?.model.text;
      const cueTwoText = store.getBlock(cue2)?.model.text;
      cueOneText?.insert(seedContent.cueOne, 0);
      cueTwoText?.insert(seedContent.cueTwo, 0);
      rootDoc.transact(
        () => seedReplayRoot(replayRoot, [cue1, cue2]),
        'replaylab:seed'
      );
      if (!store.getBlock(surfaceId)?.model) {
        throw new Error('Seeded surface block is missing');
      }
    }

    const titleModel = findBlockModel<{ props: { title: MutableText } }>(
      store,
      'replaylab:page'
    );
    const snapshot = readReplaySnapshot(replayRoot, titleModel.props.title.toString());
    const surface = findBlockModel<SurfaceBlockModel>(store, 'replaylab:surface');
    for (const phase of snapshot.phases) {
      const cue = store.getBlock(phase.cueBlockId);
      if (!cue?.model.text) throw new Error(`Missing cue block ${phase.cueBlockId}`);
    }

    store.history.undoManager.addToScope(replayRoot);
    store.resetHistory();
    return new ReplayLabEditorFacade(
      doc,
      store,
      replayRoot,
      surface,
      loadedFromIndexedDB,
      migrationResult,
      openedAt,
      persistence
    );
  }

  get snapshot() {
    return readReplaySnapshot(this.replayRoot, this.titleText.toString());
  }

  get canUndo() {
    return this.store.history.undoManager.canUndo();
  }

  get canRedo() {
    return this.store.history.undoManager.canRedo();
  }

  get readOnly() {
    return this.readOnlyValue;
  }

  setReadOnly(value: boolean) {
    this.readOnlyValue = value;
    this.store.readonly = value;
    this.emitUpdated();
  }
  get localOpenDurationMs() {
    return performance.now() - this.openedAt;
  }

  get revision() {
    return this.revisionValue;
  }

  setSelectionSnapshot(selection: SelectionSnapshot | null) {
    this.currentSelection = cloneSelection(selection);
  }

  takeRestoredSelection() {
    const selection = cloneSelection(this.restoredSelection);
    this.restoredSelection = null;
    return selection;
  }

  getCueDocument(phaseIndex = 0) {
    return richCueFromDelta(this.getCueText(phaseIndex).toDelta());
  }

  getCue(phaseIndex = 0) {
    return richCuePlainText(this.getCueDocument(phaseIndex));
  }

  setActorPose(input: {
    phaseIndex?: number;
    actorId: ActorId;
    x: number;
    y: number;
  }) {
    const phaseIndex = input.phaseIndex ?? 0;
    if (!ACTOR_IDS.includes(input.actorId)) throw new Error('Unknown actor');
    const pose = { x: input.x, y: input.y } satisfies Pose;
    assertPoseInBounds(pose);
    const frame = this.snapshot.phases[phaseIndex];
    if (!frame) throw new Error(`Missing phase ${phaseIndex}`);
    const { frameMap } = getFrameMap(this.replayRoot, frame);
    const poses = frameMap.get('poses');
    if (!(poses instanceof Y.Map)) throw new Error('Missing poses');
    const register = poses.get(input.actorId);
    if (!(register instanceof Y.Map)) throw new Error('Missing pose register');
    const draft = this.buildRegisterDraft(register, pose, 'set-pose');
    this.commit(() => this.applyRegisterDraft(draft));
  }

  moveActor(input: {
    phaseIndex?: number;
    actorId: ActorId;
    x: number;
    y: number;
  }) {
    this.setActorPose(input);
  }

  setPossession(input: {
    phaseIndex?: number;
    value: Possession;
    looseBallPose?: Pose;
  }) {
    const phaseIndex = input.phaseIndex ?? 0;
    if (input.value !== 'loose' && !ACTOR_IDS.includes(input.value)) {
      throw new Error('Unknown possession value');
    }
    const frame = this.snapshot.phases[phaseIndex];
    if (!frame) throw new Error(`Missing phase ${phaseIndex}`);
    const { frameMap } = getFrameMap(this.replayRoot, frame);
    const register = frameMap.get('possession');
    if (!(register instanceof Y.Map)) throw new Error('Missing possession register');
    const possessionDraft = this.buildRegisterDraft(
      register,
      input.value,
      'set-possession'
    );
    let nextLooseRegister: Y.Map<unknown> | null = null;
    if (input.value === 'loose' && !(frameMap.get('looseBallPose') instanceof Y.Map)) {
      const pose = input.looseBallPose ?? frame.ballPose;
      assertPoseInBounds(pose);
      const commandId = this.nextCommandId('loose-ball');
      nextLooseRegister = createRegister(
        `${commandId}:candidate`,
        pose,
        this.authorId,
        commandId
      );
    }
    this.commit(() => {
      this.applyRegisterDraft(possessionDraft);
      if (input.value === 'loose') {
        if (nextLooseRegister) frameMap.set('looseBallPose', nextLooseRegister);
      } else {
        frameMap.delete('looseBallPose');
      }
    });
  }

  setLooseBallPose(input: {
    phaseIndex?: number;
    x: number;
    y: number;
  }) {
    const phaseIndex = input.phaseIndex ?? 0;
    const pose = { x: input.x, y: input.y } satisfies Pose;
    assertPoseInBounds(pose);
    const frame = this.snapshot.phases[phaseIndex];
    if (!frame) throw new Error(`Missing phase ${phaseIndex}`);
    if (frame.possession.value !== 'loose') {
      throw new Error('Ball pose can be edited only when possession is loose');
    }
    const { frameMap } = getFrameMap(this.replayRoot, frame);
    const register = frameMap.get('looseBallPose');
    if (!(register instanceof Y.Map)) throw new Error('Missing loose-ball register');
    const draft = this.buildRegisterDraft(register, pose, 'set-loose-ball');
    this.commit(() => this.applyRegisterDraft(draft));
  }

  addPhaseAfter(phaseIndex = 0) {
    const snapshot = this.snapshot;
    if (snapshot.phases.length >= MAX_PHASES) {
      throw new Error(`A play cannot contain more than ${MAX_PHASES} phases`);
    }
    const source = snapshot.phases[phaseIndex];
    if (!source) throw new Error(`Missing phase ${phaseIndex}`);
    const { frames } = getFrameMap(this.replayRoot, source);
    const page = Object.values(this.store.blocks.peek()).find(
      block => block.model.flavour === 'replaylab:page'
    );
    if (!page) throw new Error('Missing page block');
    const commandId = this.nextCommandId('add-phase');
    const frameId = `phase-${crypto.randomUUID()}`;
    const cueBlockId = `cue-${crypto.randomUUID()}`;
    const frame = createFrame(
      frameId,
      rankAfter(snapshot.phases, phaseIndex),
      cueBlockId,
      source.poses,
      source.possession.value,
      source.looseBallPose?.value ?? null,
      { actorId: this.authorId, commandId }
    );
    this.commit(() => {
      this.store.addBlock(
        'replaylab:cue',
        { id: cueBlockId, phaseId: frameId },
        page.id
      );
      frames.set(frameId, frame);
    });
    return frameId;
  }
  reorderPhase(input: { phaseId: string; targetIndex: number }) {
    const snapshot = this.snapshot;
    const sourceIndex = snapshot.phases.findIndex(
      phase => phase.id === input.phaseId
    );
    if (sourceIndex < 0) throw new Error(`Missing phase ${input.phaseId}`);
    if (sourceIndex === input.targetIndex) return false;
    const rank = rankForReorder(
      snapshot.phases,
      input.phaseId,
      input.targetIndex
    );
    const phase = snapshot.phases[sourceIndex]!;
    const { frameMap } = getFrameMap(this.replayRoot, phase);
    this.commit(
      () => frameMap.set('rank', rank),
      {
        phaseId: phase.id,
        entityId: phase.id,
        focusTarget: 'timeline',
      }
    );
    return true;
  }


  createAction(input: {
    phaseIndex?: number;
    actorId: ActorId;
    type: TacticalActionType;
    targetActorId?: ActorId | null;
    path: ActionPath;
  }) {
    const phaseIndex = input.phaseIndex ?? 0;
    assertActionActors(input);
    assertActionPath(input.path);
    const snapshot = this.snapshot;
    const fromFrame = snapshot.phases[phaseIndex];
    const toFrame = snapshot.phases[phaseIndex + 1];
    if (!fromFrame || !toFrame) {
      throw new Error('Actions require an adjacent next phase');
    }
    const transitionCount = snapshot.actions.filter(
      action =>
        !action.archived &&
        action.fromFrameId === fromFrame.id &&
        action.toFrameId === toFrame.id
    ).length;
    if (transitionCount >= MAX_ACTIONS_PER_TRANSITION) {
      throw new Error(`A transition cannot contain more than ${MAX_ACTIONS_PER_TRANSITION} actions`);
    }
    const actions = this.replayRoot.get('actions');
    if (!(actions instanceof Y.Map)) throw new Error('Missing actions');
    const commandId = this.nextCommandId('create-action');
    const actionId = `action-${crypto.randomUUID()}`;
    const action = createActionRecord(
      {
        id: actionId,
        fromFrameId: fromFrame.id,
        toFrameId: toFrame.id,
        actorId: input.actorId,
        type: input.type,
        targetActorId: input.targetActorId,
        path: input.path,
      },
      { actorId: this.authorId, commandId }
    );
    this.commit(
      () => (actions as Y.Map<Y.Map<unknown>>).set(actionId, action),
      {
        phaseId: fromFrame.id,
        entityId: actionId,
        focusTarget: 'action',
      }
    );
    return actionId;
  }

  replaceActionPath(input: { actionId: string; path: ActionPath }) {
    assertActionPath(input.path);
    const actionSnapshot = this.snapshot.actions.find(
      action => action.id === input.actionId
    );
    if (!actionSnapshot) throw new Error(`Missing action ${input.actionId}`);
    const actions = this.replayRoot.get('actions');
    const action =
      actions instanceof Y.Map ? actions.get(input.actionId) : undefined;
    if (!(action instanceof Y.Map)) throw new Error(`Missing action ${input.actionId}`);
    const register = action.get('path');
    if (!(register instanceof Y.Map)) throw new Error('Missing action path register');
    const draft = this.buildRegisterDraft(register, input.path, 'replace-action-path');
    this.commit(
      () => this.applyRegisterDraft(draft),
      {
        phaseId: actionSnapshot.fromFrameId,
        entityId: actionSnapshot.id,
        focusTarget: 'action',
      }
    );
  }


  resolveConflict(input: import('./conflicts').ResolveConflictInput) {
    const commandId = this.nextCommandId('resolve-conflict');
    const draft = buildConflictResolution(this.replayRoot, this.snapshot, input, {
      actorId: this.authorId,
      commandId,
    });
    this.commit(draft.mutate, draft.selection);
  }

  renamePlay(value: string) {
    const title = value.trim();
    if (!title || title.length > 80) {
      throw new Error('Play name must be 1–80 characters');
    }
    this.commit(() => {
      this.titleText.replace(0, this.titleText.length, title);
    });
  }

  editCue(input: { phaseIndex?: number; value: string }) {
    const phaseIndex = input.phaseIndex ?? 0;
    if (typeof input.value !== 'string') throw new Error('Cue must be text');
    this.replaceCueDocument({
      phaseIndex,
      document: plainTextCue(input.value),
    });
  }

  replaceCueDocument(input: {
    phaseIndex?: number;
    document: RichCueDocument;
  }) {
    const phaseIndex = input.phaseIndex ?? 0;
    const delta = richCueToDelta(input.document);
    const text = this.getCueText(phaseIndex);
    this.commit(() => {
      if (text.yText.length > 0) text.yText.delete(0, text.yText.length);
      text.yText.applyDelta(delta);
    });
  }

  undo() {
    const selectionEntry = this.undoSelections.pop();
    this.store.captureSync();
    this.store.undo();
    this.store.captureSync();
    if (selectionEntry) {
      this.redoSelections.push(selectionEntry);
      this.currentSelection = cloneSelection(selectionEntry.before);
      this.restoredSelection = cloneSelection(selectionEntry.before);
    }
  }

  redo() {
    const selectionEntry = this.redoSelections.pop();
    this.store.captureSync();
    this.store.redo();
    this.store.captureSync();
    if (selectionEntry) {
      this.undoSelections.push(selectionEntry);
      this.currentSelection = cloneSelection(selectionEntry.after);
      this.restoredSelection = cloneSelection(selectionEntry.after);
    }
  }

  onUpdated(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  encode() {
    return Y.encodeStateAsUpdate(this.doc.rootDoc);
  }

  applyRemoteUpdate(update: Uint8Array) {
    Y.applyUpdate(this.doc.rootDoc, update, 'replaylab:remote');
  }

  runMigrations() {
    return migrateReplayRoot(this.replayRoot);
  }

  exportSnapshot() {
    return JSON.stringify(this.snapshot, null, 2);
  }

  get recoveryIssue() {
    return this.storageIssueValue;
  }

  get lastRecoveryJson() {
    return this.lastRecoveryJsonValue;
  }

  get recoveryDiagnostics() {
    return diagnosticsPayload({
      activeDatabase: this.persistence?.activeDatabase ?? 'memory',
      previousDatabase: this.persistence?.previousDatabase ?? null,
      migrationDurationMs: this.migrationDurationMsValue,
      recoverySnapshotCount: this.recoverySnapshotCountValue,
      lastRecoveryAt: this.lastRecoveryAtValue,
    });
  }

  async checkpointRecovery(force = false) {
    if (!this.persistence) return null;
    try {
      const artifact = await this.persistence.recoveryStore.checkpoint({
        playId: this.doc.rootDoc.guid,
        update: this.encode(),
        schemaVersion: REPLAY_SCHEMA_VERSION,
        sourceDatabase: this.persistence.activeDatabase,
        force,
      });
      const snapshots = await this.persistence.recoveryStore.list(this.doc.rootDoc.guid);
      this.recoverySnapshotCountValue = snapshots.length;
      this.lastRecoveryAtValue = snapshots[0]?.createdAt ?? null;
      if (artifact) this.lastRecoveryJsonValue = serializeRecoveryArtifact(artifact);
      return artifact;
    } catch (error) {
      this.storageIssueValue = classifyRecoveryIssue(error);
      if (error instanceof ReplayOpenError && error.recoveryJson) {
        this.lastRecoveryJsonValue = error.recoveryJson;
      }
      throw error;
    }
  }

  async exportRecovery() {
    const sourceDatabase = this.persistence?.activeDatabase ?? 'memory';
    const artifact = await createRecoveryArtifact({
      playId: this.doc.rootDoc.guid,
      update: this.encode(),
      reason: 'manual-export',
      schemaVersion: REPLAY_SCHEMA_VERSION,
      sourceDatabase,
    });
    const serialized = serializeRecoveryArtifact(artifact);
    this.lastRecoveryJsonValue = serialized;
    if (this.persistence) {
      try {
        await this.persistence.recoveryStore.saveImmutable(artifact);
        this.recoverySnapshotCountValue += 1;
        this.lastRecoveryAtValue = artifact.createdAt;
      } catch (error) {
        this.storageIssueValue = classifyRecoveryIssue(error);
        if (!(error instanceof ReplayOpenError && error.issue === 'quota')) throw error;
      }
    }
    return serialized;
  }

  static async previewRecovery(serialized: string) {
    const { artifact, update } = await parseRecoveryArtifact(serialized);
    const facade = this.fromUpdate(update, artifact.playId);
    facade.setReadOnly(true);
    facade.lastRecoveryJsonValue = serialized;
    return facade;
  }

  static async importRecoveryCopy(serialized: string, baseDatabase = DEFAULT_DB_NAME) {
    const { artifact, update } = await parseRecoveryArtifact(serialized);
    this.validateUpdate(update, artifact.playId);
    const safeSnapshotId = artifact.snapshotId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48);
    const databaseName = `${baseDatabase}:recovered:${safeSnapshotId}`;
    const source = new IndexedDBDocSource(databaseName);
    try {
      await source.push(artifact.playId, update);
      const reopened = await source.pull(artifact.playId, new Uint8Array());
      if (!reopened?.data.length) throw new Error('Imported recovery copy did not reopen');
      this.validateUpdate(reopened.data, artifact.playId);
    } finally {
      await this.closeIndexedSource(source);
    }
    return { databaseName, playId: artifact.playId };
  }

  async flush(abort?: AbortSignal) {
    const journalSequence = this.emergencyJournal?.sequence ?? 0;
    try {
      if (this.emergencyJournal?.error) throw this.emergencyJournal.error;
      const engine = this.persistence?.engine;
      if (engine) {
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: unknown) => {
            subscription.unsubscribe();
            abort?.removeEventListener('abort', cancelled);
            if (error) reject(error); else resolve();
          };
          const cancelled = () => finish(abort?.reason ?? new Error('Local flush aborted'));
          const check = () => {
            if (abort?.aborted) { cancelled(); return; }
            if (engine.status.step === DocEngineStep.Stopped) { finish(new Error('Local persistence stopped')); return; }
            if (engine.status.main?.step === DocPeerStep.Synced) finish();
          };
          const subscription = engine.onStatusChange.subscribe(check);
          abort?.addEventListener('abort', cancelled, { once: true });
          check();
        });
      }
        await this.checkpointRecovery(false);
        this.emergencyJournal?.acknowledge(journalSequence);
    } catch (error) {
      this.storageIssueValue = classifyRecoveryIssue(error);
      if (this.storageIssueValue === 'quota' && !this.lastRecoveryJsonValue) {
        const artifact = await createRecoveryArtifact({
          playId: this.doc.rootDoc.guid,
          update: this.encode(),
          reason: 'quota',
          schemaVersion: REPLAY_SCHEMA_VERSION,
          sourceDatabase: this.persistence?.activeDatabase ?? 'memory',
        });
        this.lastRecoveryJsonValue = serializeRecoveryArtifact(artifact);
      }
      throw error;
    }
  }

  async flushForPageLifecycle(timeoutMs = 450) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      await this.flush(controller.signal);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.doc.rootDoc.off('update', this.captureEmergency);
    this.replayRoot.unobserveDeep(this.emitUpdated);
    this.doc.yBlocks.unobserveDeep(this.emitUpdated);
    this.historySubscription.unsubscribe();
    this.persistence?.engine.forceStop();
    this.persistence?.source.channel.close();
    void this.persistence?.source.getDb().then(database => database.close());
    void this.persistence?.recoveryStore.close();
    void this.persistence?.registry.close();
    this.doc.dispose();
    this.doc.rootDoc.destroy();
    this.listeners.clear();
  }

  private getCueText(phaseIndex: number) {
    const phase = this.snapshot.phases[phaseIndex];
    if (!phase) throw new Error(`Missing phase ${phaseIndex}`);
    const text = this.store.getBlock(phase.cueBlockId)?.model.text;
    if (!text) throw new Error(`Missing cue ${phase.cueBlockId}`);
    return text as unknown as MutableText;
  }

  private get authorId() {
    return String(this.doc.rootDoc.clientID);
  }

  private nextCommandId(kind: string) {
    return `${kind}:${crypto.randomUUID()}`;
  }

  private buildRegisterDraft(
    register: Y.Map<unknown>,
    value: Pose | Possession | ActionPath,
    kind: string
  ): RegisterDraft {
    const candidates = getRegisterCandidates(register);
    const commandId = this.nextCommandId(kind);
    return {
      candidates,
      observedCandidateIds: [...candidates.keys()],
      nextCandidate: createCandidate(
        `${commandId}:candidate`,
        value,
        this.authorId,
        commandId
      ),
    };
  }

  private applyRegisterDraft(draft: RegisterDraft) {
    for (const candidateId of draft.observedCandidateIds) {
      draft.candidates.delete(candidateId);
    }
    draft.candidates.set(
      draft.nextCandidate.id,
      draft.nextCandidate.candidate
    );
  }

  private commit(
    mutate: () => void,
    selectionAfter?: SelectionSnapshot | null
  ) {
    if (this.readOnlyValue) throw new Error('This capability is read-only');
    const entry: SelectionHistoryEntry = {
      before: cloneSelection(this.currentSelection),
      after: cloneSelection(
        selectionAfter === undefined ? this.currentSelection : selectionAfter
      ),
    };
    this.store.captureSync();
    this.store.transact(mutate);
    this.store.captureSync();
    this.undoSelections.push(entry);
    this.redoSelections.length = 0;
    this.currentSelection = cloneSelection(entry.after);
  }

  private readonly emitUpdated = () => {
    this.revisionValue += 1;
    for (const listener of this.listeners) listener();
  };
}
