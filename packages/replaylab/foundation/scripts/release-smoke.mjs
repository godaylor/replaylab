import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../../..');
const artifact = join(root, 'release-dist');
const docker = process.argv.includes('--docker');
const capture = process.argv.includes('--capture');
const tag = process.env.REPLAYLAB_IMAGE ?? 'replaylab:portfolio-20260908';
const name = `replaylab-smoke-${Date.now()}`;
mkdirSync(join(repo, 'tmp'), { recursive: true });
const work = mkdtempSync(join(repo, 'tmp/replaylab-runtime-smoke-'));
let data = join(work, 'data'); mkdirSync(data);
let child;
let container;
let browser;
const origin = 'http://127.0.0.1:32400';
const report = { generatedAt: new Date().toISOString(), mode: docker ? 'docker' : 'packaged-node', port: 32400, verdict: 'FAIL', checks: [], work };
const reportPath = join(root, `evidence/release-smoke-${docker ? 'docker' : 'node'}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
// Keep the orchestrator alive while Node fetch waits on unreferenced sockets.
// A failed/aborted startup must execute cleanup and must not leave stale PASS.
const keepAlive = setInterval(() => {}, 1000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${executable} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
async function waitFor(check, message) { const deadline = Date.now() + 15000; while (Date.now() < deadline) { if (await check()) return; await delay(100); } throw new Error(message); }
async function stop() {
  if (container) {
    assert.equal(command('docker', ['inspect', '--format', '{{index .Config.Labels "com.replaylab.smoke"}}', container]).trim(), name);
    command('docker', ['rm', '-f', container]); container = undefined;
  }
  if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  child = undefined;
}
async function boot() {
  if (docker) container = command('docker', ['run', '-d', '--name', name, '--label', `com.replaylab.smoke=${name}`, ...(typeof process.getuid === 'function' && process.getuid() > 0 ? ['--user', String(process.getuid())] : []), '--read-only', '--tmpfs', '/tmp:size=16m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', '512m', '-p', '127.0.0.1:32400:32400', '--mount', `type=bind,source=${data},target=/data`, tag]).trim();
  else {
    child = spawn(process.execPath, [join(artifact, 'server-dist/server-entry.js')], { cwd: artifact, windowsHide: true, stdio: 'pipe', env: { ...process.env, PORT: '32400', HOST: '127.0.0.1', REPLAYLAB_PUBLIC_ORIGIN: '', REPLAYLAB_DATA_DIR: data } });
    child.stderr.on('data', () => {});
  }
  await waitFor(() => fetch(origin + '/healthz', { signal: AbortSignal.timeout(1000) }).then(r => r.ok).catch(() => false), 'Runtime did not become healthy');
}
try {
  await new Promise((resolve, reject) => { const probe = createServer(); probe.once('error', reject); probe.listen(32400, '127.0.0.1', () => probe.close(resolve)); });
  // Provision private synthetic links without printing or persisting the tokens.
  const links = command(process.execPath, [join(artifact, 'server-dist/room-cli.js'), 'smoke'], { cwd: artifact, env: { ...process.env, REPLAYLAB_DATA_DIR: data } });
  const writeUrl = links.match(/^write: (.+)$/m)?.[1];
  const readUrl = links.match(/^read: (.+)$/m)?.[1];
  assert.ok(writeUrl && readUrl);
  await boot();
  for (const path of ['/legal/THIRD_PARTY_NOTICES.md', '/legal/slice7-sbom.cdx.json', '/legal/LICENSE-MIT']) assert.equal((await fetch(origin + path)).status, 200);
  for (const path of ['/bundle-closure.json', '/server-dist/server-entry.js', '/.replaylab-data/smoke.room.json']) assert.equal((await fetch(origin + path)).status, 404);
  report.checks.push('health/legal/static boundary');
  browser = await chromium.launch();
  const videoDir = join(root, 'evidence/demo-capture');
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(capture ? { recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } } : {}) });
  const b = await browser.newContext();
  for (const context of [a, b]) await context.addInitScript(() => localStorage.setItem('replaylab:locale', 'en'));
  const pa = await a.newPage(); const pb = await b.newPage();
  await pa.goto(writeUrl); await pb.goto(writeUrl);
  for (const page of [pa, pb]) await page.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced');
  const started = Date.now();
  const at = async seconds => { if (capture) await delay(Math.max(0, seconds * 1000 - (Date.now() - started))); };
  await pa.locator('[data-actor-id="offense-1"]').focus();
  await pa.locator('[data-actor-id="offense-1"]').press('ArrowRight');
  await pa.evaluate(() => {
    const f = window.replayLabApp.facade; const phase = f.snapshot.phases[0];
    f.createAction({ actorId: 'offense-1', type: 'pass', targetActorId: 'offense-2', path: { points: [phase.poses['offense-1'], phase.poses['offense-2']] } });
    window.replayLabApp.playbackController.play();
  });
  await at(8);
  await pa.evaluate(() => { window.replayLabApp.playbackController.pause(); window.replayLabApp.facade.setActorPose({ actorId: 'offense-1', x: 345, y: 210 }); });
  await pb.waitForFunction(() => window.replayLabApp.facade.snapshot.phases[0].poses['offense-1'].x === 345);
  await at(17);
  await pb.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Read the defense; pass to the open teammate.');
  await pb.getByRole('button', { name: 'Apply cue', exact: true }).click();
  await pa.waitForFunction(() => JSON.stringify(window.replayLabApp.facade.getCueDocument(0)).includes('Read the defense'));
  await pa.locator('.cue-editor').scrollIntoViewIfNeeded();
  await at(25); await pa.locator('#court').scrollIntoViewIfNeeded();
  report.checks.push('two independent writers; pose and cue');
  await at(30);
  await b.setOffline(true);
  await pb.waitForFunction(() => window.replayLabApp.networkSource.state.status === 'offline');
  await pb.evaluate(() => window.replayLabApp.facade.setActorPose({ actorId: 'offense-1', x: 444, y: 200 }));
  await pa.evaluate(() => window.replayLabApp.facade.setActorPose({ actorId: 'offense-1', x: 222, y: 200 }));
  await at(38); await b.setOffline(false);
  await pa.waitForFunction(() => window.replayLabApp.facade.snapshot.phases[0].poseRegisters['offense-1'].candidates.length >= 2);
  const conflict = pa.locator('[data-conflict-kind="pose"]').first();
  await conflict.scrollIntoViewIfNeeded();
  await conflict.getByRole('radio').first().check();
  await at(44); await conflict.getByRole('button', { name: 'Resolve', exact: true }).click();
  await pb.waitForFunction(() => window.replayLabApp.facade.snapshot.conflictCount === 0);
  await at(48);
  await pa.locator('#court').scrollIntoViewIfNeeded();
  await pa.evaluate(() => window.replayLabApp.facade.setActorPose({ actorId: 'offense-2', x: 700, y: 150 }));
  await at(52); await pa.getByRole('button', { name: /^Undo/ }).click();
  await pb.waitForFunction(() => window.replayLabApp.facade.snapshot.phases[0].poses['offense-2'].x !== 700);
  report.checks.push('offline concurrent intentions; resolve; local undo');
  await pa.locator('#court').scrollIntoViewIfNeeded();
  await pa.evaluate(() => window.replayLabApp.playbackController.play());
  await at(60);
  await pa.evaluate(() => { window.replayLabApp.playbackController.pause(); return window.replayLabApp.facade.flush(); });
  await pb.evaluate(() => window.replayLabApp.facade.flush());
  const expected = await pa.evaluate(() => window.replayLabApp.facade.snapshot.phases[0].poses['offense-1'].x);
  const video = pa.video(); await a.close(); await b.close();
  if (capture) report.video = await video.path();
  await stop();
  cpSync(data, join(work, 'backup'), { recursive: true });
  data = join(work, 'restored'); cpSync(join(work, 'backup'), data, { recursive: true });
  await boot();
  const reader = await browser.newContext(); const pr = await reader.newPage(); await pr.goto(readUrl);
  await pr.waitForFunction(() => window.replayLabApp?.networkSource?.state.status === 'synced');
  assert.equal(await pr.evaluate(() => window.replayLabApp.facade.snapshot.phases[0].poses['offense-1'].x), expected);
  assert.equal(await pr.evaluate(() => window.replayLabApp.facade.readOnly), true);
  await pr.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await reader.setOffline(true); await pr.reload(); await pr.locator('[data-app-ready="true"]').waitFor();
  report.checks.push('stopped-server backup -> separate restored data directory -> new read-only client -> offline reload');
  if (docker) { report.imageId = command('docker', ['image', 'inspect', '--format', '{{.Id}}', tag]).trim(); report.runtimeUser = command('docker', ['inspect', '--format', '{{.Config.User}}', container]).trim(); assert.equal(command('docker', ['image', 'inspect', '--format', '{{.Config.User}}', tag]).trim(), 'node'); assert.notEqual(report.runtimeUser, '0'); }
  report.verdict = 'PASS';
} finally {
  try { await browser?.close(); await stop(); }
  finally { clearInterval(keepAlive); writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
}
console.log(JSON.stringify({ verdict: report.verdict, mode: report.mode, checks: report.checks.length, port: report.port }));
