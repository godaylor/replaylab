import { expect, test } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test('home creates independent plays, reopens real edits and supports mobile review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a play', exact: true }).click();
  await expect(page.locator('[data-app-ready]')).toBeVisible();
  const first = page.url();
  await page.getByRole('textbox', { name: 'Play name' }).fill('Horns into Spain');
  await page.getByRole('textbox', { name: 'Play name' }).press('Enter');
  await page.getByRole('link', { name: 'Fifth Tempo home' }).click();
  await page.getByRole('link', { name: /Horns into Spain/ }).click();
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveValue('Horns into Spain');
  await page.getByRole('link', { name: 'Fifth Tempo home' }).click();
  await page.getByRole('button', { name: 'Create a play', exact: true }).click();
  expect(page.url()).not.toBe(first);
  await expect(page.getByRole('textbox', { name: 'Play name' })).toHaveValue('Untitled play');
  await page.goto('/');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'evidence/home-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'evidence/home-desktop.png', fullPage: true });
});

test('browser creates durable private room, separate writer and reader join the exact play', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const root = resolve('.');
  mkdirSync(resolve(root, '../../../tmp/product-rooms'), { recursive: true });
  const data = mkdtempSync(resolve(root, '../../../tmp/product-rooms/room-'));
  const origin = 'http://127.0.0.1:32414';
  const child = spawn(process.execPath, [resolve(root, 'server-dist/server-entry.js')], { cwd: root, windowsHide: true, stdio: 'pipe', env: { ...process.env, PORT: '32414', HOST: '127.0.0.1', REPLAYLAB_PUBLIC_ORIGIN: '', REPLAYLAB_SUPABASE_URL: '', REPLAYLAB_SUPABASE_SECRET_KEY: '', REPLAYLAB_DATA_DIR: data } });
  const a = await browser.newContext({ locale: 'en' });
  const b = await browser.newContext();
  const reader = await browser.newContext();
  try {
    await expect.poll(() => request.get(origin + '/healthz').then(r => r.status()).catch(() => 0)).toBe(200);
    const html = await (await request.get(origin)).text();
    const cssPath = html.match(/href="(\/assets\/[^\"]+\.css)"/)![1]!;
    const css = await (await request.get(origin + cssPath)).text();
    const materials = [...css.matchAll(/url\((\/assets\/[^)]+\.(?:jpg|ttf))\)/g)].map(match => match[1]!);
    expect(materials.some(path => path.endsWith('.jpg'))).toBe(true);
    expect(materials.some(path => path.endsWith('.ttf'))).toBe(true);
    for (const path of new Set(materials)) {
      const asset = await request.get(origin + path);
      expect(asset.status(), path).toBe(200);
      expect(asset.headers()['content-type']).toBe(path.endsWith('.jpg') ? 'image/jpeg' : 'font/ttf');
    }
    const fontLicense = await request.get(origin + '/legal/OFL-Oswald.txt');
    expect(fontLicense.status()).toBe(200);
    expect(await fontLicense.text()).toContain('SIL OPEN FONT LICENSE');
    expect((await request.post(origin + '/api/rooms', { data: { update: 'AA==' }, headers: { Origin: 'https://foreign.example' } })).status()).toBe(403);
    expect((await request.post(origin + '/api/rooms', { data: { update: 'AA==' }, headers: { Origin: origin } })).status()).toBe(400);
    const page = await a.newPage();
    await page.goto(origin);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('button', { name: 'Create a play', exact: true }).click();
    await page.getByRole('textbox', { name: 'Play name' }).fill('Shared Spain pick and roll');
    await page.getByRole('textbox', { name: 'Play name' }).press('Enter');
    await page.evaluate(() => window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 345, y: 210 }));
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await page.getByRole('button', { name: 'Create collaborative room', exact: true }).click();
    const write = await page.getByLabel('Can edit', { exact: true }).inputValue();
    const read = await page.getByLabel('Can view', { exact: true }).inputValue();
    expect(write).not.toBe(read);
    await page.getByRole('link', { name: 'Open collaborative room' }).click();
    const peer = await b.newPage();
    await peer.goto(write);
    await peer.waitForFunction(() => window.replayLabApp?.facade.snapshot.title === 'Shared Spain pick and roll');
    await expect.poll(() => peer.evaluate(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-1'].x)).toBe(345);
    await page.evaluate(() => window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 350, y: 210 }));
    await expect.poll(() => peer.evaluate(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-1'].x)).toBe(350);
    const view = await reader.newPage();
    await view.goto(read);
    await view.waitForFunction(() => window.replayLabApp?.facade.snapshot.title === 'Shared Spain pick and roll');
    expect(await view.locator('.title-field input').getAttribute('readonly')).not.toBeNull();
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('replaylab:recent:')).map(k => localStorage.getItem(k)).join(''))).not.toContain('cap=');
  } finally {
    await Promise.all([a.close(), b.close(), reader.close()]);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }
});
