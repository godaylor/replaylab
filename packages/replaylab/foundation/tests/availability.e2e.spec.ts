import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('local HTTP editor remains durable while hosted storage fails, then room readiness recovers', async ({ browser, request }) => {
  test.setTimeout(65_000);
  const tempRoot = resolve('../../../tmp/replaylab-availability');
  mkdirSync(tempRoot, { recursive: true });
  const data = mkdtempSync(join(tempRoot, 'isolated-'));
  const preload = join(data, 'storage-stub.mjs');
  // Child-only dependency fault; never contacts Supabase or reads credentials.
  writeFileSync(preload, `let calls = 0; globalThis.fetch = async () => ++calls === 1
    ? new Response(null, {status:503, headers:{'Retry-After':'31'}})
    : Response.json([]);`);
  const origin = 'http://127.0.0.1:32414';
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'server-dist/server-entry.js'], {
    cwd: process.cwd(), windowsHide: true, stdio: 'pipe',
    env: { ...process.env, PORT: '32414', HOST: '127.0.0.1', REPLAYLAB_PUBLIC_ORIGIN: '', REPLAYLAB_SUPABASE_URL: 'https://test.invalid', REPLAYLAB_SUPABASE_SECRET_KEY: 'sb_secret_synthetic', REPLAYLAB_DATA_DIR: data },
  });
  let logs = '';
  child.stdout.on('data', data => { logs += String(data); });
  child.stderr.on('data', data => { logs += String(data); });
  const context = await browser.newContext();
  try {
    await expect.poll(() => request.get(origin + '/healthz').then(r => r.status()).catch(() => 0)).toBe(200);
    expect((await (await request.get(origin + '/healthz')).json()).collaboration).toBe('unavailable');
    expect((await request.get(origin + '/readyz')).status()).toBe(503);
    const post = await request.post(origin + '/api/rooms', { headers: { origin }, data: { update: 'not-applied' } });
    expect(post.status()).toBe(503);
    expect(post.headers()['retry-after']).toBe('30');
    const page = await context.newPage();
    await page.goto(origin + '/app/play/independent-editor/edit?lesson=1');
    await page.locator('.player-controls > summary').click();
    const actor = page.locator('[data-actor-id="offense-1"]');
    await actor.click(); await actor.press('ArrowRight');
    await expect(actor).toContainText('x 285');
    await expect(page.locator('#persistence-status')).toContainText(/Saved in this browser|Сохранено в этом браузере/);
    await page.reload();
    await page.locator('.player-controls > summary').click();
    await expect(actor).toContainText('x 285');
    await expect.poll(() => request.get(origin + '/readyz').then(r => r.status()), { timeout: 40_000 }).toBe(200);
    expect(logs).toContain('collaboration.unavailable');
    expect(logs).toContain('collaboration.ready');
    expect(logs).not.toContain('sb_secret_synthetic');
    writeFileSync('evidence/availability.json', JSON.stringify({ generatedAt: new Date().toISOString(), verdict: 'PASS', checks: ['HTTP before hosted storage', 'readiness 503', 'room API fails closed with Retry-After', 'local edit/reload survives', 'background storage recovery'], network: 'isolated dependency fault; no public database writes' }, null, 2));
  } finally {
    await context.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  }
});
