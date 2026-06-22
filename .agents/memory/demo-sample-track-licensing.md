---
name: Bundled demo/sample audio must be royalty-free
description: The app's default sample track ships in the repo and plays in the demo video — it must be license-clean
---

The game's default track is a real audio file bundled in the repo
(`artifacts/audio-architect/public/audio/sample-track.mp3`), served same-origin so
Cyanite/LALAL.AI can fetch and analyze it. It plays automatically on "Enter the
room", so it is whatever ends up in the Musicathon demo video.

**Constraint:** this bundled sample MUST be royalty-free / license-clean.

**Why:** an earlier version shipped a copyrighted commercial track (Robert Miles —
"Fable") under the harmless-looking label "Neon Architect (sample)". The file name
in code said nothing about the real song. When the demo was uploaded to YouTube it
got a Content ID copyright claim and was region-blocked, risking judges being unable
to watch the submission. Source royalty-free audio (YouTube Audio Library, Pixabay
Music) instead.

**How to apply:** if you ever regenerate or swap the sample track, keep it
royalty-free, and keep `SAMPLE_TRACK_NAME` a non-real title that is NOT in the
Musixmatch catalog — that is what makes `getRichSync` fall back to `MOCK_RICHSYNC`,
which drives the deterministic Part-1 keypad clue/password. A real song title would
fetch unrelated real lyrics and break the scripted demo.
