import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const port of [32410, 32411, 32412]) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
const steps = [];
for (const script of ['typecheck', 'build', 'build:server', 'test:release', 'test:durability', 'audit', 'package:release']) {
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, ['../../../.yarn/releases/yarn-4.18.0.cjs', script], { cwd: root, stdio: 'inherit', env: { ...process.env, REPLAYLAB_PREVIEW_PORT: '32410', REPLAYLAB_TEST_REPORT: script === 'test:durability' ? 'evidence/release-durability.json' : 'evidence/release-tests.json' } });
  steps.push({ script, started, exitCode: result.status });
  mkdirSync(new URL('../evidence/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../evidence/release-verification.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, ports: [32410, 32411, 32412], verdict: result.status !== 0 ? 'FAIL' : steps.length === 7 ? 'PASS' : 'INCOMPLETE', steps }, null, 2) + '\n');
  if (result.status !== 0) process.exit(result.status ?? 1);
}
