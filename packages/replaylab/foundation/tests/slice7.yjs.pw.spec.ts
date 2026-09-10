import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

const LEGACY_UINT53_CLIENT_ID = 2 ** 32 + 7_301;
const evidenceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../evidence');
let legacyUpdateInteroperability = false;
let scopedUndoInteroperability = false;

test.afterAll(() => {
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, 'slice7-yjs-compatibility.json'), `${JSON.stringify({
    verdict: legacyUpdateInteroperability && scopedUndoInteroperability ? 'PASS' : 'FAIL',
    runtime: 'official unpatched yjs@13.6.21',
    legacyUint53ClientId: LEGACY_UINT53_CLIENT_ID,
    legacyUpdateInteroperability,
    stateVectorRoundTrip: legacyUpdateInteroperability,
    scopedUndoPreservesConcurrentLegacyRemoteUpdate: scopedUndoInteroperability,
  }, null, 2)}\n`);
});

test('official Yjs accepts a legacy uint53 update and preserves it through state-vector sync', () => {
  const legacy = new Y.Doc();
  legacy.clientID = LEGACY_UINT53_CLIENT_ID;
  legacy.getMap<string>('replay').set('legacy', 'accepted');

  const official = new Y.Doc();
  expect(official.clientID).toBeLessThanOrEqual(0xffff_ffff);
  Y.applyUpdate(official, Y.encodeStateAsUpdate(legacy));

  expect(official.getMap<string>('replay').get('legacy')).toBe('accepted');

  official.getMap<string>('replay').set('official', 'round-trip');
  const replica = new Y.Doc();
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(official, Y.encodeStateVector(legacy)));
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(legacy));

  expect(replica.getMap<string>('replay').toJSON()).toEqual({
    legacy: 'accepted',
    official: 'round-trip',
  });
  legacyUpdateInteroperability = true;

  legacy.destroy();
  official.destroy();
  replica.destroy();
});

test('local undo on official Yjs keeps a concurrent legacy uint53-origin update', () => {
  const localOrigin = Symbol('replaylab-local');
  const local = new Y.Doc();
  const replay = local.getMap<string>('replay');
  const undo = new Y.UndoManager(replay, {
    trackedOrigins: new Set([localOrigin]),
  });

  local.transact(() => replay.set('local', 'undo-me'), localOrigin);

  const legacyRemote = new Y.Doc();
  legacyRemote.clientID = LEGACY_UINT53_CLIENT_ID;
  legacyRemote.getMap<string>('replay').set('remote', 'keep-me');
  Y.applyUpdate(local, Y.encodeStateAsUpdate(legacyRemote), 'remote');

  expect(undo.canUndo()).toBe(true);
  undo.undo();

  expect(replay.get('local')).toBeUndefined();
  expect(replay.get('remote')).toBe('keep-me');
  scopedUndoInteroperability = true;

  undo.destroy();
  local.destroy();
  legacyRemote.destroy();
});
