import { expect, test } from '@playwright/test';

test('production route authors a formation and reloads without losing title, phases, or pose', async ({ page }) => {
  const database = `replaylab-slice1a-reload-${Date.now()}`;
  const url = `/app/play/reload-proof/edit?db=${database}`;

  await page.goto(url);
  await page.locator('[data-app-ready="true"]').waitFor();
  await expect(page.locator('#persistence-status')).toHaveAttribute(
    'data-loaded-from-indexed-db',
    'false'
  );
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '2');
  await expect(page.locator('#document-status')).toHaveAttribute('data-actor-count', '10');
  await expect(page.locator('#court')).toHaveAttribute('data-projection-count', '11');

  const actor = page.locator('[data-actor-id="offense-1"]');
  await actor.focus();
  await actor.press('ArrowRight');
  await actor.press('Shift+ArrowDown');
  await expect(actor).toContainText('x 115 · y 175');

  const title = page.getByLabel('Play name');
  await title.fill('Horns into Spain');
  await title.press('Enter');
  await expect(title).toHaveValue('Horns into Spain');

  await page.getByRole('button', { name: /Add phase/ }).click();
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
  await expect(page.locator('#persistence-status')).toContainText('Saved locally');

  await page.reload();
  await page.locator('[data-app-ready="true"]').waitFor();
  await expect(page.locator('#persistence-status')).toHaveAttribute(
    'data-loaded-from-indexed-db',
    'true'
  );
  await expect(page.getByLabel('Play name')).toHaveValue('Horns into Spain');
  await expect(page.locator('#document-status')).toHaveAttribute('data-phase-count', '3');
  await expect(page.locator('[data-actor-id="offense-1"]')).toContainText('x 115 · y 175');
  await expect(page.locator('#court')).toHaveAttribute('data-projection-count', '11');
});
