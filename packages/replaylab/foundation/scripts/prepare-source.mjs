import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A source export, never a fabricated Git history or a deploy artifact.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const product = 'packages/replaylab/foundation';
const kernel = ['global', 'store', 'std', 'sync'].map(name => `blocksuite/framework/${name}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const parent = json(`${product}/package.json`);
const sourcePackage = json('package.json');
const baseline = '329839e467d936f90230fb02a8983f8eb4b62fc0';
mkdirSync(join(repo, 'tmp'), { recursive: true });
const output = mkdtempSync(join(repo, 'tmp/replaylab-source-'));
const copied = new Map();
function copy(path) {
  const source = join(repo, path);
  if (lstatSync(source).isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${path}`);
  if (lstatSync(source).isDirectory()) {
    for (const name of readdirSync(source).sort()) {
      if (/^(node_modules|dist|server-dist|release-dist|test-results|playwright-report|\.replaylab-data|\.env.*|replaylab-private-links\.txt)$/.test(name)) continue;
      copy(`${path}/${name}`);
    }
    return;
  }
  mkdirSync(dirname(join(output, path)), { recursive: true });
  cpSync(source, join(output, path));
  copied.set(path, hash(readFileSync(source)));
}
function write(path, value) {
  mkdirSync(dirname(join(output, path)), { recursive: true });
  writeFileSync(join(output, path), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
}

// Only tracked, allowlisted kernel material; preserve every retained nested license.
let blobs;
if (existsSync(join(repo, 'SOURCE_STATE.json'))) {
  const previous = json('SOURCE_STATE.json');
  if (previous.upstream.commit !== baseline) throw new Error('Unreviewed upstream baseline');
  blobs = new Map(previous.files.filter(file => kernel.some(path => file.path.startsWith(`${path}/`)) && /^[a-f0-9]{40}$/.test(file.upstreamBlob ?? '')).map(file => [file.path, file.upstreamBlob]));
} else {
  const upstreamFiles = execFileSync('git', ['ls-tree', '-r', baseline, '--', ...kernel], { cwd: repo, encoding: 'utf8' });
  blobs = new Map(upstreamFiles.trim().split('\n').filter(Boolean).map(line => {
    const [metadata, path] = line.split('\t');
    return [path, metadata.split(' ')[2]];
  }));
}
if (!blobs.size) throw new Error('Missing approved kernel provenance');
for (const path of [...blobs.keys()].sort()) copy(path);
for (const path of ['src', 'public', 'scripts', 'tests', 'evidence']) copy(`${product}/${path}`);
for (const name of readdirSync(join(repo, product)).sort()) {
  if (/^(package\.json|tsconfig\.json|.*\.config\.ts|index\.html)$/.test(name)) copy(`${product}/${name}`);
}
for (const path of ['README.md', 'PLAN.md', 'AGENTS.md', 'FINAL_AUDIT.md', 'LICENSE', 'LICENSE-MIT', '.gitignore', '.github/workflows/replaylab.yml', '.yarn/releases/yarn-4.18.0.cjs',
  ...['LICENSE_BOUNDARIES', 'REUSABLE_SCOPE', 'TRANSFORMATION_SPEC', 'ARCHITECTURE', 'BASELINE_AUDIT', 'PRODUCT_OPTIONS', 'EMERGENCY_JOURNAL', 'RELEASE', 'SOURCE_STATE'].map(name => `docs/${name}.md`),
  'deploy/replaylab']) copy(path);

// Preserve existing runtime resolution choices, including the two runtime patches.
const resolutions = Object.fromEntries(Object.entries(sourcePackage.resolutions).filter(([name, value]) => !value.startsWith('patch:') || !name.startsWith('@magic-works/')));
for (const value of Object.values(resolutions)) {
  if (value.startsWith('patch:')) copy(value.split('#~/')[1]);
}
write('package.json', {
  name: 'replaylab-source', version: '0.1.0', private: true, license: sourcePackage.license,
  packageManager: 'yarn@4.18.0', engines: sourcePackage.engines,
  workspaces: [...kernel, product], devDependencies: parent.devDependencies, resolutions,
});
write('.yarnrc.yml', 'enableGlobalCache: true\nenableScripts: false\nnmMode: hardlinks-local\nnodeLinker: node-modules\nnpmRegistryServer: "https://registry.npmjs.org"\nyarnPath: .yarn/releases/yarn-4.18.0.cjs\n');
const ts = await import(pathToFileURL(join(repo, 'node_modules/@typescript/old/lib/typescript.js')).href);
const config = ts.default.parseConfigFileTextToJson('tsconfig.json', readFileSync(join(repo, 'tsconfig.json'), 'utf8')).config;
delete config.references;
delete config.compilerOptions.paths;
config.compilerOptions.typeRoots = ['./node_modules/@types'];
write('tsconfig.json', config);
write('tsconfig.web.json', { extends: './tsconfig.json', compilerOptions: { lib: ['ESNext', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx' } });
write('blocksuite/tsconfig.json', { extends: '../tsconfig.web.json', compilerOptions: { types: ['node'] } });
// Seed resolution from the reviewed lock, then prune only in the isolated export.
copy('yarn.lock');
execFileSync(process.execPath, ['.yarn/releases/yarn-4.18.0.cjs', 'install', '--mode=skip-build'], {
  cwd: output, stdio: 'inherit', env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
});
const files = [];
function inventory(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (['node_modules', 'install-state.gz'].includes(name)) continue;
    const path = join(dir, name);
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Unexpected export symlink: ${path}`);
    if (lstatSync(path).isDirectory()) inventory(path);
    else {
      const name = relative(output, path).replaceAll('\\', '/');
      const sha256 = hash(readFileSync(path));
      files.push({ path: name, sha256, origin: blobs.has(name) ? 'upstream-kernel' : copied.get(name) === sha256 ? 'working-tree-copy' : 'export-configuration', ...(blobs.has(name) ? { upstreamBlob: blobs.get(name) } : {}) });
    }
  }
}
inventory(output);
const snapshotSha256 = hash(JSON.stringify(files));
write('SOURCE_STATE.json', { format: 'replaylab-source-state-v1', snapshotSha256, upstream: { repository: 'https://github.com/toeverything/AFFiNE', commit: baseline },
  history: 'Uncommitted working-tree export. No ReplayLab commit history or individual authorship is asserted.',
  verification: 'Historical evidence is retained with original dates; run targeted source-export checks separately. No hosted CI or manual review is implied.',
  files });
if (existsSync(join(output, '.git'))) throw new Error('An export must not contain copied Git metadata');
const workflows = readdirSync(join(output, '.github/workflows'));
if (workflows.length !== 1 || workflows[0] !== 'replaylab.yml') throw new Error('Unexpected inherited workflow');
console.log(`SOURCE_STATE_OUTPUT=${output}`);
console.log(`SOURCE_STATE_SHA256=${snapshotSha256}`);
