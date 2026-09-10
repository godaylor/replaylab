import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
mkdirSync(join(root, 'tmp'), { recursive: true });
const output = mkdtempSync(join(root, 'tmp/replaylab-local-ci-'));
function copy(relative) { const target = join(output, relative); mkdirSync(dirname(target), { recursive: true }); cpSync(join(root, relative), target, { recursive: true, filter: path => !/[/\\](node_modules|dist|server-dist|release-dist|test-results|\.replaylab-data|\.env[^/\\]*|replaylab-private-links\.txt)([/\\]|$)/.test(path) }); }
const manifests = spawnSync('rg', ['--files', '--hidden', '-g', 'package.json', '-g', '!node_modules/**', '-g', '!tmp/**', '-g', '!.git/**'], { cwd: root, encoding: 'utf8' });
if (manifests.status !== 0) throw new Error('Cannot inventory workspace manifests');
for (const manifest of manifests.stdout.trim().split(/\r?\n/)) copy(manifest);
for (const relative of ['.yarn/releases', '.yarn/patches', '.yarnrc.yml', 'yarn.lock', 'tsconfig.json', 'tsconfig.web.json', 'blocksuite/tsconfig.json', 'LICENSE', 'LICENSE-MIT', 'docs/RELEASE.md', 'blocksuite/framework/global', 'blocksuite/framework/store', 'blocksuite/framework/std', 'blocksuite/framework/sync', 'packages/replaylab/foundation']) copy(relative);
for (const relative of ['.git/HEAD', '.git/packed-refs', '.git/refs']) if (existsSync(join(root, relative))) copy(relative);
copy('deploy/replaylab/Dockerfile.ci');
copy('docs/EMERGENCY_JOURNAL.md');
writeFileSync(join(root, 'packages/replaylab/foundation/evidence/local-ci-context.json'), JSON.stringify({ generatedAt: new Date().toISOString(), context: output, scope: 'workspace manifests + approved framework/product source only; no user databases or denied source implementation' }, null, 2));
console.log(output);
