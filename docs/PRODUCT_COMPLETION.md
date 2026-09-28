# Product completion — 2026-09-11

The owner explicitly requested a standalone working product, browser room creation,
public deployment and repository completion. Reuse the existing godaylor/replaylab
repository and Render + Supabase service; do not provision a replacement host.
The historical no-publication authorization restriction is superseded by that request.
Licensing, canonical data and manual-review boundaries remain unchanged.

## Decisions

- The home route creates individually identified plays and keeps a disposable local
  recent-navigation index. Titles are derived from the document, never authoritative.
  Capability URLs are excluded from this index. No folders or general workspace model.
- Browser room creation copies the validated current play into a new private room;
  the original local document remains unchanged and accessible. A new room starts
  with the exact encoded Yjs update. Joining it never seeds a competing document.
- New HTTP `POST /api/rooms` provisions a random room ID and independent 256-bit
  read/write capabilities. Only hashes are durable. It is same-origin, bounded to
  256 KiB decoded updates, schema-validated, rate-limited, and restricted by the
  existing 32-room cap. No discovery/list endpoint. Tokens are returned once in
  private fragment links, not logs or query parameters.
- The existing server-only Supabase storage remains the hosted network shadow.
  Room creation requires an INSERT grant for service_role only; browser roles
  remain denied with RLS enabled. Existing rows are neither rewritten nor deleted.
- Use one server instance, as required by the existing in-memory room fanout and
  serialized snapshot persistence. The browser remains local-first authority.
- A first-time room join with failed network bootstrap must not seed or upload a
  replacement document. It opens read-only until the user can reload successfully.
  Existing IndexedDB or recovered journal documents remain available offline.

## UX references

Reviewed the public product surfaces of [CoachCanvas](https://coachcanvas.app/),
[OpenDraw](https://opendraw.pro/) and [Coach Board](https://www.coachboard.app/sports/basketball).
Useful patterns: an immediate create action, recent work, action vocabulary and
phase playback. No code, assets or branding were copied. ReplayLab keeps its
original half-court linework, coral offense, cyan defense and amber playback accents.

## Infrastructure discovered

- GitHub: https://github.com/godaylor/replaylab (main)
- Render service: replaylab-godaylor, srv-dah9cq1t0dsc73f4ou50, Frankfurt Free
- Live origin: https://replaylab-godaylor.onrender.com
- Existing deployed revision at discovery: b9e0e404af8bf8e4d0ea32f404e4e61d283a0488
- No new host, account, paid resource or document migration is required.

The open root is a historical AFFiNE checkout. Its original files and user data
are retained; the standalone working copy is standalone inside the same
project. Automatic approval rejected wholesale root replacement, so it is not
being retried indirectly. Only the five allowlisted workspaces are published.
# V3 beginner workflow — 2026-09-28

Owner-authorized scope: understandable basketball entry, tools, guided practice,
portable copies and collaboration verification. Existing standalone repository,
Render target and Supabase data are retained; no tariff/privilege/schema changes.

- The former disappearing onboarding strip is replaced with one repeatable,
  non-modal guide. Its controls never run document commands. Starting from a
  personal play creates a UUID-named practice copy; reopening a practice keeps it.
- New practice seeds include a synthetic pass and phase-two possession. Seeding
  runs only for an empty document through the existing seed transaction; existing
  records, room joins and recovery data are not reseeded. Canonical schema is unchanged.
- `archiveAction` uses the existing archived field, prevalidates the record, and
  commits through the local typed-command/history path. The record and concurrent
  path data remain present. Undo restores the action; no hard deletion is added.
- Reflow fixes the existing tablet header minimum widths. The guide uses normal
  page flow, supports keyboard/focus return and missing-target fallback, and offers
  a shorter mobile review path. No full mobile editing is claimed.
