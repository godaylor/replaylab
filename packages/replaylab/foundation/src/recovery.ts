export const RECOVERY_FORMAT = 'replaylab-recovery' as const;
export const RECOVERY_FORMAT_VERSION = 1 as const;

export type RecoveryReason =
  | 'pre-migration'
  | 'checkpoint'
  | 'manual-export'
  | 'quota'
  | 'corrupt'
  | 'import';

export type RecoveryArtifact = {
  format: typeof RECOVERY_FORMAT;
  formatVersion: typeof RECOVERY_FORMAT_VERSION;
  snapshotId: string;
  playId: string;
  createdAt: number;
  reason: RecoveryReason;
  schemaVersion: number | null;
  byteLength: number;
  updateBase64: string;
  checksumSha256: string;
  sourceDatabase: string;
};

export type RecoveryIssue =
  | 'corrupt'
  | 'future-schema'
  | 'migration'
  | 'quota';

type ActiveDatabaseRecord = {
  playId: string;
  activeDatabase: string;
  previousDatabase: string | null;
  switchedAt: number;
};

const textEncoder = new TextEncoder();

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
}

function openDatabase(name: string, storeName: string) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: storeName === 'snapshots' ? 'snapshotId' : 'playId' });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
    request.addEventListener('blocked', () => reject(new Error(`IndexedDB open blocked for ${name}`)), { once: true });
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function checksumBytes(bytes: Uint8Array) {
  const digestBytes = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestBytes.buffer);
  return [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function createRecoveryArtifact(input: {
  playId: string;
  update: Uint8Array;
  reason: RecoveryReason;
  schemaVersion: number | null;
  sourceDatabase: string;
  createdAt?: number;
}) {
  const createdAt = input.createdAt ?? Date.now();
  const checksumSha256 = await checksumBytes(input.update);
  return {
    format: RECOVERY_FORMAT,
    formatVersion: RECOVERY_FORMAT_VERSION,
    snapshotId: `${createdAt}-${checksumSha256.slice(0, 16)}-${crypto.randomUUID()}`,
    playId: input.playId,
    createdAt,
    reason: input.reason,
    schemaVersion: input.schemaVersion,
    byteLength: input.update.byteLength,
    updateBase64: bytesToBase64(input.update),
    checksumSha256,
    sourceDatabase: input.sourceDatabase,
  } satisfies RecoveryArtifact;
}

function assertArtifactShape(value: unknown): asserts value is RecoveryArtifact {
  if (!value || typeof value !== 'object') throw new Error('Recovery file is not an object');
  const artifact = value as Partial<RecoveryArtifact>;
  if (artifact.format !== RECOVERY_FORMAT || artifact.formatVersion !== RECOVERY_FORMAT_VERSION) {
    throw new Error('Unsupported ReplayLab recovery format');
  }
  if (
    typeof artifact.snapshotId !== 'string' ||
    typeof artifact.playId !== 'string' ||
    typeof artifact.createdAt !== 'number' ||
    typeof artifact.byteLength !== 'number' ||
    typeof artifact.updateBase64 !== 'string' ||
    typeof artifact.checksumSha256 !== 'string' ||
    typeof artifact.sourceDatabase !== 'string'
  ) {
    throw new Error('Recovery file is incomplete');
  }
}

export async function parseRecoveryArtifact(serialized: string) {
  const value: unknown = JSON.parse(serialized);
  assertArtifactShape(value);
  const update = base64ToBytes(value.updateBase64);
  if (update.byteLength !== value.byteLength) throw new Error('Recovery byte length mismatch');
  if ((await checksumBytes(update)) !== value.checksumSha256) {
    throw new Error('Recovery checksum mismatch');
  }
  return { artifact: value, update };
}

export function serializeRecoveryArtifact(artifact: RecoveryArtifact) {
  return JSON.stringify(artifact, null, 2);
}

export function classifyRecoveryIssue(error: unknown): RecoveryIssue {
  if (error instanceof ReplayOpenError) return error.issue;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'quota';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('quota')) return 'quota';
  if (message.includes('schemaversion') || message.includes('future schema')) return 'future-schema';
  if (message.includes('migration')) return 'migration';
  return 'corrupt';
}

export class ReplayOpenError extends Error {
  constructor(
    readonly issue: RecoveryIssue,
    message: string,
    readonly recoveryJson?: string
  ) {
    super(message);
    this.name = 'ReplayOpenError';
  }
}

export class RecoveryStore {
  readonly databaseName: string;
  private databasePromise?: Promise<IDBDatabase>;

  constructor(baseDatabaseName: string) {
    this.databaseName = `${baseDatabaseName}:recovery-v1`;
  }

  private get database() {
    this.databasePromise ??= openDatabase(this.databaseName, 'snapshots');
    return this.databasePromise;
  }

  async saveImmutable(artifact: RecoveryArtifact) {
    try {
      const database = await this.database;
      const transaction = database.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').add(artifact);
      await transactionDone(transaction);
      return artifact;
    } catch (error) {
      if (classifyRecoveryIssue(error) === 'quota') {
        throw new ReplayOpenError('quota', 'Recovery storage quota was exceeded', serializeRecoveryArtifact(artifact));
      }
      throw error;
    }
  }

  async list(playId: string) {
    const database = await this.database;
    const transaction = database.transaction('snapshots', 'readonly');
    const records = await requestResult(
      transaction.objectStore('snapshots').getAll() as IDBRequest<RecoveryArtifact[]>
    );
    await transactionDone(transaction);
    return records
      .filter(record => record.playId === playId)
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async latestValid(playId: string) {
    for (const artifact of await this.list(playId)) {
      try {
        await parseRecoveryArtifact(serializeRecoveryArtifact(artifact));
        return artifact;
      } catch {
        // A damaged checkpoint is skipped; older immutable checkpoints remain inspectable.
      }
    }
    return null;
  }

  async checkpoint(input: {
    playId: string;
    update: Uint8Array;
    schemaVersion: number | null;
    sourceDatabase: string;
    force?: boolean;
    minIntervalMs?: number;
  }) {
    const artifact = await createRecoveryArtifact({
      ...input,
      reason: 'checkpoint',
    });
    const latest = await this.latestValid(input.playId);
    if (latest?.checksumSha256 === artifact.checksumSha256) return latest;
    if (
      !input.force &&
      latest &&
      artifact.createdAt - latest.createdAt < (input.minIntervalMs ?? 30_000)
    ) {
      return null;
    }
    return this.saveImmutable(artifact);
  }

  async close() {
    (await this.databasePromise)?.close();
  }
}

export class ActiveDatabaseRegistry {
  readonly databaseName: string;
  private databasePromise?: Promise<IDBDatabase>;

  constructor(baseDatabaseName: string) {
    this.databaseName = `${baseDatabaseName}:registry-v1`;
  }

  private get database() {
    this.databasePromise ??= openDatabase(this.databaseName, 'active');
    return this.databasePromise;
  }

  async read(playId: string) {
    const database = await this.database;
    const transaction = database.transaction('active', 'readonly');
    const record = await requestResult(
      transaction.objectStore('active').get(playId) as IDBRequest<ActiveDatabaseRecord | undefined>
    );
    await transactionDone(transaction);
    return record ?? null;
  }

  async resolve(playId: string, fallbackDatabase: string) {
    return (await this.read(playId))?.activeDatabase ?? fallbackDatabase;
  }

  async activate(playId: string, activeDatabase: string, previousDatabase: string) {
    const database = await this.database;
    const transaction = database.transaction('active', 'readwrite');
    transaction.objectStore('active').put({
      playId,
      activeDatabase,
      previousDatabase,
      switchedAt: Date.now(),
    } satisfies ActiveDatabaseRecord);
    await transactionDone(transaction);
  }

  async close() {
    (await this.databasePromise)?.close();
  }
}

export function diagnosticsPayload(input: {
  activeDatabase: string;
  previousDatabase: string | null;
  migrationDurationMs: number;
  recoverySnapshotCount: number;
  lastRecoveryAt: number | null;
}) {
  return {
    format: 'replaylab-diagnostics-v1',
    recordedAt: Date.now(),
    ...input,
  } as const;
}

export function diagnosticsContainsDocumentContent(value: unknown) {
  const serialized = JSON.stringify(value);
  return ['title', 'cue', 'poses', 'actions', 'updateBase64'].some(marker =>
    serialized.includes(`\"${marker}\"`)
  );
}

export const RECOVERY_UTF8_MARKER = textEncoder.encode(RECOVERY_FORMAT);
