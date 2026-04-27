---
tended_on: [tag-infer]
created: "2026-04-26T00:00:00.000Z"
---

# PLACEMENT.md — Letting users place notes and have them stick

A thinking doc, not a spec. The current product has a real problem:
**physics overwrites the user's deliberate placement**. You drag a note
to where you want it, let go, and the next 60 seconds of gravity +
springs + flocking shove it back toward whatever the equilibrium says
is "right." Even if the persisted positions in `.universe/state.json`
were perfect last session, on next boot physics begins reshaping them
before you've even moved the camera.

This is the bet from [HONEST_TAKE.md](HONEST_TAKE.md) failing in
miniature: spatial memory only develops if positions stay put. They
don't.

---

## 1. What exists today

- **Pinning.** Per-note frontmatter flag `pinned: true` plus a saved
  `position: [x,y,z]`. The body is held there absolutely. Toggleable
  from the panel header (◯/●) or via the `Pin` hotkey. Wired through
  [bodies.setPinned](../boltzsidian/src/sim/bodies.js) and read by the
  physics loop.
- **Position persistence.** `persistState()` in
  [main.js](../boltzsidian/src/main.js) writes the _current_ live
  positions of every body into `.universe/state.json` on a 600 ms
  debounce. On next boot, those positions seed the field.
- **Pinned positions in frontmatter** survive vault re-parses too,
  because they're baked into the file.

What's missing is the middle. Today there's no concept of "I placed
this on purpose, leave it alone for a while" — only "I am committing
to this position forever (pin)" or "do whatever physics wants
(default)." Most of the time the user is in between those two
intentions.

---

## 2. Why pinning isn't enough

Three reasons users don't reach for pinning even when the design
suggests they should:

- **It's a permanent commitment.** Pinning a note feels like saying
  "this is its home forever." Most placements aren't that — they're
  "this is where I want it for this composition I'm making right now."
  The mismatch makes pinning feel heavy.
- **It's per-note.** Composing a layout of 8 notes means clicking pin
  8 times. The friction kills the gesture.
- **It's invisible.** Pinned bodies look identical to free ones.
  After two days you can't tell which notes you pinned and which are
  just drifting near where you left them.

Pinning is the right primitive but the wrong default ergonomic. The
fix isn't to remove pinning; it's to add lighter forms of intention
above it.

---

## 3. The deeper problem: persistState captures physics, not intent

`persistState()` writes the live position from the GPU buffer. By
the time it fires (600 ms after the last edit, longer in practice
because physics is always running), the position has already been
nudged off the user's placement by gravity. So even the "remember
where I left things" promise leaks: what gets remembered is _where
physics had moved things to_ by the moment of save, not _where the
user intended them to be_.

This means a fix to persistence alone doesn't help. We need to
distinguish **intended position** from **physics-current position**
in the data model.

---

## 4. Five design options, ordered by ROI

### 4.1 Soft hold (cheapest, biggest UX gain)

When the user releases a body from a drag, set a per-body
"intent timer" of N seconds (e.g. 8 s). While the timer is running:

- Spring force on this body is reduced to ~10% of normal.
- Gravity pull is reduced to ~25%.
- Flocking is suppressed.
- The body's own velocity is dampened sharply — it settles where
  released instead of drifting.

After the timer expires, weights ramp back to 100% over 2 s so the
return to physics doesn't lurch.

This is the lightest possible answer to "I just placed it, leave it
alone for a moment." No new state, no new UI, no per-note flag.
Discoverable by accident: _"hey, when I drag things they actually
stay put now."_

**Cost:** ~30 lines in physics.js. One per-body float (`intentUntilMs`)
in the bodies buffer.

### 4.2 Compose mode (the deliberate gesture)

Hotkey (e.g. `Cmd+.`) toggles a "compose" state:

- Physics frozen — gravity, springs, flocking, dream gravity all paused.
- The HUD shows a small "composing" badge.
- The user drags bodies into whatever arrangement they want.
- On exit (`Esc` or hotkey again), persist the composed positions
  AND mark the moved bodies as having "intent" (see §4.4).

When physics resumes, the soft-hold treatment applies for ~30 s so
the composition doesn't snap back the moment thawing happens.

This is the killer feature for the "I want to make a deliberate
arrangement" moment. Cleaner than pinning 8 notes individually.

**Cost:** ~80 lines including the HUD badge and the freeze hook in
the physics loop.

### 4.3 Saved layouts (named recall)

Like the existing saved viewpoints, but for body positions. The user
arranges things, hits "save layout as 'morning brief'", and can
recall it later. Recall snaps positions and triggers a 30 s soft-hold
so the layout isn't immediately deformed.

Stored in `.universe/layouts.json` (or in `state.json` under a
`layouts` key) as `{name, positions: {noteId: [x,y,z]}, savedAt}`.
Notes added since the layout was saved sit at their default; notes
removed since are silently dropped from the recall.

This is what makes spatial memory load-bearing. _"My writing
layout"_ and _"my research layout"_ become real, recallable
configurations of the same vault.

**Cost:** ~120 lines for the storage + recall + a small picker UI.

### 4.4 Intent flag in state.json (data-model fix)

Adds a `placed: true` marker per body in `state.json` (and optionally
mirrored to frontmatter for persistence across cache wipes). When a
position has the placed flag, two things change:

- `persistState()` will not overwrite it on the next save.
- The physics loop reads the flag and applies a stronger spring back
  to the placed position (roughly: between "drift freely" and "pinned
  rigidly").

This is the missing data-model piece §3 described. With it, "where
the user intended this" becomes a first-class fact about a body.

**Cost:** ~40 lines, but it touches several files
(state-store.js, bodies.js, physics.js). Worth it — without this,
§4.1 / §4.2 / §4.3 are all building on sand.

### 4.5 Per-cluster freeze (later)

Drag a region with `Alt+drag` (or a marquee), all bodies inside
freeze. Useful for "I want this whole cluster to stay arranged like
this" without committing to per-body pinning.

Lower priority — most users will reach for §4.2 first. Implement
once the basic compose flow is in.

### 4.6 Relative pin — anchor a child to a parent (the architectural answer)

The other five options answer _"keep this body where I put it."_
This one answers a deeper question: **"keep this group together,
wherever the group goes."**

A note can be marked as **anchored** to another note, with a recorded
relative offset:

```yaml
---
id: 01HABCD…
anchor:
  parent: 01HXYZ… # the note this one orbits
  offset: [12, -4, 0] # this body sits at parent + offset
  strength: soft # 'soft' (drift on a leash) or 'rigid' (exact)
---
```

The physics loop reads the anchor on each tick:

- **Rigid** anchors hold the child at exactly `parent.position +
offset`. The child has no independent dynamics; it teleports with
  the parent. Right for tight constellations like a project hub and
  its three sub-pages.
- **Soft** anchors apply a strong spring toward `parent.position +
offset` but let the child drift on a short leash (~5–10 units).
  The child still feels small forces from neighbours and dream
  gravity; it just always returns home. Right for looser orbits like
  a person-note and the three observation-notes about them.

Default is **soft**. Rigid is opt-in via a flag.

#### Why this is the better answer

- **Composes with the alive-universe brand instead of fighting it.**
  Pinning says "this body doesn't move"; relative pin says "this
  group moves together." The universe stays alive — composed
  constellations drift through the field as units, not as frozen
  blobs. Way more on-brand.
- **Encodes structure, not just position.** A composed arrangement is
  more than a snapshot — it's a meaningful _relationship_ the user
  is asserting. Saving relationships outlives saving positions: when
  the field reshuffles for any reason (new notes added, dream cycle,
  cluster algorithm change), the constellation survives because
  it's tied to its hub, not to absolute coordinates.
- **Maps to existing intuition.** Stars orbit galactic centres,
  moons orbit planets, planets orbit stars. The user already
  understands hierarchical anchoring without being taught.
- **Plays beautifully with [CONSTELLATIONS.md](CONSTELLATIONS.md)
  and [STAR_CHARTS.md](STAR_CHARTS.md).** A user could compose a
  constellation visually, anchor the satellites to the hub, name
  the constellation, and the named region travels as one. The
  cluster-name + the anchor graph reinforce each other instead of
  being parallel features.

#### How a user creates an anchor

Two paths, both gestural:

- **Alt-drag from one body to another.** A tether forms during the
  drag. Drop on the target → that target becomes the parent, the
  current body's offset is recorded, the anchor is written to
  frontmatter. Same gesture vocabulary as the existing alt-drag-to-
  link, just with a different modifier (e.g. `Alt+Shift+drag`) so
  it doesn't fight the link gesture.
- **From the note panel header.** A small "anchor to..." button
  opens a fuzzy picker over the vault; pick a note → the current
  body's offset relative to that note becomes the anchor.

To break: drag the child away while holding `Esc`, or click the
anchor bond and select "release."

#### How the physics actually does it

In [physics.js](../boltzsidian/src/sim/physics.js), after the spring

- flock pass:

```js
for (const child of vault.notes) {
  const a = child.frontmatter?.anchor;
  if (!a) continue;
  const parent = vault.byId.get(a.parent);
  if (!parent) continue; // orphan — fall through to free
  const pi = bodies.indexOfId(parent.id);
  const ci = bodies.indexOfId(child.id);
  if (pi < 0 || ci < 0) continue;
  const targetX = positions[pi * 3 + 0] + a.offset[0];
  // … same for y, z
  if (a.strength === "rigid") {
    positions[ci * 3 + 0] = targetX; // teleport
  } else {
    // Strong spring with damping toward target
    velocities[ci * 3 + 0] += (targetX - positions[ci * 3 + 0]) * 0.4 * dt;
  }
}
```

~30 lines, runs after the existing physics pass so anchors override
spring drift.

#### Edge cases

- **Parent deleted / hushed.** Child becomes free (anchor preserved
  in frontmatter as a dormant reference; if the parent ever returns
  by id, the anchor reactivates).
- **Anchor cycle** (A anchored to B anchored to A). Detect at write
  time; reject the second anchor with a toast. _"Can't anchor — that
  would create a loop."_
- **Anchor depth.** A → B → C is fine; physics resolves in topological
  order each tick. Cap at depth 5 to avoid pathological chains.
- **User drags an anchored child.** Drag updates the offset live;
  releases save the new offset to frontmatter. The anchor stays;
  only the relative position changes. Hold `Esc` while dragging to
  break the anchor instead.
- **Anchored child paired with a third note in dream.** The anchored
  position is its position; the dream pair-finder uses real positions
  regardless. No special-casing needed.

#### Visual cue

A thin **bond line** from parent to child — different style from the
existing wikilink tether (which renders curved/flowing). The anchor
bond is straighter, slightly translucent, and inherits the parent's
folder tint. Two notes anchored to the same parent share the same
bond hue, which makes constellations visually obvious without
labelling.

#### What this replaces (or doesn't)

- **Replaces §4.5** (per-cluster freeze) entirely. Anchoring IS the
  cluster-freeze gesture, just better-named and persistent.
- **Reduces but doesn't replace §4.2** (compose mode). Compose mode
  becomes a _workflow_ — pause physics, arrange a constellation,
  exit, then sweep through the satellites and `Alt+Shift+drag` each
  to the hub to commit the relationships. Without anchors, compose
  mode's output is fragile (the soft-hold expires, physics returns,
  arrangement decays). With anchors, compose mode becomes the
  setup phase for permanent relative pins.
- **Reduces but doesn't replace §4.3** (saved layouts). A
  constellation IS a layout, defined relationally rather than
  absolutely. A vault full of well-anchored constellations needs
  fewer named layouts because the structure carries itself.
- **Doesn't replace §4.4** (intent flag) or §4.1 (soft hold). Free
  bodies still benefit from the data-model fix and the drag-feels-
  intentional polish — anchors aren't for every note, just for the
  ones that have a clear parent.

### 4.7 Image-to-constellation — drop a PNG/SVG, satellites form the shape

Built directly on top of §4.6. Worth shipping, **not in MVP**.

Drag a PNG or SVG onto a note's body (or its panel header). The
parent absorbs the image as a constellation template. Every note
currently anchored to that parent — plus any free notes the user
chooses to recruit — is reassigned a new offset that places it at a
sampled point of the image. The result: the parent's children
collectively _draw_ the image in the field.

#### The pipeline

1. **Sample salient points from the image.**
   - **SVG:** parse paths via the browser's native SVGGeometryElement
     API (`getTotalLength`, `getPointAtLength`); sample N evenly
     spaced points along the strokes.
   - **PNG:** draw to an off-screen canvas, run a cheap edge
     detector (Sobel or just luminance threshold), sample dark
     pixels weighted toward edges. N = number of children to place.
2. **Project to 3D.** Three options, default the simplest:
   - **Flat (default):** all points sit on the parent's local
     z-plane. The constellation reads as a 2D drawing in the field.
     Looks great when the camera faces the plane; reads as a tilted
     line when the camera moves around it. That's the brand.
   - **Bas-relief:** dark pixels get a small +z bump proportional to
     darkness. Cheap depth illusion without needing a depth map.
     ~10 lines extra.
   - **True 3D from a depth-map image** (a second uploaded greyscale
     PNG, or an inferred depth from a model). Cool but heavy; defer
     until someone asks.
3. **Assign children to points** (Hungarian algorithm or greedy
   nearest-point, depending on count). Greedy is fine up to ~50
   children; Hungarian for larger sets.
4. **Write the offsets to each child's `anchor.offset`** via the §4.6
   mechanism. Mark the parent's frontmatter with
   `constellation_image: <path-in-vault>` so the relationship is
   re-renderable from disk.
5. **Storage.** Uploaded images live at
   `.universe/constellations/<parent-id>/<filename>` so they ship
   with the workspace. Multi-root: store next to the parent's source
   root (the same `getSourceRoot` path used for note saves).

#### Why this is worth doing

- **One-of-a-kind feature.** No other PKM tool can do this because
  no other PKM tool has a 3D field of physical bodies. The fact that
  Boltzsidian's anchor mechanism makes it nearly free to ship is the
  whole point.
- **Brand-multiplying.** Hits the painterly hook in
  [LAUNCH.md](LAUNCH.md) hard — _"Pointillist Space"_ literally
  becomes the user's own pointillism, with their own notes as the
  dots.
- **Demo magic.** The Twitch stream + launch tweets get a video
  feature that's instantly explicable: "drag any image onto a hub
  note and your satellites become that image."
- **Composes with [STAR_CHARTS.md](STAR_CHARTS.md).** Star Charts
  already has procedural shapes (ring, disc, spine, fan). This adds
  _user-supplied_ shapes through the same mechanism. The Star Chart
  becomes "shape: ring | disc | spine | fan | image" with one new
  branch.

#### Failure modes & honest caveats

- **Sparse inputs.** A parent with 3 children can't draw the Mona
  Lisa. Sample N=children-count points and accept that the image
  will be coarse — a few stars in a Y-shape that vaguely suggests
  the original. Show a faint outline of the source image during
  arrangement so the user understands the intent.
- **Dense inputs.** A parent with 200 children drawing a 10×10
  pixel-art Pac-Man works fine; drawing a 4K photograph collapses
  into noise. UI hint: "this image will sample to N points — pick
  something graphic, not photographic."
- **The flatness reads as flat.** From most camera angles, a 2D
  constellation in 3D space looks like a line. Solution: the
  cinematic director auto-cuts to a face-on view of the
  constellation when the user just dropped one, holds for a few
  seconds, then resumes drift.
- **Persistence on file move.** The `constellation_image` path needs
  to round-trip safely if the user moves the parent note to a new
  folder. Use a workspace-relative path stored in
  `.universe/constellations/<parent-id>/...` keyed by note id, not
  parent's path.
- **Image rights.** Free-for-all on user-uploaded images. Don't
  build a curated stock library — that's not the brand.

#### Why it's worth shipping (but not in MVP)

The MVP is just §4.1 + §4.6 + §4.4 — the placement plumbing. Once
that's stable for a couple of weeks, ship §4.7 as the first
"delightful" build on top. It's the kind of feature that gets a
project written about, but only after the foundation is solid;
shipping it on top of buggy anchors would just expose the anchor
bugs faster.

The MVP also doesn't lock in any decisions that would make §4.7
harder later. The anchor mechanism IS the entire backend for
image-to-constellation.

---

## 5. Recommended slice (revised — relative pin changes the picture)

The honest read after writing §4.6: **relative pin is the better
long-term answer**, and §4.2 / §4.3 / §4.5 are mostly band-aids that
exist because we didn't have anchors. Re-prioritised stack:

1. **§4.1 first** (soft hold on drag-release). Free UX win, no data
   model change, ~30 lines. Makes every drag feel like the user
   meant it. Ship this in a day; it stops the worst pain immediately.
2. **§4.6 second** (relative pin / anchor). The architectural fix.
   Adds a real `anchor: { parent, offset, strength }` field, the
   physics override, the `Alt+Shift+drag` gesture, and the bond-line
   visual. ~250 lines across frontmatter parser, physics, and a
   small picker. **This is where spatial memory becomes load-
   bearing**, because constellations now persist relationally
   instead of decaying with the field.
3. **§4.4 third** (intent flag for free bodies). Anchored bodies
   don't need it — their position is computed from their parent's.
   But free bodies still need the data-model fix so persistState
   captures intent rather than physics-current. Smaller scope now
   that anchors carry most of the weight.
4. **§4.2 fourth, optional** (compose mode). With anchors in place,
   compose mode stops being load-bearing — it becomes a _workflow_
   for setting up a constellation in one sitting (pause physics,
   arrange, anchor, exit). Worth shipping if users ask for it; not
   before.
5. **§4.3 even later** (saved layouts). A vault full of anchors
   needs fewer named layouts because structure carries itself.
   Defer until the demand is real.
6. **§4.5 dropped**. Per-cluster freeze is what anchors do better.

**The new MVP is §4.1 + §4.6 + §4.4**, in that order. Roughly two
weekends. Soft hold ships in a day and you can live with it; anchor
is the meaningful build; intent flag tidies the loose end.

### Why this beats the original recommendation

The original stack (intent flag + soft hold + compose mode) treated
the universe as the enemy of placement — it was about _defending_
positions against physics. Relative pin reframes the whole problem:
positions don't matter, _relationships_ do. Once a constellation is
anchored, the physics can do whatever it wants to the absolute
coordinates because the structure travels with the parent.

That's much more on-brand. The universe stays alive — it just
preserves the user's compositions as it moves.

---

## 6. Visual cues — make placement legible

A body's _placement state_ should be readable at a glance:

- **Free** (default): no marker. Drifts with physics.
- **Recently placed** (in soft-hold window): a brief, faint inner
  ring that ticks down over 8 s. Quiet visual confirmation that the
  drag landed.
- **Composed** (intent flag set, not pinned): a thin static halo
  the same colour as the accent — there but not loud.
- **Pinned** (frontmatter `pinned: true`): the existing solid
  pin glyph in the panel + a clearer ring on the body itself
  (currently barely distinguishable from free).
- **Compose mode active** (whole-scene): a global shift in tone —
  bodies a touch dimmer, a `composing · esc to thaw` strip at the
  top. The frozen state is unmistakable.

Without these cues users can't tell what's happening to their
arrangements and won't trust them.

---

## 7. Tension with the brand (and the resolution)

The product thesis is _the universe is alive_. Letting users freeze
it fights that. But the spatial-memory bet from
[HONEST_TAKE.md](HONEST_TAKE.md) §3.3 only pays off if positions
stay put long enough for memory to form. Both have to be true.

The right framing:

- The **universe drifts** between deliberate placements. That's the
  default; it's what makes the field feel alive.
- The user's **placements stick** when they make them. Soft hold
  makes a single drag feel intentional; compose mode makes a
  multi-body arrangement feel intentional; saved layouts make
  intention recallable.
- **Dreaming respects intention** too. During the dream cycle,
  composed/pinned bodies are anchors — the rearranging happens
  _around_ them, not to them. (This needs a small change to the
  dream-gravity attractor's force application.)

So: the universe stays alive, but it stays alive _around_ the user's
intent rather than overwriting it.

---

## 8. Acceptance criteria

Ship §4.4 + §4.1 + §4.2 when all hold:

1. Drag a body to a new position, let go, walk away for 30 s. The
   body should still be visibly within ~10 units of where you
   released it. (Currently fails — physics moves it 50+ units.)
2. Enter compose mode, arrange 6 bodies, exit. Walk away for 60 s.
   The arrangement should remain recognisable: relative positions
   preserved within ~15%.
3. Reload the app. The placed positions from the prior session
   should restore exactly, not get reshaped within the first second.
4. A pinned body (existing feature) is fully unaffected by the new
   layers — the intent flag adds a _softer_ bucket without changing
   pinning's behaviour.
5. Visual cues clearly distinguish free / soft-hold / composed /
   pinned. A blind hover-and-tell test: a user who didn't write the
   feature should be able to identify which state a given body is in.

---

## 9. Out of scope

- **Disabling physics globally.** That's the existing
  `dream_enabled: false` + sleep cap settings. Not the same problem
  — those govern the dream cycle, not wake-mode placement.
- **Building a 2D layout mode.** The 3D field is the product. Don't
  flatten it just because positioning is hard.
- **Snap-to-grid.** Wrong vibe for the brand. Painterly placement,
  not engineering CAD.
- **Bulk pin via Tend pass.** Tend should not be making placement
  decisions. Placement is the user's gesture; Tend is for content.

---

## 10. The single-sentence framing

The universe is alive between the user's deliberate placements —
not on top of them.

#feature #user
