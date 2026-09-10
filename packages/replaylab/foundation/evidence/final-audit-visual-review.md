# Final audit visual follow-up — 2026-09-09

Reviewer: Codex model, inspecting actual Playwright PNGs; not an external human reviewer. Windows 10.0.26200, Node 22.15.1, repository Yarn 4.18.0, Playwright 1.58.2 / Chromium 145.0.7632.6, DPR 1. CUA exited during connection. The standard image and Node viewers also failed with the Windows deny-read ACL error; the saved PNG bytes were read through the approved shell and displayed to the model.

Inspected `slice7-ru.png` and `slice7-en.png` at a 1440×900 desktop viewport (full-page captures), plus `slice7-mobile-ru.png` and `slice7-mobile-en.png` at 390×844 (full-page captures). Desktop court, token shapes/numbers, toolbar, status wrapping, lineup, conflicts, transport and phases are legible with no observed overlapping elements. Mobile stacks the court, semantic lineup, cue, conflicts and transport; the scoped test confirms no horizontal overflow in either locale. Existing document title and cue content intentionally retain the language in which the play was seeded when the UI locale changes.

Found and fixed: mobile review mode displayed the first-edit instruction to move a player even though that capability is unavailable. Onboarding now follows existing `canMoveActors`; the responsive test proves it is absent on mobile and returns on desktop without marking onboarding complete. No domain, persistence, protocol or dependency change.

Final scoped run: `test:slice7`, 4 passed / 0 failed / 0 skipped; captures and RU/EN/reflow/capability/axe checks passed. Result: `final-audit-visual-tests.json`. No additional locally blocking layout defect was observed in these views. The existing mobile read-only cue form is long; simplifying its presentation is an optional later UX improvement, not proof of device usability.

Still NOT RUN: real NVDA/VoiceOver speech, physical touch tablet/mobile, complete human keyboard/non-US/IME/zoom/contrast/reduced-motion review, external visual judgement, or human comprehension/timing judgement of the 30/60-second demo recordings. Model image inspection and axe do not close any of those gates.
