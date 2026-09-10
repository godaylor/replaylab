import { createHash } from 'node:crypto';
import type { ReplaySyncWebSocketServer } from './sync-server';
import { validRoomId } from './room-storage';

const SNAPSHOT_LIMIT = 16 * 1024 * 1024;

type SupabaseRoomRecord = {
  id: unknown;
  read_capability_hash: unknown;
  write_capability_hash: unknown;
  snapshot_base64: unknown;
  snapshot_sha256: unknown;
};

type Fetch = typeof globalThis.fetch;

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export class SupabaseRoomStorage {
  private readonly origin: string;

  constructor(
    input: { url: string; secretKey: string },
    private readonly fetchImpl: Fetch = globalThis.fetch
  ) {
    const url = new URL(input.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('REPLAYLAB_SUPABASE_URL must be an HTTPS origin');
    }
    if (!input.secretKey.startsWith('sb_secret_') && !input.secretKey.startsWith('eyJ')) {
      throw new Error('REPLAYLAB_SUPABASE_SECRET_KEY is invalid');
    }
    this.origin = `${url.origin}/rest/v1/replaylab_rooms`;
    this.secretKey = input.secretKey;
  }

  private readonly secretKey: string;

  async loadRooms(server: ReplaySyncWebSocketServer) {
    const records = await this.readRooms();
    for (const record of records) {
      const room = server.createRoom(record.id, {
        capabilityHashes: record.capabilityHashes,
        persist: (_update, snapshot) => this.writeSnapshot(record.id, snapshot),
      });
      if (record.snapshot) room.restore(record.snapshot);
    }
  }

  async readRooms() {
    const response = await this.fetchImpl(`${this.origin}?select=id%2Cread_capability_hash%2Cwrite_capability_hash%2Csnapshot_base64%2Csnapshot_sha256&order=id&limit=33`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Supabase room read failed (${response.status})`);
    const value: unknown = await response.json();
    if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new Error('Supabase must contain 1-32 hosted rooms');
    const ids = new Set<string>();
    return value.map((entry, index) => {
      const record = entry as SupabaseRoomRecord;
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !validRoomId(record.id) || ids.has(record.id) || !validHash(record.read_capability_hash) || !validHash(record.write_capability_hash)) {
        throw new Error(`Supabase room ${index} is invalid`);
      }
      ids.add(record.id);
      let snapshot: Uint8Array | null = null;
      if (record.snapshot_base64 !== null || record.snapshot_sha256 !== null) {
        if (typeof record.snapshot_base64 !== 'string' || !/^[a-zA-Z0-9+/]*={0,2}$/.test(record.snapshot_base64) || !validHash(record.snapshot_sha256)) throw new Error(`Supabase room ${index} snapshot is invalid`);
        snapshot = Buffer.from(record.snapshot_base64, 'base64');
        if (snapshot.byteLength > SNAPSHOT_LIMIT || createHash('sha256').update(snapshot).digest('hex') !== record.snapshot_sha256) throw new Error(`Supabase room ${index} snapshot integrity failed`);
      }
      return {
        id: record.id,
        capabilityHashes: { read: record.read_capability_hash, write: record.write_capability_hash },
        snapshot,
      };
    });
  }

  async writeSnapshot(roomId: string, snapshot: Uint8Array) {
    if (!validRoomId(roomId)) throw new Error('Invalid room ID');
    if (snapshot.byteLength > SNAPSHOT_LIMIT) throw new Error('Room snapshot exceeds the supported cap');
    const response = await this.fetchImpl(`${this.origin}?id=eq.${encodeURIComponent(roomId)}&select=id`, {
      method: 'PATCH',
      headers: { ...this.headers(), 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({
        snapshot_base64: Buffer.from(snapshot).toString('base64'),
        snapshot_sha256: createHash('sha256').update(snapshot).digest('hex'),
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Supabase room write failed (${response.status})`);
    const updated: unknown = await response.json();
    if (!Array.isArray(updated) || updated.length !== 1 || (updated[0] as Record<string, unknown>)?.id !== roomId) throw new Error('Supabase room write did not update exactly one row');
  }

  private headers(): Record<string, string> {
    return this.secretKey.startsWith('sb_secret_')
      ? { apikey: this.secretKey }
      : { apikey: this.secretKey, authorization: `Bearer ${this.secretKey}` };
  }
}
