import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const state = JSON.parse(readFileSync(join(root, 'SOURCE_STATE.json'), 'utf8'));
if (state.format !== 'replaylab-source-state-v1' || hash(JSON.stringify(state.files)) !== state.snapshotSha256) throw new Error('Invalid source inventory identity');
const seen = new Set();
for (const file of state.files) {
  if (isAbsolute(file.path) || file.path.includes('\\') || file.path.split('/').some(part => !part || part === '.' || part === '..') || seen.has(file.path)) throw new Error('Invalid source inventory path');
  seen.add(file.path);
  let cursor = root;
  for (const part of file.path.split('/')) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`Source symlink is not allowed: ${file.path}`);
  }
  if (hash(readFileSync(cursor)) !== file.sha256) throw new Error(`Source differs from snapshot: ${file.path}`);
}
for (const required of ['LICENSE', 'LICENSE-MIT', 'README.md', 'PLAN.md', 'AGENTS.md', 'FINAL_AUDIT.md', '.dockerignore', 'render.yaml', 'deploy/supabase/schema.sql', 'docs/SOURCE_STATE.md', 'docs/LICENSE_BOUNDARIES.md', 'docs/REUSABLE_SCOPE.md', 'docs/TRANSFORMATION_SPEC.md', 'docs/ARCHITECTURE.md', 'docs/BASELINE_AUDIT.md', 'docs/PRODUCT_OPTIONS.md', 'docs/EMERGENCY_JOURNAL.md', 'docs/RELEASE.md']) {
  if (!seen.has(required)) throw new Error(`Missing required contract: ${required}`);
}
const workflows = readdirSync(join(root, '.github/workflows'));
if (workflows.length !== 1 || workflows[0] !== 'replaylab.yml') throw new Error('Unexpected inherited workflow');
console.log(JSON.stringify({ verdict: 'PASS', files: seen.size, snapshotSha256: state.snapshotSha256, workflows }));
