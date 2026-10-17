import { expect, test } from '@playwright/test';

import { createHash } from 'node:crypto';

import { SupabaseRoomStorage } from '../src/supabase-room-storage';
import { ReplaySyncWebSocketServer } from '../src/sync-server';

const hash = (character: string) => character.repeat(64);

test('a corrupt hosted room cannot install a partial room set and the next complete load is safe', async () => {
  const server = new ReplaySyncWebSocketServer({ port: 32414 });
  await server.ready();
  let damaged = true;
  const bytes = Buffer.from([1, 2, 3]);
  const storage = new SupabaseRoomStorage({ url: 'https://example.supabase.co', secretKey: 'sb_secret_test-only' }, async () => Response.json(['first', 'second'].map((id, index) => ({
    id, read_capability_hash: hash('a'), write_capability_hash: hash('b'),
    snapshot_base64: damaged && index === 1 ? bytes.toString('base64') : null,
    snapshot_sha256: damaged && index === 1 ? createHash('sha256').update(bytes).digest('hex') : null,
  }))));
  try {
    await expect(storage.loadRooms(server)).rejects.toThrow();
    expect(server.rooms.size).toBe(0);
    await expect(storage.loadRooms(server)).rejects.toThrow();
    expect(server.rooms.size).toBe(0);
    damaged = false;
    await storage.loadRooms(server);
    expect([...server.rooms.keys()]).toEqual(['first', 'second']);
  } finally { await server.close(); }
});

test('startup retries transient Supabase reads with bounded backoff and respects Retry-After', async () => {
  const delays: number[] = [];
  let calls = 0;
  const storage = new SupabaseRoomStorage({ url: 'https://example.supabase.co', secretKey: 'sb_secret_test-only' }, async () => {
    calls++;
    if (calls === 1) return new Response(null, { status: 504 });
    if (calls === 2) return new Response(null, { status: 429, headers: { 'Retry-After': '3' } });
    return Response.json([]);
  }, async ms => { delays.push(ms); });
  expect(await storage.readRooms()).toEqual([]);
  expect(calls).toBe(3);
  expect(delays).toEqual([1000, 3000]);
});

test('startup fails closed on authorization or corrupt records and bounds network retries', async () => {
  for (const response of [new Response(null, { status: 401 }), Response.json([{ id: 'broken' }]), new Response(null, { status: 429, headers: { 'Retry-After': '60' } })]) {
    let calls = 0;
    const storage = new SupabaseRoomStorage({ url: 'https://example.supabase.co', secretKey: 'sb_secret_test-only' }, async () => { calls++; return response; }, async () => { throw new Error('Unexpected retry'); });
    await expect(storage.readRooms()).rejects.toThrow();
    expect(calls).toBe(1);
  }
  const delays: number[] = [];
  let calls = 0;
  const unavailable = new SupabaseRoomStorage({ url: 'https://example.supabase.co', secretKey: 'sb_secret_test-only' }, async () => { calls++; throw new TypeError('fetch failed'); }, async ms => { delays.push(ms); });
  await expect(unavailable.readRooms()).rejects.toThrow('Supabase room read unavailable');
  expect(calls).toBe(5);
  expect(delays).toEqual([1000, 2000, 4000, 8000]);
});

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
