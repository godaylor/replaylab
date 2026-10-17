# Courtside redesign — 2026-10-17

Owner scope: full coach-facing redesign, RU/EN, preserved local documents/recovery/undo/rooms, and verification of the existing publication. Work targets the standalone repository, not the historical enclosing checkout. No new hosting, paid plan, database schema, permission or canonical document/protocol changes.

## Design decision

Three imagegen directions: A blue evening coaching board; B daylight training court; C arena control desk. Choose B: daylight makes the court and player paths readable in a gym and clearly separates this editor from the previous dense diagnostic surface. Generated linework/copy is visual reference only; original correct half-court geometry and product vocabulary govern implementation.

Tokens: marine `#18364a`, cobalt `#2459a6`, slate `#edf2f7`, white `#ffffff`, court `#e1ecf2`, orange `#c84d16`. Display: restrained Bahnschrift/Arial Narrow; body: Segoe UI/system; numeric utility: system monospace. No downloaded fonts or third-party art. Signature: the same miniature half-court/ten-player projection in the phase filmstrip and example card.

Desktop: compact masthead → save/role strip → contextual next action → dominant court with tools → playback → phase filmstrip. A compact semantic lineup and cue panel remains keyboard reachable. Storage/export/diagnostics and extended explanations use explicit disclosures. Mobile preserves viewing, scrubbing and semantic review; no new authoring capability.

First use: open a separate seeded example → move a player → choose/draw an action → add phase → play → automatic local save → recent reopen. Never reseed an existing document. No save button as durability model.

Playback UX: the first start after adding a phase, or a start from the final static phase, restarts from phase one, including the presenter button/Space path. This lets “add phase → play” demonstrate the whole combination. Pausing/resuming other phases retains the current position. This changes only local playback intent, not canonical poses or the deterministic interpolation model.

## Availability investigation

Reproduced Render loading interstitial in the in-app browser. After the owner signed in, current Render application logs showed repeated process termination at `SupabaseRoomStorage.readResponse`, `Supabase room read unavailable`, before the HTTP listener. This confirms the application startup failure, not its underlying DNS/TLS/remote database cause. Independent Node health fetch timed out at 15 seconds; local DNS resolution of the existing Supabase hostname timed out. The Supabase dashboard still required authentication at the last inspection. These observations do not establish Russia/VPN availability or identify a Render infrastructure fault.

Render's current successful deployed commit at discovery was `fe37fb0c4372f40b2ac3984f53a2649d5bd4ed7b`, while the source repository's current `main` was `5c85f7387304240e4b5651436f59e26458ba7385`. Existing Render service, Frankfurt Free plan, Docker build path, `main` branch and `/healthz` health check were verified read-only. No replacement service, database reset or permission change is part of this work.

Confirmed application startup coupling in `server-entry.ts`: hosted room loading awaited before `http.listen`; five timed fetch attempts plus backoff can delay or terminate the entire HTTP shell. Fix: listen independently, expose collaboration readiness separately, refuse room operations until complete validated storage load, retry external startup failures without falling back to ephemeral storage. Existing room records and snapshots stay untouched.

## Evidence

Current checks, screenshots and publication limits will be recorded after implementation. Human screen-reader, physical touch, IME and independent name/mark clearance remain open.
