---
name: Peak-driven spawn timing safety net
description: Why audio-peak-gated spawns (cracks, room build) need a time-safety net or the last item lands at track end
---

In AudioArchitect, things that spawn "on an audio energy peak" (instrumental
glitch cracks, beat-synced room build) must ALSO have a wall-clock time-safety
net that forces the next spawn after a short window.

**Why:** peaks are gated by an energy threshold + cooldown, so on a quiet or
sparsely-peaky track the Nth item only spawns near the very end of the song. For
cracks this meant the 3rd crack landed at ~track-end, so the player couldn't reach
"all cleared" (and thus couldn't escape) until the track finished — a demo-killer.
The room-build path already had this net (`BUILD_STAGE_MAX_WAIT_MS`); the crack
path did not.

**How to apply:** mirror the build net — a short interval that, once the
precondition is met (room built, mode === instrumental), forces the next spawn if
`now - lastSpawn > MAX_WAIT_MS`. Keep the spawn helper idempotent (functional
state update, hard cap at COUNT) so the peak trigger and the timer can both call
it without double-spawning. Reset the lastSpawn ref in resetTransient.
