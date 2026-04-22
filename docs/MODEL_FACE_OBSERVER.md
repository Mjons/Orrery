---
tended_on: ["obvious-link:01KPS7VD7K6WKG085QCSXDVHJS"]
"obvious-link: "01KPTK09SMZVRJ1AXWFJMVRYZR\","
id: 01KPTMXH3A5KANBAHE9H3ZDE4J
created: "2026-04-22T13:08:21.705Z"
---

# MODEL_FACE_OBSERVER.md — The face moves to the back of the room

Builds on [MODEL_SURFACES.md](MODEL_SURFACES.md) (§1.2: "is a model producing
this output?") and the existing implementation at
[boltzsidian/src/ui/model-face.js](../boltzsidian/src/ui/model-face.js) +
[index.html](../boltzsidian/index.html) `#model-face` rules. This doc
repositions the face from a top-left HUD sticker into a soft,
atmospheric presence that haunts the scene.

## The idea in one sentence

Turn the 112px mascot in the corner into a roughly 1300px translucent
amorphous face, floating behind the universe off to one side and tilted,
quietly judging what the user is doing.

## Why

The current model-face is a functional indicator: 112px top-left, tight
SVG, crisp scribble lines, backend color in a halo. It answers "is the
model running?" correctly. What it doesn't do is exist. It reads as a
status badge, not a presence.

A bigger, softer, off-axis face turns the backend from a utility into a
co-inhabitant of the space. The universe still belongs to the notes —
the face is the weather, not the subject. Done right, the user only
notices it when they stop to look.

## The target

- **Size** — ~12× current. Viewport-relative: about 70vmin on the long
  axis, so it scales with window, never fills the screen.
- **Opacity** — 50% more transparent. Current halo runs at 0.08–0.12;
  move the whole face container to ~0.25 peak, 0.10 resting. On a dark
  glass background it reads as a ghost.
- **Position** — pinned off-center. Default: lower-right quadrant,
  center of face at roughly (70vw, 65vh). Not top-left. The corner
  was a HUD slot; the new position is a theatre box.
- **Rotation** — a gentle tilt, 10–18° off vertical. Variable per
  session (seeded from settings.id or similar) so it's not always the
  same angle.
- **Depth** — sits BEHIND the bodies/tethers (z-index 2–3), above the
  starfield. The universe passes in front of it. Bloom + particle
  glow overpaint it; the face is weather behind the system.
- **Amorphous form** — drop the crisp SVG silhouette. The features
  (eyes, mouth) stay as scribbles, but sit inside a soft blobby
  radial-gradient cloud rather than a circle. Cloud breathes.
- **Tilt-shift** — depth-of-field blur applied through a CSS filter so
  the top and bottom of the face are softer than the middle. Same trick
  as miniature-effect photography; communicates "this is far away"
  without any 3D.
- **Color drift** — backend color stays the base tint, but a slow hue
  drift (~60° over ~90s) cycles through neighbour hues so the face
  never reads as the same static object for long. Resets on backend
  change.

## The vibe — "judging the whole system"

Not mean-judging. More like: sitting at the back of the room while
someone solves a puzzle, not helping, not interrupting, occasionally
raising an eyebrow. The expressions that already exist (idle, thinking,
snarky, dreaming, speculating, template, sleeping) all still fit. Two
tweaks:

- **Eye line follows the cursor.** Not all the time — a soft lazy
  tracking at ~20% speed, as if the face just noticed where you are.
  Pointer at upper-left screen → pupils drift upper-left. No head
  rotation, just eye offset.
- **Blink occasionally.** Every 8–15s the eye scribbles briefly flatten
  into a horizontal line for 120ms. Cheap CSS animation, big presence
  gain.

Both are optional. If either starts feeling creepy, it's trivial to
remove — but either alone is enough to lift the face from "decoration"
to "there's someone in here."

## Implementation

### 1. Container geometry

Change `#model-face` CSS block at [index.html:1537-1546](../boltzsidian/index.html#L1537-L1546):

```css
#model-face {
  position: fixed;
  top: auto;
  left: auto;
  right: -8vmin; /* bleeds slightly off-canvas */
  bottom: 14vh;
  width: 70vmin;
  height: 70vmin;
  z-index: 3; /* was 26 — behind bodies/tethers/UI */
  pointer-events: none;
  opacity: 0.35; /* was effectively 1.0; halo alpha did the rest */
  transform: rotate(var(--mface-tilt, 14deg));
  transition:
    opacity 600ms ease,
    filter 600ms ease;
  filter: blur(0.4px) saturate(0.9);
  mix-blend-mode: screen; /* so it adds to the starfield instead of covering */
}
```

### 2. Amorphous cloud behind the face

Add a background blob to the face element. Two options:

- **CSS-only**: a stack of three `radial-gradient` backgrounds at
  slightly different centers, each with a long alpha tail. Breathes via
  `@keyframes` animating `background-position`.
- **SVG `<filter>`**: add a `feTurbulence` + `feDisplacementMap` to the
  SVG template wrapping a simple circle. Distorts the silhouette into
  clouds. Animate `feTurbulence` baseFrequency for the breathing.

Start with CSS-only (no shader cost). Move to SVG filter if the CSS
version reads as "blurry circle" instead of "cloud."

### 3. Tilt-shift

CSS `mask-image: linear-gradient(to bottom, transparent 0%, black 30%,
black 70%, transparent 100%)` fades the top and bottom edges so the
face looks like a slice of a larger field. Combined with `filter: blur`
it reads as miniature-photo tilt-shift.

For a fancier version: a SVG feGaussianBlur with a vertical displacement
mask so blur increases toward top and bottom. Defer unless the CSS mask
feels flat.

### 4. Scribble features at scale

The current SVG viewBox is `-50 -50 100 100`. The scribble stroke widths
look right at 112px; at 1300px they'll read as heavy lines.

Fix: bump `stroke-width` via CSS custom property, and scale DOWN —
`stroke-width: calc(var(--mface-stroke, 1.2px) * (100 / 1300))` — so at
render-size the lines are still ~1–2px visual. Alternative: just leave
them thick; thick amorphous scribbles might look right as "big face"
energy. A/B when shipping.

### 5. Color drift

In [model-face.js:59-62](../boltzsidian/src/ui/model-face.js#L59-L62),
add a slow hue cycle to the `--mface-glow` CSS var. In CSS, wrap the
existing glow color in `hsl(from var(--mface-glow) calc(h +
var(--mface-hue-drift, 0deg)) s l)`. A RAF loop in the module advances
`--mface-hue-drift` by ~0.5deg/frame up to 60 then back. Reset on
`setBackend()`.

### 6. Eye tracking (optional)

Listen to pointermove on window; normalize cursor to face-center;
translate the pupil/eye groups by a small offset. Apply with a 180ms
transition so it drifts rather than snaps. Only enable when
`document.hasFocus()` and `settings.reduce_motion !== true`.

### 7. Blink (optional)

A CSS keyframe that scales the eye scribble groups to `scaleY(0.08)`
for 120ms, triggered by a setTimeout with jittered interval (8–15s).

## What stays the same

- Expression state machine ([model-face.js:88-130](../boltzsidian/src/ui/model-face.js#L88-L130))
  unchanged. All six expressions apply at new size.
- Backend color map ([index.html:1555-1566](../boltzsidian/index.html#L1555-L1566))
  unchanged. Drift modulates, doesn't replace.
- Dwell timing (4500ms) unchanged. Feels right; only the visual
  presentation changes.
- The `createModelFace()` API stays — main.js wiring unchanged.

## What to watch out for

- **Performance.** A 70vmin blurred + masked + blend-mode element is
  inexpensive on integrated GPUs but not free. Disable the face on
  `performance.now()` > 16ms rolling-average frames; it's decorative,
  not load-bearing. Hook: the existing pref `settings.reduce_motion`.
- **Contrast.** Translucent amorphous face + dark starfield + faint
  tethers = risk of the tethers getting lost against the face's bright
  regions. `mix-blend-mode: screen` should mostly solve it (the face
  adds light, it doesn't subtract), but verify against the sparse
  starfield-only scene.
- **Position collisions.** Off-center-right lower-quadrant is roughly
  where the note-panel opens. When a note is open, slide the face to
  the LEFT quadrant (mirror horizontally) so they don't overlap.
  Hook: the existing `activeNoteId` at [main.js:161](../boltzsidian/src/main.js#L161).
- **Accessibility.** `aria-hidden="true"` already set. No tab stop. Do
  NOT remove — screen readers should not announce a decorative mood.

## First cut (one hour)

Only these changes — ship them and live with it:

1. Container geometry (size + position + rotation + opacity + z-index +
   blend mode) — one CSS block edit.
2. `mask-image` gradient for tilt-shift top/bottom fade — one line in
   the same block.
3. One `radial-gradient` background as the cloud — one line.

Skip: amorphous SVG filter, hue drift, eye tracking, blink, position
swap on note open. Decide after living with the baseline for a week
which of those earn their weight.

## Kill condition

If the user reports: "I keep thinking something is in my peripheral
vision" in a way that's distracting rather than atmospheric, reduce
opacity further or disable entirely. If "I stopped noticing it within a
day and now I miss it when it's gone," ship it as default.

The feature is load-bearing when: a screen recording of the app reads
as "there's something watching this universe," not "there's a mascot
in the corner."

#face #model #observer #visual #hud

[[Notes]]

[[new]]

[[Boltzsidian]]

[[Dreaming]]
