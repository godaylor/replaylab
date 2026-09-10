import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, copyFileSync, existsSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';
import { ReplaySyncError } from './sync-protocol';
import type { ReplaySyncRoom, ReplaySyncWebSocketServer } from './sync-server';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export const JOURNAL_LIMIT = 128 * 1024 * 1024;
const SNAPSHOT_LIMIT = 16 * 1024 * 1024;
export function validRoomId(id: string) { return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id); }

export function provisionRoom(root: string, id: string) {
  if (!validRoomId(id)) throw new Error('Room ID must be 1-64 ASCII letters, digits, underscore or hyphen');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const readToken = randomBytes(32).toString('base64url');
  const writeToken = randomBytes(32).toString('base64url');
  writeFileSync(join(root, `${id}.room.json`), JSON.stringify({ version: 1, id, capabilityHashes: { read: hash(readToken), write: hash(writeToken) } }) + '\n', { flag: 'wx', mode: 0o600 });
  return { readToken, writeToken };
}

export function loadRooms(server: ReplaySyncWebSocketServer, root: string) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const configs = readdirSync(root).filter(name => name.endsWith('.room.json'));
  if (configs.length > 32) throw new Error('Portfolio server supports at most 32 rooms');
  for (const name of configs) {
    const config = JSON.parse(readFileSync(join(root, name), 'utf8'));
    if (config.version !== 1 || !validRoomId(config.id) || name !== `${config.id}.room.json` || !['read', 'write'].every(role => /^[0-9a-f]{64}$/.test(config.capabilityHashes?.[role]))) throw new Error(`Invalid room configuration: ${name}`);
    let count = 0;
    const journal = join(root, `${config.id}.updates.jsonl`);
    const room = server.createRoom(config.id, {
      capabilityHashes: config.capabilityHashes,
      persist(update, snapshot) {
        if (snapshot.byteLength > SNAPSHOT_LIMIT) throw new ReplaySyncError('oversize', 'Room archive limit reached; export local copy', true);
        const line = JSON.stringify({ update: Buffer.from(update).toString('base64'), sha256: hash(update) }) + '\n';
        const size = existsSync(journal) ? statSync(journal).size : 0;
        if (size + Buffer.byteLength(line) > JOURNAL_LIMIT) throw new ReplaySyncError('oversize', 'Room journal limit reached; export local copy', true);
        const fd = openSync(journal, 'a', 0o600);
        try { appendFileSync(fd, line); fsyncSync(fd); }
        catch (error) { ftruncateSync(fd, size); fsyncSync(fd); throw error; }
        finally { closeSync(fd); }
        // The complete append log is retained. Snapshot failure cannot undo a durable ACK.
        if (++count % 100 === 0) {
          try {
            const pending = join(root, `${config.id}.snapshot.pending`);
            writeFileSync(pending, snapshot, { mode: 0o600 });
            const snapshotFd = openSync(pending, 'r+');
            try { fsyncSync(snapshotFd); } finally { closeSync(snapshotFd); }
            renameSync(pending, join(root, `${config.id}.snapshot.yjs`));
          } catch { /* Full journal remains the recovery authority. */ }
        }
      },
    });
    if (existsSync(journal)) restoreJournal(room, journal);
  }
}

function restoreJournal(room: ReplaySyncRoom, journal: string) {
  if (statSync(journal).size > JOURNAL_LIMIT) throw new Error('Journal exceeds supported cap; preserve and review offline');
  const raw = readFileSync(journal);
  const lastNewline = raw.lastIndexOf(10);
  const complete = raw.subarray(0, lastNewline + 1).toString('utf8');
  const restored = new Y.Doc();
  try {
    for (const line of complete.split('\n').filter(Boolean)) {
      const record = JSON.parse(line);
      const update = Buffer.from(record.update, 'base64');
      if (hash(update) !== record.sha256) throw new Error('Journal checksum mismatch; original retained');
      Y.applyUpdate(restored, update);
    }
    room.restore(Y.encodeStateAsUpdate(restored));
  } finally { restored.destroy(); }
  if (lastNewline + 1 !== raw.length) {
    // Only an unacknowledged incomplete tail is removed, after keeping the exact original.
    copyFileSync(journal, `${journal}.interrupted-${Date.now()}`);
    const fd = openSync(journal, 'r+');
    try { ftruncateSync(fd, lastNewline + 1); fsyncSync(fd); } finally { closeSync(fd); }
  }
}
