# Visual polish — 2026-10-22/23

The owner requested a fast design, motion and layout pass on the existing
basketball application. References to Daily Mirror and a capital map were
explicitly withdrawn. The existing name Fifth Tempo / Пятый темп is retained.

## Direction

Keep the live court as the signature. The charcoal arena (#0b1617), deep teal
surface (#122326), warm white (#f3eedf), ball orange (#f47737) and muted teal
(#a8b9b4) retain the basketball identity. Oswald carries short headings; system
sans carries controls and explanations. This is a refinement of the implemented
scene, not a claim to match the photorealistic generated reference.

The opening screen pairs a plain purpose statement and two actions with the
live example. The lower section becomes a small play library beside the private
room form. The editor keeps its large interactive court and gives the playback
control, current step and current tool stronger emphasis.

## Implemented scope

- Shorter home copy and useful empty state; original decorative half-court SVG;
  readable recent-play cards, count and dates; clearer shared-room form.
- Compact hero, grouped library surfaces, larger sequence controls, persistent
  active-step marker and explicit hover/focus states.
- Progressive native page crossfade, short entrance/step/panel animations and
  scroll-linked lower-section reveal. Unsupported browsers retain visible content
  and normal navigation. No animation library, timer or scroll interception.
- Reduced motion and forced colors suppress the new animation. Canvas and
  draggable-step geometry is never transformed by decorative effects.
- Existing schema, canonical state, undo, recovery, collaboration and dependencies
  are unchanged. No user documents or hosted rooms are reset.

## Verification

Typecheck, client build, lint and technical provenance audit pass. JavaScript
gzip is 246,822 bytes; 78 dependency instances, 31 emitted packages and zero
forbidden modules. Focused checks pass **26/26**: responsive RU/EN, keyboard,
direct 3D authoring, coach flow, accessibility and maximum-scene performance.
The final responsive/keyboard/motion and home accessibility recheck passes
**4/4**, without skips or retries, after correcting generic-element ARIA naming.
Widths: 320, 390, 820, 1280
and 1440 pixels. Reports: `visual-polish-tests.json` and `visual-polish-final.json`
in foundation evidence. The maximum 3D fixture measured 59.98 FPS, p95 frame
16.8 ms, input-to-paint 4.6 ms, local open 31.2 ms and zero long tasks on this
Windows host. Final publication is pending; 18 October public results remain
historical until this revision is explicitly verified and published.

Actual desktop/mobile screenshots cover RU/EN and dark/light themes in
`docs/design/polish-*`. The 21.48-second `polish-walkthrough.webm` shows the
home, library, example, 3D editor and recent reopening. It records the same
visuals before the final ARIA-only correction; final stills have a separate
asset-identity receipt in `polish-stills-review.json`: 8/8 variants, 32/32
no-overflow checks, zero browser/asset errors and zero network writes.
The recording is an
implementation capture, not an imagegen concept or a claim of human review.

Local sandbox loopback restrictions prevented the first preview/test startup;
the same commands are run with permitted local-server access. This is an
environment failure before test bodies, not evidence of an application defect.

Manual screen-reader/IME, physical devices, an actual coach field study,
independent mark clearance and a controlled Russian/VPN route remain unverified.
