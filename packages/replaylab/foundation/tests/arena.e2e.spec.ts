import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

test('new example tells a four-step pick and roll, playback is derived, pause selects the visible step, reopen preserves edits', async ({ page }) => {
  const url = `/app/play/arena-${Date.now()}/edit?lesson=1&db=arena-${Date.now()}`;
  await page.goto(url);
  await page.locator('[data-app-ready]').waitFor();
  const initial = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    return { phases: facade.snapshot.phases.map(p => p.id), actions: facade.snapshot.actions.map(a => ({ type: a.type, adjacency: a.adjacency })), pose: facade.snapshot.phases[0]!.poses['offense-1'], bytes: Array.from(facade.encode()) };
  });
  expect(initial.phases).toEqual(['pickroll-setup', 'pickroll-screen', 'pickroll-drive', 'pickroll-pass']);
  expect(initial.actions).toHaveLength(5);
  expect(initial.actions.every(a => a.adjacency === 'valid')).toBe(true);
  expect(initial.pose).toEqual({ x: 280, y: 230 });
  await expect(page.locator('.phase-card')).toHaveText([/5 sets the screen/, /1 drives, 5 rolls/, /1 passes to 5/, /5 receives the ball/]);
  await expect(page.locator('#story-heading')).toHaveText('5 sets the screen');
  await page.getByRole('button', { name: 'Play tactic', exact: true }).click();
  await expect(page.locator('.phase-card[data-phase-id="pickroll-screen"]')).toHaveAttribute('aria-current', 'step', { timeout: 5000 });
  await expect(page.locator('#story-heading')).toHaveText('1 drives, 5 rolls');
  // An editing key during playback pauses first; it must not mutate the old
  // selected keyframe while the court is displaying a later one.
  await page.locator('#court').press('ArrowRight');
  await expect(page.locator('.cue-disclosure')).not.toHaveAttribute('open');
  const after = await page.evaluate(() => ({ bytes: Array.from(window.replayLabApp!.facade.encode()), index: window.replayLabApp!.playbackController!.currentFrame.phaseIndex }));
  expect(after.bytes).toEqual(initial.bytes);
  expect(after.index).toBe(1);
  await page.locator('.player-controls > summary').click();
  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.click(); await actor.press('ArrowRight');
  await expect(actor).toContainText('x 305');
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(actor).toContainText('x 300');
  await actor.press('ArrowRight');
  await expect(page.locator('#persistence-status')).toContainText('Saved');
  await page.reload();
  await page.locator('[data-phase-id="pickroll-screen"]').click();
  await page.locator('.player-controls > summary').click();
  await expect(actor).toContainText('x 305');
});

test('light/dark and RU/EN persist, motion can pause, reduced motion stays still and desktop transport fits', async ({ page }) => {
  await page.goto('/');
  const sceneCanvas = page.locator('.play-showcase canvas');
  const progress = page.locator('.play-showcase .demo-progress i');
  const start = await sceneCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL());
  await expect.poll(() => sceneCanvas.evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL())).not.toBe(start);
  await page.getByRole('button', { name: 'Pause example', exact: true }).click();
  const stopped = await progress.getAttribute('style');
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(progress).toHaveAttribute('style', stopped!);
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Воспроизвести пример' })).toBeVisible();
  const still = await progress.getAttribute('style');
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  await expect(progress).toHaveAttribute('style', still!);
  await page.setViewportSize({ width: 1265, height: 712 });
  await page.getByRole('button', { name: 'Смотреть пример', exact: true }).click();
  await page.locator('[data-app-ready]').waitFor();
  const play = await page.getByRole('button', { name: 'Воспроизвести комбинацию', exact: true }).boundingBox();
  expect(play!.y + play!.height).toBeLessThanOrEqual(712);
});

test('a touch phone remains review only with visible playback and no horizontal overflow', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName === 'firefox', 'Playwright Firefox does not emulate a mobile touch context');
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(`/app/play/arena-phone-${Date.now()}/edit?lesson=1`);
    await page.locator('[data-app-ready]').waitFor();
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expect(page.locator('.mode-notice')).toHaveAttribute('data-responsive-mode', 'mobile');
    await expect(page.locator('.action-tools')).toHaveCount(0);
    await expect(page.locator('.title-field input')).toHaveAttribute('readonly');
    await expect(page.getByRole('button', { name: 'Воспроизвести комбинацию', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('opening a legacy local document with the new example flag never replaces its poses, actions or cues', async ({ page }) => {
  const base = `/app/play/legacy-arena-${Date.now()}/edit?db=legacy-arena-${Date.now()}`;
  await page.goto(base);
  await page.locator('[data-app-ready]').waitFor();
  const before = await page.evaluate(async () => {
    const facade = window.replayLabApp!.facade;
    facade.setActorPose({ actorId: 'offense-1', x: 157, y: 167 });
    await facade.flush();
    return { snapshot: facade.snapshot, cue: facade.getCue(0) };
  });
  await page.goto(base + '&lesson=1');
  await page.locator('[data-app-ready]').waitFor();
  expect(await page.evaluate(() => ({ snapshot: window.replayLabApp!.facade.snapshot, cue: window.replayLabApp!.facade.getCue(0) }))).toEqual(before);
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '2');
});

test('the home scene passes accessibility checks in both themes and uses visible labels as accessible names', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const theme of ['dark', 'light']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Light theme', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Watch example', exact: true })).toBeVisible();
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const axe = (window as typeof window & { axe: { run(): Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> } }).axe;
      return (await axe.run()).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => ({ id: v.id, targets: v.nodes.map(node => node.target) }));
    });
    expect(violations, theme).toEqual([]);
  }
});

for (const locale of ['ru', 'en']) test(`action dialog ${locale}: validation stays open, Tab is contained, a pass updates possession and one undo restores it`, async ({ page }) => {
  await page.goto(`/app/play/dialog-arena-${locale}/edit?db=dialog-arena-${Date.now()}`);
  await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
  await page.locator('[data-actor-id="offense-1"]').click();
  await page.locator('.action-tools > button').last().click();
  const dialog = page.getByRole('dialog');
  const create = dialog.locator('.dialog-actions button').last();
  await dialog.locator('input[type="number"]').first().fill('9999');
  await create.click();
  await expect(dialog.getByRole('alert')).toContainText('820');
  await create.press('Tab');
  await expect(dialog.locator('select').first()).toBeFocused();
  await dialog.locator('select').first().press('Shift+Tab');
  await expect(create).toBeFocused();
  await dialog.locator('select').first().selectOption('pass');
  await dialog.locator('select').nth(1).selectOption('offense-2');
  await dialog.locator('select').nth(2).selectOption('offense-3');
  await create.click();
  await expect(dialog.getByRole('alert')).toContainText(locale === 'ru' ? 'игрок с мячом' : 'ball holder');
  expect(await page.evaluate(() => window.replayLabApp!.facade.snapshot.actions.length)).toBe(0);
  await dialog.locator('select').nth(1).selectOption('offense-1');
  await dialog.locator('select').nth(2).selectOption('offense-2');
  await expect(dialog.locator('.coordinate-fields')).toHaveCount(0);
  await create.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.replayLabApp!.facade.snapshot.phases[1]!.possession.value)).toBe('offense-2');
  await page.locator('.phase-card').nth(1).click();
  await page.getByRole('button', { name: locale === 'ru' ? 'Отменить' : 'Undo', exact: true }).click();
  await expect(page.locator('#court')).toHaveAttribute('data-playback-phase-index', '0');
  expect(await page.evaluate(() => ({ actions: window.replayLabApp!.facade.snapshot.actions.length, holder: window.replayLabApp!.facade.snapshot.phases[1]!.possession.value }))).toEqual({ actions: 0, holder: 'offense-1' });
});

test('recovery import failure is visible in RU/EN, preserves the original bytes and permits the same file to be retried', async ({ page }) => {
  await page.goto(`/app/play/recovery-message/edit?db=recovery-message-${Date.now()}`);
  await page.locator('[data-app-ready]').waitFor();
  const before = await page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()));
  const file = { name: 'damaged.replaylab-recovery.json', mimeType: 'application/json', buffer: Buffer.from('{}') };
  await page.locator('input[type="file"]').setInputFiles(file);
  const alert = page.locator('.file-tools [role="alert"]');
  await expect(alert).toContainText('original play is unchanged');
  await expect(alert).toBeVisible();
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(alert).toContainText('Исходная комбинация не изменена');
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(alert).toBeVisible();
  expect(await page.evaluate(() => Array.from(window.replayLabApp!.facade.encode()))).toEqual(before);
});
