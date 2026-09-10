import type { DocSource } from '@blocksuite/sync';

import {
  base64ToBytes,
  bytesToBase64,
  makeEnvelope,
  parseEnvelope,
  ReplaySyncError,
  type CapabilityRole,
  type NetworkCapabilityConfig,
  type ReplayClientEnvelope,
  type ReplayClientPayload,
  type ReplayServerEnvelope,
} from './sync-protocol';

export type NetworkShadowState = {
  status: 'connecting' | 'syncing' | 'synced' | 'rate-limited' | 'blocked' | 'offline';
  role: CapabilityRole;
  errorCode?: string;
  retryAfterMs?: number;
};

type PendingRequest = {
  resolve(envelope: ReplayServerEnvelope): void;
  reject(error: Error): void;
  timeout: number;
};

type ImmediateRecoveryBinding = {
  docId: string;
  stateVector(): Uint8Array;
  missingUpdate(remoteState: Uint8Array): Uint8Array;
  applyRemote(update: Uint8Array): void;
};

function hasUpdate(update: Uint8Array) {
  return update.byteLength > 0 && !(update.byteLength === 2 && update[0] === 0 && update[1] === 0);
}

export class ReplayNetworkDocSource implements DocSource {
  readonly name = 'replaylab-network-shadow';
  readonly role: CapabilityRole;
  private socket: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly updateListeners = new Set<(docId: string, data: Uint8Array) => void>();
  private readonly disconnectListeners = new Set<(reason: string) => void>();
  private readonly stateListeners = new Set<() => void>();
  private stateValue: NetworkShadowState;
  private manuallyClosed = false;
  private terminalError: ReplaySyncError | null = null;
  private recoveryBinding: ImmediateRecoveryBinding | null = null;
  private recoveryPromise: Promise<boolean> | null = null;
  private recoveryTimer: number | null = null;
  private recoveryAttempt = 0;
  sentCommitCount = 0;
  immediateRecoveryCount = 0;
  lastRecoveryDurationMs: number | null = null;

  constructor(readonly config: NetworkCapabilityConfig) {
    this.role = config.access;
    this.stateValue = { status: 'offline', role: this.role };
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  get state() {
    return this.stateValue;
  }

  onStateChange(listener: () => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  configureImmediateRecovery(binding: ImmediateRecoveryBinding) {
    this.recoveryBinding = binding;
  }

  async connect() {
    if (this.terminalError) throw this.terminalError;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;
    this.manuallyClosed = false;
    this.setState({ status: 'connecting', role: this.role });
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.config.endpoint);
      this.socket = socket;
      const requestId = crypto.randomUUID();
      const timeout = window.setTimeout(() => {
        reject(new ReplaySyncError('network', 'Network handshake timed out', false));
        socket.close();
      }, 5000);
      this.pending.set(requestId, {
        resolve: envelope => {
          window.clearTimeout(timeout);
          if (envelope.kind !== 'ready') {
            reject(new ReplaySyncError('schema', 'Expected ready envelope', true));
            return;
          }
          if (envelope.role !== this.role) {
            const error = new ReplaySyncError('forbidden', 'Capability role mismatch', true);
            this.block(error);
            reject(error);
            return;
          }
          this.setState({ status: 'syncing', role: this.role });
          resolve();
        },
        reject,
        timeout,
      });
      socket.addEventListener('open', () => {
        this.send(makeEnvelope<ReplayClientEnvelope>({
          kind: 'hello',
          requestId,
          roomId: this.config.roomId,
          capability: this.config.capability,
        }));
      });
      socket.addEventListener('message', event => this.handleMessage(event.data));
      socket.addEventListener('error', () => {
        const error = new ReplaySyncError('network', 'WebSocket transport failed', false);
        this.rejectAll(error);
      });
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null;
        this.connectPromise = null;
        if (!this.terminalError && !this.manuallyClosed) {
          this.setState({ status: 'offline', role: this.role, errorCode: 'network' });
          for (const listener of this.disconnectListeners) listener('network-closed');
        }
        this.rejectAll(new ReplaySyncError('network', 'WebSocket closed', false));
      });
    }).finally(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) this.connectPromise = null;
    });
    return this.connectPromise;
  }

  async pull(docId: string, state: Uint8Array) {
    const envelope = await this.request({
      kind: 'pull',
      requestId: crypto.randomUUID(),
      docId,
      state: bytesToBase64(state),
    });
    if (envelope.kind !== 'diff') throw new ReplaySyncError('schema', 'Expected diff envelope', true);
    this.setState({ status: 'synced', role: this.role });
    return {
      data: base64ToBytes(envelope.update),
      state: base64ToBytes(envelope.state),
    };
  }

  async push(docId: string, data: Uint8Array) {
    if (this.role === 'read') return;
    const commitId = crypto.randomUUID();
    const commit = {
      kind: 'commit' as const,
      requestId: crypto.randomUUID(),
      docId,
      commitId,
      update: bytesToBase64(data),
    };
    try {
      await this.pushOnce(commit);
    } catch (error) {
      if (!(error instanceof ReplaySyncError) || error.code !== 'rate_limited') throw error;
      const retryAfterMs = error.retryAfterMs ?? 1000;
      this.setState({ status: 'rate-limited', role: this.role, errorCode: error.code, retryAfterMs });
      await new Promise(resolve => window.setTimeout(resolve, retryAfterMs));
      await this.pushOnce({ ...commit, requestId: crypto.randomUUID() });
    }
  }

  async subscribe(
    cb: (docId: string, data: Uint8Array) => void,
    disconnect: (reason: string) => void
  ) {
    this.updateListeners.add(cb);
    this.disconnectListeners.add(disconnect);
    try {
      await this.connect();
    } catch (error) {
      disconnect(error instanceof Error ? error.message : 'network-connect-failed');
    }
    return () => {
      this.updateListeners.delete(cb);
      this.disconnectListeners.delete(disconnect);
    };
  }

  recoverNow() {
    if (this.terminalError || this.manuallyClosed || !this.recoveryBinding) return Promise.resolve(false);
    if (this.recoveryPromise) return this.recoveryPromise;
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    const started = performance.now();
    const binding = this.recoveryBinding;
    this.immediateRecoveryCount += 1;
    this.recoveryPromise = (async () => {
      try {
        await this.connect();
        const remote = await this.pull(binding.docId, binding.stateVector());
        if (hasUpdate(remote.data)) binding.applyRemote(remote.data);
        const local = binding.missingUpdate(remote.state);
        if (hasUpdate(local) && this.role === 'write') await this.push(binding.docId, local);
        this.recoveryAttempt = 0;
        this.lastRecoveryDurationMs = performance.now() - started;
        return true;
      } catch (error) {
        if (!this.terminalError && (!navigator.onLine || error instanceof ReplaySyncError && !error.terminal)) {
          this.scheduleRecovery();
        }
        return false;
      } finally {
        this.recoveryPromise = null;
      }
    })();
    return this.recoveryPromise;
  }

  close() {
    this.manuallyClosed = true;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
    this.socket?.close();
    this.socket = null;
    this.connectPromise = null;
    this.rejectAll(new ReplaySyncError('network', 'Network shadow closed', false));
    if (!this.terminalError) this.setState({ status: 'offline', role: this.role });
  }

  private readonly handleOnline = () => {
    if (this.terminalError || this.manuallyClosed) return;
    void this.recoverNow();
  };

  private readonly handleOffline = () => {
    if (this.terminalError || this.manuallyClosed) return;
    this.socket?.close(4000, 'browser-offline');
  };

  private scheduleRecovery() {
    if (this.terminalError || this.manuallyClosed || this.recoveryTimer !== null || !navigator.onLine) return;
    const base = Math.min(2_000, 125 * (2 ** Math.min(this.recoveryAttempt, 4)));
    const jitter = crypto.getRandomValues(new Uint16Array(1))[0]! % 75;
    this.recoveryAttempt += 1;
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = null;
      void this.recoverNow();
    }, base + jitter);
  }

  private async pushOnce(commit: Extract<ReplayClientPayload, { kind: 'commit' }>) {
    const envelope = await this.request(commit);
    if (envelope.kind !== 'accepted') {
      throw new ReplaySyncError('schema', 'Expected accepted envelope', true);
    }
    this.setState({ status: 'synced', role: this.role });
  }

  private async request(
    envelope: Exclude<ReplayClientPayload, { kind: 'hello' }>
  ) {
    if (this.terminalError) throw this.terminalError;
    await this.connect();
    return new Promise<ReplayServerEnvelope>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(envelope.requestId);
        reject(new ReplaySyncError('network', 'Sync request timed out', false));
      }, 5000);
      this.pending.set(envelope.requestId, { resolve, reject, timeout });
      if (envelope.kind === 'commit') this.sentCommitCount += 1;
      this.send(makeEnvelope<ReplayClientEnvelope>(envelope));
    });
  }

  private send(envelope: ReplayClientEnvelope) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new ReplaySyncError('network', 'WebSocket is not open', false);
    }
    this.socket.send(JSON.stringify(envelope));
  }

  private handleMessage(data: unknown) {
    let envelope: ReplayServerEnvelope;
    try {
      envelope = parseEnvelope(String(data)) as ReplayServerEnvelope;
    } catch (error) {
      this.block(error instanceof ReplaySyncError ? error : new ReplaySyncError('malformed', 'Malformed server envelope', true));
      return;
    }
    if (envelope.kind === 'update') {
      const update = base64ToBytes(envelope.update);
      for (const listener of this.updateListeners) listener(envelope.docId, update);
      return;
    }
    if (envelope.kind === 'error') {
      const error = new ReplaySyncError(
        envelope.code,
        envelope.message,
        envelope.terminal,
        envelope.retryAfterMs
      );
      const pending = envelope.requestId ? this.pending.get(envelope.requestId) : undefined;
      if (pending && envelope.requestId) {
        window.clearTimeout(pending.timeout);
        this.pending.delete(envelope.requestId);
        pending.reject(error);
      }
      if (error.terminal) this.block(error);
      return;
    }
    if (!('requestId' in envelope)) return;
    const pending = this.pending.get(envelope.requestId);
    if (!pending) return;
    window.clearTimeout(pending.timeout);
    this.pending.delete(envelope.requestId);
    pending.resolve(envelope);
  }

  private block(error: ReplaySyncError) {
    this.terminalError = error;
    this.setState({ status: 'blocked', role: this.role, errorCode: error.code });
    this.rejectAll(error);
    this.socket?.close(4003, error.code);
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setState(state: NetworkShadowState) {
    this.stateValue = state;
    for (const listener of this.stateListeners) listener();
  }
}
