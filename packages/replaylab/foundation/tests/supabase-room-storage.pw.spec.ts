import { expect, test } from '@playwright/test';

import { createHash } from 'node:crypto';

import { SupabaseRoomStorage } from '../src/supabase-room-storage';

const hash = (character: string) => character.repeat(64);

test('Supabase adapter verifies and atomically replaces private snapshots without exposing its secret', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const existing = Uint8Array.from([1, 2, 3]);
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (!init?.method) return Response.json([{
      id: 'portfolio',
      read_capability_hash: hash('a'),
      write_capability_hash: hash('b'),
      snapshot_base64: Buffer.from(existing).toString('base64'),
      snapshot_sha256: createHash('sha256').update(existing).digest('hex'),
    }]);
    return Response.json([{ id: 'portfolio' }]);
  };
  const storage = new SupabaseRoomStorage({
    url: 'https://example.supabase.co',
    secretKey: 'sb_secret_test-only',
  }, fetchImpl);

  const rooms = await storage.readRooms();
  expect(rooms).toEqual([{
    id: 'portfolio',
    capabilityHashes: { read: hash('a'), write: hash('b') },
    snapshot: existing,
  }]);
  await storage.writeSnapshot('portfolio', Uint8Array.from([4, 5]));

  expect(requests[0]!.url).toContain('/rest/v1/replaylab_rooms?select=');
  expect(requests[0]!.init?.headers).toEqual({ apikey: 'sb_secret_test-only' });
  expect(requests[1]!.url).toBe('https://example.supabase.co/rest/v1/replaylab_rooms?id=eq.portfolio&select=id');
  expect(requests[1]!.init).toMatchObject({ method: 'PATCH', headers: expect.objectContaining({ prefer: 'return=representation' }) });
  expect(JSON.stringify(requests.map(request => request.url))).not.toContain('sb_secret');
});
