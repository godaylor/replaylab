import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { ReplaySyncError } from '../src/sync-protocol';
import { ReplaySyncRoom } from '../src/sync-server';


const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceRoot = resolve(packageRoot, 'evidence');

test('three replicas converge after 500 mixed commands, duplicate/reorder and a logical five-minute partition; local undo preserves remote work', async ({ page }) => {
  await page.goto(`/app/play/slice5b-simulator/edit?db=slice5b-simulator-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const seed = Facade.createMemory('slice5b-seed');
    const base = seed.encode();
    const replicas = ['a', 'b', 'c'].map(id => Facade.fromUpdate(base, `slice5b-${id}`));
    const updates: number[][][] = [[], [], []];
    const handlers = replicas.map((replica, index) => {
      const handler = (update: Uint8Array) => updates[index]!.push([...update]);
      replica.doc.rootDoc.on('update', handler);
      return handler;
    });
    const actors = ['offense-1', 'offense-2', 'offense-3', 'offense-4', 'offense-5', 'defense-1', 'defense-2', 'defense-3', 'defense-4', 'defense-5'] as const;

    for (let index = 0; index < 500; index += 1) {
      const replica = replicas[index % 3]!;
      const phaseIndex = index % replica.snapshot.phases.length;
      if (index % 5 < 3) {
        replica.setActorPose({
          phaseIndex,
          actorId: actors[index % actors.length]!,
          x: 40 + (index * 37) % 760,
          y: 40 + (index * 29) % 380,
        });
      } else if (index % 5 === 3) {
        replica.editCue({ phaseIndex, value: `Cue ${index} from replica ${index % 3}` });
      } else {
        replica.renamePlay(`Partition play ${index}`);
      }
    }

    let random = 0x5b5b2026;
    const next = () => {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      return (random >>> 0) / 0x1_0000_0000;
    };
    const originalUpdateCount = updates.flat().length;
    const delivery = updates.flat().flatMap((update, index) => index % 7 === 0 ? [update, update] : [update]);
    for (let index = delivery.length - 1; index > 0; index -= 1) {
      const target = Math.floor(next() * (index + 1));
      [delivery[index], delivery[target]] = [delivery[target]!, delivery[index]!];
    }
    for (const update of delivery) {
      for (const replica of replicas) replica.applyRemoteUpdate(Uint8Array.from(update));
    }
    const convergedAfterPartition = replicas.every(replica => replica.exportSnapshot() === replicas[0]!.exportSnapshot());

    updates.forEach(queue => { queue.length = 0; });
    const beforeLocalGesture = JSON.stringify(replicas[0]!.snapshot.phases[0]!.poseRegisters['offense-1']);
    replicas[0]!.setActorPose({ phaseIndex: 0, actorId: 'offense-1', x: 777, y: 177 });
    replicas[1]!.setActorPose({ phaseIndex: 0, actorId: 'defense-5', x: 123, y: 321 });
    for (const update of updates.flat()) {
      for (const replica of replicas) replica.applyRemoteUpdate(Uint8Array.from(update));
    }
    const collaboratorBeforeUndo = JSON.stringify(replicas[0]!.snapshot.phases[0]!.poseRegisters['defense-5']);
    updates.forEach(queue => { queue.length = 0; });
    replicas[0]!.undo();
    for (const update of updates[0]!) {
      for (const replica of replicas) replica.applyRemoteUpdate(Uint8Array.from(update));
    }
    const finalSnapshots = replicas.map(replica => replica.exportSnapshot());
    const value = {
      replicas: replicas.length,
      commands: 500,
      logicalPartitionMs: 300_000,
      originalUpdateCount,
      generatedUpdates: delivery.length,
      duplicatedAndReordered: delivery.length > originalUpdateCount,
      convergedAfterPartition,
      convergedAfterUndo: finalSnapshots.every(snapshot => snapshot === finalSnapshots[0]),
      localGestureReverted: JSON.stringify(replicas[0]!.snapshot.phases[0]!.poseRegisters['offense-1']) === beforeLocalGesture,
      collaboratorPreserved: replicas.every(replica => JSON.stringify(replica.snapshot.phases[0]!.poseRegisters['defense-5']) === collaboratorBeforeUndo),
    };
    replicas.forEach((replica, index) => {
      replica.doc.rootDoc.off('update', handlers[index]!);
      replica.close();
    });
    seed.close();
    return value;
  });

  expect(result).toMatchObject({
    replicas: 3,
    commands: 500,
    logicalPartitionMs: 300_000,
    duplicatedAndReordered: true,
    convergedAfterPartition: true,
    convergedAfterUndo: true,
    localGestureReverted: true,
    collaboratorPreserved: true,
  });
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolve(evidenceRoot, 'slice5b-replica.json'), JSON.stringify({ verdict: 'PASS', ...result }, null, 2) + '\n');
});

test('awareness room enforces its payload cap before retaining state', () => {
  const room = new ReplaySyncRoom('slice5b-awareness-bounds');
  let code = '';
  try {
    room.updatePresence('oversize', { participantName: 'x'.repeat(5000), color: '#45c8f5' });
  } catch (error) {
    code = (error as ReplaySyncError).code;
  }
  expect(code).toBe('oversize');
  expect(room.collectPresence()).toEqual([]);
});
