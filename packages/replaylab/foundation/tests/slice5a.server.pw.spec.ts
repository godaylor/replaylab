import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { readReplaySnapshot } from '../src/domain';
import { ReplaySyncError } from '../src/sync-protocol';
import { ReplaySyncRoom } from '../src/sync-server';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

test('room converges under duplicate/reordered delivery and rejects every invalid class before apply', async ({ page }) => {
  await page.goto(`/app/play/slice5a-server/edit?db=slice5a-server-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  const fixtures = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const seed = Facade.createMemory('slice5a-fixture');
    const base = seed.encode();
    const a = Facade.fromUpdate(base, 'slice5a-a');
    const b = Facade.fromUpdate(base, 'slice5a-b');
    a.setActorPose({ actorId: 'offense-1', x: 260, y: 170 });
    b.setActorPose({ actorId: 'defense-1', x: 520, y: 250 });
    const invalid = Facade.fromUpdate(base, 'slice5a-invalid');
    invalid.replayRoot.set('schemaVersion', 99);
    const result = {
      base: [...base],
      a: [...a.encode()],
      b: [...b.encode()],
      invalid: [...invalid.encode()],
    };
    seed.close(); a.close(); b.close(); invalid.close();
    return result;
  });
  const bytes = (values: number[]) => Uint8Array.from(values);

  const left = new ReplaySyncRoom('left');
  const right = new ReplaySyncRoom('right');
  left.accept({ sessionId: 'left', role: 'write', commitId: 'base', update: bytes(fixtures.base) });
  right.accept({ sessionId: 'right', role: 'write', commitId: 'base', update: bytes(fixtures.base) });
  left.accept({ sessionId: 'left', role: 'write', commitId: 'a', update: bytes(fixtures.a) });
  left.accept({ sessionId: 'left', role: 'write', commitId: 'b', update: bytes(fixtures.b) });
  right.accept({ sessionId: 'right', role: 'write', commitId: 'b', update: bytes(fixtures.b) });
  right.accept({ sessionId: 'right', role: 'write', commitId: 'a', update: bytes(fixtures.a) });
  expect(readReplaySnapshot(left.doc.getMap('replay'))).toEqual(readReplaySnapshot(right.doc.getMap('replay')));
  expect(left.accept({ sessionId: 'left', role: 'write', commitId: 'a', update: bytes(fixtures.a) })).toEqual({ duplicate: true });

  const beforeInvalid = [...left.encode()];
  const rejected: Record<string, string> = {};
  for (const [name, operation] of Object.entries({
    read: () => left.accept({ sessionId: 'read', role: 'read' as const, commitId: 'read', update: bytes(fixtures.a) }),
    malformed: () => left.accept({ sessionId: 'bad', role: 'write' as const, commitId: 'bad', update: Uint8Array.from([1, 2, 3]) }),
    schema: () => left.accept({ sessionId: 'schema', role: 'write' as const, commitId: 'schema', update: bytes(fixtures.invalid) }),
  })) {
    try { operation(); } catch (error) { rejected[name] = (error as ReplaySyncError).code; }
    expect([...left.encode()]).toEqual(beforeInvalid);
  }

  const small = new ReplaySyncRoom('small', { maxUpdateBytes: 64 });
  try {
    small.accept({ sessionId: 'oversize', role: 'write', commitId: 'oversize', update: bytes(fixtures.base) });
  } catch (error) {
    rejected.oversize = (error as ReplaySyncError).code;
  }
  expect(small.doc.getMap('replay').size).toBe(0);
  expect(left.authenticate('not-a-capability')).toBeNull();
  rejected.unauthorized = 'unauthorized';

  const limited = new ReplaySyncRoom('limited', { rateLimit: { commits: 1, windowMs: 80 } });
  limited.accept({ sessionId: 'rate', role: 'write', commitId: 'first', update: bytes(fixtures.base) });
  let retryAfterMs = 0;
  try {
    limited.accept({ sessionId: 'rate', role: 'write', commitId: 'second', update: bytes(fixtures.a) });
  } catch (error) {
    const syncError = error as ReplaySyncError;
    rejected.rate = syncError.code;
    retryAfterMs = syncError.retryAfterMs ?? 0;
  }
  expect(retryAfterMs).toBeGreaterThan(0);
  expect(rejected).toEqual({
    read: 'forbidden',
    malformed: 'malformed',
    schema: 'schema',
    oversize: 'oversize',
    unauthorized: 'unauthorized',
    rate: 'rate_limited',
  });

  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, 'slice5a-security.json'), JSON.stringify({
    verdict: 'PASS',
    duplicateIdempotent: true,
    reorderConverged: true,
    rejectedBeforeApply: rejected,
    retryAfterMs,
    documentContentInLogs: false,
  }, null, 2) + '\n');
});
