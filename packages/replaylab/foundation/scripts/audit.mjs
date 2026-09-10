import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../../..');
const evidenceRoot = join(packageRoot, 'evidence');
const distRoot = join(packageRoot, 'dist');
const packageJson = readJson(join(packageRoot, 'package.json'));
const sliceFlagIndex = process.argv.indexOf('--slice');
const auditSlice = sliceFlagIndex >= 0 && process.argv[sliceFlagIndex + 1]
  ? process.argv[sliceFlagIndex + 1]
  : 'slice7';

const approvedWorkspaces = new Map([
  ['@blocksuite/global', 'blocksuite/framework/global'],
  ['@blocksuite/store', 'blocksuite/framework/store'],
  ['@blocksuite/std', 'blocksuite/framework/std'],
  ['@blocksuite/sync', 'blocksuite/framework/sync'],
]);

const deniedPathMarkers = [
  'blocksuite/affine/',
  'packages/backend/',
  'packages/common/native/',
  'packages/frontend/native/',
  'packages/frontend/mobile-native/',
  'packages/frontend/apps/electron/',
  'packages/frontend/apps/electron-renderer/',
  'packages/frontend/apps/android/',
  'packages/frontend/apps/ios/',
  'packages/frontend/apps/mobile/',
  'packages/frontend/apps/mobile-shared/',
  'packages/frontend/admin/',
  'packages/common/nbstore/',
  'packages/common/realtime/',
  'packages/common/graphql/',
  'packages/frontend/apps/web/',
  'packages/frontend/core/',
  'packages/frontend/component/',
];

const deniedPackagePrefixes = [
  '@affine/',
  '@blocksuite/affine',
];

const acceptedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'ISC',
  'MIT',
  '(MPL-2.0 OR Apache-2.0)',
]);

const excalidrawMitNotice = [
  'MIT License',
  '',
  'Copyright (c) 2020 Excalidraw',
  '',
  'Permission is hereby granted, free of charge, to any person obtaining a copy',
  'of this software and associated documentation files (the "Software"), to deal',
  'in the Software without restriction, including without limitation the rights',
  'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
  'copies of the Software, and to permit persons to whom the Software is',
  'furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all',
  'copies or substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
  'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
  'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
  'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
  'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
  'SOFTWARE.',
].join('\n');

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\0/, '').split('?')[0];
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (['dist', 'evidence', 'node_modules', 'test-results'].includes(entry.name)) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function findInstalledManifest(name, fromDirectory) {
  if (approvedWorkspaces.has(name)) {
    return join(repoRoot, approvedWorkspaces.get(name), 'package.json');
  }
  let cursor = fromDirectory;
  while (true) {
    const candidate = join(cursor, 'node_modules', ...name.split('/'), 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function normalizedLicense(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.type === 'string') return value.type;
  return 'UNKNOWN';
}

function noticeFilesForManifest(realManifest) {
  const packageDirectory = dirname(realManifest);
  return readdirSync(packageDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^(LICENSE|LICENCE|NOTICE|COPYING|AUTHORS)(\.|$)/i.test(entry.name))
    .map(entry => {
      const file = join(packageDirectory, entry.name);
      return { file: normalizePath(relative(repoRoot, file)), sha256: sha256(file) };
    })
    .sort((left, right) => left.file.localeCompare(right.file));
}

function dependencyClosure() {
  const directNames = Object.keys(packageJson.dependencies ?? {}).sort();
  const queue = directNames.map(name => ({
    name,
    fromDirectory: packageRoot,
    requestedBy: packageJson.name,
    edge: 'direct',
  }));
  const records = new Map();
  const missing = [];

  while (queue.length) {
    const item = queue.shift();
    const manifestPath = findInstalledManifest(item.name, item.fromDirectory);
    if (!manifestPath) {
      missing.push(item);
      continue;
    }
    const realManifest = realpathSync(manifestPath);
    const manifest = readJson(realManifest);
    const key = `${manifest.name}@${manifest.version}:${normalizePath(realManifest)}`;
    const existing = records.get(key);
    if (existing) {
      existing.requestedBy.add(item.requestedBy);
      existing.edges.add(item.edge);
      continue;
    }
    const workspacePath = approvedWorkspaces.get(manifest.name);
    const license = normalizedLicense(manifest.license);
    const record = {
      name: manifest.name,
      version: manifest.version,
      license,
      manifest: normalizePath(relative(repoRoot, realManifest)),
      workspace: workspacePath ?? null,
      boundaryDecision: workspacePath
        ? 'APPROVED_DIRECT_KERNEL'
        : 'ACCEPTED_THIRD_PARTY_RUNTIME',
      noticeFiles: noticeFilesForManifest(realManifest),
      requestedBy: new Set([item.requestedBy]),
      edges: new Set([item.edge]),
    };
    records.set(key, record);

    const peerMeta = manifest.peerDependenciesMeta ?? {};
    const next = [
      ...Object.keys(manifest.dependencies ?? {}).map(name => ({ name, edge: 'dependency' })),
      ...Object.keys(manifest.optionalDependencies ?? {}).map(name => ({ name, edge: 'optional' })),
      ...Object.keys(manifest.peerDependencies ?? {})
        .filter(name => !peerMeta[name]?.optional)
        .map(name => ({ name, edge: 'peer' })),
    ];
    for (const dependency of next) {
      const childManifest = findInstalledManifest(dependency.name, dirname(realManifest));
      if (dependency.edge === 'optional' && !childManifest) continue;
      queue.push({
        ...dependency,
        fromDirectory: dirname(realManifest),
        requestedBy: manifest.name,
      });
    }
  }

  return {
    directNames,
    missing,
    records: [...records.values()]
      .map(record => ({
        ...record,
        requestedBy: [...record.requestedBy].sort(),
        edges: [...record.edges].sort(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version)),
  };
}

function packageFromNodeModule(moduleId) {
  const normalized = normalizePath(moduleId);
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return null;
  const parts = normalized.slice(index + marker.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

function inspectBundle() {
  const closureFile = join(distRoot, 'bundle-closure.json');
  if (!existsSync(closureFile)) throw new Error('Missing dist/bundle-closure.json; run build first');
  const closure = readJson(closureFile);
  const modules = closure.chunks.flatMap(chunk => chunk.modules);
  const workspaceModuleCounts = Object.fromEntries([...approvedWorkspaces].map(([name, root]) => [name, 0]));
  const emittedPackages = new Set();
  const unexpectedRepoModules = [];
  const forbiddenModules = [];

  for (const rawModule of modules) {
    const moduleId = normalizePath(rawModule);
    const lower = moduleId.toLowerCase();
    if (deniedPathMarkers.some(marker => lower.includes(marker))) forbiddenModules.push(moduleId);
    let matchedWorkspace = false;
    for (const [name, workspaceRoot] of approvedWorkspaces) {
      if (lower.includes(`${workspaceRoot.toLowerCase()}/`)) {
        workspaceModuleCounts[name] += 1;
        emittedPackages.add(name);
        matchedWorkspace = true;
        break;
      }
    }
    if (matchedWorkspace) continue;
    const externalPackage = packageFromNodeModule(moduleId);
    if (externalPackage) {
      emittedPackages.add(externalPackage);
      continue;
    }
    if (
      moduleId.startsWith('\0') ||
      moduleId.includes('/packages/replaylab/foundation/') ||
      !moduleId.includes(normalizePath(repoRoot))
    ) continue;
    unexpectedRepoModules.push(moduleId);
  }

  const chunks = readdirSync(join(distRoot, 'assets'))
    .filter(name => name.endsWith('.js'))
    .sort()
    .map(name => {
      const file = join(distRoot, 'assets', name);
      const bytes = readFileSync(file);
      return { file: `assets/${name}`, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
    });
  return {
    chunks,
    rawBytes: chunks.reduce((sum, chunk) => sum + chunk.rawBytes, 0),
    gzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
    budgetGzipBytes: 1_500_000,
    emittedPackages: [...emittedPackages].sort(),
    workspaceModuleCounts,
    forbiddenModules: [...new Set(forbiddenModules)].sort(),
    unexpectedRepoModules: [...new Set(unexpectedRepoModules)].sort(),
  };
}

function inspectProductSources() {
  const files = [
    ...listFiles(join(packageRoot, 'src')),
    ...listFiles(join(packageRoot, 'public')),
    ...listFiles(join(packageRoot, 'tests')),
    join(packageRoot, 'package.json'),
    join(packageRoot, 'vite.config.ts'),
    join(packageRoot, 'playwright.config.ts'),
  ].filter(existsSync);
  const forbidden = [];
  const protocolMarkers = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const normalizedContent = content.replaceAll('\\', '/').toLowerCase();
    for (const marker of deniedPathMarkers) {
      if (normalizedContent.includes(marker)) {
        forbidden.push({ file: normalizePath(relative(repoRoot, file)), marker });
      }
    }
    for (const marker of [
      '@affine/',
      '/graphql',
      'space:join',
      'space:load-doc',
      'space:push-doc-update',
      'legacy sync mode',
      'batch sync mode',
      'affine-realtime',
    ]) {
      if (normalizedContent.includes(marker)) {
        protocolMarkers.push({ file: normalizePath(relative(repoRoot, file)), marker });
      }
    }
  }
  return { filesScanned: files.length, forbidden, protocolMarkers };
}

function inspectNotices() {
  const files = [join(repoRoot, 'LICENSE'), join(repoRoot, 'LICENSE-MIT')];
  for (const workspaceRoot of approvedWorkspaces.values()) {
    files.push(...listFiles(join(repoRoot, workspaceRoot)).filter(file => /(^|[\\/])(LICENSE|NOTICE|COPYING|AUTHORS)(\.|$)/i.test(file)));
  }
  return [...new Set(files.filter(existsSync))].sort().map(file => ({
    file: normalizePath(relative(repoRoot, file)),
    sha256: sha256(file),
  }));
}

function inspectInlineProvenance() {
  const checks = [
    {
      file: 'blocksuite/framework/store/src/adapter/base.ts',
      marker: 'Rich-Harris/estree-walker MIT License',
      decision: 'PRESERVE_ATTRIBUTION',
    },
    {
      file: 'blocksuite/framework/global/src/gfx/math.ts',
      marker: 'credit to Excalidraw hitTestFreeDrawElement',
      decision: 'PRESERVE_ATTRIBUTION',
    },
    {
      file: 'blocksuite/framework/global/src/gfx/perfect-freehand/LICENSE',
      marker: 'Copyright (c) 2021 Stephen Ruiz Ltd',
      decision: 'PRESERVE_LICENSE',
    },
  ];
  return checks.map(check => ({
    ...check,
    present: readFileSync(join(repoRoot, check.file), 'utf8').includes(check.marker),
  }));
}

function inspectYjsCompatibility() {
  const patchFile = join(repoRoot, '.yarn/patches/yjs-npm-13.6.21-c9f1f3397c.patch');
  const installedManifest = readJson(join(repoRoot, 'node_modules/yjs/package.json'));
  const installedModule = readFileSync(join(repoRoot, 'node_modules/yjs/dist/yjs.mjs'), 'utf8');
  const installedLicense = join(repoRoot, 'node_modules/yjs/LICENSE');
  const compatibilityFile = join(evidenceRoot, 'slice7-yjs-compatibility.json');
  const compatibilityReport = existsSync(compatibilityFile) ? readJson(compatibilityFile) : null;
  const rootPackage = readJson(join(repoRoot, 'package.json'));
  const lockfile = readFileSync(join(repoRoot, 'yarn.lock'), 'utf8');
  return {
    declaredRange: packageJson.dependencies.yjs,
    installedVersion: installedManifest.version,
    resolution: rootPackage.resolutions?.yjs ?? null,
    patchFile: normalizePath(relative(repoRoot, patchFile)),
    patchFilePresent: existsSync(patchFile),
    lockfileContainsPatchLocator: lockfile.includes('yjs@patch:'),
    license: normalizedLicense(installedManifest.license),
    licenseFile: normalizePath(relative(repoRoot, installedLicense)),
    licenseSha256: sha256(installedLicense),
    registryArtifact: {
      package: 'yjs@13.6.21',
      integrity: 'sha512-/fzzyeCAfr3Qwx1D71zvumm64x+Q5MEFel6EhWlA1IBFxWPb7tei4J2a8CJyjpYHfVrRij5q3RJTK9W2Iqjouw==',
      shasum: '888b7077a7236120ae6b74e58ddbef3c9863825a',
      gitHead: '89dddc2a95079460b7203bde07f45dffd56629f2',
      officialTag: 'v13.6.21',
      officialTagCommit: '1f79e4c6f32c43362b2fbaa775604f46b3880da7',
    },
    installedUsesUint32: installedModule.includes('generateNewClientId = random.uint32'),
    installedUsesUint53: installedModule.includes('generateNewClientId = random.uint53'),
    compatibilityEvidenceFile: normalizePath(relative(packageRoot, compatibilityFile)),
    compatibilityVerdict: compatibilityReport?.verdict ?? 'MISSING',
    decision: 'USE_OFFICIAL_UNPATCHED_YJS_13_6_21',
    compatibilityEvidence: [
      'tests/slice7.yjs.pw.spec.ts',
      'evidence/slice7-yjs-compatibility.json',
      'tests/slice5b.e2e.spec.ts (targeted reconnect/convergence/per-user undo)',
      'tests/slice7.e2e.spec.ts',
    ],
    upstreamNoticeIncludedInGeneratedReport: true,
    finalRetainVersusUnpatchedReviewRequiredBeforeRelease: false,
  };
}

function currentCommit() {
  const gitPath = join(repoRoot, '.git');
  // Source archives have an explicit identity, not a borrowed upstream HEAD.
  if (!existsSync(gitPath)) {
    const statePath = join(repoRoot, 'SOURCE_STATE.json');
    if (!existsSync(statePath)) throw new Error('Missing Git metadata and SOURCE_STATE.json provenance');
    return `uncommitted-source-state:${readJson(statePath).snapshotSha256}`;
  }
  const actualGitPath = statSync(gitPath).isDirectory()
    ? gitPath
    : resolve(repoRoot, readFileSync(gitPath, 'utf8').replace(/^gitdir:\s*/, '').trim());
  const head = readFileSync(join(actualGitPath, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref: ')) return head;
  const ref = head.slice(5);
  const looseRef = join(actualGitPath, ...ref.split('/'));
  if (existsSync(looseRef)) return readFileSync(looseRef, 'utf8').trim();
  const packed = readFileSync(join(actualGitPath, 'packed-refs'), 'utf8')
    .split(/\r?\n/)
    .find(line => line.endsWith(` ${ref}`));
  return packed?.split(' ')[0] ?? 'UNKNOWN';
}

function sourceNoticeReport(bundle) {
  const emittedModules = readJson(join(distRoot, 'bundle-closure.json')).chunks.flatMap(chunk => chunk.modules.map(normalizePath));
  const included = file => emittedModules.some(moduleId => moduleId.endsWith(`/${file}`));
  const perfectFreehandEmitted = emittedModules.some(moduleId => moduleId.includes('/blocksuite/framework/global/src/gfx/perfect-freehand/'));
  return {
    generatedAt: new Date().toISOString(),
    repositoryCommit: currentCommit(),
    items: [
      {
        source: 'blocksuite/framework/store/src/adapter/base.ts',
        upstreamProject: 'Rich Harris estree-walker',
        upstreamReference: 'https://github.com/Rich-Harris/estree-walker',
        upstreamRevision: null,
        emitted: included('blocksuite/framework/store/src/adapter/base.ts'),
        status: included('blocksuite/framework/store/src/adapter/base.ts') ? 'pending-upstream-revision' : 'excluded',
        notice: 'MIT attribution marker preserved inline.',
      },
      {
        source: 'blocksuite/framework/global/src/gfx/math.ts',
        upstreamProject: 'Excalidraw hitTestFreeDrawElement',
        upstreamReference: 'https://github.com/excalidraw/excalidraw/commit/00c6940851b362da0d86f155269ef27a94d234c5',
        upstreamRevision: '00c6940851b362da0d86f155269ef27a94d234c5',
        upstreamBlob: 'b94e8e7c30f9350c2efa064904c405dd7f99b9c3',
        license: 'MIT',
        copyright: 'Copyright (c) 2020 Excalidraw',
        emitted: included('blocksuite/framework/global/src/gfx/math.ts'),
        status: included('blocksuite/framework/global/src/gfx/math.ts') ? 'verified' : 'excluded',
        notice: 'Exact upstream variant and MIT notice verified; upstream credit is preserved inline and the full license text is included in THIRD_PARTY_NOTICES.',
        localAdaptation: {
          blocksuiteCommit: 'ebdcea25b5dd8cf1ec851ffbb13d6e5c4dbb872d',
          blocksuiteBlob: '04ca7f64b510defc5e43c844b929a14e00afe317',
          affineImportCommit: '30200ff86dc4fd5e1966b5aa4507db8e924f16a5',
          currentPathCommit: '66d9d576e0af347248eb14609399ffaee6aa5857',
          currentSourceSha256: sha256(join(repoRoot, 'blocksuite/framework/global/src/gfx/math.ts')),
          changes: [
            'Renamed hitTestFreeDrawElement to isPointOnlines.',
            'Replaced Excalidraw element and point types with BlockSuite Bound, points, rotate, and hitPoint parameters.',
            'Replaced getElementAbsoluteCoords with Bound min/max coordinates and BlockSuite rotatePoint.',
            'Preserved the 00c6940 freehand-point fix: endpoint precheck and the segment loop from zero through points.length.',
            'Removed Excalidraw-specific comments and surrounding dispatch/bounds code; retained the inline upstream credit.',
          ],
        },
      },
      {
        source: 'blocksuite/framework/global/src/gfx/perfect-freehand',
        upstreamProject: 'perfect-freehand',
        upstreamReference: 'https://github.com/steveruizok/perfect-freehand',
        upstreamRevision: null,
        emitted: perfectFreehandEmitted,
        status: perfectFreehandEmitted ? 'pending-upstream-revision' : 'excluded',
        notice: 'Copyright (c) 2021 Stephen Ruiz Ltd; full MIT text preserved in the source tree.',
      },
    ],
  };
}

function cyclonedxSbom(report) {
  const componentRef = record => `${record.name}@${record.version}:${record.manifest}`;
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: report.generatedAt,
      component: { type: 'application', name: 'ReplayLab', version: packageJson.version, 'bom-ref': 'ReplayLab' },
      properties: [
        { name: 'replaylab:production-bundle-gzip-bytes', value: String(report.bundle.gzipBytes) },
        { name: 'replaylab:repository-commit', value: report.sourceNotices.repositoryCommit },
      ],
    },
    components: report.dependencyClosure.map(record => ({
      type: 'library',
      name: record.name,
      version: record.version,
      'bom-ref': componentRef(record),
      licenses: [{ license: { id: record.license } }],
      properties: [
        { name: 'replaylab:boundary-decision', value: record.boundaryDecision },
        { name: 'replaylab:emitted-in-browser-bundle', value: String(report.bundle.emittedPackages.includes(record.name)) },
        { name: 'replaylab:manifest', value: record.manifest },
      ],
    })),
    dependencies: [
      { ref: 'ReplayLab', dependsOn: report.dependencyClosure.filter(record => report.directDependencies.includes(record.name)).map(componentRef) },
      ...report.dependencyClosure.map(record => ({ ref: componentRef(record), dependsOn: [] })),
    ],
  };
}

const dependencies = dependencyClosure();
const bundle = inspectBundle();
const serverClosureFile = join(packageRoot, 'server-dist/bundle-closure.json');
const serverClosure = existsSync(serverClosureFile) ? readJson(serverClosureFile) : null;
const serverModules = serverClosure?.chunks.flatMap(chunk => chunk.modules) ?? [];
const serverFiles = new Set(serverClosure?.chunks.map(chunk => chunk.fileName) ?? []);
const serverImports = [...new Set(serverClosure?.chunks.flatMap(chunk => chunk.imports) ?? [])];
const serverFailures = [
  ...(!serverClosure ? ['Missing server build closure; run build:server'] : []),
  ...serverModules.filter(module => !normalizePath(module).startsWith(normalizePath(packageRoot) + '/src/')).map(module => `Unexpected server module: ${module}`),
  ...serverImports.filter(name => !name.startsWith('node:') && !serverFiles.has(name) && !['ws', 'yjs', 'fractional-indexing'].includes(name)).map(name => `Unexpected server external: ${name}`),
];
const sources = inspectProductSources();
const notices = inspectNotices();
const inlineProvenance = inspectInlineProvenance();
const yjsCompatibility = inspectYjsCompatibility();
const sourceNotices = sourceNoticeReport(bundle);

const closureNames = new Set(dependencies.records.map(record => record.name));
const emittedOutsideClosure = bundle.emittedPackages.filter(name => !closureNames.has(name));
const deniedPackages = dependencies.records.filter(record =>
  deniedPackagePrefixes.some(prefix => record.name.startsWith(prefix))
);
const rejectedLicenses = dependencies.records.filter(record => !acceptedLicenses.has(record.license));
const failures = [
  ...serverFailures,
  ...(readFileSync(join(distRoot, 'bundle-closure.json'), 'utf8').includes('05-affine-transform') ? ['Stale renamed-root paths in client closure'] : []),
  ...(dependencies.missing.length ? [`Missing dependencies: ${dependencies.missing.map(item => item.name).join(', ')}`] : []),
  ...(deniedPackages.length ? [`Denied packages: ${deniedPackages.map(item => item.name).join(', ')}`] : []),
  ...(rejectedLicenses.length ? [`Unapproved licenses: ${rejectedLicenses.map(item => `${item.name}:${item.license}`).join(', ')}`] : []),
  ...(emittedOutsideClosure.length ? [`Emitted outside declared closure: ${emittedOutsideClosure.join(', ')}`] : []),
  ...(bundle.forbiddenModules.length ? [`Forbidden bundle modules: ${bundle.forbiddenModules.length}`] : []),
  ...(bundle.unexpectedRepoModules.length ? [`Unexpected repository modules: ${bundle.unexpectedRepoModules.length}`] : []),
  ...(sources.forbidden.length ? [`Forbidden product source markers: ${sources.forbidden.length}`] : []),
  ...(sources.protocolMarkers.length ? [`AFFiNE protocol marker candidates: ${sources.protocolMarkers.length}`] : []),
  ...(bundle.gzipBytes > bundle.budgetGzipBytes ? [`Bundle gzip budget exceeded: ${bundle.gzipBytes}`] : []),
  ...(!inlineProvenance.every(item => item.present) ? ['Inline provenance marker missing'] : []),
  ...(yjsCompatibility.installedVersion !== '13.6.21' ? [`Unexpected Yjs version: ${yjsCompatibility.installedVersion}`] : []),
  ...(yjsCompatibility.resolution !== 'npm:13.6.21' ? [`Unexpected Yjs resolution: ${yjsCompatibility.resolution}`] : []),
  ...(yjsCompatibility.license !== 'MIT' ? [`Unexpected Yjs license: ${yjsCompatibility.license}`] : []),
  ...(!yjsCompatibility.installedUsesUint32 ? ['Official Yjs uint32 client-id generator is not active'] : []),
  ...(yjsCompatibility.installedUsesUint53 ? ['A uint53 Yjs client-id modification is active'] : []),
  ...(yjsCompatibility.patchFilePresent ? ['Legacy Yjs patch file is still present'] : []),
  ...(yjsCompatibility.lockfileContainsPatchLocator ? ['yarn.lock still contains a Yjs patch locator'] : []),
  ...(yjsCompatibility.compatibilityVerdict !== 'PASS' ? [`Yjs compatibility evidence is ${yjsCompatibility.compatibilityVerdict}`] : []),
];

const releaseTestBlockers = [];
for (const [name, minimum] of [['release-tests.json', 74], ['release-durability.json', 10]]) {
  const path = join(evidenceRoot, name);
  const stats = existsSync(path) ? readJson(path).stats : undefined;
  if (!stats || stats.expected < minimum || stats.unexpected || stats.flaky || stats.skipped) releaseTestBlockers.push(`Technical release gate is not green: ${name}.`);
}
const report = {
  generatedAt: new Date().toISOString(),
  verdict: failures.length ? 'FAIL' : 'PASS',
  scope: `@replaylab/foundation ${auditSlice} production runtime`,
  directDependencies: dependencies.directNames,
  dependencyClosure: dependencies.records,
  bundle,
  serverBundle: { modules: serverModules.map(module => normalizePath(relative(repoRoot, module))), imports: serverImports, failures: serverFailures },
  sourceBoundaryScan: sources,
  noticeInventory: notices,
  inlineProvenance,
  yjsCompatibility,
  sourceNotices,
  explicitBoundaryDecisions: {
    blocksuiteFrameworkKernel: 'GO: global/store/std/sync only through ReplayLab facades/adapters',
    blocksuiteAffineCandidates: 'DENIED: zero direct, transitive, or emitted modules',
    affineApplicationShell: 'DENIED: zero use',
    backendNativeEnterpriseProtocol: 'DENIED: zero use',
    storeWithoutTransact: 'AVOID: fallible drafts validate before Store.transact',
    gfxCompatibility: 'NARROW_ISOLATION: public local-element APIs; compatibility test pins the host-independent base hit test used without an AFFiNE shell',
    excalidrawHitTest: 'VERIFIED_MIT: exact upstream revision 00c6940851b362da0d86f155269ef27a94d234c5; local adaptation chain and changes recorded',
    yjsRuntime: 'OFFICIAL_UNPATCHED_13_6_21: uint32 client-id generator active; legacy uint53 update interoperability tested',
    dompurify: 'ACCEPT_APACHE_2_OPTION: package is dual-licensed and installed LICENSE is Apache-2.0',
    fractionalIndexing: 'ACCEPT_CC0_1_0: permissive public-domain dedication; preserve license inventory',
  },
  failures,
  releaseReview: {
    status: 'BLOCKED',
    technicalStatus: failures.length || releaseTestBlockers.length ? 'BLOCKED' : 'GREEN',
    allowedUse: 'ReplayLab name and current mark authorized by the owner for a noncommercial public portfolio release.',
    blockers: [
      ...releaseTestBlockers,
      'Independent trademark availability check is not complete.',
      'Public domain selection and availability check are not complete.',
      'Public-domain deployment is not authorized in Slice 7.',
      ...sourceNotices.items.filter(item => item.status.startsWith('pending')).map(item => `Record exact upstream revision for ${item.upstreamProject}.`),
      'Manual screen-reader review is not recorded.',
      'Human review of the silent 30-second capture and complete 60-second demo is not recorded.',
    ],
  },
};

mkdirSync(evidenceRoot, { recursive: true });
writeFileSync(join(evidenceRoot, `${auditSlice}-audit.json`), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(evidenceRoot, `${auditSlice}-license-inventory.json`), `${JSON.stringify({
  generatedAt: report.generatedAt,
  scope: report.scope,
  acceptedLicenses: [...acceptedLicenses].sort(),
  dependencies: report.dependencyClosure.map(record => ({
    ...record,
    emittedInBrowserBundle: bundle.emittedPackages.includes(record.name),
  })),
  rejectedLicenses,
}, null, 2)}\n`);
writeFileSync(join(evidenceRoot, `${auditSlice}-source-notices.json`), `${JSON.stringify(sourceNotices, null, 2)}\n`);
writeFileSync(join(evidenceRoot, `${auditSlice}-sbom.cdx.json`), `${JSON.stringify(cyclonedxSbom(report), null, 2)}\n`);
const thirdPartyNotices = `# ReplayLab third-party notices\n\n` +
  `Generated for repository commit \`${sourceNotices.repositoryCommit}\`. This inventory supplements and does not replace the preserved root and nested license files.\n\n` +
  `## Runtime dependencies\n\n` +
  report.dependencyClosure.map(record => {
    const paths = record.noticeFiles.length
      ? record.noticeFiles.map(item => `\`${item.file}\` (SHA-256 \`${item.sha256}\`)`).join('; ')
      : 'No package-root notice file discovered; SPDX metadata retained in the license inventory.';
    return `- **${record.name} ${record.version}** — ${record.license}; ${bundle.emittedPackages.includes(record.name) ? 'emitted browser runtime' : 'runtime closure only'}; ${paths}`;
  }).join('\n') +
  `\n\n## Embedded source notices\n\n` +
  sourceNotices.items.map(item => `- **${item.upstreamProject}** — ${item.status}; ${item.notice} Source: \`${item.source}\`.`).join('\n') +
  `\n\n## Excalidraw-derived hit test\n\n` +
  `Exact source revision: [excalidraw/excalidraw@00c6940851b362da0d86f155269ef27a94d234c5](https://github.com/excalidraw/excalidraw/commit/00c6940851b362da0d86f155269ef27a94d234c5), \`src/element/collision.ts\` blob \`b94e8e7c30f9350c2efa064904c405dd7f99b9c3\`. The adapted BlockSuite source is \`blocksuite/framework/global/src/gfx/math.ts\`; the generated source-notice report records the adaptation chain and local changes.\n\n` +
  `\`\`\`text\n${excalidrawMitNotice}\n\`\`\`\n\n` +
  `## Yjs\n\nReplayLab uses official, unmodified Yjs ${yjsCompatibility.installedVersion} under MIT. Resolution \`${yjsCompatibility.resolution}\` is pinned in the root manifest and lockfile; \`${yjsCompatibility.licenseFile}\` has SHA-256 \`${yjsCompatibility.licenseSha256}\`. No Yjs patch file, patch locator, uint53 fork, or hidden client-id modification is active. Compatibility evidence covers legacy uint53 updates, convergence, IndexedDB application behavior, reconnect, and per-user undo.\n`;
writeFileSync(join(evidenceRoot, 'THIRD_PARTY_NOTICES.md'), thirdPartyNotices);
const markdown = `# ${auditSlice} boundary audit\n\n` +
  `Verdict: **${report.verdict}**\n\n` +
  `- Direct runtime dependencies: ${dependencies.directNames.length}\n` +
  `- Direct/transitive runtime closure: ${dependencies.records.length} package instances\n` +
  `- Emitted runtime packages: ${bundle.emittedPackages.length}\n` +
  `- Production JavaScript: ${bundle.rawBytes} raw bytes; ${bundle.gzipBytes} gzip bytes; budget ${bundle.budgetGzipBytes} gzip bytes\n` +
  `- Forbidden bundle modules: ${bundle.forbiddenModules.length}\n` +
  `- Forbidden product markers: ${sources.forbidden.length}\n` +
  `- AFFiNE protocol marker candidates: ${sources.protocolMarkers.length}\n` +
  `- Inline provenance markers preserved: ${inlineProvenance.filter(item => item.present).length}/${inlineProvenance.length}\n` +
  `- Yjs: official unpatched ${yjsCompatibility.installedVersion}; uint32 generator active; no patch file/locator/uint53 modification\n` +
  `- Release review: ${report.releaseReview.status}; ${report.releaseReview.blockers.length} explicit blocker(s)\n` +
  `- Generated artifacts: license inventory, CycloneDX 1.5 SBOM, source-notice report, and THIRD_PARTY_NOTICES\n\n` +
  `Full machine-readable evidence: \`${auditSlice}-audit.json\`.\n` +
  (failures.length ? `\n## Failures\n\n${failures.map(failure => `- ${failure}`).join('\n')}\n` : '');
writeFileSync(join(evidenceRoot, `${auditSlice}-audit.md`), markdown);

console.log(JSON.stringify({
  verdict: report.verdict,
  dependencyInstances: dependencies.records.length,
  emittedPackages: bundle.emittedPackages.length,
  rawBytes: bundle.rawBytes,
  gzipBytes: bundle.gzipBytes,
  forbiddenModules: bundle.forbiddenModules.length,
  releaseReview: report.releaseReview.status,
  releaseBlockers: report.releaseReview.blockers,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
