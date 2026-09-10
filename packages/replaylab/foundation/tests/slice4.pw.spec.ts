import { expect, test } from '@playwright/test';

function proofUrl(name: string) {
  return `/app/play/${name}/edit?db=replaylab-${name}-${Date.now()}`;
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.goto(proofUrl(testInfo.title.replaceAll(/\W+/g, '-')));
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
});

test('pose, possession, loose-ball, and path candidates converge in arbitrary update order', async ({ page }) => {
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const source = Facade.createMemory('slice4-orders');

    const converge = <T,>(
      base: Uint8Array,
      mutateA: (facade: typeof source) => void,
      mutateB: (facade: typeof source) => void,
      project: (facade: typeof source) => T
    ) => {
      const a = Facade.fromUpdate(base, `a-${crypto.randomUUID()}`);
      const b = Facade.fromUpdate(base, `b-${crypto.randomUUID()}`);
      mutateA(a);
      mutateB(b);
      const left = Facade.fromUpdate(base, `left-${crypto.randomUUID()}`);
      const right = Facade.fromUpdate(base, `right-${crypto.randomUUID()}`);
      left.applyRemoteUpdate(a.encode());
      left.applyRemoteUpdate(b.encode());
      right.applyRemoteUpdate(b.encode());
      right.applyRemoteUpdate(a.encode());
      const projected = [project(left), project(right)];
      a.close(); b.close(); left.close(); right.close();
      return projected;
    };

    const poseBase = source.encode();
    const poses = converge(
      poseBase,
      facade => facade.setActorPose({ actorId: 'offense-1', x: 240, y: 160 }),
      facade => facade.setActorPose({ actorId: 'offense-1', x: 360, y: 220 }),
      facade => facade.snapshot.phases[0]!.poseRegisters['offense-1']
    );
    const possessions = converge(
      poseBase,
      facade => facade.setPossession({ value: 'offense-2' }),
      facade => facade.setPossession({ value: 'offense-3' }),
      facade => facade.snapshot.phases[0]!.possession
    );

    source.setPossession({ value: 'loose', looseBallPose: { x: 300, y: 200 } });
    const looseBase = source.encode();
    const loose = converge(
      looseBase,
      facade => facade.setLooseBallPose({ x: 280, y: 190 }),
      facade => facade.setLooseBallPose({ x: 420, y: 250 }),
      facade => facade.snapshot.phases[0]!.looseBallPose
    );

    source.setPossession({ value: 'offense-1' });
    const phase = source.snapshot.phases[0]!;
    const actionId = source.createAction({
      actorId: 'offense-1',
      type: 'cut',
      path: { points: [phase.poses['offense-1'], { x: 250, y: 170 }] },
    });
    const pathBase = source.encode();
    const paths = converge(
      pathBase,
      facade => facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 330, y: 210 }] } }),
      facade => facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 430, y: 260 }] } }),
      facade => facade.snapshot.actions.find(action => action.id === actionId)!.path
    );
    source.close();
    return { poses, possessions, loose, paths };
  });

  for (const pair of [result.poses, result.possessions, result.loose, result.paths]) {
    expect(pair[0]).toEqual(pair[1]);
    expect(pair[0]!.candidates).toHaveLength(2);
  }
});

test('resolution and undo preserve unseen candidates; concurrent resolutions stay visible', async ({ page }) => {
  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    const seed = Facade.createMemory('slice4-resolution');
    const base = seed.encode();
    const local = Facade.fromUpdate(base, 'slice4-local');
    const remote = Facade.fromUpdate(base, 'slice4-remote');
    const unseen = Facade.fromUpdate(base, 'slice4-unseen');
    local.setActorPose({ actorId: 'offense-1', x: 250, y: 160 });
    remote.setActorPose({ actorId: 'offense-1', x: 350, y: 220 });
    unseen.setActorPose({ actorId: 'offense-1', x: 450, y: 280 });
    local.applyRemoteUpdate(remote.encode());
    const observed = local.snapshot.phases[0]!.poseRegisters['offense-1'];
    local.resolveConflict({
      target: { kind: 'pose', phaseIndex: 0, actorId: 'offense-1' },
      candidateId: observed.candidates[0]!.id,
    });
    local.applyRemoteUpdate(unseen.encode());
    const afterUnseen = local.snapshot.phases[0]!.poseRegisters['offense-1'];
    local.undo();
    const afterUndo = local.snapshot.phases[0]!.poseRegisters['offense-1'];

    const conflicted = Facade.fromUpdate(base, 'slice4-conflicted');
    conflicted.applyRemoteUpdate(local.encode());
    const resolveA = Facade.fromUpdate(conflicted.encode(), 'resolve-a');
    const resolveB = Facade.fromUpdate(conflicted.encode(), 'resolve-b');
    const candidates = conflicted.snapshot.phases[0]!.poseRegisters['offense-1'].candidates;
    resolveA.resolveConflict({ target: { kind: 'pose', phaseIndex: 0, actorId: 'offense-1' }, candidateId: candidates[0]!.id });
    resolveB.resolveConflict({ target: { kind: 'pose', phaseIndex: 0, actorId: 'offense-1' }, candidateId: candidates[1]!.id });
    resolveA.applyRemoteUpdate(resolveB.encode());
    const concurrentResolution = resolveA.snapshot.phases[0]!.poseRegisters['offense-1'];
    seed.close(); local.close(); remote.close(); unseen.close(); conflicted.close(); resolveA.close(); resolveB.close();
    return { afterUnseen, afterUndo, concurrentResolution };
  });

  expect(result.afterUnseen.candidates).toHaveLength(2);
  expect(result.afterUnseen.candidates.some(candidate => candidate.value.x === 450)).toBe(true);
  expect(result.afterUndo.candidates).toHaveLength(3);
  expect(result.afterUndo.candidates.some(candidate => candidate.value.x === 450)).toBe(true);
  expect(result.concurrentResolution.candidates).toHaveLength(2);
});

test('candidate registers contain no hidden LWW resolution pointer', async ({ page }) => {
  const encoded = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    const base = facade.encode();
    const remote = window.replayLabApp!.ReplayLabEditorFacade.fromUpdate(base, 'slice4-no-pointer');
    facade.setActorPose({ actorId: 'offense-1', x: 260, y: 170 });
    remote.setActorPose({ actorId: 'offense-1', x: 390, y: 240 });
    facade.applyRemoteUpdate(remote.encode());
    remote.close();
    return JSON.stringify(facade.replayRoot.toJSON());
  });
  expect(encoded).not.toContain('resolvedCandidateId');
  expect(encoded).not.toContain('activeCandidateId');
});
