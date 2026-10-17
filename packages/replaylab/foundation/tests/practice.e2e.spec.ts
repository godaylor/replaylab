import { expect, test } from '@playwright/test';

test('isolated practice: move, draw, play, undo, archive, export, reopen and guide focus', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to use', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveValue('Pick & roll · create the opening');
  await page.getByRole('button', { name: 'Plan view', exact: true }).click();
  const practiceUrl = page.url();
  const guide = page.getByRole('region', { name: 'Step-by-step guide' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(guide.getByRole('heading')).toBeFocused();
  await guide.getByRole('button', { name: 'Go to control' }).click();
  const actor = page.locator('[data-actor-id="offense-1"]');
  await expect(actor).toBeFocused();
  await actor.press('ArrowRight');
  await expect(actor).toContainText('x 285');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Cut C', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cut C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const court = page.locator('#court');
  await court.scrollIntoViewIfNeeded();
  const box = (await court.boundingBox())!;
  await page.mouse.move(box.x + box.width * 285 / 840, box.y + box.height * 230 / 460);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 280 / 840, box.y + box.height * 220 / 460, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-action-id]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Play tactic', exact: true }).click();
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: /Delete action Cut/ }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(1);
  await expect(actor).toBeFocused();
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.locator('[data-action-id]')).toHaveCount(2);
  const downloaded = page.waitForEvent('download');
  await page.locator('.file-tools > summary').click();
  await page.getByRole('button', { name: 'Recovery file', exact: true }).click();
  const file = info.outputPath('practice.replaylab-recovery.json');
  await (await downloaded).saveAs(file);
  await guide.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'How to use', exact: true })).toBeFocused();
  await page.reload();
  await page.locator('.player-controls > summary').click();
  await expect(guide).toHaveCount(0);
  await expect(actor).toContainText('x 285');
  await page.getByRole('link', { name: 'Fifth Tempo home' }).click();
  await page.getByRole('link', { name: /Pick & roll/ }).click();
  await page.locator('.player-controls > summary').click();
  await expect(actor).toContainText('x 285');
  await page.goBack();
  await page.goForward();
  if (await page.locator('.player-controls').getAttribute('open') === null) await page.locator('.player-controls > summary').click();
  await expect(actor).toContainText('x 285');
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page).not.toHaveURL(practiceUrl);
  await page.locator('.player-controls > summary').click();
  await expect(actor).toContainText('x 285');
  await expect(page.locator('[data-action-id]')).toHaveCount(2);
  await page.getByRole('button', { name: 'How to use', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveValue('Pick & roll · create the opening');
  await page.locator('.player-controls > summary').click();
  await expect(actor).toContainText('x 280');
  await page.getByRole('region', { name: 'Step-by-step guide' }).getByRole('heading').press('Escape');
  await expect(page.getByRole('button', { name: 'How to use', exact: true })).toBeFocused();
});

test('RU and EN home, editor and guide reflow across compact and wide desktop viewports', async ({ page }) => {
  test.setTimeout(120_000);
  const widths = [320, 360, 390, 430, 649, 651, 768, 849, 851, 1024, 1179, 1181, 1280, 1440, 1920, 2560, 3840, 5120, 7680];
  for (const language of ['RU', 'EN']) {
    await page.goto('/');
    await page.getByRole('button', { name: language, exact: true }).click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home ${language} ${width}`).toBe(true);
    }
    await page.getByRole('button', { name: language === 'RU' ? 'Как пользоваться' : 'How to use', exact: true }).click();
    await expect(page.locator('[data-app-ready]')).toBeVisible();
    await page.locator('.player-controls > summary').click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `editor ${language} ${width}`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'evidence/v3-guide-desktop.png', fullPage: true });
});

test('touch mobile guide supports review and reduced motion; tablet guide handles unavailable drawing controls', async ({ browser, browserName, baseURL }) => {
  test.skip(browserName === 'firefox', 'Playwright Firefox does not emulate a mobile touch context');
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 320, height: 800 } });
  await context.addInitScript(() => localStorage.setItem('replaylab:locale', 'en'));
  const page = await context.newPage();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/app/play/practice-touch-guide-${Date.now()}/edit?lesson=1&tour=1`);
    await page.locator('[data-app-ready]').waitFor();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await expect(page.locator('.action-tools')).toHaveCount(0);
    await expect(page.locator('.title-field input')).toHaveAttribute('readonly');
    await page.getByRole('region', { name: 'Step-by-step guide' }).getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Play tactic', exact: true }).click();
    await page.screenshot({ path: 'evidence/v3-mobile-review.png', fullPage: true });
    await page.setViewportSize({ width: 768, height: 900 });
    const guide = page.getByRole('region', { name: 'Step-by-step guide' });
    await guide.getByRole('button', { name: 'Next', exact: true }).click();
    await guide.getByRole('button', { name: 'Go to control' }).click();
    await expect(guide.getByRole('status')).toContainText('unavailable');
    await guide.getByRole('button', { name: 'Skip', exact: true }).click();
  } finally { await context.close(); }
});

test('touch selection disambiguates overlapping players; enlarged text and private invite errors stay usable', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Playwright Firefox does not emulate a touch context');
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'EN', exact: true }).tap();
    await page.getByRole('button', { name: 'Watch example', exact: true }).tap();
    await expect(page.locator('[data-app-ready]')).toBeVisible();
    await page.getByRole('button', { name: 'Edit play', exact: true }).tap();
    await page.locator('.player-controls > summary').tap();
    // Isolated synthetic overlap fixture; the UI must offer an unambiguous target.
    await page.evaluate(() => window.replayLabApp!.facade.setActorPose({ actorId: 'defense-1', x: 110, y: 125 }));
    const defender = page.locator('[data-actor-id="defense-1"]');
    await defender.tap();
    await expect(defender).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-actor-id="offense-1"]').tap();
    await expect(defender).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Invite', exact: true }).tap();
    await page.route('**/api/rooms', route => route.fulfill({ status: 503 }));
    await page.getByRole('button', { name: 'Create collaborative room', exact: true }).tap();
    await expect(page.getByRole('dialog')).toContainText('Your local play is safe');
    await page.getByRole('dialog').press('Escape');
    await expect(page.getByRole('button', { name: 'Invite', exact: true })).toBeFocused();
    await expect(defender).toContainText('x 110');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const enlarged = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= innerWidth, overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => el.className) }));
    expect(enlarged.fits, JSON.stringify(enlarged.overflow)).toBe(true);
    await expect(page.getByRole('button', { name: 'How to use', exact: true })).toBeVisible();
  } finally { await context.close(); }
});
