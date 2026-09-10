import { expect, test, type Page } from '@playwright/test';

function proofUrl(name: string) {
  const database = `replaylab-${name}-${Date.now()}`;
  return `/app/play/${name}/edit?db=${database}`;
}

async function openProof(page: Page, name: string) {
  await page.goto(proofUrl(name));
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
}

test('schema round-trip preserves the v1 play, title, candidate registers, and cues', async ({ page }) => {
  await openProof(page, 'roundtrip');
  const result = await page.evaluate(() => {
    const app = window.replayLabApp!;
    const update = app.facade.encode();
    const restored = app.ReplayLabEditorFacade.fromUpdate(update, 'restored-copy');
    const value = {
      source: app.facade.snapshot,
      restored: restored.snapshot,
      cues: [restored.getCue(0), restored.getCue(1)],
      migration: restored.runMigrations(),
    };
    restored.close();
    return value;
  });

  expect(result.restored).toEqual(result.source);
  expect(result.restored.phases).toHaveLength(2);
  expect(result.restored.actors).toHaveLength(10);
  expect(result.restored.phases[0]!.possession.value).toBe('offense-1');
  expect(result.restored.phases[0]!.poseRegisters['offense-1'].candidates).toHaveLength(1);
  expect(result.cues).toEqual(['Start in horns.', 'Finish at the rim.']);
  expect(result.migration).toEqual({ migrated: false, from: 'v1', to: 'v1' });
});

test('rename, player pose, loose-ball pose, and cue share ordered local-only undo/redo', async ({ page }) => {
  await openProof(page, 'history');
  const result = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const initial = {
      title: facade.snapshot.title,
      pose: facade.snapshot.phases[0]!.poses['offense-1'],
      cue: facade.getCue(0),
    };
    facade.setActorPose({ actorId: 'offense-1', x: 260, y: 180 });
    facade.renamePlay('Baseline out-of-bounds');
    facade.setPossession({ value: 'loose', looseBallPose: { x: 420, y: 230 } });
    facade.setLooseBallPose({ x: 440, y: 250 });
    facade.editCue({ value: 'Hold the weak-side corner.' });
    const edited = {
      title: facade.snapshot.title,
      pose: facade.snapshot.phases[0]!.poses['offense-1'],
      ball: facade.snapshot.phases[0]!.ballPose,
      cue: facade.getCue(0),
    };
    facade.undo();
    const afterCueUndo = facade.getCue(0);
    facade.undo();
    const afterBallUndo = facade.snapshot.phases[0]!.ballPose;
    facade.undo();
    const afterPossessionUndo = facade.snapshot.phases[0]!.possession.value;
    facade.undo();
    const afterRenameUndo = facade.snapshot.title;
    facade.undo();
    const afterPoseUndo = facade.snapshot.phases[0]!.poses['offense-1'];
    for (let index = 0; index < 5; index += 1) facade.redo();
    return {
      initial,
      edited,
      afterCueUndo,
      afterBallUndo,
      afterPossessionUndo,
      afterRenameUndo,
      afterPoseUndo,
      redone: {
        title: facade.snapshot.title,
        pose: facade.snapshot.phases[0]!.poses['offense-1'],
        ball: facade.snapshot.phases[0]!.ballPose,
        cue: facade.getCue(0),
      },
    };
  });

  expect(result.edited).toEqual({
    title: 'Baseline out-of-bounds',
    pose: { x: 260, y: 180 },
    ball: { x: 440, y: 250 },
    cue: 'Hold the weak-side corner.',
  });
  expect(result.afterCueUndo).toBe(result.initial.cue);
  expect(result.afterBallUndo).toEqual({ x: 420, y: 230 });
  expect(result.afterPossessionUndo).toBe('offense-1');
  expect(result.afterRenameUndo).toBe(result.initial.title);
  expect(result.afterPoseUndo).toEqual(result.initial.pose);
  expect(result.redone).toEqual(result.edited);
});

test('fallible command draft throws before transaction and history remains usable', async ({ page }) => {
  await openProof(page, 'exception');
  const result = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const initialPose = facade.snapshot.phases[0]!.poses['offense-1'];
    let message = '';
    try {
      facade.setActorPose({ actorId: 'offense-1', x: -1, y: 180 });
    } catch (error) {
      message = (error as Error).message;
    }
    const undoAfterFailure = facade.canUndo;
    facade.setActorPose({ actorId: 'offense-1', x: 240, y: 170 });
    facade.undo();
    return {
      message,
      undoAfterFailure,
      initialPose,
      finalPose: facade.snapshot.phases[0]!.poses['offense-1'],
    };
  });

  expect(result.message).toContain('outside the half-court');
  expect(result.undoAfterFailure).toBe(false);
  expect(result.finalPose).toEqual(result.initialPose);
});

test('remote concurrent candidate survives local undo', async ({ page }) => {
  await openProof(page, 'remote-undo');
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const base = window.replayLabApp!.facade.encode();
    const local = Facade.fromUpdate(base, 'local');
    const remote = Facade.fromUpdate(base, 'remote');
    local.setActorPose({ actorId: 'offense-1', x: 230, y: 170 });
    remote.setActorPose({ actorId: 'offense-1', x: 330, y: 240 });
    local.applyRemoteUpdate(remote.encode());
    const beforeUndo = local.snapshot.phases[0]!.poseRegisters['offense-1'];
    local.undo();
    const afterUndo = local.snapshot.phases[0]!.poseRegisters['offense-1'];
    local.close();
    remote.close();
    return { beforeUndo, afterUndo };
  });

  expect(result.beforeUndo.candidates).toHaveLength(2);
  expect(result.afterUndo.candidates.some(candidate => candidate.value.x === 330)).toBe(true);
  expect(result.afterUndo.candidates.some(candidate => candidate.value.x === 230)).toBe(false);
});

test('custom Gfx projection contains ten players plus derived ball and paints the court', async ({ page }) => {
  await openProof(page, 'gfx');
  await expect(page.locator('#court')).toHaveAttribute('data-projection-count', '11');
  const result = await page.locator('#court').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    const context = element.getContext('2d');
    return {
      actorAlpha: context?.getImageData(110, 125, 1, 1).data[3] ?? 0,
      courtAlpha: context?.getImageData(20, 20, 1, 1).data[3] ?? 0,
      renderCount: Number(element.dataset.renderCount ?? 0),
    };
  });
  expect(result.actorAlpha).toBeGreaterThan(0);
  expect(result.courtAlpha).toBeGreaterThan(0);
  expect(result.renderCount).toBeGreaterThan(0);
});
