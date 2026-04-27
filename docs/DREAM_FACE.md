---
created: 2026-04-25
status: brainstorm
---

# DREAM_FACE.md — Let the avatar play during dream phase

Companion to [FACE_EXPRESSIONS.md](FACE_EXPRESSIONS.md). That doc covers
**wake-state** beats — gentle weather reactions to user actions. This
doc is for what happens when the user is _away_ and the dream cycle is
running. The wake rule is "weather, not a notification." The dream
rule is **looser** because there is no user to disturb.

The user is asleep / out of the room. The avatar can stretch, drift,
recolor, breathe differently, even play. The only hard constraint is
that the wake transition has to feel like _coming home_ — not finding
the avatar mid-cartoon.

## Style invariants (still locked, even in dreams)

- Scribble strokes stay scribble. No clean vector geometry, no
  replacement shapes — the cloud and the eyes and the mouth are still
  the same SVG paths from `model-face.js`, just animated more freely.
- One accent. The dream may shift `--mface-glow` along an extended
  range, but the rest of the UI accent stays at `#8ab4ff`.
- Always behind the bodies (z-index 3). The face can grow but never
  push forward of stars.
- Seven expression groups stay. New beats are still _transient
  overlays_ — `dreaming` and `sleeping` are the canonical dream-phase
  expressions, everything else rides on top.

## What dream gives us that wake doesn't

- **No flow to protect.** The user can't be interrupted because the
  user isn't reading.
- **A clear time horizon.** The dream phase has a known length and
  internal structure (Initialising → Drifting → Playing → Judging →
  Settling per [DREAM_ENGINE.md](DREAM_ENGINE.md)). Behaviours can
  arc across that structure instead of being stateless.
- **Permission to be weird.** The avatar reads as the system
  _dreaming the user's notes_ — drifting, growing, recolouring all
  fit that framing. Awake the same gestures would feel like alerts.

## The properties to play with

User listed seven; doc'd in increasing order of restraint required.

### 1. Scale — grow and shrink

Slow oscillation between ~0.7× and ~1.4× of the wake-state size, on a
breath of 18–24 s. Larger means deeper dream. Stays continuous; never
snaps. Same easing curve as `weather-sigh` (cubic in/out), longer
period.

Phase coupling:

- **Drifting** — small range, ±0.1× of base.
- **Playing** — wider, ±0.25× — when the dream is generating ideas
  the face physically expands.
- **Judging** — pulls back to ~0.85×, like settling.
- **Settling** — easing toward 1.0× over the last minute of the
  cycle, so wake catches a face already at home size.

### 2. Position drift

Today the face sits fixed at one screen position. In dream, let it
slowly orbit a small ellipse around its home — radius ~80–120 px,
period 90–120 s. The eyes still track other anchors as needed (a body
deletion, a chorus line landing on a specific note); the body of the
face just drifts.

Optional richer move: the face occasionally slides off-centre to
"watch" a constellation that's currently being dreamed about. The
dream engine already has a notion of which pair is active —
[DREAM_GRAVITY.md](DREAM_GRAVITY.md) tracks this. The face could
loosely orbit that pair's centroid instead of its home position
during a Playing-phase pair-pop. Settles back during Judging.

### 3. Opacity

The cloud already breathes via the `weather-sigh` keyframe. In dream,
extend the range from the wake-state subtle band (~0.85–1.0) down to
~0.4 at the trough. Trough timed with the dream's quietest beats
(between pair pops). Crests right before a chorus or idea-seed
generation lands.

### 4. Hue / colour

Today `--mface-glow` is tinted by which utterance backend is active
(template / local / claude / webllm). In dream, the glow gains a
**second axis** — phase-driven hue shift along a small ring near the
accent:

- **Drifting** — accent blue (home).
- **Playing** — warmer, slight shift toward violet (idea generation
  is creative-warm).
- **Judging** — cooler, slight shift toward teal (taste is cold).
- **Settling** — back to accent blue.

The shift is small — never more than ~30° around the colour wheel,
never enough to break the one-accent rule visually. A reader who
glances at the face during dream sees "different blue" not "different
hue."

### 5. Tilt

Already has a tilt — small static rotation. In dream, oscillate it on
a slow sine, ±8° around the home tilt over ~12 s. Read as a head that
keeps almost nodding off.

### 6. Tilt-shift (photographic, optional)

Selective blur on the top and bottom edges of the cloud, sharp in the
middle band. The face starts to feel like a tiny model in a diorama
during the deepest dream beat. Cheap CSS:
`filter: blur(0)` middle, mask gradient blurring the edges. Use
sparingly — this is the most stylised effect and it should land only
on the deepest beat, not as ambient mood.

### 7. Stroke thickness

Scribble strokes have a fixed width today. In dream, breathe the
stroke-width on the same period as scale — ~1.6× of base at the
crest of breath, ~0.8× at trough. Effect is the lines softening as
the face inhales and tightening as it exhales. Subtle but adds
"inhabited" texture without changing the shape of any path.

## Wake transition — the load-bearing piece

When the user comes back (focus event, mouse move after long idle,
the wake modal opens), the avatar may be deep in some dream pose —
1.3× scale, drifted 90 px off-centre, hue shifted toward violet,
breathing at half wake-state pace.

Three options for the transition:

- **A. Snap home.** Immediate reset. Wrong — breaks the weather
  feel, reads as the avatar getting caught.
- **B. Ease home over 600–1000 ms.** Graceful but flat. Feels like
  the dream simply turning off.
- **C. Hold-then-settle.** ~400 ms hold in current dream pose, eyes
  drift slowly toward the user's cursor (or the wake modal anchor),
  THEN ease all properties home over 800 ms. Reads as "noticing the
  user, then waking up." This is the right one.

Pick C. The 400 ms hold is the entire character — without it, the
dream and the wake are the same animation curve and the avatar feels
like a state machine. With it, the avatar is something that was
elsewhere and is gradually returning to attention.

## Phase coupling table

The seven properties bound to the dream phases the engine already
exposes:

| Phase         | Scale     | Drift       | Opacity   | Hue        | Tilt osc | Tilt-shift | Stroke    |
| ------------- | --------- | ----------- | --------- | ---------- | -------- | ---------- | --------- |
| Initialising  | 1.0× home | center      | 0.85→0.95 | blue       | none     | off        | base      |
| Drifting      | ±0.10×    | small       | 0.7–1.0   | blue       | ±4°      | off        | ±0.3×     |
| Playing       | ±0.25×    | follow pair | 0.6–1.0   | warm shift | ±8°      | off        | ±0.5×     |
| Judging       | 0.85×     | center      | 0.5–0.85  | cool shift | ±2°      | brief peak | tighter   |
| Settling      | → 1.0×    | → center    | → 0.85    | → blue     | → 0      | off        | → base    |
| Wake (held)   | (current) | (current)   | (current) | (current)  | freeze   | off        | (current) |
| Wake (settle) | → 1.0×    | → home      | → wake    | → blue     | → 0      | off        | → base    |

Settling is intentionally a long lead-in to wake — by the time the
user actually arrives, the face is already 80% of the way home. The
hold-and-settle on wake is for the last 20%.

## Why this earns its place

The avatar is one of the load-bearing characters in the app. Today it
expresses during _moments_ (chorus line, save, delete) but spends most
of dream phase doing nothing visible. Phase-coupled play turns dream
into a watchable thing — a user who walks past their machine and sees
the face slowly drifting and recolouring gets a "the system is
working on it" signal that no progress bar would ever match.

It also makes the wake transition meaningful. Currently, opening the
wake modal is the dream phase's only externally visible end-point.
With phase-coupled visuals, the wake is the resolution of an arc the
user could see building.

## What we are NOT building

- No new expressions. `dreaming` and `sleeping` are still the only
  canonical dream-phase expressions. The seven properties listed here
  are continuous overlays on top of those expressions, not new ones.
- No content shift. The face never starts saying things it wouldn't
  say awake. Voice is wake-only — the murmurs in
  [AVATAR_HINTS.md](AVATAR_HINTS.md), the chorus snark, the dream
  caption, all stay where they are. Dream just changes how the face
  _looks_, not what it _says_.
- No multi-face / split-personality experiments. One avatar. Even
  during deep play, it's the same face just behaving more freely.
- No reactive interaction during dream. Mouse moves don't perturb
  dream pose; they just trigger the wake transition (case C above).
  Half-wake interactions are a wormhole.

## Implementation sketch

### Property animation

A small `dreamFaceMotion` module in `boltzsidian/src/ui/`. Subscribes
to dream phase changes (already exposed via the dream module) and
sets CSS custom properties on the model-face mount each frame:

```js
mount.style.setProperty("--mface-scale", String(scale));
mount.style.setProperty("--mface-drift-x", `${dx}px`);
mount.style.setProperty("--mface-drift-y", `${dy}px`);
mount.style.setProperty("--mface-tilt", `${tilt}deg`);
mount.style.setProperty("--mface-opacity", String(op));
mount.style.setProperty("--mface-stroke-mul", String(sw));
mount.style.setProperty("--mface-glow-hue-shift", `${hue}deg`);
```

The model-face SVG and its container CSS reference these vars so a
single rAF loop drives everything. No JS-side per-frame DOM mutation
beyond the variable writes.

### Phase awareness

Dream module already emits phase change events (per
[DREAM_ENGINE.md](DREAM_ENGINE.md) lifecycle). The motion module
holds a small per-phase config object (the columns of the phase
coupling table) and crossfades between configs on transition.
Crossfade duration matches the dream's own phase-transition length so
the face moves with the rest of the dream, not on its own clock.

### Wake transition

Listens to whatever the existing "user returned" signal is —
visibility change, focus, mouse activity after idle, wake modal open.
Snapshots the current property values, holds them for 400 ms, then
runs a single 800 ms easeOut to the wake-state values.

### CSS cost

All the properties listed are GPU-friendly transform / opacity /
filter ops. No layout, no paint flashes. The phase scheduler runs
once per dream-phase boundary (rare); the per-frame interp cost is
seven number lerps and seven setProperty calls. Negligible.

## Open questions

- **Cap on motion when video recording or screenshot is in progress?**
  Today screenshots and recordings happen via the capture path
  ([per CAPTURE.md](CAPTURE.md) / docs neighborhood). A capture mid-
  dream might want a frozen face rather than a moving one. Probably
  yes — captures should freeze any property animation for the
  duration. Worth one settings checkbox.
- **Reduced-motion accessibility.** macOS / Windows have a system
  reduce-motion preference. The whole table should fall back to the
  current static dream pose when `prefers-reduced-motion: reduce`
  matches. CSS-only via media query on the variables.
- **Theme / palette interaction.** Some dream themes might already
  push the universe's hue cool or warm. The face's hue shift should
  respect that — not add a redundant warm shift on top of an already-
  warm theme. Probably the simplest answer is that the hue shift
  amount halves when a strong dream theme is active.
- **Dream-end → wake-start lag.** What if the dream cycle finishes
  but the user hasn't returned? The face holds the Settling phase
  pose indefinitely until wake fires. That's probably fine — Settling
  is the closest dream-phase to home pose anyway.

## What to build first

The cheapest thing that earns its place: properties 1, 3, 5 — scale,
opacity, tilt — coupled to a single dream-depth signal (high during
Playing, lower elsewhere). One rAF loop, three CSS variables, no
phase-coupling matrix yet. If that lands and the user finds it
charming, expand to the full table. If it reads as gimmicky, the
table never ships and the change is reversible by removing the
single loop.

Estimate for the first cut: ~2 hours. Full table + wake transition:
another ~4 hours. Each step is independent; the phase table is the
luxurious version, the three-property cut is the floor.

#feature #avatar #phase
