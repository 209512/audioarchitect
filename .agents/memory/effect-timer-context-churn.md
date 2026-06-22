---
name: Effect timers torn down by context-value identity churn
description: Why an auto-trigger setTimeout inside a useEffect never fired until audio ended — throttled state churns the context value and callback identity
---

A `useEffect` that schedules a delayed action (`setTimeout(..., 900)`) must not
depend on a callback whose identity changes faster than the timeout delay, or the
cleanup keeps cancelling the timer before it completes.

**Concrete incident (AudioArchitect, instrumental win):** the "all cracks cleared
-> escape()" effect depended on `cracks` and on `escape`. `escape` depended on the
`audio` context value, and `AudioProvider` folds a *throttled* `currentTime` (set
every ~200ms during playback) into its memoized context value. So while audio
played, `audio` -> `escape` got a new identity every ~200ms, the win effect re-ran
every ~200ms, and its 900ms escape timer was cleared/reset before it could fire.
The timer only completed once the track ENDED and currentTime updates stopped —
making the escape modal appear at exactly track-end (~44s) regardless of when the
player actually cleared the cracks. (The earlier "cracks spawn too late" theory was
a misdiagnosis; on an energetic track the cracks were already spawning early.)

**Fix pattern:** depend only on a *primitive* trigger (a boolean/string that flips
once), and call the action through a ref updated each render:
`const xRef = useRef(x); xRef.current = x;` then `useEffect(() => { ...; const id =
setTimeout(() => xRef.current(), D); return () => clearTimeout(id); }, [primitiveFlag])`.

**How to apply / smell test:** any context provider that puts a per-frame or
throttled value (currentTime, mouse pos, scroll) into its memoized value will churn
EVERY consumer callback's identity at that cadence. Before listing such a callback
in a timer effect's deps, route it through a ref and gate the effect on a stable
primitive instead.
