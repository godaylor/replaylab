import { expect, test, type Page } from '@playwright/test';

async function openThreePhasePlay(page: Page, name: string, withAction = false) {
  await page.goto(`/app/play/${name}/edit?db=replaylab-${name}-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  await page.waitForFunction(() => Boolean(window.replayLabApp));
  return page.evaluate(action => {
    const facade = window.replayLabApp!.facade;
    facade.addPhaseAfter(1);
    const phases = facade.snapshot.phases;
    let actionId: string | null = null;
    if (action) {
      actionId = facade.createAction({
        actorId: 'offense-1',
        type: 'cut',
        path: { points: [phases[0]!.poses['offense-1'], phases[1]!.poses['offense-1']] },
      });
    }
    return { ids: facade.snapshot.phases.map(phase => phase.id), actionId };
  }, withAction);
}

async function timelineIds(page: Page) {
  return page.locator('[data-phase-id]').evaluateAll(elements =>
    elements.map(element => (element as HTMLElement).dataset.phaseId!)
  );
}

test('keyboard lift/move/drop/cancel restores focus, announces targets, and shows repair without retargeting', async ({ page }) => {
  const setup = await openThreePhasePlay(page, 'slice2b-keyboard', true);
  const moved = page.locator(`[data-phase-id="${setup.ids[1]}"]`);
  await moved.focus();
  await moved.press('Space');
  await expect(page.locator('#live-region')).toContainText('Lifted phase 2');
  await moved.press('ArrowRight');
  await expect(page.locator('#live-region')).toContainText('after phase 3');
  await moved.press('Escape');
  expect(await timelineIds(page)).toEqual(setup.ids);
  await expect(moved).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('Original order restored');

  await moved.press('Space');
  await moved.press('ArrowRight');
  await moved.press('Enter');
  expect(await timelineIds(page)).toEqual([setup.ids[0], setup.ids[2], setup.ids[1]]);
  await expect(page.locator(`[data-phase-id="${setup.ids[1]}"]`)).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('position 3 of 3');

  await page.locator(`[data-phase-id="${setup.ids[0]}"]`).click();
  const action = page.locator(`[data-action-id="${setup.actionId}"]`);
  await expect(action).toContainText('Needs adjacency repair');
  const actionAfter = await page.evaluate(id => {
    const action = window.replayLabApp!.facade.snapshot.actions.find(item => item.id === id)!;
    return { id: action.id, actorId: action.actorId, targetActorId: action.targetActorId, path: action.path };
  }, setup.actionId);
  expect(actionAfter.id).toBe(setup.actionId);
  expect(actionAfter.targetActorId).toBeNull();

  await page.getByRole('button', { name: /Undo/ }).click();
  expect(await timelineIds(page)).toEqual(setup.ids);
  await page.locator(`[data-phase-id="${setup.ids[0]}"]`).click();
  await expect(action).not.toContainText('Needs adjacency repair');
});

test('pointer drag commits the same final order as keyboard and restores moved-card focus', async ({ page }) => {
  const setup = await openThreePhasePlay(page, 'slice2b-pointer');
  const source = page.locator(`[data-phase-id="${setup.ids[1]}"]`);
  const target = page.locator(`[data-phase-id="${setup.ids[2]}"]`);
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Timeline cards are not visible');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 6 });
  await page.mouse.up();

  expect(await timelineIds(page)).toEqual([setup.ids[0], setup.ids[2], setup.ids[1]]);
  await expect(page.locator(`[data-phase-id="${setup.ids[1]}"]`)).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('position 3 of 3');
});
