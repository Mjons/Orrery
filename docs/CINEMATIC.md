# CINEMATIC.md — Endless Director Mode

A plan for a cinematic mode that drifts the sim forever without ever looking
the same twice. The goal is **film, not screensaver**: long, confident
holds on beautiful moments, patient moves between them, and transitions that
feel inevitable rather than scripted.

Sibling to `ROADMAP.md`. Nothing here requires new physics — every lever
already exists. This is a director that composes what we already have.

---

## North star

Press `C`. Walk away. Come back in an hour. The sim is still beautiful, the
composition is different, and nothing about it feels like a loop.

Three rules:

1. **Patience over punch.** Holds dwarf cuts. A single good beat is 20–90s.
2. **Motion is always subtle.** If the viewer notices the camera moving,
   it's moving too fast. Target sub-1°/s angular drift at dwell.
3. **Transitions hide the seams.** Use bloom, exposure, and the existing
   mid-transition flash to mask body-swap. The cut happens under cover.

---

## State machine

One director object, four states, infinite loop.

```
          ┌──────────────┐
     ┌───▶│   DWELL      │  hold on a composition, slow drift
     │    │   30–90s     │
     │    └──────┬───────┘
     │           │  dwell timer expires
     │           ▼
     │    ┌──────────────┐
     │    │   REFRAME    │  re-aim on a different focal point
     │    │   6–14s      │  within the *same* scene
     │    └──────┬───────┘
     │           │  reframe budget spent (2–5 reframes per scene)
     │           ▼
     │    ┌──────────────┐
     │    │   APPROACH   │  ease camera toward a "portal" framing
     │    │   4–8s       │  (close-up on dense region, or wide pull-out)
     │    └──────┬───────┘
     │           ▼
     │    ┌──────────────┐
     │    │   TRANSITION │  applyScene(next) — existing 1600ms path
     │    │   1.6s       │  with extended duration 2.4–3.2s in cine mode
     │    └──────┬───────┘
     └───────────┘
```

All timings are sampled from ranges, never fixed. Each cycle logs its seed
so a user can reproduce a run if they want to capture it.

---

## Phase 1 — Director skeleton (ship first)

Minimum viable version. Endless mode works, just not lyrical yet.

- New module-scoped object `director` in section 22 (next to `driftState`).
- `params.cinematic: false`. Toggle via hotkey `C` and a left-rail switch.
- When enabled:
  - Pick a random scene from `SCENE_ORDER` excluding the current one.
  - Wait `dwellMs` (sampled 30–90s), then call `applyScene(key)`.
  - Repeat forever.
- When disabled, cancel the pending timeout and leave the current scene.

This alone is already useful. Everything after is polish.

**Hook for emergence:** don't pre-bake the shuffle. Weight next-scene
probability by _current sim energy_ (mean speed, BH proximity, density) so
high-energy moments get followed by calmer scenes. Compute weights from
`computeStats` output — it's already running at ~1Hz.

---

## Phase 2 — Scene shuffler that never repeats

Avoid both exact repeats and _feeling_ like a repeat.

- Maintain a rolling history of the last 3 scene keys. Forbid any of them
  as the next pick.
- Maintain a rolling history of the last 3 **palettes** and **channels**.
  Forbid exact repeats; prefer a palette distance (LAB-space) > some ε.
- For scenes with variants (collision scenarios, birth seeds), pick a
  different variant than last time.
- Seed the whole session with a hash of `Date.now()` so two runs on the
  same machine don't share a trajectory.

The shuffle is the cheap half of "never the same twice." The expensive
half is camera.

---

## Phase 3 — Procedural reframes within a scene

Instead of cutting between scenes every 30s, **linger** in each scene and
re-compose. This is where the cinematic feel lives.

For each scene in `DWELL`:

1. Sample 2–5 reframes to perform before leaving. Each reframe picks a new
   focal point and orbit offset.
2. Focal point candidates, in priority order:
   - **Highest-mass body** (natural anchor — BH, primary star).
   - **Densest cluster** (k-means or grid bucket over position texture).
   - **Fastest body within frame** (drama — streaks, doppler).
   - **User-saved viewpoint** for this scene (if any exist in localStorage).
3. Orbit offset: spherical coordinates `(r, θ, φ)` sampled within a scene-
   specified bounding shell. New scenes need a `framing` block:

```js
framing: {
  rRange: [120, 320],         // orbit radius around focal point
  thetaRange: [0.2, 1.3],     // polar angle (keep away from poles)
  phiDrift: 0.04,             // radians/s during dwell
  fovRange: [38, 65],         // allowed FOV window
  focalBias: "bh" | "density" | "speed" | "saved"
}
```

Reframe transitions are **camera-only** — no body swap, no palette change,
no flash. Use a longer ease (6–14s, `easeInOutQuint`) and keep the sim
running visibly through the move.

**Emergence hook:** if a supernova-like event fires (high radiation kick,
detected via stats), interrupt the current reframe budget and cut to a
close-up on that body within 800ms. Let it cool, then resume.

---

## Phase 4 — Living parameters (the "breathing" pass)

During `DWELL` and `REFRAME`, nothing is ever quite static:

- **Bloom breathing.** `bloomStrength` oscillates ±8% around scene baseline
  on a 40–70s period, phase-offset per session. Two sine components at
  irrational ratios so it never re-phases.
- **Exposure drift.** ±0.05 EV on a 90–140s period. Keeps the image alive
  without the user noticing.
- **Chromatic aberration.** ±15% of baseline on a 50s period. Strongest at
  edges of the FOV range.
- **FOV micro-zoom.** ±1.5° around the current target, 80s period. Reads
  as a slow push/pull even when the camera is still.
- **Flock/radiation weights.** Allowed to walk by ±10% of scene values
  over 2–3 minutes. This is the only physics-touching modulation — keep
  it inside the band where behaviour remains recognisable.

All oscillators live on one clock. When the director transitions, phases
are preserved (don't snap) so nothing pops.

---

## Phase 5 — Transition grammar

Not every scene change should look the same. Three transition flavours,
chosen by the director based on _what kind of cut_ fits:

| Flavour       | When                                            | How                                                      |
| ------------- | ----------------------------------------------- | -------------------------------------------------------- |
| **Dissolve**  | Similar scenes (quiet → lattice)                | Long (3.2s), low flash intensity, slower palette swap    |
| **Flare cut** | High-energy → anything (collision exit)         | Short (1.6s), exposure spike at t=0.7, hard palette flip |
| **Pull-back** | Intimate → cosmic (event-horizon → sagittarius) | Extra camera travel, FOV widens 20° through the move     |
| **Push-in**   | Cosmic → intimate (sagittarius → orrery)        | Extra camera travel, FOV narrows 15° through the move    |

Implementation: extend `applyScene` to accept `{ flavour, durationMs }` in
opts. The tick function scales the existing lerp curves; no new machinery.

---

## Phase 6 — Musical timing (optional, but worth it)

Give the director a _tempo_ — a base interval it varies around. One dwell
is "a bar," one reframe is "a beat." This gives the whole run a rhythm the
eye picks up on subliminally:

- Tempo chosen per session (e.g. 52–68 "bpm" equivalent).
- Dwell = 16–32 bars. Reframe = 4–8 bars. Transition = 1 bar.
- Every ~8–12 scenes the director takes a "breath": one extra-long dwell
  (120–180s) with no reframes. The sim earns a moment of stillness.

No audio. Just timing. But it's the difference between a mixtape and a DJ
set.

---

## Phase 7 — Capture & reproducibility

Cinematic mode pairs obviously with recording:

- `Shift+R` in cine mode starts a recording and embeds the session seed +
  director log in the filename.
- Exported JSON gains a `cinematic.log` field: ordered list of
  `{ t, scene, focal, flavour, durationMs }` entries. Replayable later.
- A "director replay" mode reads the log and drives `applyScene` +
  reframes deterministically. Useful for re-rendering at higher quality.

Don't build this until phases 1–4 feel good on their own.

---

## UI

Minimal. One toggle in the left rail under "Motion":

```
[●] Cinematic mode
    Pace: ◯ Slow  ● Normal  ◯ Restless
    Scenes: ● All  ◯ Current only
```

- **Pace** scales all director timings by 1.4 / 1.0 / 0.65.
- **Scenes = Current only** disables scene transitions — pure reframing
  within whatever's loaded. Good for streaming a single scene for hours.

Hotkey: `C` toggles on/off. `Shift+C` cycles pace. No other surface area.

---

## Invariants

- **Never** bypass `applyScene`'s symplectic integrator guarantees. Cine
  mode only modulates camera + post + uniform weights, never the
  integrator.
- **Never** add hidden physics scripting (no "trigger supernova at t=42").
  Triggers read the sim; they don't drive it.
- **Never** let a parameter walk out of its scene's sane band. If
  `flock` is 0.3 in a scene, cine modulation is ±10% of 0.3, not a new
  absolute range.
- Cine mode must survive user interaction: any mouse input on the canvas
  pauses the director for 8s (the same `idle` timer `autoOrbit` already
  uses). If the user saves a new viewpoint, the director uses it next
  time that scene comes up.

---

## Test plan

- Leave cine mode running for 30 minutes. No two consecutive 2-minute
  windows should look alike on a frame-compare diff.
- Scrub through a 10-minute capture at 8× speed. Transitions should not
  "pop" — no visible frame where bloom, exposure, or colour jumps.
- Toggle cine mode off mid-transition. No hang, no stuck camera.
- Drag the orbit controls during a reframe. Director yields, user wins,
  director resumes 8s after input stops.

---

## Build order

1. Phase 1 (skeleton) — one afternoon.
2. Phase 4 (breathing) — half day. Biggest visual payoff per line of code.
3. Phase 3 (reframes) — one day. Needs scene `framing` blocks added.
4. Phase 2 (shuffler) — couple hours.
5. Phase 5 (transition grammar) — one day.
6. Phase 6 (tempo) — half day, mostly tuning.
7. Phase 7 (capture) — when the rest feels right.

Ship phase 1 alone first. Live with it for a few days before phase 3
— the reframe system is the expensive bet and shouldn't be designed
from a cold start.
