---
id: 01KR0000TETHERDIRECTION00
created: 2026-04-22
---

# TETHER_DIRECTION.md — Color incoming vs outgoing on the side they come from

Today a tether between two bodies is drawn as a single accent-
tinted line. At a glance you can't tell if A→B, B→A, or both. The
note panel already distinguishes incoming from outgoing in its
backlinks list; the 3D view should reflect the same truth.

User ask: **differently colored on the side they're going from.**
A link A→B should look like "something leaves A" on A's end of
the line, and "something arrives at B" on B's end. The color tells
you at a glance which way the arrow points without drawing an
arrowhead (arrowheads clutter at scale).

---

## 0. Premise

Every edge in `vault.forward` is directional. Tethers today
collapse direction: the renderer takes the edge set, draws a
segment between body positions, done. Direction information is
lost in rendering.

Consequences:

- **Mutual links look identical to one-way links.** A ↔ B and A →
  B render the same.
- **No at-a-glance "where is this flowing?"** Hard to trace
  influence during dream gravity peaks.
- **Backlink panel doesn't cross-reference.** You see 12
  backlinks in the panel but can't tell which tethers on canvas
  correspond to them without clicking.

---

## 1. What a directional tether looks like

Five plausible encodings. We evaluate each.

### 1.1 Gradient along the line (recommended)

Line color transitions from SOURCE tint near A to TARGET tint near
B. Linear gradient in clip space.

**Pros.** Zero new geometry. Single shader change. Reads as
direction at every zoom level (the gradient bias is visible whether
the line is 3 px or 300 px on screen).
**Cons.** Colors must be orthogonal enough to distinguish. Against
an accent-only palette, using accent + a contrasting tone works;
adding a SECOND accent violates the one-accent rule.

**Compromise.** Use a single hue, split into two LUMINANCE stops:
brighter at the source ("this light is leaving here"), dimmer at
the target ("this light is arriving here"). Same-color-different-
brightness is legible without introducing a rainbow.

### 1.2 Arrowhead at the target end

A small triangle at the target vertex.

**Pros.** Unambiguous direction.
**Cons.** Breaks down at scale — a 2 px line with a 6 px arrow
becomes visual noise at wide zoom. Has to be billboard-aligned.
Adds geometry (two extra triangles per tether).

### 1.3 Dashed pattern that animates along the line

Marching ants from source to target.

**Pros.** Gorgeous. Obvious direction. Works at every zoom.
**Cons.** Animation-expensive at 1000+ tethers. Competes for
attention with dream-gravity motion. Would need to suppress during
dream or drop to LOW quality tier.

### 1.4 Thickness taper

Wider at source, thinner at target.

**Pros.** No color change. Works with one-accent rule.
**Cons.** Subtle at typical line weights. Hard to see at distance.
Requires custom line renderer (three.js standard lines don't taper).

### 1.5 Per-side half-line

Split the segment at its midpoint. Source half = one color. Target
half = another.

**Pros.** Simpler than gradient (two segments instead of one).
**Cons.** Hard cut at midpoint looks like a broken line. Two draw
calls per edge. Worse than §1.1 in every dimension except shader
simplicity.

---

## 2. Recommended approach: luminance gradient along the line

**Single line segment, two vertex attributes, one shader change.**

Each vertex gets a new attribute:

```js
aDirectionT: Float32Array(segCount * 2); // 0 at source, 1 at target
```

- `aDirectionT[i*2]` = 0 (vertex at source end).
- `aDirectionT[i*2 + 1]` = 1 (vertex at target end).

Vertex shader interpolates `vT = aDirectionT` to fragment. Fragment
shader samples the gradient:

```glsl
float t = vT;  // 0 at source → 1 at target
vec3 col = mix(uSourceCol, uTargetCol, t);
gl_FragColor = vec4(col, vAlpha * taper * dreamFade);
```

Where:

- `uSourceCol` = accent × 1.25 (brighter end).
- `uTargetCol` = accent × 0.55 (dimmer end).

The brighter end = "flowing from here." The dimmer end = "landing
here." Same hue, different brightness. One accent respected.

### 2.1 Mutual links

When A ↔ B (both forward(A).has(B) AND forward(B).has(A)), the
edge is ambiguous. Today we dedupe by edge key (i < j) so mutual
links draw once. With direction colors, we'd want the mutual case
to look SYMMETRIC — a uniform brighter line, not a gradient.

Detect in `rebuildEdges`:

```js
for (const e of edges) {
  e.mutual = forward.get(aId)?.has(bId) && forward.get(bId)?.has(aId);
}
```

In the shader, when `aMutual = 1.0`, skip the gradient (use source
color everywhere, or the average of source+target).

Visually: mutual links look "thicker / brighter overall," one-way
links have a visible gradient from bright → dim.

### 2.2 Which end is which?

The tether segment has `a` and `b` body indices. We need to know
which is the SOURCE in `vault.forward`. `rebuildEdges` already
decides the canonical edge key (`i < j`), but that's lexicographic,
not directional.

Change the segment record to carry direction:

```js
{ a: srcIndex, b: dstIndex, rest, mutual }
```

Where `a` is always the forward-graph SOURCE. If both directions
exist (mutual), pick the one with lower index for determinism but
set `mutual: true`.

In `tethers.rebuild()`, vertex 0 of the segment gets `aDirectionT
= 0` (source end), vertex 1 gets `aDirectionT = 1` (target end).

### 2.3 Quality tier interaction

Low tier already simplifies tethers. Drop the gradient entirely at
Low (single uniform accent color) — one less attribute to upload,
one less interpolation in the fragment shader. At Medium / High /
Ultra, gradient is on.

---

## 3. Alternative: reuse folder tints for source / target tone

If two connected notes live in different roots or different
folders, the source-tint + target-tint gives cross-region links a
visible "flowing from root X into root Y" look. This composes
naturally with the existing folder-tint system.

**Pros.** Piggybacks on tint vocabulary users already see on body
halos. Makes cross-project tethers instantly readable.
**Cons.** Links within the same folder show uniform color (both
ends same tint) → looks like the original non-directional line.
User can't tell direction for intra-folder edges.

**Workaround.** Blend: 70% folder tint + 30% luminance gradient.
Direction still readable within-folder via the subtle gradient;
cross-folder links get the full tint split.

Scope creep; skip for v1.

---

## 4. Implementation phases

### Phase A — Direction metadata in physics edges · ~45 min

1. `physics.rebuildEdges()` — record the SOURCE of each edge
   (not just `a < b`). Also compute `mutual` for edges that go
   both ways.
2. `refreshEdgesFor(noteId)` — keep direction metadata fresh.
3. Export edge shape `{ a, b, rest, mutual }` where `a` is always
   the forward-graph source.

### Phase B — Tether shader direction attribute · ~1 h

1. Add `aDirectionT` buffer attribute to the tethers geometry.
2. Vertex shader passes through as `vT`.
3. Fragment shader mixes source/target color based on `vT`.
4. Add `uSourceCol` / `uTargetCol` uniforms. Default to accent ×
   1.25 and accent × 0.55.

### Phase C — Mutual handling · ~30 min

1. Add `aMutual` attribute (0 or 1 per vertex — both vertices of
   the same segment share the value).
2. Shader short-circuits gradient when `aMutual === 1.0`.

### Phase D — Quality tier integration · ~15 min

1. `tethers.setQuality(tier)` toggles a uniform flag that the
   shader reads (or swap to a simpler material at Low).

**Total: ~2.5 hours.**

---

## 5. Verification

After shipping:

1. Create three test edges: A→B, C→D, E↔F.
2. Zoom close to each pair.
3. A→B tether is bright on A's end, dim on B's end.
4. C→D same pattern on C's end.
5. E↔F is uniform (mutual).
6. Open A's note panel. Backlinks section is empty. Forward
   links shows B. The tether color gradient "points away" from A
   — matches the "this link leaves here" cue.
7. Open B's note panel. Backlinks shows A. The tether color
   gradient "points toward" B — matches the "this link arrives
   here" cue.

---

## 6. What to deliberately skip

- **Arrowheads.** Already too noisy at scale.
- **Animated flow.** Beautiful but expensive. Save for [[DREAM_GRAVITY]]
  future work when peak motion gets its own visual layer.
- **Per-link opacity decay over age.** Links don't expire.
- **Color-coded pass type** (tag-infer links vs obvious-link vs
  manual). All edges are just edges in the graph; the origin of
  the edge isn't load-bearing after creation.
- **Directional halo on the body itself** (a little glow arc on
  the target side). Visual clutter; the line gradient is enough.

---

## 7. Interactions with existing features

- **[[RENDER_QUALITY]].** Low tier drops the gradient; one
  uniform color. Medium+ gets the full directional shading.
- **[[DREAM_GRAVITY]].** During dream, tethers already fade
  heavily — the gradient is less visible, which is fine. Dream
  is about the field, not the graph structure.
- **[[LIVE_CLUSTERS]].** When edges repartition and the forward
  direction flips, the gradient flips with it on the next
  `rebuildEdges`. Transition is instant (no animation); the
  tether's fade-in/out covers the flip.
- **[[CONSTELLATIONS]].** Tethers entering / leaving a cluster
  read as one-directional against the other cluster's tone. If
  combined with the folder-tint composition (§3), cross-cluster
  flow becomes visually traceable.
- **Note panel backlinks list.** The gradient direction matches
  the in/out list split — same information, two surfaces.

---

## 8. One sentence

A tether is a vector, not a string — its source end should glow
brighter and its target end dimmer along a single luminance
gradient, so direction is readable at any zoom without breaking
the one-accent rule and without adding geometry.

#tethers #direction #graph #visual

[[DREAM_THEMES.md — Telling the dream what to dream about]]
