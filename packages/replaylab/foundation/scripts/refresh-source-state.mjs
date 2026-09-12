import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const statePath = resolve(root, 'SOURCE_STATE.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const old = new Map(state.files.map(file => [file.path, file]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(path => path && path !== 'SOURCE_STATE.json').sort();
state.files = [...new Set(paths)].map(path => ({ ...old.get(path), path, sha256: hash(readFileSync(resolve(root, path))), origin: old.get(path)?.origin ?? 'original-replaylab' }));
state.snapshotSha256 = hash(JSON.stringify(state.files));
state.history = 'Standalone godaylor/replaylab source. Original upstream kernel commit/blob provenance is retained per file; owner changes are recorded in Git.';
state.verification = 'Snapshot hashes cover exact source bytes. Runtime checks and their dates are recorded in evidence and PLAN.md.';
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log(`Inventoried ${state.files.length} source files`);
