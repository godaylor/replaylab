import { expect, test, type Locator, type Page } from '@playwright/test';

const widths = [320, 390, 820, 1280, 1440];

async function expectReadable(content: Locator) {
  await expect(content).toBeVisible();
  // Visibility alone accepts opacity: 0, which can strand content in an entrance animation.
  await expect.poll(() => content.evaluate(element => {
    let opacity = 1;
    for (let current: Element | null = element; current; current = current.parentElement) {
      opacity *= Number(getComputedStyle(current).opacity);
    }
    return opacity;
  })).toBeGreaterThan(0.95);
}

async function expectReflow(page: Page, label: string) {
  await expect.poll(() => page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  })).then(size => size.document <= size.viewport), { message: label }).toBe(true);
}

async function expectActionable(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expectReadable(control);
  await control.click({ trial: true });
  expect(await control.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= -1 && bounds.right <= innerWidth + 1;
  }), 'The whole control is reachable without horizontal page scrolling').toBe(true);
}

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, 'The control must be reachable by Tab').toBeFocused();
}

async function expectKeyboardFocus(target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  expect(await target.evaluate(element => {
    const style = getComputedStyle(element);
    return element.matches(':focus-visible') && (
      (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0)
      || style.boxShadow !== 'none'
    );
  }), 'Keyboard focus has a visible indicator').toBe(true);
}

for (const locale of ['ru', 'en'] as const) test(`visual polish ${locale}: home and editor stay readable and usable from 320 to 1440 pixels`, async ({ page }) => {
  test.setTimeout(60_000);
  const ru = locale === 'ru';
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
  await expect(page.locator('.home-story .eyebrow')).toHaveText(ru ? 'Для баскетбольного тренера' : 'For basketball coaches');
  const watch = page.getByRole('button', { name: ru ? 'Смотреть пример' : 'Watch example', exact: true });
  const create = page.getByRole('button', { name: ru ? 'Создать комбинацию' : 'Create a play', exact: true });
  const room = page.getByRole('textbox', { name: ru ? 'Ссылка на комнату' : 'Room link', exact: true });

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectReadable(page.getByRole('heading', { level: 1 }));
    await expectReadable(page.locator('.home-description'));
    await expectActionable(watch);
    await expectActionable(create);
    await expectActionable(room);
    await expectReflow(page, `${locale} home at ${width}px`);
  }

  await watch.click();
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: ru ? 'Редактировать' : 'Edit play', exact: true }).click();
  const title = page.getByRole('textbox', { name: ru ? 'Название комбинации' : 'Play name', exact: true });
  const play = page.getByRole('button', { name: ru ? 'Воспроизвести комбинацию' : 'Play tactic', exact: true });
  const add = page.getByRole('button', { name: ru ? 'Добавить шаг F' : 'Add step F', exact: true });
  const name = ru ? 'Проверка оформления · движение к кольцу' : 'Visual check · movement to the rim';
  await title.fill(name);
  await title.press('Tab');

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
    await expectReadable(page.locator('#court'));
    await expectActionable(title);
    await expect(title).toBeEditable();
    await expect(title).toHaveValue(name);
    await expectActionable(play);
    await expectActionable(add);
    if (width === widths[0] || width === widths.at(-1)) {
      await add.click();
      await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '5');
      await page.getByRole('button', { name: ru ? 'Отменить' : 'Undo', exact: true }).click();
      await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '4');
    }
    await expectReflow(page, `${locale} editor at ${width}px`);
  }
  expect(errors).toEqual([]);
});

test('reduced motion preserves RU/EN keyboard navigation, form errors and the route into editing', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const locale of ['ru', 'en'] as const) {
    const ru = locale === 'ru';
    await page.goto('/');
    await page.getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
    await page.reload();
    await expectReadable(page.getByRole('heading', { level: 1 }));
    await expect(page.getByRole('button', { name: ru ? 'Воспроизвести пример' : 'Play example', exact: true })).toBeVisible();
    const progress = page.locator('.play-showcase .demo-progress i');
    const still = await progress.getAttribute('style');
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);

    const library = page.getByRole('link', { name: ru ? 'Мои комбинации' : 'My plays' });
    await tabTo(page, library);
    await expectKeyboardFocus(library);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#plays$/);
    await expect(page.getByRole('heading', { name: ru ? 'Недавние комбинации' : 'Recent plays', exact: true })).toBeInViewport();

    const room = page.getByRole('textbox', { name: ru ? 'Ссылка на комнату' : 'Room link', exact: true });
    await tabTo(page, room);
    await expectKeyboardFocus(room);
    await page.keyboard.type('not-a-room');
    await page.keyboard.press('Tab');
    const open = page.getByRole('button', { name: ru ? 'Открыть комнату' : 'Open room', exact: true });
    await expectKeyboardFocus(open);
    await page.keyboard.press('Enter');
    await expect(room).toHaveAttribute('aria-invalid', 'true');
    await expectKeyboardFocus(room);
    await expectReadable(page.getByRole('alert'));
    await expect(page.getByRole('alert')).toHaveText(ru ? 'Вставьте полную ссылку на комбинацию с этого сайта.' : 'Paste a complete play link from this site.');
    await expect(room).toHaveAccessibleDescription(new RegExp(ru ? 'Вставьте полную ссылку' : 'Paste a complete play link'));
    await expect(progress).toHaveAttribute('style', still!);

    const watch = page.getByRole('button', { name: ru ? 'Смотреть пример' : 'Watch example', exact: true });
    await tabTo(page, watch);
    await expectKeyboardFocus(watch);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    const edit = page.getByRole('button', { name: ru ? 'Редактировать' : 'Edit play', exact: true });
    await tabTo(page, edit);
    await expectKeyboardFocus(edit);
    await page.keyboard.press('Enter');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-workbench-mode', 'edit');
    await expectReadable(page.locator('#court'));
    await expect(page.locator('#court')).toHaveAttribute('data-presentation', '3d');
    await expect(page.getByRole('textbox', { name: ru ? 'Название комбинации' : 'Play name', exact: true })).toBeEditable();
    await expectReflow(page, `${locale} reduced-motion editor`);
  }
});
