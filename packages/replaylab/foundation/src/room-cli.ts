import { resolve } from 'node:path';
import { provisionRoom } from './room-storage';
import { capabilityFragment } from './sync-protocol';

const id = process.argv[2];
if (!id) throw new Error('Usage: room:create <room-id> [https://your-host or http://127.0.0.1:32400]');
const origin = new URL(process.argv[3] ?? 'http://127.0.0.1:32400');
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Supply an HTTP(S) origin only');
if (origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Non-local publication requires HTTPS');
const root = resolve(process.env.REPLAYLAB_DATA_DIR ?? '.replaylab-data');
const tokens = provisionRoom(root, id);
const endpoint = origin.origin.replace(/^http/, 'ws') + '/sync';
for (const access of ['read', 'write'] as const) {
  const fragment = capabilityFragment({ endpoint, roomId: id, access, capability: tokens[`${access}Token`] });
  console.log(`${access}: ${origin.origin}/app/play/${id}/edit${fragment}`);
}
console.log('Keep these private bearer links. Only hashes were saved. Restart the server to load this room.');
