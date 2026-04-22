---
tended_on: [tag-infer]
id: 01KPS7VDDVQS5E39MPGAYTF0TT
created: "2026-04-19T19:55:48.234Z"
---

# FILAMENT.md — Flow-Field Bead Chains

Sibling feature to `FIDENZA_FILTER.md`. Instead of rendering each
flow-field stroke as a single continuous ink ribbon, **place beads
along it**: tapered chains of filled circles, each bead with a small
geometric treatment (solid, concentric rings, split halves, pie slices,
dots, or hollow ring). Think astrophysics-track-plot meets Klee.

The reference implementation already exists standalone at
`filament.html` in this repo. This doc is about wiring that output
into our live sim so the flow field is driven by the universe's
actual motion at the moment of capture — not by Simplex noise.

---

## The pitch

Press `U` (for _universe-strand_). The sim freezes in your head. A
painterly render appears and resolves in ~1.5 seconds: a few hundred
curving **bead chains**, each threaded along the gravity currents
that were moving a moment ago. Beads taper at chain ends, swell in
the middle, wear one of six decorative treatments, and inherit colour
from a scene-derived sub-palette. Download as PNG or SVG.

The output reads as: _someone patiently mapped the currents of that
exact moment with beads on a wire._ The sim's physics becomes a
printed artefact of the same specific instant the viewer watched.

---

## Filament vs Fidenza — same bones, different skin

| Stage           | Fidenza                        | Filament                                  |
| --------------- | ------------------------------ | ----------------------------------------- |
| Snapshot frame  | identical — read pos + vel tex | identical                                 |
| Flow field      | identical — Gaussian splat     | identical                                 |
| Seed placement  | identical — body-projected     | identical                                 |
| Walk strokes    | identical — bidirectional      | identical                                 |
| Collision       | against stroke points          | against **bead disks** (looser spacing)   |
| Palette assign  | per-stroke weighted random     | **per-chain biased subset** (1–4 colours) |
| Terminal render | `ctx.stroke()` round-cap       | `drawCurveAsBeads()` — six treatments     |

Everything up to and including the walker is shared. We get a
zero-cost second medium out of the Fidenza pipeline plus a new
renderer + palette-biaser.

This matters for maintenance: one flow-field + walker, two
render endpoints. Fidenza / Filament are siblings, not rivals.

---

## The existing reference (`filament.html`)

Already in the repo. Self-contained, ~3,600 lines. Uses a _pure
Simplex noise_ flow field, with an optional spiral term anchored at
a focal point. Our integration keeps its **renderer and bead
vocabulary exactly** and replaces the noise field with our velocity
field.

### What to port

- `drawCurveAsBeads` (~130 lines): arc-length tabulation, bead
  placement loop, taper bell, per-bead cross-chain shrink-or-skip.
- `drawBead` (~100 lines): the six treatments. Don't reinvent — the
  details are already tuned in the reference.
- `pickBeadTreatment`, `beadFill`, `beadStroke`, `pickCurvePalette`,
  `pickBiased` (~50 lines).
- Per-chain "bias" palette concept (the subset idea — 1–4 colours
  drawn from the global palette, weighted 0.7^i).
- Spine underlay option — faint ink line under beads to connect
  widely-spaced chains.
- The six named palettes worth stealing (Classic, Pink, Emerald,
  RadDark, Golf, Luxe). Each is a curated bg + ink + 7–10 colours.

### What to skip / replace

- **The noise flow field and its UI knobs (turb, curl, spiral, tilt,
  focalX/Y, freq).** Replaced wholesale by our velocity texture
  readback — those knobs become nothing-to-tune because the physics
  does the equivalent work.
- **The seed-candidate OBB check and palette-pills lock system.** We
  don't need seed exploration UI; capture always uses the current
  frame.
- **The grain + vignette options.** Our sim already has grain /
  vignette on the live render; the Filament capture should live on
  clean flat colour, matching Fidenza's aesthetic invariant.
- **All the preview-scale plumbing and favourites gallery.** Too much
  UI. Ship the feature, not a sandbox.

### What to add that filament.html doesn't have

- **Per-scene palette inheritance.** Sample the live scene's palette
  stops as an alternative to the named palettes. Same pattern we used
  for Fidenza.
- **Kind-biased palette picks per bead.** A bead seeded from a BH can
  favour the palette's hottest colour; a bead from dust can favour
  cooler. Makes the physics legible at capture time.
- **Scene-key + seed-hash reproducibility.** Same seed, same frame,
  same image.

---

## The bead catalog

Six treatments ported verbatim. Each uses one or two colours drawn
from the chain's biased palette. All are oriented along the local
path tangent so dividers "flow" with the curve.

| Name       | Description                                            | Weight |
| ---------- | ------------------------------------------------------ | ------ |
| **solid**  | Filled disc + optional ink outline                     | 40%    |
| **rings**  | 2–5 concentric rings, alternating colours              | 18%    |
| **split**  | Divided across or along the tangent, two colours       | 14%    |
| **pie**    | 3–6 radial wedges, each a different colour             | 10%    |
| **dots**   | Filled disc with 1–2 smaller concentric dots inside    | 12%    |
| **hollow** | Ring-only stroke (no fill) with optional inner outline | 6%     |

Weights are editable via UI pills. Filament.html already implements
this as six separate sliders (user-tunable weighting). For our
integration, expose as **three presets**:

- **Classic** — default weights from filament.html
- **Bold** — more solid + split, less hollow + dots
- **Quiet** — more hollow + rings, less pie + dots

Start with Classic as default. Users don't need more than three
presets to find what they like.

---

## Per-chain palette bias (the colour-region effect)

This is the single most distinctive technique vs Fidenza. Each
curve picks 1–4 colours from the global palette, weighted `0.7^i`
so the first pick dominates. Every bead in that curve draws from
**only those colours**, producing the "this chain is mostly navy +
ochre, the next chain is mostly coral + teal" look visible in the
reference images.

```js
function pickCurvePalette(globalPalette, rng, n = 3) {
  const pool = globalPalette.slice();
  const picks = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return { picks, weights: picks.map((_, i) => Math.pow(0.7, i)) };
}
```

At our sim's scale (few hundred chains per capture), the aggregate
effect is a mosaic of small colour-regions. The eye reads the
regions as landscape — clumps of mood across the canvas — exactly
the quality the reference images have.

### Tying bias to the sim

Extra richness: bias each chain's palette pick by its **seed body's
properties**. Options (pick the cleanest one):

- **Kind-biased.** Seed is a BH → bias weights toward hot palette
  stops. Seed is dust → cooler. Seed is galaxy-A → one accent; B →
  the other.
- **Mass-biased.** Heavy seed → longer curves + first-pick dominance
  boosted to 0.85^i (one colour heavily dominates). Light seed →
  flatter, more colour variety.
- **Speed-biased.** Fast seed → saturated high-chroma picks. Slow
  seed → muted neutrals.

Ship _kind-biased_ first. Most legible, most tied to the sim's
vocabulary.

---

## Taper, spacing, density

Ports from filament.html, tuned for our typical 500–2,000 chains.

- **Taper amount:** `[0, 1]`, default `0.7`. Chains shrink toward
  endpoints — a hallmark of the style, visible in all four reference
  images. `0` = uniform beads, `1` = aggressive Q-tip ends.
- **Bead gap multiplier:** `[-0.3, 1.0]`, default `0.12`. Fraction of
  bead diameter added as spacing. Negative = overlap (rings layered).
- **Bead radius variation:** `[0, 0.5]`, default `0.15`. Per-bead
  jitter on size so adjacent beads don't look mechanical.
- **Spine alpha:** `[0, 1]`, default `0.22`. Faint ink line drawn
  along the curve under the beads so gaps are visually bridged.

### Scale presets

Filament.html uses named scales (`small` / `mixed` / `large` /
`giant`). Our integration exposes three:

- **Small** — bead diameter 6–20 px at 2560 canvas; dense chains.
  Reads as lattice / fabric.
- **Mixed** — 6–60 px bimodal distribution; a few fat "structural"
  chains plus many thin ones. Closest to reference image 2.
- **Large** — 30–100 px; sparse, few chains, each bead a statement.
  Reads as jewellery. Image 4's feel.

Default **Mixed**. It's what all four reference images want.

### "Thin-chain" escape valve

A small fraction of chains (~10% by default, tunable) render as
**ink strokes only** — no beads, just a spine line. Shown clearly in
reference image 1: white hairlines are the dominant texture; colour
beads punctuate. Essential for variety at high density.

In Filament.md speak: each chain rolls `rng() < thinRate` at draw
time; if true, draw the polyline with `lineWidth = w * 0.14` in ink
colour and skip bead placement. `thinRate` = 0.1 for Mixed, 0.25 for
Small.

---

## Composition

Same canvas sizing and aspect rules as Fidenza: longest edge 2560
default, match camera aspect, flip Y (NDC bottom-up → canvas
top-down).

Bead radius in pixels = `baseRadius * taperK * varFactor`, where
`baseRadius = chainWidth * 0.5 * state.beadSize`. `chainWidth` is
the same thickness our Fidenza walker picks from the Scale preset.

Collision strategy **differs from Fidenza**. Beads collide against
other chains' _beads_, not against all stroke points. Implementation:

- On chain walk (flow-field integration), _don't_ commit to collision
  grid.
- Only when beads are actually placed on the curve, register each
  bead disk in the grid.
- When placing the next bead on a new chain, query the grid; if
  overlap, _shrink_ the bead (×0.78 up to 6 times) until it fits; if
  still overlapping at minimum radius, _skip that slot_ (nudge
  forward half a diameter and try the next one).

Result: chains can pass very close without crunching, beads stay
legible as discrete objects, and local density naturally varies.

---

## UI surface

The Capture panel (`K`) grows a new "Style" pill row under the
existing Fidenza section, _or_ the Fidenza section becomes a two-way
split:

```
Style          ● fidenza  ◯ filament
Density        ●────○     [1500]
Thickness      ◯ thin  ● mixed  ◯ fat       ← Fidenza-only knob
Scale          ◯ small ● mixed ◯ large      ← Filament-only knob
Beads          ● classic ◯ bold ◯ quiet     ← Filament-only knob
Bg / Palette src / Seed (shared)
────────────────────────────────
[ Generate ]   [ Save PNG ]   [ Save SVG ]
```

The panel swaps the mid-section (Thickness vs Scale+Beads) based on
which Style pill is active. Shared knobs stay visible.

### Hotkey

- `I` — Fidenza (already bound).
- `U` — Filament. Pick _U_ for "universe-strand" and because `F` /
  `P` are taken. Not under the fingers for any other critical
  feature.

### HUD on capture

Same toast pattern as Fidenza: `Filament · 812 chains · 1180ms`.
No modal in phase 1; auto-download.

---

## Implementation sketch

### File layout

One new section `23c. FILAMENT` right after `23b. FIDENZA`. Target
~350 lines once all the ported bead treatments land. All of it is
pure CPU + Canvas 2D — no composer changes.

Re-use existing Fidenza helpers where clean:

- `_fidenzaSnapshotFrame` → rename to `_captureSnapshotFrame`, share.
- `_fidenzaBuildFlowField` → `_captureBuildFlowField`, share.
- `_fidenzaSampleField` → `_captureSampleField`, share.
- `_fidenzaWalkStrokes` → split into `_captureWalkCurves` (returns
  polyline + seed metadata) + `_fidenzaStrokeRender`. Fidenza and
  Filament both consume curves; each has its own renderer.
- New: `_filamentRender(curves, opts, frame)` → calls
  `_filamentDrawChain(curve, ...)` per curve.

### Core new functions

```js
function _filamentPickCurveBias(globalPalette, seedBody, rng) {
  // Kind-biased. Read seedBody.kind, weight pool accordingly.
  const pool = globalPalette.slice();
  const n = 2 + Math.floor(rng() * 3); // 2..4 colours per curve
  // If seedBody is BH, shuffle pool so hot colours land first.
  if (seedBody.kind === 2) {
    pool.sort((a, b) => hue(b) - hue(a)); // red-biased
  } else if (seedBody.kind === 3) {
    pool.sort((a, b) => lightness(a) - lightness(b)); // pale-biased
  }
  const picks = [];
  const shufPool = pool.slice();
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * shufPool.length);
    picks.push(shufPool.splice(idx, 1)[0]);
  }
  return { picks, weights: picks.map((_, i) => Math.pow(0.7, i)) };
}

function _filamentDrawChain(curve, bias, opts, beadGrid, chainId) {
  // 1. Arc-length table along curve points.
  // 2. Thin-chain check — if rng() < opts.thinRate, stroke polyline only.
  // 3. Spine underlay — if opts.spine > 0.
  // 4. Bead placement loop — arc-length walk, taper bell, variation.
  // 5. Per-bead grid collision: shrink or skip.
  // 6. For each placed bead: call _filamentDrawBead(bead, bias).
}

function _filamentDrawBead(bead, bias, opts) {
  // Six treatments, chosen by weighted roll. Port verbatim.
}
```

### New options object

```js
const filamentOpts = {
  scale: "mixed", // small | mixed | large
  beadMix: "classic", // classic | bold | quiet
  thinRate: 0.1,
  spine: 0.22,
  taper: 0.7,
  gap: 0.12,
  variation: 0.15,
  outlineWidth: 0.6, // ink outline per bead
  density: 800, // fewer chains than Fidenza — each is busier
  bg: "ink", // shared
  seedSource: "bodies", // shared
};
```

Note the smaller default density (800 vs Fidenza's 1500). Each
filament chain is visually heavier than a stroke, so we use fewer.

### Rendering order

1. Background fill.
2. For each chain: compute bias from seed body kind.
3. Sort chains descending by length (longer chains = more visual
   weight; place them first so their beads claim grid space).
4. For each chain in order: draw spine underlay, then walk and
   place beads. Register beads in grid as committed.
5. No second pass. `ctx.fill()` / `ctx.stroke()` handles the painter's
   algorithm.

---

## Phases

1. **Phase 1 — port the core.** Renderer, six bead treatments, taper,
   per-chain bias, spine underlay. Scene-palette inheritance only.
   `U` hotkey triggers with default opts. PNG download. Two days.
2. **Phase 2 — UI in Capture panel.** Style pill toggle, scale preset,
   bead-mix preset. The rest rides on shared Fidenza knobs. One day.
3. **Phase 3 — named palettes.** Port the six best palettes from
   filament.html (Classic, Pink, Emerald, RadDark, Golf, Luxe).
   Capture-panel dropdown to pick scene-or-classic. Half a day.
4. **Phase 4 — SVG export.** Same pattern as Fidenza phase — emit
   `<path>` + `<circle>` / `<path>` for each bead treatment. One day.
5. **Phase 5 — kind / mass / speed bias tuning.** Make the physics
   legible in the colour field. Half a day, mostly swatch fiddling.
6. **Phase 6 — batch capture.** Pressing `U` during cinematic mode
   takes one capture per scene transition for a session. Pair with
   Fidenza's phase 6 — probably one unified gallery at the end. Two
   days.

Ship phase 1 standalone. If the output looks like the reference
images, phases 2–6 land naturally. If it doesn't, the likely culprit
is either the per-chain bias isn't firing (check the weighting) or
the taper is too subtle (crank it to 0.85 and re-check).

---

## What kills this

- **Beads at display resolution.** A 1080p capture reads like dots.
  Filament NEEDS 2560+ to breathe. Lock the minimum resolution in
  UI; warn the user if they try anything smaller.
- **Chains too dense.** Filament with 2k+ chains looks like textile;
  the magic is visible space between chains (reference image 4).
  Default density **800**, cap at 1400 for filament. For Fidenza,
  1500 is fine.
- **Per-chain bias picks too many colours.** If every chain picks
  all 8 palette colours with equal weight, the region-effect
  disappears. Clamp `n` to `[2, 4]` and honour the `0.7^i` weighting.
- **Spine underlay too dark.** Filament.html's default (`0.22`)
  works on cream. On ink backgrounds the spine disappears into the
  bg. Cap spine to a _minimum_ visibility against the chosen bg.
- **Bead collision grid too tight.** If beads can't fit, chains
  drop out entirely in dense regions, creating unnatural voids.
  The ×0.78 shrink / 6-try limit is tuned — don't lower it.
- **Treatments that don't scale down.** "Pie" with 6 slices on a
  6-px bead is a coloured smudge. In the draw step, skip pie/rings
  below radius 4 and fall back to solid. Port this guard.

---

## Invariants

- **Physics is never touched.** Same as Fidenza. This is a pure
  output medium.
- **The flow field comes from the sim, not from noise.** If someone
  refactors the field to "just use noise" because it's simpler, the
  feature has lost its reason to exist.
- **Beads are atomic.** A bead is always a circle (or circle-derived
  shape) with a single position, radius, and tangent. No composite
  shapes, no sprites.
- **Per-chain bias palette is honoured strictly.** A chain never
  draws a colour outside its biased picks. That guarantee is what
  produces the region-effect.
- **Filament and Fidenza share a walker.** Two render endpoints, one
  curve-generation pipeline. Changes to the walker apply to both;
  changes to rendering apply to exactly one.

---

## Pitch fragments

> Your universe, strung on wire. Every gravity current from that one
> moment becomes a beaded chain, each bead a little geometry, the
> whole thing frozen in six hundred colours on ink.

> A physics sim that makes two kinds of art: one in long ink ribbons,
> one in small round beads. Press _I_ for ribbons. Press _U_ for
> beads.

> Every chain is a cross-section through the gravity field. Six
> treatments per bead, three or four colours per chain, one frame
> forever.

The middle one is the tweet — the pair-of-buttons line is
memorable and sells the feature without needing a screenshot.

#phase #reference #feature
