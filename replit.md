# AudioArchitect (소리로 짓는 방)

A web-based 3D escape room where the room itself is built from music. The puzzle is
song-agnostic: a universal NLP classifier turns each track's lyrics into a hidden clue
object, and instrumental tracks fall back to a "Frequency Hack" mode. Players hunt the
hidden object with an audio-reactive sonar scan and decrypt a password to escape —
built for Musicathon 2026.

## Run & Operate

- `pnpm --filter @workspace/audio-architect run dev` — run the game frontend (Vite)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/audio-architect run typecheck` — typecheck the game
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Optional env: `N8N_WEBHOOK_URL` — when set, `/api/game-over` forwards stats to n8n; otherwise it runs in mock mode

### Partner API secrets (server-side only)

Stored as Replit Secrets and read **only by the api-server** — never bundled into the
browser. The frontend reaches them through `/api/*` proxy routes, so the keys never
reach the client.

- `ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_VOICE_ID`) — real AI System Voice (TTS)
- `MUSIXMATCH_API_KEY` — real synced/plain lyrics
- `LALALAI_API_KEY` — sonar/stem availability

Each integration degrades gracefully: if a key is missing or the upstream call fails,
the game falls back to its mock/local behavior so nothing breaks.

The paid proxy routes (`/api/voice/taunt`, `/api/lyrics`) are same-origin-only and
rate-limited (see `artifacts/api-server/src/lib/security.ts`) so the secret-backed
relay cannot be abused by third-party sites to burn quota.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Three.js via `@react-three/fiber` + `@react-three/drei`, Web Audio API
- API: Express 5
- Validation: Zod (`zod/v4`); API codegen: Orval (from OpenAPI spec)

## Where things live

- Game frontend: `artifacts/audio-architect/src/`
  - `game/types.ts` — clue/crack/mode/placement domain types (ClueCategory, ClueObjectType, PlayMode, SimMode, Surface, CluePlacement, Clue, GlitchCrack)
  - `game/config.ts` — tunable constants (idle timeout, FFT size, asset paths, peak-energy threshold/cooldown, crack count, default-fallback delay, sonar reveal radius)
  - `game/themes.ts` — per-genre visual themes (hiphop purple/green graffiti, classical gold/marble)
  - `game/integrations/` — **partner API adapters (all LIVE via backend proxy, mock fallback)**:
    - `cyanite.ts` — **LIVE**: `fetchGenreAnalysis()` polls `/api/genre` (real audio analysis), `mapCyaniteToGenre()` maps real genre/mood tags onto the room theme; GameProvider auto re-skins on mount. Falls back to default theme if unavailable.
    - `musixmatch.ts` — **LIVE**: `getRichSync(title)` fetches real synced lyrics via `/api/lyrics`, falls back to `MOCK_RICHSYNC` when none exist (e.g. the custom sample). Plus universal `classifyLyric` (NLP keyword/number classifier), `objectForCategory`, `isInstrumentalTrack`, `titleToPassword`, demo-clue helpers.
    - `lalalai.ts` — **LIVE**: `fetchSonarStatus()` (`/api/sonar/status`) + `fetchSeparation()` (`/api/sonar/separate`) drive the HUD readout with real plan/minutes and real separated stem names. The real-time analyser deformation (`STEM_BANDS`/`stemEnergy`) is unchanged. Falls back to analyser-only sonar if unavailable.
    - `elevenlabs.ts` — **LIVE**: `speak()` calls `/api/voice/taunt` for the real ElevenLabs voice, falls back to browser SpeechSynthesis
  - Backend integration layer (keys server-side): `artifacts/api-server/src/integrations/` (`elevenlabs.ts`, `musixmatch.ts`, `lalalai.ts`) + `routes/integrations.ts`
  - `game/audio/AudioProvider.tsx` — single AudioContext + AnalyserNode, exposed via refs
  - `game/state/GameProvider.tsx` — phase, theme, generic clue, play/sim mode, sonar state, instrumental cracks, idle/wrong-click taunts, run timer
  - `game/three/` — Scene (incl. AudioPeakDriver), Room, SonarWall (audio-reactive), LyricHolograms, ClueObject (sonar-reveal clue), GlitchCracks (instrumental), dimensions + placement (random hidden surface placement)
  - `game/ui/` — intro, HUD (sonar toggle + tracker), audio player, dev panel (mood + clue simulation), glitch overlay, AI voice caption, adaptive PasswordPuzzle terminal, StaticNoise overlay, game-over modal
- Game-over webhook route: `artifacts/api-server/src/routes/game.ts`
- Partner API proxy routes: `artifacts/api-server/src/routes/integrations.ts`
  - `GET /api/integrations/status` — which keys are configured (booleans only: elevenlabs/musixmatch/lalalai/cyanite)
  - `POST /api/voice/taunt` `{text}` — ElevenLabs TTS, returns `audio/mpeg`
  - `GET /api/lyrics?title=&artist=` — Musixmatch synced/plain lyrics (normalized)
  - `GET /api/genre?trackUrl=&title=` — Cyanite real audio analysis (kickoff/poll state machine, analyze-once cache). Returns `{status:'analyzing'|'ready'|'error', result:{genreTags,moodTags,energyLevel,bpm}}`
  - `GET /api/sonar/status` — LALAL.AI real account status (plan + minutes left)
  - `GET /api/sonar/separate?trackUrl=` — LALAL.AI real stem separation (kickoff/poll, separate-once cache). Returns `{status, stems:[{name,url}]}` where `url` points at the `/api/sonar/stem` proxy
  - `GET /api/sonar/stem?src=` — proxy that streams a LALAL.AI stem (SSRF-guarded: only lalal.ai URLs)
  - Backend Cyanite/LALAL.AI fetch trackUrl through `assertAllowedFetchUrl` (SSRF guard in `lib/security.ts`): only this app's own origins (REPLIT_DOMAINS) or localhost
- API contract: `lib/api-spec/openapi.yaml` (POST `/game-over`)
- Generated client hook: `useGameOver` from `@workspace/api-client-react`

## Architecture decisions

- **Audio data flows through refs, not React state.** The AnalyserNode is read every
  frame inside `useFrame` (SonarWall, LyricHolograms, ClueObject, AudioPeakDriver read
  `audioRef.currentTime` / `getFrequencyData()` directly) so per-frame updates never
  trigger re-renders. Only coarse UI state (isPlaying, throttled currentTime) lives in
  React state.
- **The sonar cursor is a ref, not state.** Wall/floor/ceiling `onPointerMove` write
  `sonarCursorRef` only when sonar is active; ClueObject/GlitchCracks read it each frame
  to compute proximity reveal. This keeps mouse-move off the React render path.
- **One active clue per game.** `classifyLyric` (digits -> number, then keyword buckets)
  maps any lyric to a category -> object: TIME/NUMBER->keypad, EMOTION/VISION->mirror,
  SPACE/MOVEMENT->speaker, DEFAULT->song-title core. The matched token is the password.
- **Default fallback is peak-driven and song-dynamic.** In lyric mode, if no keyword
  matches within `DEFAULT_FALLBACK_AFTER_S`, the next energy peak arms the song-title
  core clue, with the password derived at arm time via `titleToPassword(trackTitle)`.
- **Instrumental mode auto-detects.** In the "auto" simulation, `isInstrumentalTrack()`
  (no usable richsync lyrics) switches the game to Frequency Hack mode at start; the dev
  panel can also force it.
- **Instrumental "Frequency Hack" mode** spawns hidden glitch cracks on energy peaks
  (`AudioPeakDriver` -> `reportPeak`); clearing all `CRACK_COUNT` lifts the StaticNoise
  overlay and auto-escapes.
- **The room is built and sized by the sound.** Surfaces are not present at start:
  each wall/ceiling snaps in stage-by-stage on early audio peaks (`reportPeak` in
  GameProvider advances `buildStageRef` until `BUILD_STAGES`, then peaks resume normal
  gameplay; a `BUILD_STAGE_MAX_WAIT_MS` time-safety interval finishes assembly for quiet
  intros). Each `Wall`/`Ceiling`/`SonarWall` eases a local build factor toward its
  `stageIndex` and extrudes from the floor (group pivot at y=0, mesh at +height/2). The
  room's proportions come from the real Cyanite analysis via `dimensions.ts`:
  `computeRoomDims(energy, bpm)` sets `heightScale` (energy -> wall/ceiling/sonar Y
  scale), `gridDensity` (BPM -> floor-grid cell size), and `pulseHz` (BPM -> center
  floor light pulse, `BeatPulseLight`). Applied at `startGame` via `applyRoomDims`,
  reset via `resetRoomDims`.
- **Only vertical scale is song-derived; horizontal extent is fixed.** The sonar reveal
  and hidden-clue math compare WORLD coordinates, so `ROOM_EXTENT` never changes. Walls
  scale only on Y; `placement.ts` reads `getRoomHeight()` so ceiling/clue Y stays aligned
  with the visually scaled walls. Never wrap actors (ClueObject/SonarWall mesh) in a
  uniformly scaled group — it would desync the sonar.
- **Hidden placement is generic.** `placement.ts` picks a random wall/floor/ceiling
  surface + uv and returns position/rotation via `dimensions.ts` (`getRoomHeight()` for
  the ceiling); objects sit at ~10% opacity until the sonar reveals them.
- **AudioProvider must wrap GameProvider** — game logic calls into `useAudio()`.
- **Web Audio graph is created lazily on first play()** to satisfy browser autoplay
  policy (the intro "Enter the room" button is the required user gesture).
- **Partner API keys live only on the api-server.** The browser never sees a key; it
  calls `/api/*` proxy routes and the server attaches the secret. All four integrations
  are LIVE: ElevenLabs (`speak()` -> `/api/voice/taunt`), Cyanite (real analysis ->
  auto re-skin), Musixmatch (real synced lyrics), and LALAL.AI (real status + real stem
  separation). Every integration falls back to mock/local behavior if a key is missing
  or the upstream call fails, so the game never breaks.
- **Cyanite auto re-skins the room from real analysis.** GameProvider kicks off
  `/api/genre` on mount; when the real result returns, `mapCyaniteToGenre` picks the
  theme (calm/acoustic genres -> classical marble, everything else -> hiphop neon). A
  manual dev-panel mood pick sets `genreManualRef` so live analysis won't clobber it.
- **Real lyrics flow through state, not a static import.** GameProvider resolves the
  lyric stream via `getRichSync` (real Musixmatch, mock fallback) into `lyrics`;
  LyricHolograms + instrumental auto-detect consume that resolved stream.
- **Stem separation is kicked off once, lazily.** The first sonar activation triggers
  `/api/sonar/separate` (guarded by `sonarKickedRef`) to bound LALAL.AI processing-minute
  cost; the HUD shows real plan/minutes, then the real separated stem names.
- **The game-over webhook runs in mock mode unless `N8N_WEBHOOK_URL` is set**, so the
  full flow works locally with no external dependency.

## Product

A single-screen 3D experience: orbital camera inside a neon grid room, bottom audio
player, floating holographic lyrics synced to playback, and an audio-reactive "sonar"
wall. The universal classifier hides one clue object (keypad / mirror / speaker / core)
flush against a random surface at ~10% opacity; the player toggles the LALAL.AI sonar
and sweeps the room to reveal it (full opacity + red ripples on proximity), clicks it,
and decrypts the password in an adaptive terminal whose header/riddle match the clue
category. Instrumental tracks switch to "Frequency Hack" mode: a static-noise overlay
plus three hidden glitch cracks to find and clear ("AUDIO WAVELENGTH DECRYPTION",
"NOISE CORRUPTION: x/3"). An AI "System Voice" taunts the player (with a screen glitch)
on wrong clicks or 15s idle. A dev panel toggles the Cyanite mood (hiphop vs classical)
and the clue simulation (Auto/Time/Emotion/Space/Instrumental) to demo every path.

## Gotchas

- WebGL cannot render in the headless screenshot/preview-capture browser (no GPU) —
  it logs "Error creating WebGL context". This is environment-only; real browsers render fine.
- Do not change the OpenAPI `info.title` — it controls generated filenames.
- `GameOverInput` fields are `clearTimeSeconds` and `song` (not `elapsedSeconds`/`trackName`).

## User preferences

- No emojis in the UI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `gamestack-js` skill for 3D game (R3F) guidance
