import { expect, test, type Page, type Browser } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { journalPrefix } from '../src/emergency-journal';

function target() { const id = `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`; return { id, db: id, url: `/app/play/${id}/edit?db=${id}` }; }
async function open(page: Page, url: string) { await page.goto(url); await page.locator('[data-app-ready="true"]').waitFor(); await page.waitForFunction(() => Boolean(window.replayLabApp)); }
async function stall(page: Page) {
  await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    (facade as unknown as { persistence: { source: { push(): Promise<void> } } }).persistence.source.push = () => new Promise(() => {});
  });
}

async function crashRenderer(page: Page, browser: Browser) {
  const crashed = page.waitForEvent('crash');
  if (process.platform === 'linux') {
    // Page.crash can hang behind a host core-dump handler in Docker/WSL.
    // Kill only renderer PIDs reported by this isolated test browser, without
    // unload/pagehide/blur or any chance to finish the deliberately stalled write.
    const cdp = await browser.newBrowserCDPSession();
    const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
    const renderers = processInfo.filter(item => item.type === 'renderer');
    expect(renderers.length).toBeGreaterThan(0);
    for (const renderer of renderers) process.kill(renderer.id, 'SIGKILL');
    await cdp.detach();
  } else {
    const cdp = await page.context().newCDPSession(page);
    void cdp.send('Page.crash').catch(() => undefined);
  }
  await crashed;
}

test('renderer crash before IndexedDB ACK restores the journal, then repeated reopen is idempotent', async ({ page, context, browser }) => {
  const item = target(); await open(page, item.url); await stall(page);
  await page.evaluate(() => window.replayLabApp!.facade.setActorPose({ actorId: 'offense-1', x: 333, y: 222 }));
  await crashRenderer(page, browser);
  const recovered = await context.newPage(); await open(recovered, item.url);
  await expect(recovered.locator('[data-actor-id="offense-1"]')).toContainText('x 333');
  await recovered.reload();
  await expect(recovered.locator('[data-actor-id="offense-1"]')).toContainText('x 333');
  writeFileSync('evidence/emergency-crash.json', JSON.stringify({ verdict: 'PASS', generatedAt: new Date().toISOString(), mechanism: process.platform === 'linux' ? 'SIGKILL isolated browser renderer with stalled IndexedDB push' : 'CDP Page.crash with stalled IndexedDB push', pose: 333, repeatedReopen: true }, null, 2));
});

test('corrupt newest record retains raw bytes and recovers the previous valid slot read-only', async ({ page }) => {
  const item = target(); await open(page, item.url); await stall(page);
  const damaged = await page.evaluate(() => {
    const facade = window.replayLabApp!.facade;
    facade.setActorPose({ actorId: 'offense-1', x: 222, y: 200 });
    facade.setActorPose({ actorId: 'offense-1', x: 333, y: 200 });
    const latest = facade.emergencyJournal!.scan().latest.find(entry => entry.body.kind === 'document')!;
    const raw = latest.raw.slice(0, -9);
    localStorage.setItem(latest.key, raw);
    return { key: latest.key, raw };
  });
  await page.reload();
  await expect(page.locator('[data-actor-id="offense-1"]')).toContainText('x 222');
  expect(await page.evaluate(() => window.replayLabApp!.facade.readOnly)).toBe(true);
  expect(await page.evaluate(key => localStorage.getItem(key), damaged.key)).toBe(damaged.raw);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export drafts / emergency journal', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('replaylab-drafts.json');
});

test('legacy collection backup precedes additive adoption; interruption preserves exact original bytes', async ({ page }) => {
  const item = target(); await open(page, item.url);
  const result = await page.evaluate(async ({ id, db }) => {
    const Facade = window.replayLabApp!.ReplayLabEditorFacade;
    await window.replayLabApp!.facade.flush();
    const bytes = [...window.replayLabApp!.facade.encode()];
    let artifact: string | undefined;
    try { await Facade.open({ dbName: db, playId: id, migrationFault: 'after-journal-backup' }); }
    catch (error) { artifact = (error as { recoveryJson: string }).recoveryJson; }
    const reopened = await Facade.open({ dbName: db, playId: id });
    const equal = JSON.stringify([...reopened.encode()]) === JSON.stringify(bytes);
    reopened.close();
    return { equal, artifact: artifact ? JSON.parse(artifact) : null };
  }, item);
  expect(result.equal).toBe(true);
  expect(result.artifact.formatVersion).toBe(1);
  expect(result.artifact.reason).toBe('pre-migration');
  expect(result.artifact.checksumSha256).toHaveLength(64);
});

test('two tabs retain independent Unicode drafts across close; remote cue changes do not erase unapplied input', async ({ page, context }) => {
  const item = target(); await open(page, item.url);
  const second = await context.newPage(); await open(second, item.url);
  await page.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Черновик 日本語 first');
  await second.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Second draft');
  await second.getByRole('button', { name: 'Apply cue', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Cue block 1 text', exact: true })).toHaveValue('Черновик 日本語 first');
  await second.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Second retained');
  await page.close(); await second.close();
  const recovered = await context.newPage(); await open(recovered, item.url);
  const buttons = recovered.getByRole('button', { name: /Restore retained draft/ });
  await expect(buttons).toHaveCount(2);
  const values: string[] = [];
  for (let i = 0; i < 2; i++) { await buttons.nth(i).click(); values.push(await recovered.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).inputValue()); }
  expect(values.sort()).toEqual(['Second retained', 'Черновик 日本語 first'].sort());
  const canonical = await recovered.evaluate(() => window.replayLabApp!.facade.getCueDocument(0));
  expect(JSON.stringify(canonical)).toContain('Second draft');
});

test('future journal version is preserved and cannot silently open writable', async ({ page }) => {
  const item = target(); await open(page, item.url);
  const key = journalPrefix(item.db, item.id) + 'record:future:document::1';
  const body = JSON.stringify({ version: 99, session: 'future', sequence: 1, kind: 'document', entity: '', payload: 'uninterpreted future data' });
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 0x01000193);
  const raw = JSON.stringify({ body, checksum: (hash >>> 0).toString(16).padStart(8, '0') });
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.reload(); await page.locator('[data-app-ready="true"]').waitFor();
  expect(await page.evaluate(() => window.replayLabApp!.facade.readOnly)).toBe(true);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
});

test('unsubmitted title survives renderer crash and Escape cancels without committing', async ({ page, context, browser }) => {
  const item = target(); await open(page, item.url);
  const title = page.getByRole('textbox', { name: 'Play name', exact: true });
  const original = await title.inputValue();
  await title.fill('Название до аварии');
  await crashRenderer(page, browser);
  const next = await context.newPage(); await open(next, item.url);
  await next.getByRole('button', { name: 'Restore title draft 1', exact: true }).click();
  const restored = next.getByRole('textbox', { name: 'Play name', exact: true });
  await expect(restored).toHaveValue('Название до аварии');
  expect(await next.evaluate(() => window.replayLabApp!.facade.snapshot.title)).toBe(original);
  await restored.press('Escape');
  await expect(restored).toHaveValue(original);
  expect(await next.evaluate(() => window.replayLabApp!.facade.snapshot.title)).toBe(original);
  await next.reload();
  await expect(next.getByRole('button', { name: /Restore title draft/ })).toHaveCount(0);
});

test('applying an observed foreign draft never deletes that live writer latest revision', async ({ page, context }) => {
  const item = target(); await open(page, item.url);
  await page.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Observed old draft');
  const observer = await context.newPage(); await open(observer, item.url);
  await observer.getByRole('button', { name: 'Restore retained draft 1', exact: true }).click();
  await page.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Newer writer intention');
  await observer.getByRole('button', { name: 'Apply cue', exact: true }).click();
  await page.close(); await observer.close();
  const recovered = await context.newPage(); await open(recovered, item.url);
  await recovered.getByRole('button', { name: 'Restore retained draft 1', exact: true }).click();
  await expect(recovered.getByRole('textbox', { name: 'Cue block 1 text', exact: true })).toHaveValue('Newer writer intention');
});

test('individually valid snapshots whose union exceeds caps never enter trusted main storage', async ({ page }) => {
  const item = target(); await open(page, item.url);
  await page.evaluate(async ({ id, db }) => {
    const first = window.replayLabApp!.facade;
    const second = await window.replayLabApp!.ReplayLabEditorFacade.open({ dbName: db, playId: id });
    for (const facade of [first, second]) (facade as unknown as { persistence: { source: { push(): Promise<void> } } }).persistence.source.push = () => new Promise(() => {});
    for (let i = 0; i < 6; i++) { first.addPhaseAfter(0); second.addPhaseAfter(0); }
    second.close();
  }, item);
  await page.reload(); await page.locator('[data-app-ready="true"]').waitFor();
  expect(await page.evaluate(() => window.replayLabApp!.facade.readOnly)).toBe(true);
  expect(await page.evaluate(() => window.replayLabApp!.facade.snapshot.phases.length)).toBeLessThanOrEqual(12);
});

test('quota failure retains live document and draft, never reports locally saved', async ({ page }) => {
  const item = target(); await open(page, item.url);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith('replaylab:emergency:')) throw new DOMException('quota test', 'QuotaExceededError'); original.call(this, key, value); };
  });
  await page.locator('[data-actor-id="offense-1"]').press('ArrowRight');
  await expect(page.locator('#persistence-status')).not.toContainText('Saved locally');
  await expect(page.locator('[data-actor-id="offense-1"]')).toContainText('x 115');
  await page.getByRole('textbox', { name: 'Cue block 1 text', exact: true }).fill('Keep this draft');
  await expect(page.getByRole('alert')).toContainText('Draft recovery storage failed');
  await expect(page.getByRole('textbox', { name: 'Cue block 1 text', exact: true })).toHaveValue('Keep this draft');
});
