# Local Linux release verification — 2026-09-08

Actual `verify:release` exit 0: typecheck, client/server build, 74 tests, ten unchanged immediate-close repetitions, boundary/license audit and 942-file packaging. Reports in this directory were copied from the exited test container, not from Windows.

Environment: Node 22.15.1 from node:22.15.1-bookworm-slim and Playwright v1.58.2-noble, Chromium 145.0.7632.6. Container `replaylab-ci-final-20260908`, image `sha256:a87d82d0c8ce628caf2c1ee831b63a92e6a7537dbf69b6929526d8d04171784d`, 4,000,000,000 NanoCPUs, CPU affinity 0–3, memory cap 8,589,934,592 bytes, 1-GiB shared memory, no published host ports. OS APIs report host CPU/memory; Docker caps are stated separately, not misrepresented as dedicated hardware.

The image was built from the minimal local CI context (workspace manifests, four approved framework roots, product sources and inherited tsconfig chain), with repository Yarn focus. Registry TLS timeouts prevented one subsequent image refresh. The final stopped container received the current crash test, release packager, RELEASE.md and EMERGENCY_JOURNAL.md with explicit `docker cp` before `docker start -a`; application code and dependency closure were unchanged. This is a local Linux pipeline execution, not a claim that GitHub Actions has run.

Initial Linux execution had 72 pass / two Page.crash timeouts. An isolated Chromium diagnostic confirmed SIGKILL of renderer PIDs reported by that test browser emits the required crash event. The final tests use this actual abrupt process termination on Linux, with IndexedDB push deliberately stalled and no unload/blur event. No recovery assertion, timeout or application behavior was relaxed. Final nine journal tests and all existing tests pass.

Canonical dedicated-runner measurements and the owner's hosted workflow remain external publication gates. No upstream service/container, global Docker setting or real browser data was changed.
