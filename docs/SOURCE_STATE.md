# ReplayLab source state

The source export is a reviewable starting tree for an owner's repository, not a fabricated commit history. The original checkout and its upstream remote remain unchanged. Commits, remote selection, pushes, hosted Actions and publication require separate owner instructions.

Before adopting an export, run `node packages/replaylab/foundation/scripts/verify-source.mjs` inside it. This verifies the complete snapshot hash, every inventoried file, required documents and the single-workflow policy. CI retains this integrity gate. When intentionally changing source later, prepare a fresh export (also supported from an existing source state), review its file diff and new manifest together, and adopt both as one reviewed change. Do not reuse a stale manifest or remove the verifier to make CI green. Regenerated audit/test evidence also changes the snapshot; keep it with the corresponding reviewed inventory.

Run from the installed upstream working tree with Node 22 and repository Yarn 4.18.0:

```sh
node packages/replaylab/foundation/scripts/prepare-source.mjs
```

The command creates a fresh `tmp/replaylab-source-*` directory without replacing any previous export or user data. It includes only the four approved BlockSuite kernel roots, ReplayLab source/tests/scripts, dated evidence, required project contracts, root and retained nested licenses, runtime patches, Yarn, and the single ReplayLab workflow. It copies no Git metadata, denied implementation roots, inherited upstream workflows, browser profiles or room databases. The original baseline's remaining licenses and source stay untouched in the original checkout.

The exported root manifest has exactly five workspaces and product development tools; TypeScript root configuration removes references to excluded applications. Existing resolution choices and the reviewed lock seed are retained; Yarn prunes the lock in the export without changing the original lock. Lifecycle scripts are disabled. Generated configuration changes are classified in `SOURCE_STATE.json`; framework bytes retain upstream Git blob IDs and materialized SHA-256 hashes. Root license texts are copied byte-for-byte and remain authoritative. Historical reports are not proof of a fresh build of this exported tree.

`SOURCE_STATE.json` inventories every source file and hashes the ordered inventory. It explicitly distinguishes the upstream baseline from the uncommitted ReplayLab working tree and makes no claim about individual authorship or intermediate history. `node_modules` and Yarn install state are local conveniences excluded from the inventory. Recreate dependencies in a clean copy with:

```sh
node .yarn/releases/yarn-4.18.0.cjs install --immutable --mode=skip-build
cd packages/replaylab/foundation
node ../../../.yarn/releases/yarn-4.18.0.cjs typecheck
node ../../../.yarn/releases/yarn-4.18.0.cjs build
node ../../../.yarn/releases/yarn-4.18.0.cjs build:server
node ../../../.yarn/releases/yarn-4.18.0.cjs audit
```

Only this exported tree should become the owner's repository. Review the inventory, then create real commits when authorized; do not claim upstream commits as ReplayLab implementation history. Do not copy the original `.github` directory over the export. Before a public release, run the existing `verify:release` and hosted workflow on the selected repository and complete every external/manual gate in `FINAL_AUDIT.md`.
