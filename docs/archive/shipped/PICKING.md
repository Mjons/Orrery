---
tended_on: [tag-infer]
id: 01KPS7VDP4HGP70GAQNRJRS088
created: "2026-04-21T15:51:18.838Z"
---

# PICKING.md — Knowing what the user is pointing at

A focused design doc. After two attempts at fixing the hover-label
behavior, a clear pattern has emerged: our current hit-testing doesn't
match what the GPU actually draws. No amount of tuning thresholds will
fix that. We need a different approach.

This doc names the problem, lists five real approaches (not
seventeen), ranks them honestly, and proposes a path.

---

## 0. The actual problem

Every star on screen is a GL `Point` whose rendered size is computed
in the vertex shader using:

```glsl
float baseSize = (4.0 + sqrt(aMass) * 5.0) * densitySize;
gl_PointSize = baseSize * pulse * selBoost * hoverBoost * labelBoost
             * (420.0 / -mv.z) * uPixelRatio * 0.5;
```

Our hit-test function `bodies.pickAt(x, y)` uses a _completely
different formula_:

```js
const radius = 6 + Math.sqrt(mass[i]) * 4;
```

These disagree about:

- **Camera distance scaling.** Shader divides by `-mv.z`; picker ignores
  camera entirely. A far star might render at 2px but the picker thinks
  it has radius 10.
- **Density boost.** Dense clusters render ~1.4× larger; picker doesn't
  know about density at all.
- **Pixel ratio.** Shader accounts for `uPixelRatio`; picker is in CSS
  pixels with no ratio adjustment.
- **State modifiers.** Selection, hover, pulse all change rendered
  size; picker ignores these.

Result: when the user hovers a visible sprite, the picker might return
a _different_ body, or none, or a body that's behind it in the depth
buffer. This is why "the label keeps popping from a star near the one
I'm on."

It's not a tuning problem. It's a _formula divergence_ problem. The
picker is making up a world the renderer doesn't actually draw.

---

## 1. Five approaches

### 1.1 Match the shader (CPU)

**Port the shader's size math to JavaScript.** `bodies.pickAt` computes
each body's actual projected screen position _and_ its actual rendered
pixel radius using the same formula the shader uses. Cursor-in-sprite
hit-testing becomes a simple circle-point check.

```js
// Per body, each pickAt call:
const mv = applyMatrix4(cameraViewMatrix, worldPos);
const zDist = -mv.z;
if (zDist <= 0) continue; // behind camera
const projected = applyProjectionMatrix(mv, projMatrix);
const sx = (projected.x * 0.5 + 0.5) * screenWidth;
const sy = (1 - (projected.y * 0.5 + 0.5)) * screenHeight;

const shaderSize =
  (4 + Math.sqrt(mass) * 5) *
  (1 + density * densityBoost * 0.45) *
  (420 / zDist) *
  pixelRatio *
  0.5;
const hitRadius = shaderSize * 0.5; // gl_PointSize is width, not radius

const dx = sx - cursorX;
const dy = sy - cursorY;
const d = Math.sqrt(dx * dx + dy * dy);
if (d < hitRadius + marginPx) ...
```

**Pros.** CPU-only. No extra render pass. Fast (O(n) per pick). When
right, pixel-accurate by construction. Doesn't need the shader change
to stay in sync — we control both.

**Cons.** Shader changes must be mirrored in JS or the picker drifts
again. (Solution: extract the size formula into one JS function and
use it from BOTH the shader builder _and_ the picker, so they can't
diverge. Or: build the shader source from the JS function.)

**Cost.** Half a day. Medium risk of subtle mismatches initially;
fixable by eyeballing a debug overlay that draws the picker's radius
as a circle.

**Verdict.** This is probably what we should ship first. It's the
minimum correct fix.

### 1.2 GPU picking

**Render the scene to an offscreen framebuffer where each body writes
a unique color (= its index) instead of visuals.** On hover, read one
pixel at the cursor position and decode the color back to a body id.

Implementation: a second `Points` mesh with the same geometry and a
`PickMaterial` that writes `vec4(id.r, id.g, id.b, 1.0)`. Render to a
`WebGLRenderTarget` just before each pick. Use `renderer.readRenderTargetPixels`
to grab one pixel.

**Pros.** Pixel-perfect by definition. Whatever's drawn at (x, y) is
what gets picked. No formula to mirror. Handles _everything_ —
occlusion, transparency, dense clusters, arbitrary future shader
effects.

**Cons.**

- Extra render pass per pick (cheap at 20Hz, but non-zero).
- `readRenderTargetPixels` causes a GPU↔CPU sync — a few ms stall on
  render calls that cross it. Usually not noticeable but can show up
  on frame-time graphs.
- More code. Two materials to maintain, one render target to size
  with the window, careful bookkeeping for body↔id encoding.

**Cost.** Full day or two. Low risk once working.

**Verdict.** The most robust solution. Worth doing if §1.1 still feels
off, or if the app gains more complex per-body visual effects later
(halos, sprites, glyphs) that make CPU mirroring untenable.

### 1.3 Sort by depth, tiebreak by proximity

**Treat overlapping sprites as a stack.** When multiple bodies are
within hit-radius of the cursor, prefer the one closest to the camera
(front-most). Tiebreak by `d/radius` as we do today.

**Pros.** One-line change on top of current code. Fixes the specific
"wrong body behind the one I'm on" case.

**Cons.** Doesn't fix the bigger bug — the hit radius is still wrong
because the formula diverges from the shader. Cursor can still miss
visible stars or hit invisible ones.

**Verdict.** Stopgap only. Don't ship on its own; combine with §1.1.

### 1.4 Make sprites bigger

**Up the minimum rendered size so every star is easier to aim at.**
Change `baseSize = 4.0 + ...` → `baseSize = 8.0 + ...`, bump the
distance-scaling intercept, etc.

**Pros.** Zero code; just shader constants. Might make the problem
"tolerable" by making the hit target larger regardless of the formula
mismatch.

**Cons.** Bodies start to look clumpy; the fine-grained density
clusters that [[AMBIENCE]] specifically wants to preserve get smudged
into blobs. Makes the _symptom_ slightly better, not the bug. Doesn't
help when the cursor is _between_ two bodies.

**Verdict.** No. This is cosmetic cover for a real bug.

### 1.5 Label spotlight (UX sidestep)

**Don't try to pick one body — reveal labels for all bodies within a
spotlight (say 120px) around the cursor.** Multiple labels at once.
The user picks the right one with their eye.

**Pros.** Sidesteps the hit-testing problem. Always shows the "right"
label because all candidates are visible. Softens the sharp-edge feel
of picking.

**Cons.** Michael explicitly asked for pin-point accuracy. This is the
opposite. Multiple labels reintroduce the clutter the "On hover" mode
was invented to eliminate. Fine for a _different_ mode ("spotlight")
but doesn't deliver what was asked for.

**Verdict.** Worth remembering as a distinct mode name for a future
feature, not a fix for the current bug.

---

## 2. Recommendation

**Ship §1.1 (Match the shader) first. Keep §1.2 (GPU picking) in
reserve.**

The §1.1 fix is the right size for a bug fix: it repairs the divergence
that caused the symptom, it's contained to `bodies.pickAt`, and it
leaves no room for further tuning-by-vibes — either the math is right
or it isn't, and we can tell from a debug overlay in fifteen seconds.

If, after §1.1, hover-labeling still feels off in some cases (dense
overlaps, odd camera angles, unusual pixel ratios), escalate to §1.2.
That's the "this is unambiguously correct" fallback.

Don't do §1.3 alone. Don't do §1.4 at all. §1.5 is a different
feature, not a fix.

---

## 3. The §1.1 implementation, concretely

Three changes:

1. **Extract a `computeScreenRadius(body, camera, pixelRatio)` helper**
   in `sim/bodies.js` that returns the body's current rendered pixel
   radius. Mirror the shader formula exactly, _including_ density,
   selection, hover, label-hover multipliers. Export it so the picker
   can use it.

2. **Rewrite `bodies.pickAt` to use it.** Score becomes
   `d / screenRadius`, cap outside `screenRadius + marginPx`. Pick the
   smallest score. Cursor inside any sprite (d < screenRadius) is
   guaranteed a hit for that sprite.

3. **Optional debug overlay.** A devtools toggle that draws the
   computed hit radius as a dim circle around each body. Lets us
   visually confirm the picker's model matches what's drawn. Ship it
   behind a console hook (`window.__boltzsidian.debug.showPickRadii
= true`).

One source of truth for size. Picker and shader can't disagree if they
read from the same function.

---

## 4. Risks and caveats

- **`gl_PointSize` interpretation varies.** Different GPUs may round
  or clamp slightly differently. Our picker will be close but not
  atom-identical at the pixel edge. Add a few pixels of margin
  (e.g. 4px) to cover the slop — still pin-point for the user.
- **Density boost changes during dream mode.** The density uniform
  oscillates with sleep depth. Picker reads the current uniform each
  call, so it stays in sync.
- **Camera hasn't updated yet.** If the camera moves between render and
  pick, the picker's projection lags one frame. In practice the picker
  is called on pointer events, which interleave with animation frames.
  A ~16ms lag is imperceptible.
- **Pinned / hidden bodies.** Exclude `pinned` bodies? No — they're
  still visible. Exclude off-screen bodies via the z<0 / clip-space
  check, as we do today.

---

## 5. What to do right now

1. Implement §1.1 in `bodies.pickAt`. Extract a single-source formula.
2. Add the debug overlay so we can eyeball correctness.
3. Re-test hover mode with `L` toggled to "On hover."
4. If hover-label picks the right body 100% of the time, ship it.
5. If it's still off in specific scenes, gather those scenes and
   escalate to §1.2 with a concrete failure set.

---

## 6. One sentence

The picker and the renderer have to agree about what's drawn where —
right now they don't, and no threshold value will make a wrong formula
correct.

#user #star #risk
