---
name: Sample interaction cursors on a deforming surface's REST plane
description: Why a flush-mounted clue on an audio-reactive wall became unclickable when the wall rippled hard
---

When a surface is visually deformed every frame (audio-reactive ripple, wave,
displacement) but actors are positioned against its FLAT rest plane, any
pointer-derived "cursor" used for proximity/hit math must be projected back onto
the rest plane — do NOT use the raw `e.point` from the deformed mesh.

**Concrete incident (AudioArchitect):** the SonarWall ripples along its normal
(local z) with bass-driven amplitude that can reach tens of world units. Front-wall
glitch cracks sit flush at the rest plane (z ≈ ROOM_EXTENT − small offset) and are
revealed by a proximity test against `sonarCursorRef` with radius 7. The wall's
onPointerMove stored `e.point.z` (the deformed hit point), so a loud bass moment
pushed the cursor z far from the crack, the reveal amount never crossed its click
threshold, and the crack registered wrong-clicks instead of clearing — only while
the music was loud. Fix: store the cursor at the rest-plane coordinate
(`z = ROOM_EXTENT`), keeping the in-plane x/y from `e.point` (deformation was
local-z only, so x/y are unaffected).

**How to apply:** for any deforming surface, snap the interaction cursor's
along-normal component to the rest plane. The in-plane components from the raycast
are fine. A generalized "project cursor onto surface rest plane" helper would cover
all six surfaces if more become reactive.
