# Direct 3D authoring — 2026-10-18

The owner's published-site exercise exposed a product mistake: the dimensional
court was restricted to review, while Edit forced an unrelated plan. The owner
explicitly requests direct player movement and action drawing in that same scene.
This supersedes the corresponding decision in COACH_WORKBENCH.md.

Watch/Edit controls permission to author. 3D/Plan controls only projection, with
3D the default in both modes. URL view state preserves the existing query and
room capability fragment. Forced colors retains the accessible plan projection.
Desktop supports direct body drag and path drawing, tablet repositioning/cues,
and mobile review only. The semantic keyboard editor remains available.

Input uses the same camera as rendering. A body grab preserves its screen offset
from the player's floor anchor. Action paths start at the actor's canonical pose;
pass/screen targets are hit-tested on the visible body. Pointer motion is a local
preview, with one typed command on release, never interpolated/canonical writes.
No-op clicks and cancellation write nothing. Escape, lost capture, pointer cancel,
view/tool/phase/permission changes discard drafts. Playback first pauses before
editing. Presence projects the same canonical coordinates into either view.

No dependency, schema, protocol, seed overwrite, history or persistence migration.
The procedural scene is an original stylized implementation, not a claim of
photorealistic equality with the generated lighting/material reference.

Verification: projection inverse and hit tests; RU/EN full workflow; body grabbing,
draft immutability, target selection, cancellation, undo, resize/DPR, forced colors,
read-only/mobile; existing release, offline, convergence and maximum-scene gates.
Published exercise and actual screenshots are required before reporting delivery.

The practical checks exposed three regressions which were fixed before release:
undoing the selected final step must clamp both editor and story playback indices
at render time; a narrow sequence grid needs zero minimum child width; and a
pointer reorder must use the rendered slot index, since React can batch the DOM
behind the synchronous preview ref. WebKit production checks reproduce the last
case; a dev-server-only pass was insufficient. Gesture endpoint assertions allow
one projected CSS pixel of browser input quantization, while the committed path
endpoint and destination pose must still match exactly.
