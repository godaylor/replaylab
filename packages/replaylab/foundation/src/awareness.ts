import {
  makeEnvelope,
  parseEnvelope,
  ReplaySyncError,
  type NetworkCapabilityConfig,
  type ReplayClientEnvelope,
  type ReplayServerEnvelope,
} from './sync-protocol';

export type ReplayPresencePayload = {
  participantName: string;
  color: string;
  selection?: { phaseId: string; entityId: string };
  pointer?: { phaseId: string; x: number; y: number };
  gesture?: { phaseId: string; entityId: string; x: number; y: number };
  presenter?: { phaseIndex: number; playheadMs: number; playing: boolean };
  following?: string;
};

export type ReplayPresence = ReplayPresencePayload & {
  clientId: string;
  expiresAt: number;
};

export type ReplayAwarenessState = 'offline' | 'connecting' | 'connected' | 'blocked';

type PublishPatch = {
  selection?: ReplayPresencePayload['selection'] | null;
  pointer?: ReplayPresencePayload['pointer'] | null;
  gesture?: ReplayPresencePayload['gesture'] | null;
  presenter?: ReplayPresencePayload['presenter'] | null;
  following?: string | null;
};

const TRANSIENT_KEYS = new Set(['pointer', 'gesture']);

function withoutTransient(value: ReplayPresence | undefined) {
  if (!value) return '';
  const { pointer: _pointer, gesture: _gesture, ...stable } = value;
  return JSON.stringify(stable);
}

export class ReplayAwarenessSource {
  readonly clientId = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private terminalError: ReplaySyncError | null = null;
  private manuallyClosed = false;
  private local: ReplayPresencePayload;
  private readonly remote = new Map<string, ReplayPresence>();
  private readonly stableListeners = new Set<() => void>();
  private readonly visualListeners = new Set<() => void>();
  private pointerTimer: number | null = null;
  private presenterTimer: number | null = null;
  private queuedPointer = false;
  private queuedPresenter = false;
  private stateValue: ReplayAwarenessState = 'offline';
  revision = 0;
  sentPublishCount = 0;

  constructor(
    readonly config: NetworkCapabilityConfig,
    identity: { participantName?: string; color?: string } = {}
  ) {
    this.local = {
      participantName: identity.participantName ?? `Coach ${this.clientId.slice(0, 4)}`,
      color: identity.color ?? '#45c8f5',
    };
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  get state() {
    return this.stateValue;
  }

  get presences() {
    return [...this.remote.values()].sort((left, right) => left.clientId.localeCompare(right.clientId));
  }

  onChange(listener: () => void) {
    this.stableListeners.add(listener);
    return () => {
      this.stableListeners.delete(listener);
    };
  }

  onVisualChange(listener: () => void) {
    this.visualListeners.add(listener);
    return () => {
      this.visualListeners.delete(listener);
    };
  }

  async connect() {
    if (this.terminalError) throw this.terminalError;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.manuallyClosed = false;
    this.setState('connecting');
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.config.endpoint);
      this.socket = socket;
      const requestId = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        reject(new ReplaySyncError('network', 'Awareness handshake timed out', false));
        socket.close();
      }, 5000);
      socket.addEventListener('open', () => {
        this.send(makeEnvelope<ReplayClientEnvelope>({
          kind: 'presence.hello',
          requestId,
          roomId: this.config.roomId,
          capability: this.config.capability,
          clientId: this.clientId,
        }));
      });
      socket.addEventListener('message', event => {
        let envelope: ReplayServerEnvelope;
        try {
          envelope = parseEnvelope(String(event.data)) as ReplayServerEnvelope;
        } catch (error) {
          this.block(error instanceof ReplaySyncError ? error : new ReplaySyncError('malformed', 'Malformed awareness envelope', true));
          reject(error);
          return;
        }
        if (envelope.kind === 'presence.ready' && envelope.requestId === requestId) {
          window.clearTimeout(timeout);
          this.setState('connected');
          this.send(makeEnvelope<ReplayClientEnvelope>({ kind: 'presence.collect', requestId: crypto.randomUUID() }));
          this.sendLocal();
          resolve();
          return;
        }
        this.handleEnvelope(envelope);
      });
      socket.addEventListener('error', () => reject(new ReplaySyncError('network', 'Awareness transport failed', false)));
      socket.addEventListener('close', () => {
        window.clearTimeout(timeout);
        this.socket = null;
        this.connectPromise = null;
        if (!this.terminalError && !this.manuallyClosed) this.setState('offline');
      });
    }).finally(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) this.connectPromise = null;
    });
    return this.connectPromise;
  }

  publish(patch: PublishPatch) {
    let transientOnly = true;
    for (const [key, value] of Object.entries(patch)) {
      if (!TRANSIENT_KEYS.has(key)) transientOnly = false;
      if (value === null) delete (this.local as Record<string, unknown>)[key];
      else if (value !== undefined) (this.local as Record<string, unknown>)[key] = value;
    }
    const hasPointer = 'pointer' in patch || 'gesture' in patch;
    const hasPresenter = 'presenter' in patch;
    if (hasPointer && transientOnly) {
      this.queuedPointer = true;
      if (this.pointerTimer === null) {
        this.pointerTimer = window.setTimeout(() => {
          this.pointerTimer = null;
          if (this.queuedPointer) this.sendLocal();
          this.queuedPointer = false;
        }, 50);
      }
      return;
    }
    if (hasPresenter) {
      this.queuedPresenter = true;
      if (this.presenterTimer === null) {
        this.presenterTimer = window.setTimeout(() => {
          this.presenterTimer = null;
          if (this.queuedPresenter) this.sendLocal();
          this.queuedPresenter = false;
        }, 100);
      }
      return;
    }
    this.sendLocal();
  }

  close() {
    this.manuallyClosed = true;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.pointerTimer !== null) window.clearTimeout(this.pointerTimer);
    if (this.presenterTimer !== null) window.clearTimeout(this.presenterTimer);
    this.pointerTimer = null;
    this.presenterTimer = null;
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
    this.remote.clear();
    if (!this.terminalError) this.setState('offline');
  }

  private readonly handleOnline = () => {
    if (!this.terminalError && !this.manuallyClosed) void this.connect();
  };

  private readonly handleOffline = () => {
    if (!this.terminalError && !this.manuallyClosed) this.socket?.close(4000, 'browser-offline');
  };

  private sendLocal() {
    if (this.socket?.readyState !== WebSocket.OPEN || this.terminalError) return;
    this.sentPublishCount += 1;
    this.send(makeEnvelope<ReplayClientEnvelope>({
      kind: 'presence.publish',
      requestId: crypto.randomUUID(),
      state: this.local,
    }));
  }

  private handleEnvelope(envelope: ReplayServerEnvelope) {
    if (envelope.kind === 'error') {
      const error = new ReplaySyncError(envelope.code, envelope.message, envelope.terminal, envelope.retryAfterMs);
      if (error.terminal) this.block(error);
      return;
    }
    if (envelope.kind === 'presence.snapshot') {
      const previous = JSON.stringify(this.presences.map(withoutTransient));
      this.remote.clear();
      for (const presence of envelope.presences) {
        if (presence.clientId !== this.clientId) this.remote.set(presence.clientId, presence);
      }
      this.emitVisual();
      if (previous !== JSON.stringify(this.presences.map(withoutTransient))) this.emitStable();
      return;
    }
    if (envelope.kind === 'presence.changed') {
      if (envelope.presence.clientId === this.clientId) return;
      const previous = withoutTransient(this.remote.get(envelope.presence.clientId));
      this.remote.set(envelope.presence.clientId, envelope.presence);
      this.emitVisual();
      if (previous !== withoutTransient(envelope.presence)) this.emitStable();
      return;
    }
    if (envelope.kind === 'presence.left') {
      if (this.remote.delete(envelope.clientId)) {
        this.emitVisual();
        this.emitStable();
      }
    }
  }

  private block(error: ReplaySyncError) {
    this.terminalError = error;
    this.setState('blocked');
    this.socket?.close(4003, error.code);
  }

  private send(envelope: ReplayClientEnvelope) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(envelope));
  }

  private setState(state: ReplayAwarenessState) {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.emitStable();
  }

  private emitStable() {
    this.revision += 1;
    for (const listener of this.stableListeners) listener();
  }

  private emitVisual() {
    for (const listener of this.visualListeners) listener();
  }
}
