---
tended_on: [tag-infer]
id: 01KPS7VDKDJ4X11NSMZ1QSXXF1
created: "2026-04-19T14:15:04.004Z"
---

# MOVIE.md — Film Mode

A plan for a mode that is to Cinematic what a _film_ is to a _mixtape_.
Cinematic dwells forever. Movies end. Movies have structure, pacing, a
destination. Movies _travel_.

Companion to `ROADMAP.md`, `CINEMATIC.md`, and `SCENES_CLUSTERS.md`.
Where Cinematic is the infinite loop, Movie Mode is a scripted 3–10 min
sequence that uses **every** system we've built — scenes, palettes,
channels, trails, doppler, lensing, jets, photon ring, music — with
intention.

---

## North star

A user hits `Shift+C`. A six-minute film begins. The camera drifts
across an emission cloud, travels through stars, plunges toward a black
hole, lingers on the Einstein ring, pulls back to reveal Sagittarius
spiral, holds as the music swells. At the end, the camera ascends into
blackness and title text fades. The film is over. Credits.

Nothing about that run feels random. Everything about it _earns_ the
runtime.

Three rules:

1. **Long takes.** Average shot length is 40–90s. If cutting more often,
   you're making a trailer, not a film.
2. **Travel, don't cut.** Between acts, _transport_ the camera — a warp,
   a dolly through darkness, a punch-through a starfield. Body-swap
   happens under the cover of motion, never as a flash.
3. **One climax per film.** A single moment is _the_ shot. Everything
   else serves its set-up or release.

---

## Cinematic vs. Movie — the wall between them

|                      | **Cinematic**                | **Movie**                                                |
| -------------------- | ---------------------------- | -------------------------------------------------------- |
| **Runtime**          | ∞                            | 3–10 min                                                 |
| **Structure**        | state machine                | scripted timeline                                        |
| **Scene choice**     | weighted shuffle             | curated act list                                         |
| **Pacing**           | steady / pace knob           | act-by-act variation                                     |
| **Camera**           | 10–20s beats in repertoire   | 40–90s choreographed shots                               |
| **Transitions**      | flavoured (dissolve / flare) | travel sequences (warp / dolly-through / cross-dissolve) |
| **Climax**           | none — no single moment owns | exactly one moment is _the_ shot                         |
| **End state**        | keeps going                  | ends on title card + music fade                          |
| **Interruptibility** | user-yield 8s                | user can Esc out                                         |

They coexist. Cinematic is the lived-in mode. Movie is the show.

---

## Architecture

### State

```js
const movie = {
  active: false,
  filmKey: null,
  film: null, // resolved FILMS[filmKey]
  timeline: [], // flattened list of timeline events
  cursor: 0, // next timeline event to fire
  startedAt: 0, // wall-clock start
  elapsed: 0, // seconds since start
  currentShot: null, // active camera program
  currentTravel: null, // active travel effect
};
```

### Timeline event model

A film is a list of events sorted by `at` (offset seconds). Each event
either **begins a shot** or **begins a travel**. Shots and travels have
durations; they tick internally. An event that fires with a new shot
stops the previous shot.

```js
// Shot event — holds in a scene for duration
{ at: 0,   kind: "shot",
  scene: "quiet-drift",
  program: "slow-reveal",
  duration: 60,
  look: { palette: "ice", channel: "speed", trail: 0.6, doppler: 0.0 },
  accents: [ { at: 40, kind: "perturb" } ],
  music: { fadeIn: 3 } }

// Travel event — moves the camera through non-diegetic space
{ at: 60,  kind: "travel", style: "warp", duration: 6,
           next: "sagittarius" }

// Title event — overlay text on the image
{ at: 0,   kind: "title", text: "FIRST LIGHT", duration: 4, style: "fade" }

// Music event — start / duck / fade a track
{ at: 0,   kind: "music", track: "Bough-Bend", action: "play", volume: 0.5 }
{ at: 380, kind: "music", action: "fade", duration: 20 }

// End event — fade to black + exit
{ at: 420, kind: "end", fadeOut: 5 }
```

The ticker walks the timeline once, triggering events on time. No
loops, no randomness (except where a program chooses within
constraints).

---

## Camera programs — the shot vocabulary

Each program is a continuous 30–90s shot with a specific cinematic
purpose. Implementations are just parametrised lerpers over the shot's
duration.

| Program            | Duration | Describes                                                                                                          |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------ |
| **slow-reveal**    | 50–90s   | Start tight on a dense region, pull out to show the full scene. Exposure rises slightly, vignette softens.         |
| **push-in**        | 40–70s   | Reverse of slow-reveal. Scene-wide opening, dolly inward while FOV narrows. Good for intimate endings.             |
| **orbit-ascend**   | 45–75s   | Rising spiral arc. Starts below disk plane, ends above it. Pairs with bloom swell.                                 |
| **orbit-descend**  | 45–75s   | Mirror — descending spiral. Ends "settled".                                                                        |
| **dolly-through**  | 30–50s   | Camera _flies through_ the body cloud at low altitude, bodies stream past. Speed-channel + doppler strongly on.    |
| **track-streamer** | 40–60s   | Pick a fast body (highest `speed`), match its velocity, dolly alongside it as it moves. Point-of-view of a body.   |
| **vertigo**        | 8–15s    | Dolly-zoom (Hitchcock). Camera dollies in while FOV widens, or vice versa. Reserved for _the_ shot.                |
| **god-ray**        | 30–45s   | Camera fixed in space; the scene rotates past. Use when the _sim_ should feel the dominant motion, not the camera. |
| **hold-still**     | 20–50s   | No motion. Mood shifts + breathing + a single accent. Between busy programs.                                       |
| **drift-wide**     | 60–120s  | Barely-there motion in a wide frame. Opening act.                                                                  |
| **ascend-out**     | 20–40s   | Vertical pull-out ending in empty space. Final shot.                                                               |
| **crash-zoom**     | 3–6s     | Sharp inward zoom. Cut-in accent; rarely used.                                                                     |

Programs share hooks:

- `beginShot(p)` — captures pose, sets up eased curves
- `tickShot(p, dt)` — called every frame, advances state
- `endShot(p)` — restores/captures final state, hands off to travel

### Subject-finding primitives

Several programs need a focal point. Movies have a **subject finder**
that — on shot start — reads back a small sample of positions and
velocities and picks:

- `densest()` — grid-bucket, max cell
- `fastest()` — max `|v|`
- `heaviest()` — max `mass`
- `brightest_dopplered()` — velocity most aligned with current camera
  direction (highest apparent brightness)
- `named(idx)` — a specific body index (for Event Horizon: idx=0 = BH)

Caches per-shot; doesn't reselect mid-shot unless shot says so.

---

## Travel transitions — the between-scene vocabulary

Travel _covers_ body-swap. The flash and palette hop happen while the
camera is visually moving, so the viewer never notices the cut.

| Style               | Duration | What happens                                                                                                                                                                                                                                  |
| ------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **warp**            | 5–8s     | FOV narrows to 18°, CA ramps to 0.6, grain ramps to 0.12, exposure spikes, bloom +80%, simulation speed x8. Stars appear to streak. Body swap at t=0.5 under full-screen brightness. Then CA/grain release, FOV widens, landing in new scene. |
| **dolly-through**   | 6–12s    | Camera translates a long distance (1000+ units) while both scenes render crossfaded. Old scene bodies fade to black via per-body opacity; new scene bodies fade in. No flash.                                                                 |
| **cross-dissolve**  | 3–5s     | Standard dissolve with camera continuing previous motion. The quietest transition.                                                                                                                                                            |
| **black-hole-dive** | 8–12s    | Lens strength ramps to 1.5, camera dollies toward lens center, everything goes black at center, comes out in next scene. Used when _entering_ Event Horizon from any scene.                                                                   |
| **sunrise**         | 6–10s    | Exposure ramps from 0.3 to 1.4, new scene "rises" out of darkness. Slow palette morph. For openings.                                                                                                                                          |
| **fade-to-black**   | 3–6s     | Exposure goes to 0. Credits fit. For endings only.                                                                                                                                                                                            |

Travels own the camera globally — the shot program is paused.

### "Travel between stars" — the signature move

This is the specific fantasy the user named. Implementation:

1. While in a scene with a dense background starfield (`quiet-drift`,
   `sagittarius`, `horsehead`, `coma`), the camera does a **warp
   traversal**:
   - Camera accelerates along its current view vector for 6–10s.
   - FOV narrows to 20°.
   - A **motion-blur pass** (new — needed for this) streaks the
     starfield along the travel axis.
   - Simulation `speed` ramps to x6 so physics don't freeze during
     travel.
2. At the far end, either:
   - Re-emerge in the _same_ scene but on the opposite side, or
   - Swap to a new scene under cover of the streak.

This is a travel _within/between_ scenes without cutting. It's the
literal "flying through stars" moment in a space IMAX film.

---

## Films — the scripted sequences

Ship three films in v1. Each exercises different system combinations so
together they cover the depth/breadth.

### Film 1 — "First Light" · 6:00

Opening-to-climax arc. Quiet → warm → chaotic → resolution.

```
0:00  music: Bough-Bend, fadeIn 4s
0:00  title: "FIRST LIGHT" fade-in 3s, fade-out 6s
0:00  scene: quiet-drift
0:00  shot: drift-wide, 65s (palette ice, channel speed, trail 0.45)
1:05  travel: sunrise, 8s → sagittarius
1:13  shot: orbit-descend, 70s (palette ember, channel mass, trail 0.5)
2:23  mood-shift: palette sunset, 6s
2:29  shot: push-in, 55s (center on BH, channel density)
3:24  travel: warp, 6s → horsehead
3:30  shot: slow-reveal, 80s (ember, mass, vignette climbs to 0.65)
4:50  travel: dolly-through, 10s → event-horizon
5:00  shot: vertigo, 12s (climax — doppler full, lens full, bloom x1.4)
5:12  shot: hold-still, 30s (disk rotation, trails burn in)
5:42  shot: ascend-out, 15s (pull up and away)
5:57  travel: fade-to-black, 3s
6:00  end
```

Feature budget: 3 palettes, 3 channels, 1 climax (vertigo + lens +
doppler), 4 travels (one of each style except dolly-through's cousin),
uses jets + photon ring via Event Horizon.

### Film 2 — "Passage" · 4:30

Travel-forward film. The entire piece is about movement.

```
0:00  music: Slow Weather, fadeIn 3s
0:00  scene: sagittarius
0:00  shot: track-streamer, 70s (pick fastest disk body, pov-ride it)
1:10  travel: warp-traverse, 8s (WITHIN scene, re-emerge far side)
1:18  shot: god-ray, 45s (scene rotates past still camera)
2:03  travel: warp, 7s → coma
2:10  shot: slow-reveal, 55s (palette ember, yellow tint, mass)
3:05  travel: dolly-through, 10s → virgo-m87
3:15  shot: orbit-ascend, 50s (jet orthogonal to view; climax at t=40s as jet crosses frame)
4:05  shot: hold-still, 20s
4:25  travel: fade-to-black, 5s
4:30  end
```

Feature budget: showcases jets (Virgo), tracking motion, warp.

### Film 3 — "Homecoming" · 8:00

Long-form meditative film. The longest shots; a full dramatic arc.

```
0:00  music: Written Behind the Stars, fadeIn 5s
0:00  scene: birth
0:00  shot: drift-wide, 90s (palette ember, channel age — the whole
             point of age channel: we watch bodies get older on-screen)
1:30  travel: cross-dissolve, 5s → antennae
1:35  shot: slow-reveal, 120s (tidal tails already extended via
             kickstart; channel switches mid-shot speed→density)
3:35  travel: dolly-through, 12s → event-horizon
3:47  shot: orbit-descend, 80s (buildup)
5:07  shot: vertigo, 13s (climax)
5:20  shot: hold-still, 40s
6:00  travel: black-hole-dive, 12s → stephans-quintet
6:12  shot: slow-reveal, 90s (the "resolution" — five galaxies in frame)
7:42  shot: ascend-out, 15s
7:57  travel: fade-to-black, 3s
8:00  end
```

Feature budget: age channel (unique to Birth), kickstarted tidal tails,
black-hole-dive travel, mid-shot mood shift.

---

## Musical alignment

Each film specifies its music track at start. Timeline events can
_snap to musical downbeats_ by annotating target bars/beats from
whatever tempo the track has.

For v1: align travels to the track's natural crescendos — we don't do
beat detection, we hand-author the timing based on listening to each
track. Each film's timeline ships with timings derived from its own
track.

Future: `audio reactivity` from the roadmap's Phase 7 nice-to-haves
could drive _real-time_ beat alignment. Movies would then sync
automatically to any loaded track.

---

## New primitives we need

Most of Movie Mode uses what we have. A few pieces are new:

### 1. `motionBlurPass` — new post-pass

Required for warp travel. A camera-velocity-aware directional blur
that reads screen velocity from pixel displacement over the last N
frames (accumulation buffer approach, same as trails but
directional). Without it, warp looks like a zoom, not a warp.

~100 lines, one shader pass, sits between trails and CA in the chain.
Enabled only during travels.

### 2. `titleOverlay` — DOM layer

A simple CSS-styled text overlay that fades in/out. Not a fullscreen
overlay — positioned in the upper-left third, small-caps, accent
colour. Used for film titles, act markers, and final credits.

### 3. `cameraTraveller` — long-trajectory parameter rig

Unlike cinematic moves (bounded to 8–18s), film shots can be 90s long.
The trajectory is described as a **keyframe spline** through
(position, target, fov) at a few anchors; tangent-smoothed with
catmull-rom. Every shot program becomes a keyframe generator.

~200 lines. Uses `THREE.CatmullRomCurve3`.

### 4. `subjectFinder`

Already described. One-shot stats readback + bucket selection. ~80
lines.

### 5. `filmScheduler`

Top-level ticker that walks the timeline, dispatches events to
camera/scene/music/title subsystems, handles user interrupts. ~150
lines.

### 6. `warpShader`

Existing starfield has per-vertex twinkle — add a per-vertex
_streaking_ mode that stretches stars along the camera-velocity vector
when `uWarp > 0`. Happens only during warp travels.

---

## UI surface

Minimal — Movie Mode is meant to be watched, not configured.

```
┌─ Movie ───────────────────────────┐
│                                   │
│   [ FIRST LIGHT ]     6:00        │
│   [ PASSAGE ]         4:30        │
│   [ HOMECOMING ]      8:00        │
│                                   │
│   ─────────────────────────────   │
│                                   │
│   ▸ Play              (Shift+C)   │
│   ⏹ Stop              (Esc)       │
│                                   │
│   during playback:                │
│   current act + elapsed           │
│                                   │
└───────────────────────────────────┘
```

- New rail slot: "Movie" (icon: film strip). Key `Shift+C` to toggle.
- `Esc` mid-film aborts cleanly (fade-to-black 2s → return to previous
  state).
- Cannot coexist with Cinematic mode. Starting a movie stops
  Cinematic; stopping the movie does _not_ restart Cinematic (user
  chooses).

No per-film controls. No scrubber. Films play front-to-back. (If you
want to edit, edit the `FILMS` object in code.)

---

## Invariants

- **Physics integrator never driven.** Timeline can modulate `G`,
  `flock`, `radiation`, `speed`, but never bypass the symplectic step.
- **No hidden triggers.** A supernova visible in a climax happens
  because physics produced it. The timeline can _expect_ it — e.g.,
  schedule a vertigo shot when a high-mass + high-density body forms
  in Birth — but never _spawn_ it.
- **Body-swap always under cover.** Every scene change in a film
  happens inside a travel. No user-visible body-swap flash unless
  the travel's design specifically uses one.
- **Pausable, not scrubbable.** `Space` pauses the film (camera
  freezes, music pauses, sim pauses). Unpausing resumes from where it
  stopped.
- **Music is not decoration.** A film's music cues fire on schedule.
  Missing music file = film silent but otherwise runs.
- **Climaxes are earned.** A climax shot is preceded by ≥ 2 min of
  build-up. Don't climax in act 1.

---

## Implementation order

One week of focused work to get v1 shipping.

### Pack α — core mechanics (ships first, Film 1 only)

1. `filmScheduler` — timeline iterator that calls `applyScene`,
   hooks into music, and swaps camera control.
2. Four programs: `drift-wide`, `slow-reveal`, `push-in`,
   `hold-still`.
3. Two travels: `warp`, `cross-dissolve`.
4. `titleOverlay` + minimal panel.
5. Ship Film 1 ("First Light"). Live with it.

### Pack β — travel grammar (ships Film 2)

6. `motionBlurPass` + warp integration with starfield stretch.
7. Travels: `dolly-through`, `sunrise`, `fade-to-black`.
8. Programs: `orbit-ascend`, `orbit-descend`, `god-ray`,
   `track-streamer`, `subjectFinder`.
9. Ship Film 2 ("Passage").

### Pack γ — climax machinery (ships Film 3)

10. Program: `vertigo` (dolly-zoom). One-pass implementation coupled
    to existing FOV system.
11. Travel: `black-hole-dive` (couples to existing lens pass).
12. Program: `ascend-out`, `crash-zoom`.
13. Ship Film 3 ("Homecoming").

### Pack δ — polish (optional, post-v1)

14. Mid-shot mood shifts scheduled from timeline.
15. Per-film colour grading override (LUT or palette family map).
16. Replay log export (like [[CINEMATIC]] Phase 7).
17. User-authored films loadable from localStorage-pasted JSON.
18. Soundtrack beat-syncing (Roadmap Phase 7).

---

## What not to do in v1

- **No branching.** Films are linear. No "choose your own adventure".
- **No user-created films via UI.** Text editing is fine; shipping a
  film builder is a different project.
- **No 4K capture mode from inside Movie.** Recording is already wired
  (`Shift+K`); that's enough.
- **No voiceover.** Music and silence only. A narrator isn't the
  aesthetic.
- **No text captions per shot.** Titles at open and credits at close.
  Shots speak for themselves. If they don't, the shot isn't good
  enough.

---

## Test plan

- Play each film end-to-end from cold boot. No drops, no black frames
  (except intentional fades), no stuck camera.
- Record each film at 1080p. Play back at 1× — does it feel like a
  _film_, or a slideshow with pretty transitions? If the latter, the
  shot durations are too short or the travels too abrupt.
- Start a film, `Esc` at 17s into an act. Does it fade out cleanly
  and leave the user in the pre-film state? Repeat at 3 different
  points per film.
- Start Film 1, toggle Cinematic mid-film (`C`). Cinematic must refuse
  to start while a film is playing, or cleanly stop the film.
- Let Film 3 finish. Does the UI stay usable? Music fade clean? Post
  chain restored?
- Subjectively: after watching all three films back-to-back, do they
  feel distinct? If they all feel like the same film, the timelines
  aren't opinionated enough.

---

## Open questions

- **Should films loop?** My bias: no. An ending is part of the
  medium. But a "play all" button that queues three films with 20s
  black between them is a good alt. _Keep in back pocket for Pack δ._
- **Physical camera fly-through a body cloud — collision?** Right
  now bodies are points, not volumes. A dolly-through at y=0 through a
  galaxy disk looks great precisely because no collision detection is
  needed. Keep it that way — the "through" in dolly-through is
  visual, not physical.
- **How loud is too loud?** Track volumes out of ssi_tracks/ vary.
  Each film should set a target volume that matches the dwell-music
  default the user set via their slider. Default to user's last
  volume unless overridden per-film.
- **Event Horizon lens during travel?** If we do a black-hole-dive
  travel _from_ Event Horizon to another scene, does the lens
  continue through the travel, fade during the travel, or fade
  before? _Proposal:_ lens fades during the first 30% of the travel,
  full black-out at 40%, new scene emerges at 60%, linear clear of
  lens after that.

---

## Scope discipline

Movie Mode is the capstone feature. It _uses_ everything; it builds
almost nothing. The primitives it needs (motion blur, title overlay,
catmull-rom camera, subject finder, film scheduler) are ~600 lines
total and land over three packs.

If the primitives creep past 1000 lines, we over-engineered and
should cut a program or a travel style until it fits. The films are
the product, not the framework.

#user #star #feature
