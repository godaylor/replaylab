# Production verification — 2026-09-13

- Live: https://replaylab-godaylor.onrender.com
- Runtime commit: fe37fb0c4372f40b2ac3984f53a2649d5bd4ed7b
- CI: https://github.com/godaylor/replaylab/actions/runs/34770869306
- Render service: replaylab-godaylor, srv-dah9cq1t0dsc73f4ou50, Free unchanged.
- Successful deploy: dep-dajdl5h42hec73bhf00g.
- Existing Supabase project: wxyoplenptrntdfrlzyf.

## Observed public results

| Check | Result |
| --- | --- |
| Create local play, rename, move player and reopen through recent list | PASS; title and offense-1 x=115 retained |
| Create private collaborative room through the public interface | PASS; edit and view links returned separately |
| Second client with a different IndexedDB name | PASS; correct title and initial pose loaded |
| First client moves offense-1 | PASS; second client receives x=120 |
| Second client moves defense-1 | PASS; first client receives y=315 |
| View capability with a third local database | PASS; correct title and both poses, read-only title and role |
| Close all room clients, restart only ReplayLab, open another fresh database | PASS; correct title, x=120 and y=315 restored, network status synced |

Public checks used the in-app browser with distinct local database namespaces.
The IndexedDB source's BroadcastChannel is scoped to its database name, so these
clients could exchange data only through the network shadow. The local/CI suite
also uses independent browser contexts. A separate headless production run could
not reach the origin from its network environment; it is not counted as passed.

## Database boundary

Executed exactly `GRANT INSERT ON public.replaylab_rooms TO service_role` after
the owner's explicit confirmation. Before: 1 room, RLS true, service INSERT false,
no anon/authenticated table grants. After grant: 1 room, RLS true, INSERT true,
no public-role grants. After synthetic verification: 3 rooms, RLS true, INSERT
true, still no public-role grants. The original room was not opened or modified.
Two synthetic verification rooms were retained; no rows were deleted. No secrets
or invitation capabilities are included in these published materials.

## Release checks and fixes

80/80 tests and 10/10 abrupt-close repetitions passed in GitHub CI, along with
typecheck, lint, client/server build, source inventory, provenance, isolated Node
package smoke, Docker build and non-root container backup/restore smoke.

The release checks exposed Linux font-dependent mobile header overflow; controls
now wrap. A real Supabase 504 exposed startup fragility; only transient reads are
retried with a bounded delay. A first-time join during transport failure exposed
unsafe seeding; a client without a local copy now stops before creating/uploading
replacement blocks. A regression test verifies the server update is byte-for-byte
unchanged after that failed join and the correct title survives a successful retry.

No global Git configuration or auth login/logout was changed. Publication used
ordinary Git transport. Other PetProjects processes, containers, networks and
volumes were not changed.

## Open limitations

Render Free cold starts, one server instance and a 32-room cap remain deliberate
deployment limits. Human screen-reader/device/IME review, full demonstration
review and independent working-name clearance remain open.
