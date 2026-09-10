import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../../..');
const destination = join(root, 'release-dist');
let output = destination;
const verification = JSON.parse(readFileSync(join(root, 'evidence/release-verification.json'), 'utf8'));
for (const script of ['typecheck', 'build', 'build:server', 'test:release', 'test:durability', 'audit']) {
  if (!verification.steps.some(step => step.script === script && step.exitCode === 0)) throw new Error(`Release gate is not green: ${script}`);
}
const audit = JSON.parse(readFileSync(join(root, 'evidence/slice7-audit.json'), 'utf8'));
if (audit.verdict !== 'PASS' || audit.releaseReview.technicalStatus !== 'GREEN') throw new Error('Passing current technical and boundary audits are required');
if (existsSync(output)) {
  if (output !== resolve(root, 'release-dist') || lstatSync(output).isSymbolicLink() || !existsSync(join(output, '.replaylab-generated'))) throw new Error('Refusing to replace an unmarked release directory');
  if (existsSync(join(output, '.replaylab-data'))) throw new Error('Release directory contains room data; preserve it outside the artifact before packaging');
  const previous = JSON.parse(readFileSync(join(output, 'release-manifest.json'), 'utf8'));
  const generated = new Map(previous.files.map(file => [file.path, file.sha256]));
  function checkGenerated(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Refusing to replace a release containing symbolic links');
      if (entry.isDirectory()) { checkGenerated(path); continue; }
      const name = path.slice(output.length + 1).split(sep).join('/');
      if (name === 'release-manifest.json') continue;
      if (generated.get(name) !== createHash('sha256').update(readFileSync(path)).digest('hex')) throw new Error(`Preserve user-added or modified release file before packaging: ${name}`);
    }
  }
  checkGenerated(output);
}
mkdirSync(join(repo, 'tmp'), { recursive: true });
output = mkdtempSync(join(repo, 'tmp/replaylab-release-staging-'));
mkdirSync(output, { recursive: true });
writeFileSync(join(output, '.replaylab-generated'), 'Generated ReplayLab release only\n');
cpSync(join(root, 'dist'), join(output, 'dist'), { recursive: true, filter: path => !path.endsWith('.map') && !path.endsWith('bundle-closure.json') });
cpSync(join(root, 'server-dist'), join(output, 'server-dist'), { recursive: true, filter: path => !path.endsWith('bundle-closure.json') });
const legal = join(output, 'dist/legal');
mkdirSync(legal, { recursive: true });
for (const name of ['LICENSE', 'LICENSE-MIT']) cpSync(join(repo, name), join(legal, name));
for (const name of ['THIRD_PARTY_NOTICES.md', 'slice7-license-inventory.json', 'slice7-sbom.cdx.json', 'slice7-source-notices.json']) cpSync(join(root, 'evidence', name), join(legal, name));
const runtime = ['yjs', 'lib0', 'ws', 'fractional-indexing', 'isomorphic.js'];
const versions = {};
for (const name of runtime) {
  const source = join(repo, 'node_modules', name);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  if (!audit.dependencyClosure.some(item => item.name === name && item.version === manifest.version)) throw new Error(`Unaudited runtime: ${name}`);
  for (const dependency of Object.keys(manifest.dependencies ?? {})) if (!runtime.includes(dependency)) throw new Error(`Unexpected server runtime dependency: ${dependency}`);
  versions[name] = manifest.version;
  cpSync(source, join(output, 'node_modules', name), { recursive: true, dereference: true });
}
writeFileSync(join(output, 'package.json'), JSON.stringify({ name: 'replaylab-portfolio', version: '0.1.0', private: true, type: 'module', engines: { node: '>=22.12.0 <23' }, scripts: { start: 'node server-dist/server-entry.js', 'room:create': 'node server-dist/room-cli.js' }, dependencies: versions }, null, 2) + '\n');
cpSync(join(repo, 'docs/RELEASE.md'), join(output, 'README.md'));
cpSync(join(repo, 'docs/EMERGENCY_JOURNAL.md'), join(output, 'EMERGENCY_JOURNAL.md'));
const files = [];
function inventory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) inventory(path);
    else files.push({ path: path.slice(output.length + 1).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
  }
}
inventory(output);
writeFileSync(join(output, 'release-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), runtime: versions, files }, null, 2) + '\n');
if (existsSync(destination)) renameSync(destination, join(repo, 'tmp', `replaylab-release-backup-${randomUUID()}`));
renameSync(output, destination);
console.log(`Prepared ${files.length} release files; runtime: ${JSON.stringify(versions)}`);
