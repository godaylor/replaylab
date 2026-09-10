import { expect, test } from '@playwright/test';

test('possession, loose-ball, and path registers preserve unseen and concurrent resolutions through undo', async ({ page }) => {
  await page.goto(`/app/play/slice4-registers/edit?db=slice4-registers-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));

  const result = await page.evaluate(() => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    type TestFacade = NonNullable<typeof window.replayLabApp>['facade'];
    type Target = Parameters<TestFacade['resolveConflict']>[0]['target'];

    const exercise = (
      base: Uint8Array,
      target: Target,
      mutateLocal: (facade: TestFacade) => void,
      mutateRemote: (facade: TestFacade) => void,
      mutateUnseen: (facade: TestFacade) => void,
      project: (facade: TestFacade) => { candidates: Array<{ id: string }> }
    ) => {
      const local = Facade.fromUpdate(base, `local-${crypto.randomUUID()}`);
      const remote = Facade.fromUpdate(base, `remote-${crypto.randomUUID()}`);
      const unseen = Facade.fromUpdate(base, `unseen-${crypto.randomUUID()}`);
      mutateLocal(local);
      mutateRemote(remote);
      mutateUnseen(unseen);
      local.applyRemoteUpdate(remote.encode());
      const conflictUpdate = local.encode();
      const observed = project(local).candidates;
      local.resolveConflict({ target, candidateId: observed[0]!.id });
      local.applyRemoteUpdate(unseen.encode());
      const afterUnseen = project(local).candidates.length;
      local.undo();
      const afterUndo = project(local).candidates.length;

      const resolutionA = Facade.fromUpdate(conflictUpdate, `resolution-a-${crypto.randomUUID()}`);
      const resolutionB = Facade.fromUpdate(conflictUpdate, `resolution-b-${crypto.randomUUID()}`);
      const resolutionCandidates = project(resolutionA).candidates;
      resolutionA.resolveConflict({ target, candidateId: resolutionCandidates[0]!.id });
      resolutionB.resolveConflict({ target, candidateId: resolutionCandidates[1]!.id });
      resolutionA.applyRemoteUpdate(resolutionB.encode());
      const concurrentResolution = project(resolutionA).candidates.length;
      local.close(); remote.close(); unseen.close(); resolutionA.close(); resolutionB.close();
      return { afterUnseen, afterUndo, concurrentResolution };
    };

    const possessionSeed = Facade.createMemory('possession-seed');
    const possession = exercise(
      possessionSeed.encode(),
      { kind: 'possession', phaseIndex: 0 },
      facade => facade.setPossession({ value: 'offense-2' }),
      facade => facade.setPossession({ value: 'offense-3' }),
      facade => facade.setPossession({ value: 'offense-4' }),
      facade => facade.snapshot.phases[0]!.possession
    );
    possessionSeed.close();

    const looseSeed = Facade.createMemory('loose-seed');
    looseSeed.setPossession({ value: 'loose', looseBallPose: { x: 300, y: 200 } });
    const loose = exercise(
      looseSeed.encode(),
      { kind: 'loose-ball', phaseIndex: 0 },
      facade => facade.setLooseBallPose({ x: 280, y: 190 }),
      facade => facade.setLooseBallPose({ x: 390, y: 240 }),
      facade => facade.setLooseBallPose({ x: 500, y: 300 }),
      facade => facade.snapshot.phases[0]!.looseBallPose!
    );
    looseSeed.close();

    const pathSeed = Facade.createMemory('path-seed');
    const phase = pathSeed.snapshot.phases[0]!;
    const actionId = pathSeed.createAction({
      actorId: 'offense-1',
      type: 'cut',
      path: { points: [phase.poses['offense-1'], { x: 250, y: 170 }] },
    });
    const path = exercise(
      pathSeed.encode(),
      { kind: 'action-path', actionId },
      facade => facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 320, y: 200 }] } }),
      facade => facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 420, y: 250 }] } }),
      facade => facade.replaceActionPath({ actionId, path: { points: [phase.poses['offense-1'], { x: 520, y: 300 }] } }),
      facade => facade.snapshot.actions.find(action => action.id === actionId)!.path
    );
    pathSeed.close();
    return { possession, loose, path };
  });

  for (const register of Object.values(result)) {
    expect(register.afterUnseen).toBe(2);
    expect(register.afterUndo).toBe(3);
    expect(register.concurrentResolution).toBe(2);
  }
});
