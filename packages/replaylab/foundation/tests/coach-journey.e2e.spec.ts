import { test, expect } from '@playwright/test';
import { capabilityFragment } from '../src/sync-protocol';

for (const locale of ['ru', 'en'] as const) test(`coach journey ${locale}: example, move, draw, phase, play, reopen and localized room failure`, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
  await page.getByRole('button', { name: locale === 'ru' ? 'Открыть пример' : 'Open example', exact: true }).click();
  await page.locator('[data-app-ready]').waitFor();
  const actor = page.locator('[data-actor-id="offense-1"]');
  const title = locale === 'ru' ? 'Учебная комбинация' : 'Practice play';
  await expect(page.getByRole('textbox', { name: locale === 'ru' ? 'Название комбинации' : 'Play name' })).toHaveValue(title);
  await actor.click(); await actor.press('ArrowRight');
  await expect(actor).toContainText('x 115');
  await page.getByRole('button', { name: locale === 'ru' ? 'Рывок C' : 'Cut C', exact: true }).click();
  const box = (await page.locator('#court').boundingBox())!;
  await page.mouse.move(box.x + box.width * 115 / 840, box.y + box.height * 125 / 460);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 280 / 840, box.y + box.height * 200 / 460, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-action-id]')).toHaveCount(2);
  await expect(page.locator('.drawing-help')).toContainText(locale === 'ru' ? 'Действие готово' : 'Action ready');
  await page.getByRole('button', { name: locale === 'ru' ? 'Добавить фазу F' : 'Add phase F', exact: true }).click();
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
  await page.getByRole('button', { name: locale === 'ru' ? 'Воспроизвести комбинацию' : 'Play tactic', exact: true }).click();
  expect(await page.evaluate(() => window.replayLabApp!.playbackController!.currentFrame.phaseIndex)).toBe(0);
  await page.getByRole('button', { name: locale === 'ru' ? 'Приостановить воспроизведение' : 'Pause playback', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(actor).toContainText('x 115');
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
  const fileSummary = page.locator('.file-tools > summary');
  await fileSummary.click();
  await fileSummary.press('Escape');
  await expect(page.locator('.file-tools')).not.toHaveAttribute('open');
  await expect(fileSummary).toBeFocused();
  await page.getByRole('link', { name: locale === 'ru' ? 'Главная ReplayLab' : 'ReplayLab home' }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(actor).toContainText('x 115');
  // A real browser disconnect also covers requests made through a service
  // worker; route interception differs between browser engines.
  await page.context().setOffline(true);
  await page.getByRole('button', { name: locale === 'ru' ? 'Пригласить' : 'Invite', exact: true }).click();
  await page.getByRole('button', { name: locale === 'ru' ? 'Создать совместную комнату' : 'Create collaborative room', exact: true }).click();
  await expect(page.locator('.share-dialog [role="status"]')).toContainText(locale === 'ru' ? 'Не удалось связаться' : 'Could not reach');
  await expect(page.locator('.share-dialog')).not.toContainText('Failed to fetch');
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('button', { name: locale === 'ru' ? 'Пригласить' : 'Invite', exact: true })).toBeFocused();
  await page.context().setOffline(false);
});

test('coach layout fits the initial desktop view; RU/EN reflow and browser shortcuts remain available', async ({ page }) => {
  await page.goto('/app/play/coach-layout/edit?lesson=1');
  await page.locator('[data-app-ready]').waitFor();
  const before = await page.locator('#document-status').getAttribute('data-phase-count');
  await page.locator('#court').focus();
  await page.keyboard.press('Control+f');
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', before!);
  await page.keyboard.press('Escape');
  await page.locator('#court').focus();
  await page.locator('#court').dispatchEvent('keydown', { key: 'а', code: 'KeyF', bubbles: true });
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', String(Number(before) + 1));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const court = (await page.locator('#court').boundingBox())!;
  const timeline = (await page.locator('.timeline').boundingBox())!;
  expect(court.y).toBeLessThan(350);
  expect(timeline.y + timeline.height).toBeLessThanOrEqual(1000);
  for (const locale of ['RU', 'EN']) {
    await page.getByRole('button', { name: locale, exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1180, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${locale} ${width}`).toBeLessThanOrEqual(width);
    }
  }
});

test('first room visit without a server shows a localized retry screen and never a fabricated play', async ({ page }) => {
  const fragment = capabilityFragment({ roomId: 'unavailable-room', endpoint: 'ws://127.0.0.1:32419', access: 'write', capability: 'synthetic-'.repeat(8) });
  await page.goto(`/app/play/unavailable-room/edit?db=unavailable-${Date.now()}${fragment}`);
  await page.locator('[data-app-ready]').waitFor();
  await expect(page.getByRole('heading', { name: 'Could not open the shared room' })).toBeVisible();
  await expect(page.locator('#court')).toHaveCount(0);
  await expect(page.locator('#persistence-status')).toHaveCount(0);
  await page.getByRole('button', { name: 'RU', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Не удалось открыть общую комнату' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible();
  await page.getByRole('link', { name: 'Открыть локальные комбинации' }).click();
  await expect(page.locator('.home-intro')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});
