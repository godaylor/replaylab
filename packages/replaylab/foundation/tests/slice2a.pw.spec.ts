import { expect, test } from '@playwright/test';

function proofUrl(name: string) {
  return `/app/play/${name}/edit?db=replaylab-${name}-${Date.now()}`;
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.goto(proofUrl(testInfo.title.replaceAll(/\W+/g, '-')));
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
});

test('all tactical actions round-trip with final candidate-register paths', async ({ page }) => {
  const result = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const phase = facade.snapshot.phases[0]!;
    const paths = [
      { points: [phase.poses['offense-1'], { x: 300, y: 160 }] },
      { points: [phase.poses['offense-1'], phase.poses['offense-2']] },
      { points: [phase.poses['offense-2'], { x: 360, y: 210 }] },
      { points: [phase.poses['offense-3'], phase.poses['defense-3']] },
    ];
    facade.createAction({ actorId: 'offense-1', type: 'cut', path: paths[0]! });
    facade.createAction({ actorId: 'offense-1', type: 'pass', targetActorId: 'offense-2', path: paths[1]! });
    facade.createAction({ actorId: 'offense-2', type: 'dribble', path: paths[2]! });
    facade.createAction({ actorId: 'offense-3', type: 'screen', targetActorId: 'defense-3', path: paths[3]! });
    const restored = window.replayLabApp!.ReplayLabEditorFacade.fromUpdate(
      facade.encode(),
      'slice2a-roundtrip'
    );
    const actions = restored.snapshot.actions;
    restored.close();
    return actions;
  });

  expect(result.map(action => action.type).sort()).toEqual(['cut', 'dribble', 'pass', 'screen']);
  expect(result.every(action => action.path.candidates.length === 1)).toBe(true);
  expect(result.every(action => action.path.winnerId.endsWith(':path'))).toBe(true);
  expect(result.every(action => action.adjacency === 'valid')).toBe(true);
});

test('local action-path undo preserves an unrelated remote candidate', async ({ page }) => {
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const source = window.replayLabApp!.facade;
    const phase = source.snapshot.phases[0]!;
    const actionId = source.createAction({
      actorId: 'offense-1',
      type: 'cut',
      path: { points: [phase.poses['offense-1'], { x: 250, y: 160 }] },
    });
    const base = source.encode();
    const local = Facade.fromUpdate(base, 'path-local');
    const remote = Facade.fromUpdate(base, 'path-remote');
    local.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 330, y: 210 }] } });
    remote.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 410, y: 250 }] } });
    local.applyRemoteUpdate(remote.encode());
    const beforeUndo = local.snapshot.actions[0]!.path;
    local.undo();
    const afterUndo = local.snapshot.actions[0]!.path;
    local.close();
    remote.close();
    return { beforeUndo, afterUndo };
  });

  expect(result.beforeUndo.candidates).toHaveLength(2);
  expect(result.afterUndo.candidates).toHaveLength(2);
  expect(result.afterUndo.candidates.some(candidate => candidate.value.points.at(-1)?.x === 330)).toBe(false);
  expect(result.afterUndo.candidates.some(candidate => candidate.value.points.at(-1)?.x === 410)).toBe(true);
  expect(result.afterUndo.value.points.at(-1)).toEqual({ x: 410, y: 250 });
});

test('rich cue and court edits share one local history with deterministic selection restoration', async ({ page }) => {
  const result = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const phase = facade.snapshot.phases[0]!;
    const initialPose = phase.poses['offense-1'];
    facade.setSelectionSnapshot({ phaseId: phase.id, entityId: 'offense-1', focusTarget: 'lineup' });
    facade.setActorPose({ actorId: 'offense-1', x: 260, y: 180 });
    facade.setSelectionSnapshot({ phaseId: phase.id, entityId: phase.cueBlockId, focusTarget: 'cue' });
    facade.replaceCueDocument({
      document: {
        blocks: [
          { type: 'paragraph', runs: [{ text: 'Hold ', bold: true }, { text: 'the corner', link: 'https://example.com/read' }] },
          { type: 'bullet', runs: [{ text: 'Cut hard', italic: true }] },
        ],
      },
    });
    const rich = facade.getCueDocument();
    facade.undo();
    const cueSelection = facade.takeRestoredSelection();
    const cueAfterUndo = facade.getCue();
    facade.undo();
    const actorSelection = facade.takeRestoredSelection();
    const poseAfterUndo = facade.snapshot.phases[0]!.poses['offense-1'];
    return { initialPose, rich, cueSelection, cueAfterUndo, actorSelection, poseAfterUndo };
  });

  expect(result.rich.blocks).toHaveLength(2);
  expect(result.rich.blocks[0]!.runs[0]!.bold).toBe(true);
  expect(result.rich.blocks[0]!.runs[1]!.link).toBe('https://example.com/read');
  expect(result.cueAfterUndo).toBe('Start in horns.');
  expect(result.cueSelection?.focusTarget).toBe('cue');
  expect(result.poseAfterUndo).toEqual(result.initialPose);
  expect(result.actorSelection?.entityId).toBe('offense-1');
});
