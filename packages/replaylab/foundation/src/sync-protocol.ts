export const REPLAY_SYNC_PROTOCOL = 'replaylab-sync' as const;
export const REPLAY_SYNC_VERSION = 1 as const;
export const DEFAULT_UPDATE_LIMIT_BYTES = 256 * 1024;

export type CapabilityRole = 'read' | 'write';
export type ReplaySyncErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'malformed'
  | 'oversize'
  | 'schema'
  | 'rate_limited'
  | 'network';

type EnvelopeBase = {
  protocol: typeof REPLAY_SYNC_PROTOCOL;
  version: typeof REPLAY_SYNC_VERSION;
};

export type ReplayClientEnvelope = EnvelopeBase & (
  | { kind: 'hello'; requestId: string; roomId: string; capability: string }
  | { kind: 'pull'; requestId: string; docId: string; state: string }
  | { kind: 'commit'; requestId: string; docId: string; commitId: string; update: string }
  | { kind: 'presence.hello'; requestId: string; roomId: string; capability: string; clientId: string }
  | { kind: 'presence.collect'; requestId: string }
  | { kind: 'presence.publish'; requestId: string; state: import('./awareness').ReplayPresencePayload }
);

export type ReplayServerEnvelope = EnvelopeBase & (
  | { kind: 'ready'; requestId: string; role: CapabilityRole }
  | { kind: 'diff'; requestId: string; update: string; state: string }
  | { kind: 'accepted'; requestId: string; commitId: string; duplicate: boolean }
  | { kind: 'update'; docId: string; commitId: string; update: string }
  | { kind: 'presence.ready'; requestId: string; role: CapabilityRole }
  | { kind: 'presence.snapshot'; requestId: string; presences: import('./awareness').ReplayPresence[] }
  | { kind: 'presence.changed'; presence: import('./awareness').ReplayPresence }
  | { kind: 'presence.left'; clientId: string; reason: 'disconnect' | 'expired' }
  | {
      kind: 'error';
      requestId?: string;
      code: ReplaySyncErrorCode;
      message: string;
      terminal: boolean;
      retryAfterMs?: number;
    }
);

export class ReplaySyncError extends Error {
  constructor(
    readonly code: ReplaySyncErrorCode,
    message: string,
    readonly terminal: boolean,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'ReplaySyncError';
  }
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
type EnvelopePayload<T> = T extends EnvelopeBase ? Omit<T, keyof EnvelopeBase> : never;
export type ReplayClientPayload = EnvelopePayload<ReplayClientEnvelope>;
export type ReplayServerPayload = EnvelopePayload<ReplayServerEnvelope>;

export function makeEnvelope<T extends ReplayClientEnvelope | ReplayServerEnvelope>(
  envelope: EnvelopePayload<T>
) {
  return {
    protocol: REPLAY_SYNC_PROTOCOL,
    version: REPLAY_SYNC_VERSION,
    ...envelope,
  } as unknown as T;
}

export function parseEnvelope(value: unknown) {
  if (typeof value !== 'string') throw new ReplaySyncError('malformed', 'Envelope must be text', true);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ReplaySyncError('malformed', 'Envelope is not valid JSON', true);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ReplaySyncError('malformed', 'Envelope must be an object', true);
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.protocol !== REPLAY_SYNC_PROTOCOL || envelope.version !== REPLAY_SYNC_VERSION) {
    throw new ReplaySyncError('schema', 'Unsupported ReplayLab sync protocol version', true);
  }
  if (typeof envelope.kind !== 'string') {
    throw new ReplaySyncError('malformed', 'Envelope kind is missing', true);
  }
  return envelope;
}

export type NetworkCapabilityConfig = {
  endpoint: string;
  roomId: string;
  capability: string;
  access: CapabilityRole;
};

export function parseCapabilityFragment(hash: string): NetworkCapabilityConfig | null {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  const endpoint = values.get('sync');
  const roomId = values.get('room');
  const capability = values.get('cap');
  const access = values.get('access');
  if (!endpoint || !roomId || !capability || (access !== 'read' && access !== 'write')) return null;
  if (!endpoint.startsWith('ws://') && !endpoint.startsWith('wss://')) return null;
  return { endpoint, roomId, capability, access };
}

export function capabilityFragment(config: NetworkCapabilityConfig) {
  const values = new URLSearchParams({
    sync: config.endpoint,
    room: config.roomId,
    cap: config.capability,
    access: config.access,
  });
  return `#${values.toString()}`;
}
