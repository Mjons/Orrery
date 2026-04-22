---
tended_on: [tag-infer]
id: 01KPS7VDDHSY8WHMFTP226VPJ5
created: "2026-04-19T10:32:19.634Z"
---

# FIDENZA_FILTER.md — Solidify the Frame Into Art

Take a moment from the sim — the way bodies are flowing right now — and
turn it into a finished generative artwork in the lineage of Tyler
Hobbs's _Fidenza_. Not a screen-capture. An _object_: a non-overlapping
flow-field composition, palette-harmonised, printable, signable.

Companion to `CAPTURE.md` territory (screenshots, recordings) and to
the existing `#flash` / export plumbing. Everything here operates on
one captured frame — the live sim keeps running underneath.

---

## The pitch

Press `I` (for _ink_). The sim freezes in your mind. A painterly render
appears over it and resolves in ~1.5 seconds: 800–2,500 curving ribbons
of colour, none crossing, thicker where the star-field was dense,
thinner where it was empty, curling the way your universe was curling
just before you pressed the key. Download it as a 4K PNG or a 20MB SVG.
Post it. Sign it. Frame it.

The whole thing works because **the sim already has everything a
Fidenza needs**:

| Fidenza needs       | Sim provides (free)                                   |
| ------------------- | ----------------------------------------------------- |
| A flow field        | The velocity texture. Every body is a vector sample.  |
| Stroke seeds        | Projected body positions, one per body                |
| Thickness variation | Body mass                                             |
| Hue variation       | Palette + channel mapping (kind / speed / mass / age) |
| Spatial density     | Natural — clusters vs voids, no extra work            |
| Organic curvature   | Softened-Newtonian orbits bend exactly right          |

Fidenza is what our sim already is, held still and re-drawn with a
round brush instead of point sprites.

---

## What makes Fidenza _Fidenza_

Before writing any code, know what we're chasing. Tyler Hobbs's
public writings on _Fidenza_ and flow-field generative art break
down into five ingredients. Miss any one and it stops looking like
Fidenza.

1. **Flow-field-driven strokes.** Each stroke is a polyline that
   integrates along a 2D vector field. The field's _smoothness_ is
   what gives the work its organic breath. Noisy fields look chaotic;
   ours (softened Newtonian gravity + flocking) is naturally smooth.
2. **Variable thickness.** Strokes aren't uniform. Some are 2px,
   some 40px. The distribution of thicknesses is bimodal-ish: many
   thin, a few thick, occasional fat. The thick strokes provide
   structure; the thin ones fill the breathing room.
3. **No overlap.** This is the single most expensive and most
   important rule. Each stroke is drawn with collision detection
   against every previously placed stroke. If two would touch, one
   is truncated (or discarded). The resulting _packing_ is what
   reads as hand-drawn.
4. **Palette harmony.** Colours come from a curated palette with 4–8
   entries, weighted. One colour is usually dominant (60%); the
   others are accents. Adjacent colours in the palette rarely
   neighbour each other in the image — some anti-clustering rule.
5. **Composition space.** Canvas proportions matter. Strokes can
   extend _past_ the frame (implied infinity) or stop short of it
   (implied margin). Hobbs varies this per piece; our default should
   be strokes that bleed because the universe doesn't have edges.

Miss any one of these and the output looks like a cheap filter, not
a finished work. Hit all five and the sim earns a new medium.

---

## Our mapping: sim → Fidenza vocabulary

The non-obvious translations. These are what make this feature
_ours_ and not a stock Fidenza knock-off.

### The flow field is the velocity texture

Every body has a 3D velocity in the GPGPU texture. Projected to
screen space (after the same camera matrix the renderer uses), each
becomes a 2D vector. Bake N×N samples of the screen-space velocity
into a 2D grid by splatting + smoothing. Away from bodies, the field
decays to a gentle curl-noise baseline so strokes out in the void
still have something to follow.

Why this beats a pure noise field: the curls in the sim are _real_
— they come from mass, from BHs, from flocking. The viewer can't
consciously read that, but the composition carries the physics of
that specific moment. Frames captured near a BH look swirly. Frames
of a calm scene look gentle. Frames of a collision look violent.
**Every capture is legibly "this moment."**

### Stroke seeds are body positions

Two ways, both worth supporting:

- **Body-seeded (default).** Each body projects to a screen point;
  those points are the seeds. Dense regions spawn many strokes; empty
  regions spawn none. Composition inherits the universe's density.
- **Grid-seeded.** Regular grid with jitter. Even density across the
  canvas. Reads more like classic Fidenza; loses the "this frame"
  feel.

Default is body-seeded. Setting to switch is worth having.

### Thickness from mass

Raw mass isn't well-distributed for visual purposes. Transform:

```
thickness_px = lerp(2, 40, pow(normalisedMass, 0.4)) * compositionScale
```

Black holes blow past the cap — clip to 40px or they draw over
everything. Dust particles sit near 2px. The 0.4 exponent lifts the
mid-range so more strokes are visibly varied.

### Palette from scene + override

Two sources, user can pick:

- **Scene-inherited.** Pull the 5–8 stops from the current scene's
  active palette. Composition feels like that scene in print form.
- **Classic-Fidenza.** One of ~12 hand-curated palettes in the
  Hobbs-ish lineage, picked by the user. For when they want the
  _look_ regardless of scene.

Either way, one palette stop becomes the **dominant** (60%), two or
three become **accents** (collectively 35%), and the rest are **rare
sparks** (5%).

### Hue assignment per stroke

Not random. Rules:

1. **Spatial clustering.** Neighbouring strokes are more likely to
   share a hue — creates visible regions of colour.
2. **Kind bias.** A stroke seeded from a star gets stellar hues; from
   a dust particle gets dust hues. Preserves the sim's own narrative.
3. **Anti-adjacency.** Two palette stops that are adjacent in the
   palette array rarely sit next to each other in the image. Adds
   contrast.

The _region_ emerges naturally from rule 1. It's what makes Fidenza
feel like landscape rather than static.

---

## The capture pipeline

```
  press I
     │
     ▼
 snapshotFrame()         (read position + velocity textures, CPU copy)
     │
     ▼
 buildFlowField(256×256) (project, splat, smooth, fill void with curl noise)
     │
     ▼
 walkStrokes(seeds)      (integrate forward + backward, collision-test)
     │
     ▼
 assignPalette(strokes)  (spatial + kind + anti-adjacency rules)
     │
     ▼
 renderCanvas(2560×2560) (2D canvas, round lineCap, additive optional)
     │
     ▼
 download(.png) or (.svg)
```

The whole pipeline is offline — runs once per capture, blocks the
main thread for <2s at 2K strokes, user sees an overlay progress bar
while it resolves. Live sim continues behind the overlay.

### snapshotFrame()

- `readRenderTargetPixels` on the position + velocity textures. One
  full read of each (e.g. 128² × 16 bytes = 32 KB each). Trivial.
- Also snapshot: `camera.projectionMatrix`, `camera.matrixWorldInverse`,
  the active palette array, viewport size, current scene key.
- Returns a plain `{ positions, velocities, view, palette, scene }`
  object that the rest of the pipeline operates on purely in CPU.

### buildFlowField(res = 256)

- Allocate `Float32Array(res * res * 2)` for the 2D field.
- For each live body: project xyz to NDC via the view matrix, then
  to grid coords. Splat its 2D velocity (also projected) into a
  small Gaussian footprint (~3 cells) on the grid.
- Smooth with a separable 5-tap Gaussian pass (horizontal + vertical).
- For empty cells, fill with a tiny curl-noise sample so strokes
  don't dead-stop in voids.
- Normalise magnitude per-cell to unit length — stroke integration
  wants direction, not magnitude (we get variable speed for free from
  the integration step size).

### walkStrokes(seeds, opts)

For each seed, walk forward and backward.

```js
function walkStroke(x, y, field, opts) {
  const points = [[x, y]];
  // Forward
  let cx = x,
    cy = y;
  for (let i = 0; i < opts.maxSteps; i++) {
    const [vx, vy] = sampleField(field, cx, cy);
    if (isNaN(vx)) break;
    cx += vx * opts.stepSize;
    cy += vy * opts.stepSize;
    if (outOfBounds(cx, cy)) break;
    if (collides(cx, cy, opts.thickness)) break;
    points.push([cx, cy]);
  }
  // Backward (reverse the field at each sample)
  cx = x;
  cy = y;
  const back = [];
  for (let i = 0; i < opts.maxSteps; i++) {
    const [vx, vy] = sampleField(field, cx, cy);
    if (isNaN(vx)) break;
    cx -= vx * opts.stepSize;
    cy -= vy * opts.stepSize;
    if (outOfBounds(cx, cy)) break;
    if (collides(cx, cy, opts.thickness)) break;
    back.unshift([cx, cy]);
  }
  return [...back, ...points];
}
```

`collides()` uses a spatial grid (cell size ≈ 2× max thickness).
Store one entry per drawn stroke point. Query checks only the 9
surrounding cells. O(n) total stroke generation.

**Order matters.** Draw thick strokes first so they claim space, thin
ones fill in. Fidenza's structural feel comes from this ordering.
Sort seeds by thickness descending before walking.

### assignPalette(strokes)

For each stroke in order:

- Sample a palette index weighted by the dominant/accent/spark split.
- Accept with probability proportional to how many nearby strokes
  already share that hue (spatial clustering).
- Reject if the proposed hue is adjacent-in-palette to the nearest
  existing stroke (anti-adjacency).
- Fall back to a random pick if rejection exceeds 5 attempts.

Tunable: cluster radius (typical 40–80px) and anti-adjacency strictness.

### renderCanvas(w, h)

Off-screen `HTMLCanvasElement` at `2560 × 2560` by default (4K
capture), user can go up to `5120 × 5120` for print. Render loop:

```js
ctx.fillStyle = backgroundColor; // often near-black or cream
ctx.fillRect(0, 0, w, h);
for (const stroke of strokes) {
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
  }
  ctx.stroke();
}
```

That's it. No gradients, no shaders — just round-capped 2D strokes on
a solid background. This is what gives the output its permanent,
print-like quality. Bloom and glow are _sim_ aesthetics; Fidenza
lives in solid ink.

### SVG emission

Same geometry, different writer:

```js
let svg = `<svg xmlns="http://www.w3.org/2000/svg"
               viewBox="0 0 1 1" width="${W}" height="${H}">
             <rect width="1" height="1" fill="${bg}"/>`;
for (const s of strokes) {
  const d = s.points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  svg += `<path d="${d}" stroke="${s.color}"
                stroke-width="${s.thickness / W}"
                stroke-linecap="round" stroke-linejoin="round"
                fill="none"/>`;
}
svg += "</svg>";
```

Vector, infinitely scalable, printable at any size without
re-rendering. Typical 2K-stroke file is ~4–6 MB — shareable.

---

## Style knobs

A small set of user-facing controls that span the aesthetic range
without overwhelming.

| Knob             | Range              | Effect                                           |
| ---------------- | ------------------ | ------------------------------------------------ |
| **Density**      | 400 – 3000 strokes | Sparse → packed. Affects both time and presence. |
| **Curl bias**    | 0.0 – 1.0          | 0 = pure sim field, 1 = pure curl noise          |
| **Thickness**    | thin / mixed / fat | Presets for the thickness distribution           |
| **Palette src**  | scene / classic    | Inherit scene palette or pick a library one      |
| **Palette pick** | dropdown           | Only shown if "classic"; 12 curated options      |
| **Background**   | ink / cream / void | Black, cream, or near-sim dark                   |
| **Bleed**        | on / off           | Strokes extend past canvas edge or stop          |
| **Seed source**  | bodies / grid      | Where stroke origins come from                   |
| **Seed value**   | number             | Override — same seed = same artwork              |

Defaults (no-user-input case): Density 1500, Curl bias 0.2, Thickness
mixed, Palette src scene, Background ink, Bleed on, Seed bodies,
Seed value from frame hash.

---

## Sibling styles (phase 3+)

Same pipeline, different pens. Each is a ~100-line variation:

- **Constellation.** Instead of flow strokes, draw straight lines
  between bodies within a distance threshold. Pure black/white. Looks
  like a classic sky-chart but with this scene's actual topology.
- **Wash.** Strokes have heavy alpha (~15%) and wider thickness,
  layered many times. Closer to _Incomplete Control_ watercolour feel.
- **Voronoi.** Cell diagram seeded by body positions, cells coloured
  by kind or speed. Geometric and still.
- **Halftone.** Dot-based — every body becomes a dot sized by mass,
  coloured by palette, on a cream background. Ben Day style.
- **Burst.** Radial strokes emanating from the highest-mass bodies.
  Dramatic and BH-flavoured.
- **Ribbon.** Like Fidenza but strokes are wide and _tapered_ (width
  varies along length via the mass of the _nearest_ body at each
  sample). Painterly.

Shipping one excellent Fidenza is worth more than shipping six
half-baked ones. Ship that first. The others are bonus material when
the sim already feels solidified.

---

## UI surface

New section in the Capture panel (`K`):

```
Fidenza
  Density        ●─────○  [1500]
  Curl bias      ●──○    [0.2]
  Thickness      ◯ thin  ● mixed  ◯ fat
  Palette        ● scene  ◯ classic
  Background     ● ink  ◯ cream  ◯ void
  [ ] Seed from frame (default)
  Seed           [a3f91e02]         [🎲 re-roll]
  ────────────────────────────────
  [ Generate ]    [ Save PNG ]  [ Save SVG ]
```

Generate button runs the pipeline, shows result in a modal overlay
over the sim. Save PNG / SVG available once generated.

**Hotkey:** `I` triggers "Generate with current settings." If the
Capture panel isn't open, settings come from localStorage defaults.

**Modal overlay:** full-screen dark glass with the generated artwork
centred, "Save" buttons below, "Regenerate" (new seed) and "Close"
buttons. Live sim keeps rendering behind the glass — tapping outside
the modal dismisses it. Recording is not interrupted.

---

## Implementation sketch

### File layout

Everything lives in the main `index.html`, matching the repo's
single-file invariant. New section `33. FIDENZA` near the bottom,
before the main loop closes. ~400 lines once all the knobs land.
Phase 1 (core pipeline, one mode) is ~200 lines.

### Data snapshot

```js
function snapshotFrame() {
  const posBuf = new Float32Array(TEX_SIZE * TEX_SIZE * 4);
  const velBuf = new Float32Array(TEX_SIZE * TEX_SIZE * 4);
  renderer.readRenderTargetPixels(
    gpu.getCurrentRenderTarget(posVar),
    0,
    0,
    TEX_SIZE,
    TEX_SIZE,
    posBuf,
  );
  renderer.readRenderTargetPixels(
    gpu.getCurrentRenderTarget(velVar),
    0,
    0,
    TEX_SIZE,
    TEX_SIZE,
    velBuf,
  );
  return {
    positions: posBuf,
    velocities: velBuf,
    count: MAX_BODIES,
    view: {
      proj: camera.projectionMatrix.clone(),
      inv: camera.matrixWorldInverse.clone(),
      aspect: camera.aspect,
    },
    palette: currentPaletteStops(),
    scene: currentSceneKey,
    seed: Math.floor(Math.random() * 0xffffffff),
  };
}
```

### Flow field

```js
function buildFlowField(frame, res = 256) {
  const field = new Float32Array(res * res * 2);
  const counts = new Uint16Array(res * res);
  const { proj, inv } = frame.view;
  const mvp = new THREE.Matrix4().multiplyMatrices(proj, inv);
  const v3 = new THREE.Vector3();
  const velNDC = new THREE.Vector3();

  for (let i = 0; i < frame.count; i++) {
    const m = frame.positions[i * 4 + 3];
    if (m <= 0) continue;
    v3.set(
      frame.positions[i * 4],
      frame.positions[i * 4 + 1],
      frame.positions[i * 4 + 2],
    ).applyMatrix4(mvp);
    if (v3.z < -1 || v3.z > 1) continue;
    const sx = (v3.x * 0.5 + 0.5) * res;
    const sy = (v3.y * 0.5 + 0.5) * res;
    if (sx < 0 || sx >= res || sy < 0 || sy >= res) continue;

    // Project body's velocity into screen space by taking the
    // derivative of the projected pos — cheap approx.
    velNDC
      .set(
        frame.positions[i * 4] + frame.velocities[i * 4] * 0.01,
        frame.positions[i * 4 + 1] + frame.velocities[i * 4 + 1] * 0.01,
        frame.positions[i * 4 + 2] + frame.velocities[i * 4 + 2] * 0.01,
      )
      .applyMatrix4(mvp);
    const vx = (velNDC.x - v3.x) * 0.5 * res;
    const vy = (velNDC.y - v3.y) * 0.5 * res;

    // Gaussian splat into surrounding cells
    const cx = Math.floor(sx),
      cy = Math.floor(sy);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx,
          y = cy + dy;
        if (x < 0 || x >= res || y < 0 || y >= res) continue;
        const r2 = dx * dx + dy * dy;
        const w = Math.exp(-r2 * 0.4);
        const idx = (y * res + x) * 2;
        field[idx] += vx * w;
        field[idx + 1] += vy * w;
        counts[y * res + x] += 1;
      }
    }
  }
  // Average, normalise, fill voids with curl noise (not shown).
  return field;
}
```

### Stroke walking

Detailed above. ~80 lines including the spatial-grid collision check.

### Rendering

Canvas API, ~60 lines. The draw loop itself is 12 lines.

---

## Phases

1. **Phase 1 — core pipeline.** One mode (Fidenza), one palette
   source (scene), fixed thickness presets. Canvas PNG export only.
   No modal — just auto-download. Two days.
2. **Phase 2 — UI + modal.** Settings panel, live preview, save
   buttons. Seed shown + copyable. Two days.
3. **Phase 3 — SVG export.** Vector output. One day.
4. **Phase 4 — palette library.** 12 curated Fidenza-lineage palettes
   - scene source + custom. One day.
5. **Phase 5 — sibling styles.** Constellation, Halftone first —
   smallest diff from phase 1. Others as demand appears. Variable.
6. **Phase 6 — batch capture.** Pressing `I` during cinematic mode
   queues up a capture every N seconds for a session; user gets a
   gallery at the end. Great for finding _the_ frame. Two days.

Ship phase 1 standalone. If the output doesn't make you want to print
it, nothing else is worth building. If it does, phases 2–6 follow
naturally.

---

## What kills this

- **The flow field is noisy.** Per-body splats without smoothing
  produce spiky fields; strokes zig-zag. Gaussian smoothing is
  non-optional.
- **Thick strokes drawn last.** If we forget to sort by thickness,
  thin strokes claim the canvas and the thick ones can't lay down.
  Output reads as "many tiny strokes" instead of "a few structural
  bars with detail around them."
- **Too much curl bias.** Users crank it to 1, get pure noise, think
  the feature is broken. Default 0.2, max warning at 0.5.
- **Palette inherits white.** Sim palettes include near-white stops;
  if white becomes dominant on an ink background, strokes scream.
  Either desaturate white stops or default to cream background when
  dominant is light.
- **Collision grid too coarse.** Cell size ≈ 2× max thickness — miss
  this and strokes visibly overlap in tight regions. Easy to get
  wrong; measure a generated image for overlaps as a unit test.
- **Output at native resolution.** A 1080p capture looks flat. The
  feature sings at 4K+. Don't save anything under 2560×1440 by
  default — wasted potential.

---

## Invariants

- **The frame is read, never written.** Sim state is a source, not a
  target. Physics is undisturbed.
- **Capture is synchronous and blocking within its overlay.** No
  racing against a moving sim during render.
- **Seed → same image, always.** The whole pipeline, including body
  snapshot choice, is reproducible from (sceneKey, frameSeed, opts).
  Same seed at density lite and density lush can produce different
  outputs — that's fine, include density in the seed salt.
- **PNG output must look finished.** A Fidenza without a signature is
  still a Fidenza. Don't add "Made with Universe Sim" watermarks by
  default. Leave artistic credit where it belongs — with the piece.
- **SVG paths must not be self-intersecting.** Round-capped
  self-intersecting strokes render with artefacts in most viewers.
  Our walker produces monotonic polylines; keep it that way.

---

## Variations worth trying as a*design* exercise

Not all worth building, but all worth imagining before phase 1 lands
so we know what space we're in:

- **Two-frame Fidenza.** Capture _now_ and _5 seconds later_; render
  both as overlapping layers with alpha 40/60. Shows motion as
  ghosted duplication. Ethereal.
- **Kind-striped Fidenza.** Each kind gets its own pass, stacked with
  blend modes. Stars go on top, dust underneath. Reads like geology.
- **Animated Fidenza.** One frame per sim-minute for an hour → 60
  stills → timelapse GIF at 2fps. The universe as a slow-motion
  painting.
- **Physical output.** SVG → plotter. A real pen on real paper. The
  piece that started as photons in a browser ends as ink in an art
  store. This is the moment the project has arrived.

---

## The pitch (for launch copy)

> Capture the sim the way photographers capture light. Press a key
> and a moment becomes a finished drawing — thousands of curving
> ink strokes, none touching, following the gravity of that exact
> instant. Export vector, print any size.

> A physics sim that makes its own art, forever, from whatever it
> happened to be doing when you decided to stop.

> Every frame is already a Fidenza. The filter just believes that
> enough to draw it.

That last one is the line that sells it.

#phase #user #feature
