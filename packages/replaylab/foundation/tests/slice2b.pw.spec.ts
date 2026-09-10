import { expect, test } from '@playwright/test';
import * as Y from 'yjs';

import {
  rankForReorder,
  readReplaySnapshot,
  seedReplayRoot,
} from '../src/domain';

test('equal fractional ranks have the same immutable-ID total order on every replica', () => {
  const source = new Y.Doc({ guid: 'equal-rank-source' });
  const replay = source.getMap<unknown>('replay');
  seedReplayRoot(replay, ['cue-1', 'cue-2']);
  const frames = replay.get('frames') as Y.Map<Y.Map<unknown>>;
  const ids = [...frames.keys()].sort();
  for (const frame of frames.values()) frame.set('rank', 'same-rank');

  const update = Y.encodeStateAsUpdate(source);
  const left = new Y.Doc({ guid: 'equal-rank-left' });
  const right = new Y.Doc({ guid: 'equal-rank-right' });
  Y.applyUpdate(left, update);
  Y.applyUpdate(right, update);

  expect(readReplaySnapshot(left.getMap('replay')).phases.map(phase => phase.id)).toEqual(ids);
  expect(readReplaySnapshot(right.getMap('replay')).phases.map(phase => phase.id)).toEqual(ids);
});

test('rankForReorder produces one deterministic rank between final neighbours', () => {
  const source = new Y.Doc({ guid: 'rank-reorder' });
  const replay = source.getMap<unknown>('replay');
  seedReplayRoot(replay, ['cue-1', 'cue-2']);
  const snapshot = readReplaySnapshot(replay);
  const rank = rankForReorder(snapshot.phases, snapshot.phases[0]!.id, 1);
  const frames = replay.get('frames') as Y.Map<Y.Map<unknown>>;
  frames.get(snapshot.phases[0]!.id)!.set('rank', rank);
  expect(readReplaySnapshot(replay).phases.map(phase => phase.id)).toEqual([
    snapshot.phases[1]!.id,
    snapshot.phases[0]!.id,
  ]);
  expect(rankForReorder(snapshot.phases, snapshot.phases[0]!.id, 1)).toBe(rank);
});

test('one reorder unit preserves action identity, target, path, cue, and exposes repair until undo', async ({ page }) => {
  await page.goto(`/app/play/reorder-history/edit?db=replaylab-reorder-history-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
  const result = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    facade.addPhaseAfter(1);
    const beforePhases = facade.snapshot.phases;
    const from = beforePhases[0]!;
    const to = beforePhases[1]!;
    const actionId = facade.createAction({
      actorId: 'offense-1',
      type: 'pass',
      targetActorId: 'offense-2',
      path: { points: [from.poses['offense-1'], to.poses['offense-2']] },
    });
    const cueByPhaseBefore = Object.fromEntries(
      facade.snapshot.phases.map((phase, index) => [phase.id, facade.getCue(index)])
    );
    const actionBefore = facade.snapshot.actions.find(action => action.id === actionId)!;
    facade.setSelectionSnapshot({ phaseId: to.id, entityId: to.id, focusTarget: 'timeline' });
    facade.reorderPhase({ phaseId: to.id, targetIndex: 2 });
    const orderAfter = facade.snapshot.phases.map(phase => phase.id);
    const actionAfter = facade.snapshot.actions.find(action => action.id === actionId)!;
    const cueByPhaseAfter = Object.fromEntries(
      facade.snapshot.phases.map((phase, index) => [phase.id, facade.getCue(index)])
    );
    facade.undo();
    const orderAfterUndo = facade.snapshot.phases.map(phase => phase.id);
    const actionAfterUndo = facade.snapshot.actions.find(action => action.id === actionId)!;
    const selectionAfterUndo = facade.takeRestoredSelection();
    return {
      orderBefore: beforePhases.map(phase => phase.id),
      orderAfter,
      orderAfterUndo,
      actionBefore,
      actionAfter,
      actionAfterUndo,
      cueByPhaseBefore,
      cueByPhaseAfter,
      selectionAfterUndo,
    };
  });

  expect(result.orderAfter).not.toEqual(result.orderBefore);
  expect(result.actionAfter.adjacency).toBe('needs-repair');
  expect(result.actionAfter.id).toBe(result.actionBefore.id);
  expect(result.actionAfter.targetActorId).toBe(result.actionBefore.targetActorId);
  expect(result.actionAfter.path).toEqual(result.actionBefore.path);
  expect(result.cueByPhaseAfter).toEqual(result.cueByPhaseBefore);
  expect(result.orderAfterUndo).toEqual(result.orderBefore);
  expect(result.actionAfterUndo.adjacency).toBe('valid');
  expect(result.selectionAfterUndo?.focusTarget).toBe('timeline');
});
