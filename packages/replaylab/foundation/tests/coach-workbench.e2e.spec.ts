import { expect, test } from '@playwright/test';

function playUrl(label: string, query = '') {
  const id = `workbench-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `/app/play/${id}/edit?db=${id}${query}`;
}

test('a compact fine-pointer desktop keeps full authoring and visible undo at 700, 900 and 1024 pixels', async ({ page }) => {
  await page.goto(playUrl('compact'));
  await page.locator('[data-app-ready]').waitFor();
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true);

  for (const width of [1024, 900, 700]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('.mode-notice')).toHaveAttribute('data-responsive-mode', 'desktop');
    await expect(page.getByRole('toolbar', { name: 'Court tools' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Play name' })).toBeEditable();
    const add = page.locator('.timeline > .section-heading-row button');
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px reflow`).toBe(true);
  }
});

test('drawing starts from the touched player rather than the old selection and one undo restores action and destination', async ({ page }) => {
  await page.goto(playUrl('draw-origin'));
  await page.locator('[data-app-ready]').waitFor();
  const before = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    return { poses: facade.snapshot.phases.map(phase => phase.poses), actions: facade.snapshot.actions };
  });
  await page.locator('[data-actor-id="offense-1"]').click();
  await expect(page.locator('[data-actor-id="offense-1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Cut C', exact: true }).click();
  const court = page.locator('#court');
  await court.scrollIntoViewIfNeeded();
  const bounds = (await court.boundingBox())!;
  const origin = before.poses[0]!['offense-5'];
  const destination = { x: 390, y: 265 };
  const point = ({ x, y }: { x: number; y: number }) => ({ x: bounds.x + x / 840 * bounds.width, y: bounds.y + y / 460 * bounds.height });
  await page.mouse.move(point(origin).x, point(origin).y);
  await page.mouse.down();
  await page.mouse.move(point(destination).x, point(destination).y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => page.evaluate(() => window.replayLabApp!.facade.snapshot.actions.length)).toBe(before.actions.length + 1);
  const after = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    return { poses: facade.snapshot.phases.map(phase => phase.poses), action: facade.snapshot.actions.at(-1)! };
  });
  expect(after.action.actorId).toBe('offense-5');
  expect(after.action.path.value.points[0]).toEqual(origin);
  expect(after.poses[1]!['offense-5'].x).toBeCloseTo(destination.x, 0);
  expect(after.poses[1]!['offense-5'].y).toBeCloseTo(destination.y, 0);
  expect(after.poses[0]).toEqual(before.poses[0]);
  expect(after.poses[1]!['offense-1']).toEqual(before.poses[1]!['offense-1']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => ({ poses: window.replayLabApp!.facade.snapshot.phases.map(phase => phase.poses), actions: window.replayLabApp!.facade.snapshot.actions }))).toEqual(before);
});

for (const locale of ['ru', 'en']) test(`watch-to-edit ${locale}: 3D playback is derived and editing restores the plan view`, async ({ page }) => {
  await page.goto(playUrl(`watch-${locale}`, '&lesson=1&watch=1'));
  await page.locator('[data-app-ready]').waitFor();
  await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'watch');
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
  const before = await page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()));
  await page.getByRole('button', { name: locale === 'ru' ? 'Воспроизвести комбинацию' : 'Play tactic', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBeGreaterThan(0);
  await page.getByRole('button', { name: locale === 'ru' ? 'Приостановить воспроизведение' : 'Pause playback', exact: true }).click();
  await page.locator('#court').press('ArrowRight');
  expect(await page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()))).toEqual(before);
  await page.getByRole('group', { name: locale === 'ru' ? 'Режим площадки' : 'Court mode' }).getByRole('button', { name: locale === 'ru' ? 'Редактировать' : 'Edit play', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'edit');
  await expect(page.locator('#court')).toHaveAttribute('data-presentation', 'plan');
  await expect(page.getByRole('toolbar', { name: locale === 'ru' ? 'Инструменты площадки' : 'Court tools' })).toBeVisible();
  await expect(page.locator('.timeline > .section-heading-row button')).toBeEnabled();
  expect(await page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()))).toEqual(before);
});
