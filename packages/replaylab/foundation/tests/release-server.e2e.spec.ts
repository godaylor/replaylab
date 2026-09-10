import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { provisionRoom, loadRooms } from '../src/room-storage';
import { capabilityFragment } from '../src/sync-protocol';
import { ReplaySyncRoom, ReplaySyncWebSocketServer } from '../src/sync-server';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = resolve(root, '../../../tmp/replaylab-release-tests');
function temporary() { mkdirSync(tempRoot, { recursive: true }); return mkdtempSync(join(tempRoot, 'room-')); }
function cleanup(path: string) {
  if (!resolve(path).startsWith(tempRoot + sep)) throw new Error('Unsafe test cleanup');
  rmSync(path, { recursive: true, force: true });
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
}

test('durable journal restores after abrupt process restart and production HTTP boundary preserves collaboration', async ({ browser, request }) => {
  test.setTimeout(60_000);
  const data = temporary();
  const tokens = provisionRoom(data, 'restart');
  let child: ChildProcess | undefined;
  const origin = 'http://127.0.0.1:32412';
  const boot = async () => {
    child = spawn(process.execPath, [join(root, 'server-dist/server-entry.js')], {
      cwd: root, windowsHide: true, stdio: 'pipe',
      env: { ...process.env, PORT: '32412', HOST: '127.0.0.1', REPLAYLAB_PUBLIC_ORIGIN: '', REPLAYLAB_DATA_DIR: data },
    });
    let error = '';
    child.stderr?.on('data', chunk => { error += String(chunk); });
    await expect.poll(async () => {
      if (child?.exitCode !== null) throw new Error(error || 'Server exited before readiness');
      return request.get(origin + '/healthz').then(response => response.status()).catch(() => 0);
    }).toBe(200);
  };
  const a = await browser.newContext();
  const b = await browser.newContext();
  const read = await browser.newContext();
  try {
    await boot();
    for (const path of ['/bundle-closure.json', '/server-dist/server-entry.js', '/.replaylab-data/restart.room.json', '/assets/not-found.js.map']) expect((await request.get(origin + path)).status()).toBe(404);
    expect((await request.get(origin + '/sw.js')).headers()['cache-control']).toBe('no-store');
    const response = await request.get(origin + '/');
    expect(response.headers()['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
    const writeUrl = `${origin}/app/play/restart/edit` + capabilityFragment({ endpoint: origin.replace('http', 'ws') + '/sync', roomId: 'restart', capability: tokens.writeToken, access: 'write' });
    const pageA = await a.newPage();
    const browserErrors: string[] = [];
    pageA.on('pageerror', error => browserErrors.push(error.message));
    pageA.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await pageA.goto(writeUrl);
    await pageA.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced', undefined, { timeout: 15_000 }).catch(error => { throw new Error(JSON.stringify(browserErrors), { cause: error }); });
    const pageB = await b.newPage();
    await pageB.goto(writeUrl);
    await pageB.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced');
    await pageA.evaluate(() => window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 345, y: 210 }));
    await pageB.waitForFunction(() => window.replayLabApp!.facade.snapshot.phases[0]!.poses['offense-1'].x === 345);
    expect(existsSync(join(data, 'restart.updates.jsonl'))).toBe(true);
    expect(readFileSync(join(data, 'restart.room.json'), 'utf8')).not.toContain(tokens.writeToken);
    await stop(child);
    child = undefined;
    await a.close(); await b.close();
    await boot();
    const pageRead = await read.newPage();
    pageRead.on('pageerror', error => browserErrors.push(error.message));
    pageRead.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await pageRead.goto(`${origin}/app/play/restart/edit` + capabilityFragment({ endpoint: origin.replace('http', 'ws') + '/sync', roomId: 'restart', capability: tokens.readToken, access: 'read' }));
    await pageRead.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced');
    await expect(pageRead.locator('[data-actor-id="offense-1"]')).toContainText('x 345');
    expect(await pageRead.evaluate(() => window.replayLabApp!.facade.readOnly)).toBe(true);
    await pageRead.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await read.setOffline(true);
    await pageRead.reload();
    await expect(pageRead.locator('[data-app-ready="true"]')).toBeVisible().catch(async error => { throw new Error(JSON.stringify({ errors: browserErrors, body: await pageRead.locator('body').innerText() }), { cause: error }); });
    await expect(pageRead.locator('[data-actor-id="offense-1"]')).toContainText('x 345');
    expect(await pageRead.evaluate(() => window.replayLabApp!.facade.readOnly)).toBe(true);
    writeFileSync(join(root, 'evidence/release-server.json'), JSON.stringify({ generatedAt: new Date().toISOString(), verdict: 'PASS', port: 32412, checks: ['CSP/static boundary', 'two writers over production /sync', 'fsynced journal', 'abrupt process restart', 'new read-only client receives persisted pose', 'production-route offline reload'], publicTLS: 'NOT RUN: hosting/domain not selected' }, null, 2) + '\n');
  } finally { await Promise.allSettled([a.close(), b.close(), read.close()]); await stop(child); cleanup(data); }
});

test('disk failure does not apply a valid update; corrupt journal is retained and incomplete tail is backed up', async ({ page }) => {
  await page.goto(`/app/play/storage-test/edit?db=storage-test-${Date.now()}`);
  await page.locator('[data-app-ready="true"]').waitFor();
  const update = Uint8Array.from(await page.evaluate(() => [...window.replayLabApp!.facade.encode()]));
  const failing = new ReplaySyncRoom('failure', { persist() { throw new Error('disk full'); } });
  const original = [...failing.encode()];
  expect(() => failing.accept({ sessionId: 'a', role: 'write', commitId: 'one', update })).toThrow('Room storage unavailable');
  expect([...failing.encode()]).toEqual(original);
  const data = temporary();
  const server = new ReplaySyncWebSocketServer({ port: 32412 });
  await server.ready();
  try {
    provisionRoom(data, 'journal');
    loadRooms(server, data);
    server.rooms.get('journal')!.accept({ sessionId: 'a', role: 'write', commitId: 'one', update });
    const journal = join(data, 'journal.updates.jsonl');
    const complete = readFileSync(journal);
    appendFileSync(journal, '{"incomplete":');
    server.rooms.clear();
    loadRooms(server, data);
    expect(readFileSync(journal)).toEqual(complete);
    expect(readdirSync(data).some(name => name.includes('.interrupted-'))).toBe(true);
    const corrupt = complete.toString('utf8').replace(/"sha256":"[^"]+"/, '"sha256":"invalid"');
    writeFileSync(journal, corrupt);
    server.rooms.clear();
    expect(() => loadRooms(server, data)).toThrow('checksum mismatch');
    expect(readFileSync(journal, 'utf8')).toBe(corrupt);
  } finally { await server.close(); failing.doc.destroy(); cleanup(data); }
});
