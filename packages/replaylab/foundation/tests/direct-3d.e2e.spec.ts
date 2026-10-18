import { expect, test, type Page } from '@playwright/test';

import { hitTestCourtScene3D, projectCourtPoint3D } from '../src/court-scene-3d';
import type { ActorId, Pose } from '../src/domain';

function playUrl(label: string, query = '') {
  const id = `direct-3d-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `/app/play/${id}/edit?db=${id}${query}`;
}

async function ready(page: Page) {
  await page.locator('[data-app-ready="true"]').waitFor();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
}

async function courtGeometry(page: Page) {
  const canvas = page.locator('#court');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const dimensions = await canvas.evaluate(element => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
  const screen = (pose: Pose, z = 0) => projectCourtPoint3D(dimensions.width, dimensions.height, pose, z);
  const client = (point: Pose) => ({ x: bounds.x + point.x / dimensions.width * bounds.width, y: bounds.y + point.y / dimensions.height * bounds.height });
  return { canvas, screen, client };
}

async function bytes(page: Page) {
  return page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()));
}

async function domain(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.replayLabApp!.facade.snapshot;
    return { poses: snapshot.phases.map(phase => phase.poses), possession: snapshot.phases.map(phase => phase.possession.value), actions: snapshot.actions };
  });
}

async function pose(page: Page, actorId: ActorId, phaseIndex = 0) {
  return page.evaluate(({ actorId, phaseIndex }) => window.replayLabApp!.facade.snapshot.phases[phaseIndex]!.poses[actorId], { actorId, phaseIndex });
}

async function expectPose(page: Page, actorId: ActorId, expected: Pose) {
  await expect.poll(async () => {
    const actual = await pose(page, actorId);
    return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
  }).toBeLessThan(.5);
}

// Grab the visible torso, then translate its ground anchor by a projected
// screen delta. This catches the former jump caused by inverting the torso as
// if it were a point on the floor. It also works at non-unit CSS scale and DPR.
async function beginTorsoDrag(page: Page, actorId: ActorId, destination: Pose) {
  const geometry = await courtGeometry(page);
  const original = await pose(page, actorId);
  const torso = geometry.screen(original, 40);
  const ground = geometry.screen(original);
  const target = geometry.screen(destination);
  const start = geometry.client(torso);
  const end = geometry.client({ x: torso.x + target.x - ground.x, y: torso.y + target.y - ground.y });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 9 });
  return geometry;
}

async function drawFromTorso(page: Page, actorId: ActorId, destination: Pose, targetHeight = 0) {
  const geometry = await courtGeometry(page);
  const start = geometry.client(geometry.screen(await pose(page, actorId), 40));
  const end = geometry.client(geometry.screen(destination, targetHeight));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 9 });
  return geometry;
}

for (const locale of ['ru', 'en'] as const) test(`direct 3D ${locale}: watch example, move a torso, draw from another player, undo, add a step, play and reopen`, async ({ page }) => {
  const ru = locale === 'ru';
  await page.goto('/');
  await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
  await page.getByRole('button', { name: ru ? 'Смотреть пример' : 'Watch example', exact: true }).click();
  await ready(page);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'watch');
  await page.getByRole('button', { name: ru ? 'Редактировать' : 'Edit play', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'edit');
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
  const title = `3D ${locale} ${Date.now()}`;
  await page.getByRole('textbox', { name: ru ? 'Название комбинации' : 'Play name' }).fill(title);
  await page.getByRole('textbox', { name: ru ? 'Название комбинации' : 'Play name' }).press('Enter');

  const untouched = await bytes(page);
  const destination = { x: 230, y: 255 };
  await beginTorsoDrag(page, 'offense-1', destination);
  expect(await bytes(page), 'pointermove must remain a local preview').toEqual(untouched);
  expect(await pose(page, 'offense-1')).toEqual({ x: 280, y: 230 });
  await page.mouse.up();
  await expectPose(page, 'offense-1', destination);
  const afterMove = await domain(page);
  const beforeDraw = await bytes(page);

  await page.getByRole('button', { name: ru ? 'Рывок C' : 'Cut C', exact: true }).click();
  const cutEnd = { x: 555, y: 160 };
  const cutStart = await pose(page, 'offense-4');
  const drawing = await drawFromTorso(page, 'offense-4', cutEnd);
  expect(await bytes(page), 'drawing must not write the path before release').toEqual(beforeDraw);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.replayLabApp!.facade.snapshot.actions.length)).toBe(afterMove.actions.length + 1);
  const afterDraw = await domain(page);
  const action = afterDraw.actions.find(item => !afterMove.actions.some(previous => previous.id === item.id))!;
  expect(action.actorId).toBe('offense-4');
  expect(action.type).toBe('cut');
  expect(action.path.value.points[0]).toEqual(cutStart);
  const actualEnd = drawing.client(drawing.screen(afterDraw.poses[1]!['offense-4']));
  const intendedEnd = drawing.client(drawing.screen(cutEnd));
  // Browser engines quantize pointer events differently. Require accuracy at
  // the visible CSS pixel, rather than an arbitrary fraction of court units.
  expect(Math.hypot(actualEnd.x - intendedEnd.x, actualEnd.y - intendedEnd.y)).toBeLessThanOrEqual(1);
  expect(afterDraw.poses[1]!['offense-4']).toEqual(action.path.value.points.at(-1));
  expect(afterDraw.poses[0]).toEqual(afterMove.poses[0]);
  await page.getByRole('button', { name: ru ? 'Отменить' : 'Undo', exact: true }).click();
  expect(await domain(page), 'one undo restores the action and its destination together').toEqual(afterMove);
  await page.getByRole('button', { name: ru ? 'Повторить' : 'Redo', exact: true }).click();
  expect(await domain(page)).toEqual(afterDraw);

  await page.getByRole('button', { name: ru ? 'Добавить шаг F' : 'Add step F', exact: true }).click();
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '5');
  const saved = await domain(page);
  const beforePlayback = await bytes(page);
  await page.getByRole('button', { name: ru ? 'Воспроизвести комбинацию' : 'Play tactic', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBeGreaterThan(0);
  await page.getByRole('button', { name: ru ? 'Приостановить воспроизведение' : 'Pause playback', exact: true }).click();
  expect(await bytes(page), 'playback is derived even in the editable 3D view').toEqual(beforePlayback);
  await expect(page.locator('#persistence-status')).toContainText(ru ? 'Сохранено' : 'Saved');
  await page.reload();
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  expect(await domain(page)).toEqual(saved);
  await page.getByRole('link', { name: ru ? 'Пятый темп — главная' : 'Fifth Tempo home' }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await ready(page);
  expect(await domain(page)).toEqual(saved);
});

test('3D pass and screen resolve the visible target torso, and one undo restores possession and destination', async ({ page }) => {
  await page.goto(playUrl('targets'));
  await ready(page);
  const before = await domain(page);
  for (const action of [
    { name: 'Pass P', type: 'pass', actor: 'offense-1', target: 'offense-2' },
    { name: 'Screen S', type: 'screen', actor: 'offense-5', target: 'defense-2' },
  ] as const) {
    await page.getByRole('button', { name: action.name, exact: true }).click();
    const targetPose = await pose(page, action.target);
    await drawFromTorso(page, action.actor, targetPose, 40);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.replayLabApp!.facade.snapshot.actions.length)).toBe(1);
    const current = await domain(page);
    expect(current.actions[0]!.actorId).toBe(action.actor);
    expect(current.actions[0]!.targetActorId).toBe(action.target);
    expect(current.actions[0]!.type).toBe(action.type);
    if (action.type === 'pass') {
      expect(current.possession[1]).toBe(action.target);
      expect(current.actions[0]!.path.value.points.at(-1)).toEqual(current.poses[1]![action.target]);
    }
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await domain(page)).toEqual(before);
  }
});

test('3D cut and dribble can finish over another visible body without acquiring a target or snapping to it', async ({ page }) => {
  await page.goto(playUrl('movement-over-body', '&lesson=1'));
  await ready(page);
  const before = await domain(page);
  // Reproduce the public coach exercise: the floor point (560, 330) overlaps the
  // visible body of defender 5 in perspective, despite being a different pose.
  const destination = { x: 560, y: 330 };
  const geometry = await courtGeometry(page);
  const dimensions = await geometry.canvas.evaluate(element => ({ width: (element as HTMLCanvasElement).width, height: (element as HTMLCanvasElement).height }));
  const snapshot = await page.evaluate(() => window.replayLabApp!.facade.snapshot);
  const projected = geometry.screen(destination);
  expect(hitTestCourtScene3D(dimensions.width, dimensions.height, { snapshot, phaseIndex: 0 }, projected.x, projected.y)).toBe('defense-5');
  expect(destination).not.toEqual(before.poses[0]!['defense-5']);
  for (const operation of [
    { name: 'Cut C', type: 'cut', actor: 'offense-5' },
    { name: 'Dribble D', type: 'dribble', actor: 'offense-1' },
  ] as const) {
    await page.getByRole('button', { name: operation.name, exact: true }).click();
    const beforeDraft = await bytes(page);
    const drawing = await drawFromTorso(page, operation.actor, destination);
    expect(await bytes(page)).toEqual(beforeDraft);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.replayLabApp!.facade.snapshot.actions.length)).toBe(before.actions.length + 1);
    const after = await domain(page);
    const action = after.actions.find(item => !before.actions.some(previous => previous.id === item.id))!;
    expect(action.type).toBe(operation.type);
    expect(action.actorId).toBe(operation.actor);
    expect(action.targetActorId).toBeNull();
    expect(action.path.value.points[0]).toEqual(before.poses[0]![operation.actor]);
    expect(after.poses[1]![operation.actor]).toEqual(action.path.value.points.at(-1));
    const actualEnd = drawing.client(drawing.screen(after.poses[1]![operation.actor]));
    const intendedEnd = drawing.client(drawing.screen(destination));
    expect(Math.hypot(actualEnd.x - intendedEnd.x, actualEnd.y - intendedEnd.y)).toBeLessThanOrEqual(1);
    expect(after.poses[0]).toEqual(before.poses[0]);
    expect(after.poses[1]!['defense-5']).toEqual(before.poses[1]!['defense-5']);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect(await domain(page), `${operation.type}: one undo restores action and destination`).toEqual(before);
  }
});

test('unfinished 3D moves and paths cancel on Escape, pointer cancel, lost capture, view, phase and forced-colors changes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(playUrl('cancel'));
  await ready(page);
  const unchanged = await bytes(page);
  const initial = await courtGeometry(page);
  const torso = initial.client(initial.screen(await pose(page, 'offense-1'), 40));
  await page.mouse.click(torso.x, torso.y);
  expect(await bytes(page), 'selecting a torso without moving must not create a pose update').toEqual(unchanged);
  for (const operation of ['move', 'cut'] as const) {
    for (const cancellation of ['escape', 'pointercancel', 'capture', 'view', 'phase', 'colors'] as const) {
      await page.emulateMedia({ forcedColors: 'none' });
      await page.locator('.phase-card').first().click();
      await page.getByRole('button', { name: '3D view', exact: true }).click();
      await page.getByRole('button', { name: operation === 'move' ? 'Select V' : 'Cut C', exact: true }).click();
      const before = await bytes(page);
      const geometry = operation === 'move'
        ? await beginTorsoDrag(page, 'offense-1', { x: 185, y: 190 })
        : await drawFromTorso(page, 'offense-1', { x: 285, y: 190 });
      expect(await bytes(page), `${operation}/${cancellation} draft`).toEqual(before);
      const pointerId = await geometry.canvas.evaluate(element => [1, 2, 3, 4, 5].find(id => element.hasPointerCapture(id)));
      expect(pointerId, `${operation}/${cancellation} owns real pointer capture`).toBeDefined();
      if (cancellation === 'escape') await page.keyboard.press('Escape');
      if (cancellation === 'pointercancel') await geometry.canvas.dispatchEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true });
      if (cancellation === 'capture') await geometry.canvas.evaluate((element, id) => element.releasePointerCapture(id!), pointerId);
      if (cancellation === 'view') await page.getByRole('button', { name: 'Plan view', exact: true }).press('Enter');
      if (cancellation === 'phase') await page.locator('.phase-card').nth(1).press('Enter');
      if (cancellation === 'colors') {
        await page.emulateMedia({ forcedColors: 'active' });
        await expect(geometry.canvas).toHaveAttribute('data-presentation', 'plan');
      }
      await page.mouse.up();
      expect(await bytes(page), `${operation}/${cancellation} must discard without history`).toEqual(before);
    }
  }
});

test('an adjacent phase reorder during 3D drawing cancels the draft without retargeting it or losing the reorder', async ({ page }) => {
  await page.goto(playUrl('adjacency-cancel'));
  await ready(page);
  await page.getByRole('button', { name: 'Add step F', exact: true }).click();
  await page.locator('.phase-card').first().click();
  await page.getByRole('button', { name: 'Cut C', exact: true }).click();
  const originalOrder = await page.evaluate(() => window.replayLabApp!.facade.snapshot.phases.map(phase => phase.id));
  await drawFromTorso(page, 'offense-1', { x: 270, y: 230 });
  // Simulate the same domain command arriving from another editing surface
  // while this pointer owns an unfinished path, without releasing the pointer.
  await page.evaluate(id => window.replayLabApp!.facade.reorderPhase({ phaseId: id!, targetIndex: 2 }), originalOrder[1]);
  await expect(page.locator('.phase-card').nth(1)).toHaveAttribute('data-phase-id', originalOrder[2]!);
  const afterReorder = await bytes(page);
  await page.mouse.up();
  expect(await bytes(page), 'pointer release must not retarget the path to the new adjacent step').toEqual(afterReorder);
  expect(await page.evaluate(() => window.replayLabApp!.facade.snapshot.actions)).toEqual([]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.replayLabApp!.facade.snapshot.phases.map(phase => phase.id))).toEqual(originalOrder);
});

test('selecting an added final step then undoing keeps 3D, presence and playback mounted on a valid remaining step', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(playUrl('undo-final'));
  await ready(page);
  const before = await domain(page);
  await page.getByRole('button', { name: 'Add step F', exact: true }).click();
  await page.locator('.phase-card').last().click();
  await expect(page.locator('#court')).toHaveAttribute('data-playback-phase-index', '2');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '2');
  await expect(page.locator('#court')).toBeVisible();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
  expect(await domain(page)).toEqual(before);
  expect(await page.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBeLessThan(2);
  const beforePlayback = await bytes(page);
  await page.getByRole('button', { name: 'Play tactic', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.replayLabApp!.playbackController!.playing)).toBe(false);
  await expect(page.getByRole('button', { name: 'Play tactic', exact: true })).toBeEnabled();
  expect(await bytes(page)).toEqual(beforePlayback);
  expect(errors).toEqual([]);
});

test('the vertical step rail reorders with Up/Down and pointer drag, cancels cleanly and restores card focus', async ({ page }) => {
  await page.goto(playUrl('vertical-steps'));
  await ready(page);
  await page.getByRole('button', { name: 'Add step F', exact: true }).click();
  const ids = await page.evaluate(() => window.replayLabApp!.facade.snapshot.phases.map(phase => phase.id));
  const order = () => page.locator('.phase-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-phase-id')));
  const moved = page.locator(`.phase-card[data-phase-id="${ids[1]}"]`);
  const last = page.locator(`.phase-card[data-phase-id="${ids[2]}"]`);
  await moved.press('Space');
  await moved.press('ArrowDown');
  await expect(page.locator('#live-region')).toContainText('after step 3');
  await moved.press('Escape');
  expect(await order()).toEqual(ids);
  await expect(moved).toBeFocused();
  await moved.press('Space');
  await moved.press('ArrowDown');
  await moved.press('ArrowUp');
  await moved.press('ArrowDown');
  await moved.press('Enter');
  expect(await order()).toEqual([ids[0], ids[2], ids[1]]);
  await expect(moved).toBeFocused();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await order()).toEqual(ids);
  await moved.scrollIntoViewIfNeeded();
  const source = (await moved.boundingBox())!;
  const target = (await last.boundingBox())!;
  expect(target.y, 'the desktop step rail is actually vertical').toBeGreaterThan(source.y);
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await order()).toEqual([ids[0], ids[2], ids[1]]);
  await expect(moved).toBeFocused();
  await expect(page.locator('#live-region')).toContainText('position 3 of 3');
});

test('view changes preserve edit/watch permission and URL fragments, and a reloaded plan can return to editable 3D', async ({ page }) => {
  await page.goto(playUrl('view-state', '&lesson=1&watch=1') + '#preserve-this-fragment');
  await ready(page);
  const before = await bytes(page);
  await page.getByRole('button', { name: 'Plan view', exact: true }).click();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', 'plan');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'watch');
  expect(new URL(page.url()).hash).toBe('#preserve-this-fragment');
  expect(new URL(page.url()).searchParams.get('view')).toBe('plan');
  await page.getByRole('button', { name: 'Edit play', exact: true }).click();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', 'plan');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'edit');
  expect(new URL(page.url()).hash).toBe('#preserve-this-fragment');
  await page.reload();
  await page.locator('[data-app-ready]').waitFor();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', 'plan');
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'edit');
  expect(new URL(page.url()).searchParams.get('view')).not.toBe('plan');
  expect(new URL(page.url()).hash).toBe('#preserve-this-fragment');
  expect(await bytes(page)).toEqual(before);
});

test('forced colors uses matching plan input coordinates and restores 3D without modifying the document', async ({ page }) => {
  await page.goto(playUrl('forced-colors'));
  await ready(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', 'plan');
  const canvas = page.locator('#court');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 110 / 840, bounds.y + bounds.height * 125 / 460);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 175 / 840, bounds.y + bounds.height * 190 / 460, { steps: 5 });
  await page.mouse.up();
  await expectPose(page, 'offense-1', { x: 175, y: 190 });
  const before = await bytes(page);
  await page.emulateMedia({ forcedColors: 'none' });
  await expect(canvas).toHaveAttribute('data-presentation', '3d');
  expect(await bytes(page)).toEqual(before);
});

test('narrow fine-pointer desktop at DPR 2 retains accurate torso dragging and keyboard undo', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto(playUrl('dpr'));
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await ready(page);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    await expect(page.locator('.mode-notice')).toHaveAttribute('data-responsive-mode', 'desktop');
    const before = await domain(page);
    await beginTorsoDrag(page, 'offense-1', { x: 180, y: 205 });
    await page.mouse.up();
    await expectPose(page, 'offense-1', { x: 180, y: 205 });
    await page.locator('#court').press('ControlOrMeta+z');
    expect(await domain(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('3D storage recovery and touch mobile remain read-only under pointer and keyboard input', async ({ browser, browserName, baseURL, page }) => {
  await page.goto(playUrl('readonly', '&storage=unavailable'));
  await ready(page);
  const before = await bytes(page);
  await beginTorsoDrag(page, 'offense-1', { x: 220, y: 200 });
  await page.mouse.up();
  await page.locator('#court').press('ArrowRight');
  expect(await bytes(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Edit play', exact: true })).toHaveCount(0);
  if (browserName === 'firefox') return; // Firefox has no Playwright mobile/touch emulation.
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const mobile = await context.newPage();
  try {
    await mobile.goto(playUrl('mobile', '&lesson=1'));
    await mobile.getByRole('button', { name: 'EN', exact: true }).tap();
    await ready(mobile);
    const original = await bytes(mobile);
    const geometry = await courtGeometry(mobile);
    const torso = geometry.client(geometry.screen(await pose(mobile, 'offense-1'), 40));
    await mobile.touchscreen.tap(torso.x, torso.y);
    await mobile.locator('#court').press('ArrowRight');
    await expect(mobile.getByRole('button', { name: 'Edit play', exact: true })).toHaveCount(0);
    await expect(mobile.locator('.action-tools')).toHaveCount(0);
    await expect(mobile.locator('.title-field input')).toHaveAttribute('readonly');
    await mobile.getByRole('button', { name: 'Play tactic', exact: true }).tap();
    await expect.poll(() => mobile.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBeGreaterThan(0);
    await mobile.getByRole('button', { name: 'Pause playback', exact: true }).tap();
    expect(await bytes(mobile)).toEqual(original);
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
