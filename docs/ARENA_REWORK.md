# Arena rework · 2026-10-17

The owner rejected the previous daylight redesign: its row-aligned players,
unnamed phases and equally prominent controls did not communicate a basketball
idea. The previous `after-*.png` images are historical evidence of that rejected
version, not acceptance evidence for this revision.

## Product experience

The display name is now **Пятый темп / Fifth Tempo**, an original working name.
An initial exact-name web search did not establish an identical basketball app;
this is not a trademark, company, domain or store clearance. That release review
remains open. Existing ReplayLab URLs, storage keys, protocol names, package names
and recovery formats remain compatible.

The first experience is a moving pick-and-roll example, with a pause control.
Opening it creates a separate local copy with four meaningful states:

1. Spacing: 1 has the ball, 2/3 hold the corners, 4 spaces the floor, 5 approaches.
2. Screen: 5 sets a screen beside 1's defender.
3. Drive: 1 turns the corner; 5 rolls into the lane while help commits.
4. Pass: 1 finds 5 near the rim. The ball's final possession belongs to 5.

Ten complete player poses, five adjacent-transition actions, rich cue blocks
and the existing derived ball are stored through the existing seed/domain
contracts. The template is an original simplified illustration, not copied
coaching material. It adds no shot, roster, video or new tactical action type.

This seed runs only for a **new** example without an existing replay root. It
does not reseed an existing document, including a legacy example reopened with
`lesson=1`. A new blank play has two identical spread formations and blank cues,
without prewritten actions. Ordinary legacy fixture defaults are unchanged.

Named example steps, the current coach explanation and an active timeline state
explain the play while it moves. Player/action controls and rich cue formatting
are disclosed on demand. The accessible actor/action DOM remains available
inside native keyboard-operable disclosures. The optional guide opens those
disclosures before focusing a target. Edited cues are displayed as saved; only
untouched template cues are projected into the selected interface language.

Playback still never changes Yjs. Pausing selects the visible phase for the next
edit. Clicking the court or using an editing arrow during playback pauses first,
preventing an accidental edit against an older selected keyframe. Undo aligns
the paused canvas with a restored editing selection. These have regression tests.

Interactive drawing also sets the next frame's actor endpoint (cut, dribble,
screen) or possession (pass). A dribble retains its holder. Action and endpoint
undo as one command while preserving concurrent remote candidates. Invalid
drafts write nothing. The older annotation-only API remains compatible.
One resolved adjacent path whose endpoints match the full canonical poses drives
the animation; ambiguous/stale paths defer to the canonical pose interpolation.
Home and the editor share the original template paths and deterministic sampler.

Add phase appends to the end and keeps the new transition's start selected.
Drawing is immediately available; the new final position receives the endpoint.
This avoids an add-phase loop where the final frame always disables drawing.
Existing action adjacency is preserved. Playing after an edit starts the whole
combination; an explicit manual phase choice can be played from that point.

The keyboard action dialog keeps validation errors visible and focus contained.
Failed recovery import opens a localized visible alert, permits retrying the
same file and leaves the original document bytes unchanged.

## Visual and motion decisions

Three new directions were generated: Arena, Studio and Pulse. Arena was selected
for the dark theme; Studio's warm paper/forest palette informs the light theme.
The reference board covers dark/light authoring and mobile review. The real
implementation uses a smaller horizontal timeline to keep the court and play
control usable in short desktop windows; unlike the reference, its geometry is
strictly a single half-court with one basket at the right.

- Original generated hardwood material, self-hosted at 321,272 bytes.
- Dimensional orange offense circles, teal defense squares and a derived ball.
- Warm spot lighting and a cached canvas material, without a 3D runtime library.
- Oswald variable font with Cyrillic/Latin, self-hosted, unmodified, 172,088 bytes.
- A floating, animated demonstration on Home; the editing court stays flat so
  pointer positions and the accessible coordinate controls agree.
- Motion pauses offscreen/when hidden; the example has a pause button. Reduced
  motion disables automatic demonstration motion and decorative transitions.
- Theme and language preferences persist locally. Appearance failure never
  blocks opening a document.

No runtime fonts, images, CDN scripts or animation services are fetched from
third-party hosts. The texture/font are primed by service worker v4 for cold
offline launch; the prior cache is retained during upgrades. A failed texture
load has a procedural color fallback.

## Provenance and packaging

The font is the sole new third-party asset. Its exact upstream revision,
SHA-256, OFL-1.1 notice and emitted copy are verified by the audit script. This
asset-specific decision does not broaden accepted package licenses or the four
approved BlockSuite roots. The full font license ships at `/legal/OFL-Oswald.txt`
and in generated third-party notices; both assets appear in the SBOM and license
inventory. Prompts and image identities are in `design/ARENA_PROMPTS.md`.

The production static handler now explicitly permits hashed `.jpg` and `.ttf`
assets with their correct MIME types. It still rejects source maps, arbitrary
paths and traversal. A real server test verifies both material assets and the
font license, rather than relying only on Vite preview.

## Hosting and access boundaries

The earlier confirmed hosting diagnosis remains applicable: hosted room reads
failed before the old server started listening. Local HTTP startup and room
readiness were separated in commit `1db56b1`; those fixes are retained. Render
has not yet received either local redesign revision. The actual origin and
deployment state are recorded in `PRODUCTION_VERIFICATION.md`.

The text “no permission to view this resource in the workspace” reported by the
owner is not an error string in this application's source. It may have come
from a protected preview surface; that attribution is an inference until the
failing URL is known. The local delivery URL is plain HTTP on the owner's
computer, without a Codex workspace authorization step.

No controlled Russian connection or VPN-on/off pair is available. Browser-engine
tests on this machine do not establish availability from Russia. The actual
user's Chrome profile/extension/VPN state is also a separate condition.

## Acceptance evidence

See `PRODUCTION_VERIFICATION.md` for exact current results and remaining manual
reviews. Generated references are `design/arena-concepts.png` and
`design/arena-key-screens.png`. `arena-*.png` captures are the real implementation;
the earlier `after-*.png` captures are the rejected daylight version.
