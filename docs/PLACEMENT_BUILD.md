---
tended_on: [tag-infer]
created: "2026-04-26T00:00:00.000Z"
---

# PLACEMENT_BUILD.md — How to actually ship the placement work

Operational plan for the design in [PLACEMENT.md](PLACEMENT.md).
That doc is the _why_; this one is the _how, in order_. Split into
five phases with concrete files, acceptance gates, and a kill
condition per phase. Read PLACEMENT.md §5 first if you haven't —
the recommended slice (soft hold → anchor → intent flag) is the
spine.

---

## Phase 0 — Preconditions (verified by audit 2026-04-26)

Three critical gaps surfaced before code started; all addressed in
the phase plan below. Notes on each:

- ✅ Vault parser reads arbitrary frontmatter scalars and flat
  arrays ([vault/parser.js:55](../boltzsidian/src/vault/parser.js#L55))
  and stringifier round-trips them ([frontmatter.js:103](../boltzsidian/src/vault/frontmatter.js#L103))
  — but **only flat top-level keys**. Nested objects (`anchor: {…}`)
  are NOT round-tripable. Phase 2 uses flat `anchor_parent` /
  `anchor_offset` / `anchor_strength` keys instead. (Audit fix #3.)
- ✅ `bodies.addBody` / `removeBody` / `positionOf` / `indexOfId`
  / `moveBody` exist and are stable.
- ✅ `physics.rebuildEdges` is the chokepoint after vault graph
  changes.
- ❌ **Drag-to-move bodies does NOT exist today.** `bodies.moveBody`
  is exposed but nothing calls it from a user gesture. Only existing
  body-touching gestures are link-drag (Alt/Shift) and click-to-
  select. Phase 1 (soft hold) presupposes a release event the
  codebase doesn't fire. Phase 0.5 below adds the missing primitive.
  (Audit fix #1.)
- ✅ `stringifyFrontmatter` + `saver` round-trips a write back to
  disk (verified — used by handleTogglePin).
- ❌ **`Alt+Shift+drag` collides with link-drag.** [link-drag.js:87](../boltzsidian/src/ui/link-drag.js#L87)
  fires on `altKey OR shiftKey`. Phase 2 uses `Cmd/Ctrl+drag`
  instead. (Audit fix #2.)

---

## Phase 0.5 — Basic body drag (half day, blocking)

The missing primitive. Without this, soft hold has nothing to hold
_from_ — the user can't currently move a body in the field at all.

**Files to touch:**

1. New `boltzsidian/src/ui/body-drag.js` — mirrors
   [link-drag.js](../boltzsidian/src/ui/link-drag.js) shape but with
   no modifier (bare left-click on a body):
   - `pointerdown` on canvas → `bodies.pickAt(x, y)` → if a body is
     hit AND no modifier is held AND OrbitControls isn't currently
     panning, claim the drag.
   - Disable OrbitControls (`controls.enabled = false`) for the
     duration so the camera doesn't fight.
   - Compute the body's distance from the camera at drag start;
     reuse that depth for every subsequent pointermove. Project the
     pointer ray to that constant-depth plane and write the
     intersection back into the body's position via
     `bodies.moveBody(id, [x,y,z])`.
   - On `pointerup`: re-enable OrbitControls. Mark `stateDirty`.
     Fire the soft-hold callback (Phase 1).
2. [boltzsidian/src/main.js](../boltzsidian/src/main.js) — wire
   `createBodyDrag({ canvas, camera, controls, bodies, onRelease })`
   alongside the existing `createLinkDrag`.

**Coexistence with existing handlers:**

- A bare-left-click that doesn't hit a body falls through to
  OrbitControls (camera rotate).
- Modifier-held (Alt/Shift) still goes to link-drag — body-drag
  early-returns when modifiers are present.
- Clicking a body without dragging (pointerup within ~3 px and
  ~200 ms of pointerdown) still opens the note panel — body-drag
  detects the no-movement case and skips both the move and the
  panel-open is left to the existing click handler.

**Acceptance:**

- Click a body, drag, release. Body sits where you released it.
- Camera doesn't rotate during the drag.
- Click-without-drag still opens the panel.
- Holding Alt or Shift falls through to link-drag (verified by
  drawing a wikilink between two bodies post-Phase-0.5).

**Effort:** ~80 lines in body-drag.js + ~5 lines wiring in main.js.

---

## Phase 1 — Soft hold (1 day)

The cheap UX win. Free bodies that the user just released get a
short window where physics is muted on them, so they don't
immediately drift away from where they were dropped.

**Files to touch:**

1. [boltzsidian/src/sim/bodies.js](../boltzsidian/src/sim/bodies.js)
   - Add a per-body `Float32Array intentUntilMs` allocated alongside
     the existing `mass`, `glow`, etc. Default 0 (no soft hold).
   - Add `setSoftHold(noteId, ms = 8000)` that writes
     `performance.now() + ms` into the slot.
   - Expose `softHoldEndOf(noteId)` for the physics loop to read.
2. [boltzsidian/src/sim/physics.js](../boltzsidian/src/sim/physics.js)
   - In the per-body force-application step, look up the body's
     soft-hold end. If `now < intentUntilMs`:
     - Compute a damp factor: `1.0` outside the window, ramping
       linearly to `0.1` for spring force, `0.25` for gravity, `0`
       for flock at the moment of release. Ramp back over the last
       2 s of the window to avoid a snap.
     - Sharply damp velocity: `vel *= 0.7` per frame inside the
       hold window.
3. [boltzsidian/src/main.js](../boltzsidian/src/main.js) — find the
   pointerup that ends a body drag, call `bodies.setSoftHold(id)`
   right before the existing position commit.

**Acceptance:**

- Drag a body to a new position. Let go. Walk away for 30 s.
  The body is within ~10 units of where it was released. (Currently
  fails by 50+ units.)
- Pinned bodies are unaffected (already overridden by `pinned`
  check in physics).
- Linked notes still gravitate — they just gravitate gently.

**Kill condition:**

- If the soft hold makes the field feel "sticky" or "stuck" to
  the user across a session, the damp factors are too aggressive.
  Tune down the damp + shorten the window before adding more code.

**Effort:** ~30 lines. One sitting.

---

## Phase 2 — Anchor mechanism (the build, ~1 week)

The architectural answer (PLACEMENT.md §4.6). Anchored child
bodies follow their parent's position with a recorded offset.
Constellations become persistent and travel with the field.

Sub-phases inside Phase 2 — ship them in order, each independently
testable:

### 2A — Frontmatter contract + reader (half day)

**Schema (flat, three top-level keys — see Audit fix #3):**

```yaml
---
id: 01HABCD…
anchor_parent: 01HXYZ… # the note this one orbits
anchor_offset: [12, -4, 0] # Δx, Δy, Δz from parent
anchor_strength: soft # 'soft' (default) or 'rigid'
---
```

Flat keys are the only shape the existing
[stringifyFrontmatter](../boltzsidian/src/vault/frontmatter.js#L103)
can round-trip. Nested objects serialize to `[object Object]` and
the parser is flat-only too.

**Files:**

1. [boltzsidian/src/vault/parser.js](../boltzsidian/src/vault/parser.js)
   - No change. The three flat keys already parse as scalars +
     array.
2. New helper `boltzsidian/src/vault/anchor.js`:
   - `getAnchor(note)` → `{ parentId, offset: [x,y,z], strength }`
     or `null`. Composes from `note.frontmatter.anchor_parent`,
     `…_offset`, `…_strength`. Validates: parent must be a string,
     offset must be a 3-number array, strength must be `"soft"` or
     `"rigid"` (default `"soft"` if missing). Returns `null` on any
     malformed field rather than throwing.
   - `setAnchorFields(fm, parentId, offset, strength)` mutates a
     frontmatter object to set the three keys (used by Phase 2C
     when writing).
   - `clearAnchorFields(fm)` deletes all three.
   - `wouldCycle(vault, childId, parentId)` → `boolean`. Walks
     parent chain up to depth 5; returns true if `childId` appears.
   - Tests with a tiny in-memory vault to lock the contract.

**Acceptance:** unit test that loads a synthetic note with the
three keys returns the composed structure; cycle detection catches
A→B→A; round-trip via stringifyFrontmatter then re-parse yields
the same values.

### 2B — Physics anchor pass (one day)

**Two-pass split per Audit fix #4** — soft anchors apply force
**before** integration so they compete with spring/gravity/flock
in the same frame; rigid anchors override position/velocity
**after** integration to fully snap.

**Files:**

1. [boltzsidian/src/sim/physics.js](../boltzsidian/src/sim/physics.js)
   - **Soft pass (in the spring loop, ~line 213):** for each child
     with a soft anchor, accumulate restoring force into the same
     `force[]` array the spring pass writes to. The integration
     step then sees this alongside spring forces and damps them
     together — no one-frame lag.
     ```js
     // Inside the existing spring/force-accumulation pass
     for (const child of orderedAnchorChildren) {
       const a = getAnchor(child);
       if (!a || a.strength !== "soft") continue;
       const ci = bodies.indexOfId(child.id);
       const pi = bodies.indexOfId(a.parentId);
       if (ci < 0 || pi < 0) continue;
       const tx = positions[pi * 3 + 0] + a.offset[0];
       const ty = positions[pi * 3 + 1] + a.offset[1];
       const tz = positions[pi * 3 + 2] + a.offset[2];
       const k = 12.0; // strong spring
       force[ci * 3 + 0] += (tx - positions[ci * 3 + 0]) * k;
       force[ci * 3 + 1] += (ty - positions[ci * 3 + 1]) * k;
       force[ci * 3 + 2] += (tz - positions[ci * 3 + 2]) * k;
     }
     ```
   - **Rigid pass (after integration, ~line 332):** override
     position and zero velocity for rigid anchors. Same code as the
     existing pinned-velocity zero (line 302) shape.
     ```js
     for (const child of orderedAnchorChildren) {
       const a = getAnchor(child);
       if (!a || a.strength !== "rigid") continue;
       const ci = bodies.indexOfId(child.id);
       const pi = bodies.indexOfId(a.parentId);
       if (ci < 0 || pi < 0) continue;
       positions[ci * 3 + 0] = positions[pi * 3 + 0] + a.offset[0];
       positions[ci * 3 + 1] = positions[pi * 3 + 1] + a.offset[1];
       positions[ci * 3 + 2] = positions[pi * 3 + 2] + a.offset[2];
       velocities[ci * 3 + 0] =
         velocities[ci * 3 + 1] =
         velocities[ci * 3 + 2] =
           0;
     }
     ```
   - **Topological order:** maintain `orderedAnchorChildren`
     (rebuilt by `physics.rebuildEdges()`) — parents resolved
     before children, depth capped at 5. A chain A→B→C settles in
     one pass.
   - **Pinned wins:** if the child has both `pinned` and an anchor,
     pinned takes precedence (pinned check at line 302 already
     zeros velocity; the rigid override would just re-snap to the
     pin's position which is wrong — skip rigid override when
     pinned).

**Acceptance:** Edit a test note's frontmatter (set the three
flat keys from §2A) to anchor it to another. Reload. The child
sits at the parent's position + offset. Move the parent (drag it
via Phase 0.5); the child follows with the correct offset
preserved. Soft children show ~5–10 unit drift on a leash;
rigid children stick exactly.

### 2C — Create / break gestures (one day)

**Gesture: `Cmd/Ctrl+drag` from one body to another** (Audit fix
#2). `Alt+drag` and `Shift+drag` are both already claimed by
[link-drag.js:87](../boltzsidian/src/ui/link-drag.js#L87) which
fires on `altKey OR shiftKey`. Cmd/Ctrl is unused on canvas today
and reads as "structural connection" cleanly.

**Files:**

1. New `boltzsidian/src/ui/anchor-drag.js` — mirror of
   [link-drag.js](../boltzsidian/src/ui/link-drag.js) shape but
   gated on `(metaKey || ctrlKey) && !altKey && !shiftKey`. The
   negative checks are belt-and-suspenders so a user with all four
   modifiers held doesn't get a confused gesture.
   - On drop: compute A's offset relative to B
     (`positionOf(A) - positionOf(B)`), run `wouldCycle`, then
     either toast "would create a loop" or call `setAnchor(A, B,
offset, "soft")` which writes the three flat keys via
     `saver`.
2. [boltzsidian/src/main.js](../boltzsidian/src/main.js) — wire
   `createAnchorDrag` alongside `createLinkDrag` and the new
   `createBodyDrag` from Phase 0.5.
3. [boltzsidian/src/ui/note-panel.js](../boltzsidian/src/ui/note-panel.js)
   - Small button in the panel header: "anchor to…" → fuzzy
     picker over vault titles. Pick a target → compute current
     offset relative to that body, write the anchor.
4. **Break gesture:** while dragging an already-anchored child via
   the Phase 0.5 body-drag, hold `Esc` → on release the anchor
   clears (`clearAnchorFields(fm)` + saver). Without `Esc`, the
   live drag updates the anchor's `anchor_offset` so the child
   stays anchored at the new relative position.

**Acceptance:**

- `Cmd+drag` (Mac) / `Ctrl+drag` (Win/Linux) from a child to a
  parent creates the anchor visibly (bond line appears, child
  snaps to its offset on next tick).
- Modifier-less drag still does plain body-drag (Phase 0.5).
- Alt/Shift+drag still does link-drag (no regression).
- Cycle attempts toast and don't write.
- `Esc` while dragging an anchored child releases the anchor on
  pointerup; without Esc, the live offset updates.
- Panel-button picker works as a fallback for users who can't find
  the gesture.

### 2D — Bond-line rendering (half day)

**Files:**

1. [boltzsidian/src/sim/tethers.js](../boltzsidian/src/sim/tethers.js)
   (or a sibling `bonds.js` if that file is already crowded) —
   add a second LineSegments mesh.
   - Iterate `vault.notes`, collect anchor pairs. Build positions
     buffer per frame from `bodies.positionOf`.
   - Style: straighter, half-thickness of wikilink tethers, tinted
     by the parent's folder hue (read from `bodies.folderTint`).
2. [boltzsidian/src/main.js](../boltzsidian/src/main.js) — call
   `bonds.rebuild()` next to the existing `tethers.rebuild()`
   after anchor changes.

**Acceptance:** anchored pairs visibly connected by a thin static
line; bond hue matches parent's folder tint; line updates live as
the parent moves.

### 2E — Edge-case handling (half day)

**Files:** mostly anchor.js + physics.js + main.js polish.

- Parent deleted: child's anchor reference is preserved in
  frontmatter but inactive (parent id resolves to null in
  `getAnchor`). Child becomes free with full physics. If the parent
  is later restored (un-hushed, re-imported), anchor reactivates.
- Parent hushed: same as deleted from the body's POV — anchor
  goes dormant. The child's body is still in the field as a free
  body during the parent's hush.
- Anchor depth > 5: log a warning, treat as no-anchor for the
  too-deep child.
- Save-debounce: anchor writes piggyback on the existing
  600ms-debounced state save. Live drag updates offset in memory
  and flushes to disk on pointerup, not per-frame.

### 2F — Acceptance & kill (half day)

**Acceptance for Phase 2 as a whole:**

- Anchor a child to a parent. Drag the parent across the field.
  The child stays at its recorded offset throughout the drag.
- Reload the app. The anchor restores; child sits at parent +
  offset on first frame.
- Run a Dream Now cycle. Anchored children rearrange _with their
  parent_, not independently — constellation shape preserved.
- Bond lines visually distinct from wikilink tethers. A naive
  visitor can guess "those notes belong together" without being
  told.
- Pinned notes still take precedence over anchor (a pinned child
  with an anchor: pin wins).

**Kill condition for Phase 2:**

- If anchor cycles or depth chains crash the physics loop in
  testing, hold the release until the topo sort + depth cap are
  rock solid. A crashing physics loop kills the whole product.
- If the bond line clutters the field visually (too many anchors
  in a busy vault), revert to drawing them only when the parent
  or any child is hovered/selected. Don't ship an ugly default.

**Effort for Phase 2:** ~250 lines across ~6 files. Plan a full
week including testing.

---

## Phase 3 — Intent flag for free bodies (1 day)

For bodies _not_ anchored, persistState should still capture
_where the user wanted them_ rather than wherever physics nudged
them by the moment of save. Smaller scope now that anchors carry
most of the load.

**Files to touch:**

1. [boltzsidian/src/sim/bodies.js](../boltzsidian/src/sim/bodies.js)
   - Add a per-body `Uint8Array placed` (0/1). On drag-release,
     set `placed[i] = 1`.
2. [boltzsidian/src/main.js](../boltzsidian/src/main.js) —
   `persistState()`:
   - For free bodies (no anchor, not pinned): only write the
     position to `state.json` if `placed[i] === 1`. Otherwise
     skip — don't overwrite the prior persisted position with a
     drift-shaped one.
3. State seed on boot: when restoring positions from
   `state.json`, mark each restored body `placed = 1` for the
   first 5 s, AND apply the soft-hold treatment for those 5 s.
   This keeps physics from immediately reshaping a restored layout.

**Acceptance:**

- Place a body deliberately. Reload the app. The body restores to
  exactly where it was placed.
- A free body the user has never touched still drifts naturally
  on reload.
- Setting `placed = 1` does NOT prevent normal physics — it only
  changes what `persistState` writes.

**Kill condition:** none. This is small and safe.

---

## Phase 4 — Deferred (revisit when triggered)

Two options from PLACEMENT.md sit on the back burner. Don't
build until the trigger fires; building too early adds surface
that competes with the anchor flow.

### 4A — Compose mode (PLACEMENT.md §4.2)

**Trigger:** users tell us anchoring 8 bodies one-by-one feels
laborious. (Watch for this in screen recordings or first-week
feedback.)

**Build:** `Cmd+.` toggles physics paused. HUD shows
"composing · esc to thaw" strip. On exit, every body that moved
during compose mode gets the placed flag + a 30 s soft hold.
Optional: _"anchor moved bodies?"_ prompt → batch-create anchors
to the parent of the user's choice.

**Effort:** ~80 lines.

### 4B — Saved layouts (PLACEMENT.md §4.3)

**Trigger:** users explicitly ask for "save this arrangement"
once they've lived with anchors for a couple of weeks. May never
fire — anchored constellations carry most of the structural
intent that named layouts would otherwise serve.

**Build:** new `.universe/layouts.json`, named recall via the
viewpoints picker.

**Effort:** ~120 lines.

---

## Phase 5 — Image-to-constellation (stretch, post-MVP)

PLACEMENT.md §4.7 — drag a PNG/SVG onto a parent, satellites form
the shape. Built entirely on top of Phase 2's anchor mechanism.

**Trigger:** Phase 2 is stable, no anchor bugs reported for 2
weeks of regular use, and a launch moment is coming up that wants
a wow feature.

**Sub-phases:**

### 5A — Image upload + storage (half day)

- File upload UI on the panel header (button or drop target).
- Store at
  `.universe/constellations/<parent-id>/<original-filename>`.
- Frontmatter on parent: `constellation_image: <relative-path>`.

### 5B — Sample points from image (one day)

- New `boltzsidian/src/layers/constellation-image.js`:
  - `samplePNG(imageData, n)` — canvas + luminance-weighted
    sampling, returns `n` 2D points.
  - `sampleSVG(svgText, n)` — parse paths, use
    `getPointAtLength` to walk strokes.
  - Both normalise to a [-1, 1] square.

### 5C — Project to 3D + assign to children (one day)

- `flatProject(point, scale)` → `[x, y, 0]` (default).
- `basReliefProject(point, image, scale)` → `[x, y, z]` from
  pixel luminance (toggle).
- Greedy nearest-point assignment of children → sample points.
- Hungarian assignment behind a flag once child count exceeds 50.

### 5D — Write anchors via Phase 2 mechanism (half day)

- For each child + assigned point, call
  `setAnchor(childId, parentId, offset, "soft")`. Uses the same
  saver path as Phase 2C.
- The constellation now travels with the parent for free.

### 5E — Cinematic auto-cut on drop (half day)

- After write, fire a one-shot camera arc: face-on view of the
  parent's local plane, hold 4 s, release.
- Without this the user just dropped an image and sees… a flat
  line of dots from their angle.

**Acceptance:** drop a 256×256 PNG of a star (the literal Star of
David, Big Dipper, anything graphic). The parent's children
rearrange to form a recognisable version of the shape, and the
camera auto-frames it. Reload the app — the constellation is
preserved (anchors persist). Move the parent — the whole image
travels.

**Effort:** ~3 days, gated on Phase 2 stability.

---

## Phase ordering — single sentence

Build **Phase 1** in a day, ship and live with it for a few days;
build **Phase 2** over the following week; tack on **Phase 3** in a
day; **Phase 4** waits for explicit user demand; **Phase 5** is the
launch-moment delight, shipped once Phase 2 is bulletproof.

---

## What's deliberately not in this plan

- **No bulk anchor migration.** Existing notes don't auto-anchor
  to anything. Users discover and apply anchors deliberately.
- **No Tend pass that proposes anchors.** Tend is for content;
  placement is the user's gesture.
- **No mobile.** Same answer as the rest of the product.
- **No anchor templates / preset constellation shapes** beyond
  what STAR_CHARTS.md already provides (ring/disc/spine/fan).
  Phase 5 supersedes those for user-supplied shapes.
- **No cross-vault anchors.** Single-vault product; an anchor
  always resolves within one vault.

---

## Telemetry — how to know it's working

Manual spot-checks after each phase, no analytics infrastructure
needed:

- **Phase 1:** drop ten bodies, walk away 30 s, eyeball whether
  they drifted. Count "stayed put" vs "drifted away."
- **Phase 2:** create 3 anchored constellations, run 5 dream
  cycles, eyeball whether the constellations are still
  recognisable after.
- **Phase 3:** reload the app 10 times. Count how many bodies
  start at exactly their saved positions vs how many start
  drifting.
- **Phase 5:** drop 5 different images onto parents. Count how
  many produce a recognisable constellation in the first
  arrangement (no manual touch-up).

If any phase scores below 80% on its own check, fix before moving
on. Don't stack questionable layers.

#feature #phase
