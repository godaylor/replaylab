import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';

import { WebSocket, WebSocketServer } from 'ws';
import * as Y from 'yjs';

import type { ReplayPresence, ReplayPresencePayload } from './awareness';
import { readReplaySnapshot } from './domain';
import {
  base64ToBytes,
  bytesToBase64,
  DEFAULT_UPDATE_LIMIT_BYTES,
  makeEnvelope,
  parseEnvelope,
  ReplaySyncError,
  type CapabilityRole,
  type ReplayClientEnvelope,
  type ReplayServerEnvelope,
} from './sync-protocol';

export type ReplaySyncLog = {
  event: 'session' | 'pull' | 'accept' | 'reject';
  roomId?: string;
  role?: CapabilityRole;
  byteLength?: number;
  code?: string;
};

export type RoomOptions = {
  maxUpdateBytes?: number;
  rateLimit?: { commits: number; windowMs: number };
  readToken?: string;
  writeToken?: string;
  presenceTtlMs?: number;
  capabilityHashes?: Record<CapabilityRole, string>;
  persist?: (update: Uint8Array, snapshot: Uint8Array) => void | Promise<void>;
};

function token(prefix: string) {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function validateAcceptedDocument(doc: Y.Doc) {
  const snapshot = readReplaySnapshot(doc.getMap<unknown>('replay'));
  const blocks = doc.getMap<unknown>('blocks');
  if (blocks.size < snapshot.phases.length + 2 || blocks.size > 2 * snapshot.phases.length + 4) {
    throw new ReplaySyncError('schema', 'Block root exceeds ReplayLab structural caps', true);
  }
  for (const phase of snapshot.phases) {
    if (!blocks.has(phase.cueBlockId)) {
      throw new ReplaySyncError('schema', `Missing cue block for ${phase.id}`, true);
    }
  }
  const serializedBlocks = JSON.stringify(blocks.toJSON());
  if (serializedBlocks.length > 192 * 1024) {
    throw new ReplaySyncError('schema', 'Cue/block content exceeds ReplayLab structural caps', true);
  }
}

function validatePresencePayload(value: unknown): asserts value is ReplayPresencePayload {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 4096) {
    throw new ReplaySyncError('oversize', 'Awareness payload exceeds its bounded channel', true);
  }
  const state = value as Record<string, unknown>;
  if (typeof state.participantName !== 'string' || state.participantName.length < 1 || state.participantName.length > 40) {
    throw new ReplaySyncError('schema', 'Awareness participant name is invalid', true);
  }
  if (typeof state.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(state.color)) {
    throw new ReplaySyncError('schema', 'Awareness color is invalid', true);
  }
  for (const key of ['selection', 'pointer', 'gesture', 'presenter']) {
    const nested = state[key];
    if (nested !== undefined && (!nested || typeof nested !== 'object')) {
      throw new ReplaySyncError('schema', `Awareness ${key} is invalid`, true);
    }
  }
  for (const point of [state.pointer, state.gesture]) {
    if (!point) continue;
    const candidate = point as Record<string, unknown>;
    if (typeof candidate.phaseId !== 'string' || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y) || Number(candidate.x) < 0 || Number(candidate.x) > 840 || Number(candidate.y) < 0 || Number(candidate.y) > 460) {
      throw new ReplaySyncError('schema', 'Awareness court point is invalid', true);
    }
  }
  const presenter = state.presenter as Record<string, unknown> | undefined;
  if (presenter && (!Number.isInteger(presenter.phaseIndex) || Number(presenter.phaseIndex) < 0 || Number(presenter.phaseIndex) > 11 || !Number.isFinite(presenter.playheadMs) || Number(presenter.playheadMs) < 0 || Number(presenter.playheadMs) > 3_600_000 || typeof presenter.playing !== 'boolean')) {
    throw new ReplaySyncError('schema', 'Presenter state is invalid', true);
  }
  if (state.following !== undefined && (typeof state.following !== 'string' || state.following.length > 80)) {
    throw new ReplaySyncError('schema', 'Follow target is invalid', true);
  }
}

export class ReplaySyncRoom {
  readonly doc: Y.Doc;
  readonly readToken: string;
  readonly writeToken: string;
  readonly maxUpdateBytes: number;
  readonly rateLimit: { commits: number; windowMs: number };
  readonly presenceTtlMs: number;
  private readonly capabilityHashes: Record<CapabilityRole, string>;
  private readonly acceptedCommitIds = new Set<string>();
  private readonly commitsBySession = new Map<string, number[]>();
  private readonly presenceByClient = new Map<string, ReplayPresence>();
  private readonly persist?: RoomOptions['persist'];

  constructor(readonly id: string, options: RoomOptions = {}) {
    this.doc = new Y.Doc({ guid: id });
    this.readToken = options.readToken ?? token('rl_read');
    this.writeToken = options.writeToken ?? token('rl_write');
    this.maxUpdateBytes = options.maxUpdateBytes ?? DEFAULT_UPDATE_LIMIT_BYTES;
    this.rateLimit = options.rateLimit ?? { commits: 120, windowMs: 60_000 };
    this.presenceTtlMs = options.presenceTtlMs ?? 5_000;
    this.persist = options.persist;
    this.capabilityHashes = options.capabilityHashes ?? {
      read: tokenHash(this.readToken),
      write: tokenHash(this.writeToken),
    };
  }

  authenticate(capability: string): CapabilityRole | null {
    const hashed = tokenHash(capability);
    if (hashed === this.capabilityHashes.write) return 'write';
    if (hashed === this.capabilityHashes.read) return 'read';
    return null;
  }

  pull(state: Uint8Array) {
    return {
      update: Y.encodeStateAsUpdate(this.doc, state),
      state: Y.encodeStateVector(this.doc),
    };
  }

  accept(input: {
    sessionId: string;
    role: CapabilityRole;
    commitId: string;
    update: Uint8Array;
  }) {
    if (input.role !== 'write') {
      throw new ReplaySyncError('forbidden', 'Read capability cannot commit updates', true);
    }
    if (input.update.byteLength > this.maxUpdateBytes) {
      throw new ReplaySyncError('oversize', 'Update exceeds the room byte limit', true);
    }
    if (this.acceptedCommitIds.has(input.commitId)) return { duplicate: true };
    this.consumeRateLimit(input.sessionId);

    const isolated = new Y.Doc({ guid: this.id });
    try {
      Y.applyUpdate(isolated, Y.encodeStateAsUpdate(this.doc));
      Y.applyUpdate(isolated, input.update);
      validateAcceptedDocument(isolated);
    } catch (error) {
      isolated.destroy();
      if (error instanceof ReplaySyncError) throw error;
      throw new ReplaySyncError(
        error instanceof Error && /schema|frame|candidate|actor|action|block|cue/i.test(error.message)
          ? 'schema'
          : 'malformed',
        'Update failed isolated-clone validation',
        true
      );
    }
    isolated.destroy();
    // Durability must succeed before canonical apply, ACK, or fanout.
    // A failed write leaves the trusted room and client history unchanged.
    const finish = () => {
      Y.applyUpdate(this.doc, input.update, 'replaylab-room-accepted');
      this.acceptedCommitIds.add(input.commitId);
      if (this.acceptedCommitIds.size > 4096) this.acceptedCommitIds.delete(this.acceptedCommitIds.values().next().value!);
      return { duplicate: false };
    };
    if (this.persist) {
      const candidate = new Y.Doc({ guid: this.id });
      let stored: void | Promise<void>;
      try {
        Y.applyUpdate(candidate, this.encode());
        Y.applyUpdate(candidate, input.update);
        stored = this.persist(input.update, Y.encodeStateAsUpdate(candidate));
      } catch (error) {
        if (error instanceof ReplaySyncError) throw error;
        throw new ReplaySyncError('network', 'Room storage unavailable; local copy is preserved', false, 5000);
      } finally { candidate.destroy(); }
      if (stored instanceof Promise) {
        return stored.then(finish, error => {
          if (error instanceof ReplaySyncError) throw error;
          throw new ReplaySyncError('network', 'Room storage unavailable; local copy is preserved', false, 5000);
        });
      }
    }
    return finish();
  }

  encode() {
    return Y.encodeStateAsUpdate(this.doc);
  }

  restore(update: Uint8Array) {
    const isolated = new Y.Doc({ guid: this.id });
    try {
      Y.applyUpdate(isolated, update);
      if (isolated.getMap('replay').size) validateAcceptedDocument(isolated);
      Y.applyUpdate(this.doc, update, 'replaylab-room-restore');
    } finally { isolated.destroy(); }
  }

  forgetSession(sessionId: string) { this.commitsBySession.delete(sessionId); }

  collectPresence(now = Date.now()) {
    this.removeExpiredPresence(now);
    return [...this.presenceByClient.values()];
  }

  updatePresence(clientId: string, state: unknown, now = Date.now()) {
    validatePresencePayload(state);
    const presence = { ...state, clientId, expiresAt: now + this.presenceTtlMs } satisfies ReplayPresence;
    this.presenceByClient.set(clientId, presence);
    return presence;
  }

  removePresence(clientId: string) {
    return this.presenceByClient.delete(clientId);
  }

  removeExpiredPresence(now = Date.now()) {
    const removed: string[] = [];
    for (const [clientId, presence] of this.presenceByClient) {
      if (presence.expiresAt > now) continue;
      this.presenceByClient.delete(clientId);
      removed.push(clientId);
    }
    return removed;
  }

  private consumeRateLimit(sessionId: string) {
    const now = Date.now();
    const validAfter = now - this.rateLimit.windowMs;
    const commits = (this.commitsBySession.get(sessionId) ?? []).filter(value => value > validAfter);
    if (commits.length >= this.rateLimit.commits) {
      const retryAfterMs = Math.max(1, commits[0]! + this.rateLimit.windowMs - now);
      throw new ReplaySyncError('rate_limited', 'Commit rate limit reached', false, retryAfterMs);
    }
    commits.push(now);
    this.commitsBySession.set(sessionId, commits);
  }
}

type Session = {
  id: string;
  room: ReplaySyncRoom;
  role: CapabilityRole;
  channel: 'document' | 'awareness';
  clientId?: string;
};

export class ReplaySyncWebSocketServer {
  readonly server: WebSocketServer;
  readonly rooms = new Map<string, ReplaySyncRoom>();
  readonly logs: ReplaySyncLog[] = [];
  private readonly sessions = new Map<WebSocket, Session>();
  private readonly expiryTimer: ReturnType<typeof setInterval>;
  private messageQueue = Promise.resolve();

  constructor(options: { port?: number; host?: string; server?: Server; publicOrigin?: string } = {}) {
    this.server = new WebSocketServer({
      ...(options.server ? { server: options.server, path: '/sync' } : { port: options.port ?? 32411, host: options.host ?? '127.0.0.1' }),
      maxPayload: 384 * 1024, perMessageDeflate: false,
      ...(options.server ? { verifyClient: (info: { origin: string; req: import('node:http').IncomingMessage }) => {
        const allowed = options.publicOrigin ?? `http://${info.req.headers.host}`;
        return info.origin === allowed;
      } } : {}),
    });
    this.server.on('connection', (socket: WebSocket) => {
      if (this.server.clients.size > 64) { socket.close(1013, 'Connection limit'); return; }
      const deadline = setTimeout(() => { if (!this.sessions.has(socket)) socket.close(4003, 'Authentication required'); }, 5000);
      let windowStart = Date.now();
      let messages = 0;
      socket.on('error', () => socket.close());
      socket.on('message', (data: unknown) => {
        if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messages = 0; }
        if (++messages > 100) { socket.close(4003, 'Message rate exceeded'); return; }
        this.messageQueue = this.messageQueue.then(() => this.handle(socket, String(data)));
      });
      socket.on('close', () => clearTimeout(deadline));
      socket.on('close', () => this.dropSession(socket));
    });
    this.expiryTimer = setInterval(() => this.expirePresence(), 50);
    this.expiryTimer.unref?.();
  }

  createRoom(roomId: string, options: RoomOptions = {}) {
    if (this.rooms.has(roomId)) throw new Error(`Room ${roomId} already exists`);
    const room = new ReplaySyncRoom(roomId, options);
    this.rooms.set(roomId, room);
    return room;
  }

  async ready() {
    const existing = this.server.address();
    if (existing) return;
    await new Promise<void>((resolve, reject) => { this.server.once('listening', resolve); this.server.once('error', reject); });
  }

  get endpoint() {
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Sync server is not listening');
    return `ws://127.0.0.1:${address.port}`;
  }

  close() {
    clearInterval(this.expiryTimer);
    for (const socket of this.server.clients) socket.close();
    return new Promise<void>((resolve, reject) => {
      this.server.close(error => error ? reject(error) : resolve());
    });
  }

  private async handle(socket: WebSocket, raw: string) {
    let envelope: Partial<ReplayClientEnvelope> | undefined;
    try {
      envelope = parseEnvelope(raw) as Partial<ReplayClientEnvelope>;
      if (this.logs.length > 2000) this.logs.splice(0, this.logs.length - 2000);
      if (this.sessions.has(socket) && (envelope.kind === 'hello' || envelope.kind === 'presence.hello')) {
        throw new ReplaySyncError('forbidden', 'Session is already authenticated', true);
      }
      if (envelope.kind === 'hello') {
        this.handleHello(socket, envelope);
        return;
      }
      if (envelope.kind === 'presence.hello') {
        this.handlePresenceHello(socket, envelope);
        return;
      }
      const session = this.sessions.get(socket);
      if (!session) throw new ReplaySyncError('unauthorized', 'Session is not authorized', true);
      if (envelope.kind === 'presence.collect') {
        this.handlePresenceCollect(socket, session, envelope);
        return;
      }
      if (envelope.kind === 'presence.publish') {
        this.handlePresencePublish(socket, session, envelope);
        return;
      }
      if (session.channel !== 'document') throw new ReplaySyncError('forbidden', 'Awareness session cannot sync documents', true);
      if (envelope.kind === 'pull') {
        this.handlePull(socket, session, envelope);
        return;
      }
      if (envelope.kind === 'commit') {
        await this.handleCommit(socket, session, envelope);
        return;
      }
      throw new ReplaySyncError('malformed', 'Unknown client envelope', true);
    } catch (error) {
      this.reject(socket, error, envelope?.requestId);
    }
  }

  private handleHello(socket: WebSocket, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'hello' }>>) {
    if (typeof envelope.requestId !== 'string' || typeof envelope.roomId !== 'string' || typeof envelope.capability !== 'string') {
      throw new ReplaySyncError('malformed', 'Hello envelope is incomplete', true);
    }
    const room = this.rooms.get(envelope.roomId);
    const role = room?.authenticate(envelope.capability) ?? null;
    if (!room || !role) throw new ReplaySyncError('unauthorized', 'Capability is invalid', true);
    if ([...this.sessions.values()].filter(session => session.room === room).length >= 48) throw new ReplaySyncError('rate_limited', 'Room connection limit reached', false, 5000);
    const session = { id: crypto.randomUUID(), room, role, channel: 'document' } satisfies Session;
    this.sessions.set(socket, session);
    this.logs.push({ event: 'session', roomId: room.id, role });
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({ kind: 'ready', requestId: envelope.requestId, role }));
  }

  private handlePull(socket: WebSocket, session: Session, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'pull' }>>) {
    if (typeof envelope.requestId !== 'string' || typeof envelope.docId !== 'string' || typeof envelope.state !== 'string') {
      throw new ReplaySyncError('malformed', 'Pull envelope is incomplete', true);
    }
    if (envelope.docId !== session.room.id) throw new ReplaySyncError('forbidden', 'Document is outside this room', true);
    let state: Uint8Array;
    try { state = base64ToBytes(envelope.state); } catch { throw new ReplaySyncError('malformed', 'State vector is invalid', true); }
    const diff = session.room.pull(state);
    this.logs.push({ event: 'pull', roomId: session.room.id, role: session.role, byteLength: diff.update.byteLength });
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({
      kind: 'diff',
      requestId: envelope.requestId,
      update: bytesToBase64(diff.update),
      state: bytesToBase64(diff.state),
    }));
  }

  private async handleCommit(socket: WebSocket, session: Session, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'commit' }>>) {
    if (
      typeof envelope.requestId !== 'string' ||
      typeof envelope.docId !== 'string' ||
      typeof envelope.commitId !== 'string' ||
      typeof envelope.update !== 'string'
    ) {
      throw new ReplaySyncError('malformed', 'Commit envelope is incomplete', true);
    }
    if (envelope.docId !== session.room.id) throw new ReplaySyncError('forbidden', 'Document is outside this room', true);
    if (envelope.update.length > Math.ceil(session.room.maxUpdateBytes * 4 / 3) + 4) {
      throw new ReplaySyncError('oversize', 'Encoded update exceeds the room byte limit', true);
    }
    let update: Uint8Array;
    try { update = base64ToBytes(envelope.update); } catch { throw new ReplaySyncError('malformed', 'Update encoding is invalid', true); }
    const result = await session.room.accept({
      sessionId: session.id,
      role: session.role,
      commitId: envelope.commitId,
      update,
    });
    this.logs.push({ event: 'accept', roomId: session.room.id, role: session.role, byteLength: update.byteLength });
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({
      kind: 'accepted',
      requestId: envelope.requestId,
      commitId: envelope.commitId,
      duplicate: result.duplicate,
    }));
    if (result.duplicate) return;
    const fanout = makeEnvelope<ReplayServerEnvelope>({
      kind: 'update',
      docId: envelope.docId,
      commitId: envelope.commitId,
      update: envelope.update,
    });
    for (const [peer, peerSession] of this.sessions) {
      if (peer === socket || peerSession.room !== session.room || peerSession.channel !== 'document' || peer.readyState !== WebSocket.OPEN) continue;
      this.send(peer, fanout);
    }
  }

  private handlePresenceHello(socket: WebSocket, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'presence.hello' }>>) {
    if (typeof envelope.requestId !== 'string' || typeof envelope.roomId !== 'string' || typeof envelope.capability !== 'string' || typeof envelope.clientId !== 'string' || envelope.clientId.length > 80) {
      throw new ReplaySyncError('malformed', 'Awareness hello is incomplete', true);
    }
    const room = this.rooms.get(envelope.roomId);
    const role = room?.authenticate(envelope.capability) ?? null;
    if (!room || !role) throw new ReplaySyncError('unauthorized', 'Capability is invalid', true);
    if ([...this.sessions.values()].filter(session => session.room === room).length >= 48) throw new ReplaySyncError('rate_limited', 'Room connection limit reached', false, 5000);
    this.sessions.set(socket, { id: crypto.randomUUID(), room, role, channel: 'awareness', clientId: envelope.clientId });
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({ kind: 'presence.ready', requestId: envelope.requestId, role }));
  }

  private handlePresenceCollect(socket: WebSocket, session: Session, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'presence.collect' }>>) {
    if (session.channel !== 'awareness' || typeof envelope.requestId !== 'string') throw new ReplaySyncError('forbidden', 'Presence collection requires awareness session', true);
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({ kind: 'presence.snapshot', requestId: envelope.requestId, presences: session.room.collectPresence() }));
  }

  private handlePresencePublish(socket: WebSocket, session: Session, envelope: Partial<Extract<ReplayClientEnvelope, { kind: 'presence.publish' }>>) {
    if (session.channel !== 'awareness' || !session.clientId || typeof envelope.requestId !== 'string') throw new ReplaySyncError('forbidden', 'Presence publish requires awareness session', true);
    const presence = session.room.updatePresence(session.clientId, envelope.state);
    const changed = makeEnvelope<ReplayServerEnvelope>({ kind: 'presence.changed', presence });
    for (const [peer, peerSession] of this.sessions) {
      if (peer === socket || peerSession.room !== session.room || peerSession.channel !== 'awareness') continue;
      this.send(peer, changed);
    }
  }

  private dropSession(socket: WebSocket) {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);
    session?.room.forgetSession(session.id);
    if (!session?.clientId || !session.room.removePresence(session.clientId)) return;
    this.broadcastPresenceLeft(session.room, session.clientId, 'disconnect');
  }

  private expirePresence() {
    for (const room of this.rooms.values()) {
      for (const clientId of room.removeExpiredPresence()) this.broadcastPresenceLeft(room, clientId, 'expired');
    }
  }

  private broadcastPresenceLeft(room: ReplaySyncRoom, clientId: string, reason: 'disconnect' | 'expired') {
    const envelope = makeEnvelope<ReplayServerEnvelope>({ kind: 'presence.left', clientId, reason });
    for (const [peer, session] of this.sessions) {
      if (session.room === room && session.channel === 'awareness') this.send(peer, envelope);
    }
  }

  private reject(socket: WebSocket, error: unknown, requestId?: string) {
    const syncError = error instanceof ReplaySyncError
      ? error
      : new ReplaySyncError('malformed', 'Envelope could not be processed', true);
    const session = this.sessions.get(socket);
    this.logs.push({ event: 'reject', roomId: session?.room.id, role: session?.role, code: syncError.code });
    this.send(socket, makeEnvelope<ReplayServerEnvelope>({
      kind: 'error',
      requestId,
      code: syncError.code,
      message: syncError.message,
      terminal: syncError.terminal,
      retryAfterMs: syncError.retryAfterMs,
    }));
    if (syncError.terminal) socket.close(4003, syncError.code);
  }

  private send(socket: WebSocket, envelope: ReplayServerEnvelope) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(envelope));
  }
}
