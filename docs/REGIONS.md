---
id: 01KR0000REGIONS000000000000
created: 2026-04-21
---

# REGIONS.md — Draggable region nodes: constellations as first-class entities

Today a constellation is a _derived_ thing: it's the DOM label that
floats over a centroid computed from a cluster that was computed from
the link graph. You can rename it (stored in settings, Jaccard-
matched). You can click it to arc the camera. You can right-click to
batch-link. But it isn't a thing you can **move**, and you can't make
a new one out of nothing — every constellation requires at least one
underlying note that clusters under it.

Two asks in one feature:

1. **Drag a constellation** and the cluster comes with it — the label
   isn't a tooltip, it's a handle on a region.
2. **Create a new constellation from nothing** — a region-marker you
   can put in empty sky, then link notes to, growing a cluster around
   it deliberately.

Both collapse to the same realization: a constellation should be a
kind of node — a body in the universe with a position, a title, and
a place in the link graph — just without a text body.

---

## 0. Problem framing

Current architecture:

```
vault.notes (.md files)
  ↓ link graph (forward / backward)
  ↓ detectCommunities (label propagation)
  ↓ vault.clusters.byId[cid] = { noteIds, centroid, extent }
  ↓ recomputeCentroidsLive (every 30 frames)
  ↓ DOM label at centroid
```

Nothing in that chain is a thing the user can grab. Centroid is a
statistic of member positions. Moving the label moves no bodies;
moving one body re-derives the label.

Two gaps:

- **No handle.** To "move a cluster" the user would have to select
  every member and drag the whole selection. No UI for that. A
  constellation label is visually the one thing representing the
  region, but it's read-only.
- **No phantom.** Every cluster is a consequence of existing notes.
  If the user wants a region they're not ready to populate yet — a
  placeholder for an idea — there's no way to create one.

---

## 1. Design options

### 1.1 Drag-to-displace (offset layer)

Keep constellations as derived overlays. When the user drags a
label, compute a world-space delta and apply it to every member
body's position as a one-shot nudge.

**Pros.** No data-model change. Existing cluster/render path
untouched.
**Cons.** Delta doesn't persist — physics will pull the cluster
back to wherever gravity and flocking want it. Saving the delta
as a persistent offset means every frame has to add it back,
which fights physics forever. Can't create clusters from nothing
(no underlying note → no cluster → no label to drag).

Quick win for "move it briefly," bad fit for "these nodes belong
over there now."

### 1.2 Region note (recommended)

Promote the constellation to a first-class note of kind `region`.
Has a title, a position, participates in the link graph. Notes
link to it via wikilinks like any other note. The graph handles
clustering naturally — notes that link to region R cluster with
R.

**Pros.** No new subsystem. Existing physics, tethers, clusters,
save path all work unchanged. Dragging a region body pulls
linked members via the tethers we already render. Creating a
region is creating a note. Linking to it is writing a wikilink.
**Cons.** Region "notes" are on-disk files that have no
user-written content. Introduces a new `kind` value; scenes /
tinting / cluster-name derivation need to know about it. Disk
noise in `.universe/regions/`.

This is the clean answer. Section 2+ assumes it.

### 1.3 Region as in-memory phantom (settings only)

Store regions in `settings.regions = [{ id, title, x, y, z,
linkedNoteIds }]`. No file. No note in the vault. Render as
bodies via a parallel code path; synthesise forward/backward
edges at boot.

**Pros.** No new files. Can ship without touching the saver.
**Cons.** Regions don't participate in the normal graph — every
consumer of `vault.forward` / `vault.notes` needs to special-case
them. Double the code for half the behaviour. Sync hell the
moment anything mutates.

Reject — the settings file is for user preferences, not a shadow
vault.

---

## 2. Recommended shape — region notes

### 2.1 Storage

Each region is a markdown file at
`<writeRoot>/.universe/regions/<kebab-title>.md`.

```markdown
---
id: <ULID>
created: <ISO-8601>
kind: region
position: [x, y, z] # optional, serialised world-space anchor
---

# Curiosities

(region; no body)
```

`.universe/regions/` is the natural home — it's already the
folder where Boltzsidian writes its own artifacts (state, prune
candidates, dream logs, weed keep-list). One more subfolder for
one more kind of Boltzsidian-owned sidecar.

### 2.2 Recognition

The walker (`src/vault/walker.js`) already indexes everything
under the write root. No change. Parser reads `kind: region` from
frontmatter; `computeKind` already honours explicit frontmatter
overrides, so a region note gets a distinct integer kind.

Options for the kind integer:

- **New kind 7 (`region`).** Clean but bumps `NUM_KINDS`, touches
  every K preset, every tint array, every cluster-density shader.
  Big blast radius.
- **Reuse `kind = 4` (halo).** Halo is defined as "dust at the
  edge," visually peripheral. Regions fit the halo tinting
  vocabulary — translucent, large, not a real star.
  Pragmatically the cheapest choice; costs one halo slot that
  currently nothing in the app uses explicitly.

Start with halo (reuse kind 4) to ship fast; consider bumping to
a dedicated kind 7 later if rendering wants to diverge.

### 2.3 Rendering

Region bodies differ from stars in three ways:

1. **Bigger, softer.** Mass-like parameter rendered as a larger
   sprite. Not a hard disk — the existing halo tint works.
2. **Label always visible.** A region's title is the only sign
   of what it is; don't subject it to the `label_mode`
   cross-fade. Always render, even in "never" mode.
3. **Click behaviour differs.** Single-click on a region body
   → enter rename mode (in-place, like constellations today) OR
   pan camera to it — probably the latter by default, with
   Shift+click to rename, matching constellation rename.

One shader change: the bodies vertex shader already branches on
`kind`; we add a subtle multiplier for kind-4 so regions read as
regions, not just big halos.

### 2.4 Constellation label binding

If a region note is a cluster member (usually the most-central
one because everything links to it), its title wins the
"heaviest node" branch of `deriveClusterName`. So the constella-
tion is automatically named after the region.

Prefer this over "every region IS the constellation regardless
of cluster shape" — it keeps the emergent clustering honest. If
you create a region called "Curiosities" and nothing links to
it, it's a lonely region, not a constellation yet. Once things
link to it, a cluster forms and the constellation appears at
the region's centroid (which will be near the region body, since
most members are pulled toward it by tethers).

### 2.5 Naming

Region rename = note rename. Already implemented: inline edit on
the constellation label fires `onClusterRename`, which today
writes to `settings.cluster_names`. For regions, instead:

- If the cluster contains a region note, rename ACTUALLY
  renames the region note file (title → filename rewrite,
  link rewrites propagated via the existing rename machinery in
  `save.js` `maybeRename`).
- If the cluster contains no region note, fall back to current
  settings-based override.

This mixes two storage models per cluster. Acceptable: the
region case is the "I want this to stick forever" path; the
settings case is "I want this label to hold until a region
appears."

---

## 3. Creation

### 3.1 Hotkey + world-space placement

`R` creates a new region. Two invocation modes:

1. **Where the camera is pointing** — default. New region lands
   at `controls.target` with a small random jitter so two rapid
   creations don't stack. Title prompt inline.
2. **Click-to-place** — `R` then a canvas click positions the
   region at the world point under the pointer. Escape cancels.

Ship mode 1 first. Mode 2 is polish.

### 3.2 Title prompt

Use the existing rename-mode UI pattern: the label fades in at
the placement world-position, contenteditable, focused with the
text pre-selected to `Region`. User types, Enter commits, Esc
cancels (removing the file).

### 3.3 File creation

On commit: write the region note to disk via the saver. The
existing `createNoteAt` + frontmatter canonicalisation apply
unchanged. Stamp `kind: region` in frontmatter. Kind 4 comes out
on reparse.

### 3.4 Initial position

Saved as `position: [x, y, z]` in frontmatter. On vault load,
`layoutNotes` checks for an explicit frontmatter position and
honours it over the random layout. (This is the one new thing in
the layout code path — five lines.)

---

## 4. Movement

### 4.1 Drag gesture

Region bodies are dragged the same way regular bodies would be
if we had body-drag — but we don't have that yet. The cheap
path is to drag the constellation **label** instead: it's
pointer-events:auto on the text span already, and the underlying
body is within a predictable offset of the label's screen
position.

Flow:

1. On label `pointerdown`, record the screen position and the
   region body's current world position.
2. `pointermove` with pointer captured: project screen delta
   back into world space at the body's current depth. Update
   body position directly, bypassing physics for the duration
   of the drag.
3. `pointerup`: release pointer capture, write the new position
   to the region note's frontmatter (debounced — 400ms after
   last move).

### 4.2 Members follow via existing physics

Notes that wikilink to the region have tether edges to it.
Moving the region body without moving the members causes the
tethers to stretch, and the existing physics-step (spring along
the tether) pulls members toward the region over the next few
frames.

No special "carry my members with me" code needed. That's the
magic of this architecture — tethers are already the force that
gathers a cluster around its hub.

### 4.3 Manual vs derived position

If the user hasn't manually moved a region, its position is
whatever physics settled to from layout — the `position:`
frontmatter key is absent. The moment they drag it, we stamp
`position: [x, y, z]`. From then on, layout honours that.

If the user wants to "un-pin" the region, they can delete the
`position:` key from the note's frontmatter manually (or via a
Settings action in v2).

---

## 5. Linking

Regions participate in wikilinks identically to notes:

- `[[Curiosities]]` in any note body resolves to the region via
  the normal title → byTitle lookup.
- Batch-link (BATCH_LINK.md) works unchanged — pick a region as
  the target, link every cluster member to it.
- Tether rendering already draws lines between linked bodies.
  Region tethers render the same way — the body just happens to
  be a region.
- Backlinks appear in the region's note panel the same way any
  backlink appears (though the region's "body" panel will be
  near-empty — just the title and the backlinks section).

### 5.1 Click → what happens?

Opening a region as a note panel is underwhelming (empty body).
Alternatives:

- Click a region body → panel opens showing its backlinks list
  prominently, with an obvious rename affordance and no editor
  mount (skip CodeMirror).
- Click → pan camera to the region, don't open panel. Shift+
  click → open panel.

Try the "pan, don't open" default. The panel is heavy for an
empty note.

---

## 6. Rendering differences

| Feature            | Note (star)     | Region (kind 4)                |
| ------------------ | --------------- | ------------------------------ |
| Sprite size        | mass-based      | 2-3× star base                 |
| Tint               | kind palette    | folder tint (if set) or accent |
| Label              | label_mode      | always visible                 |
| Cursor on hover    | pointer         | grab                           |
| Click action       | open note panel | pan camera (Shift = open)      |
| Constellation halo | if clustered    | halo anchors HERE              |
| Breathing / pulse  | —               | subtle pulse (§5.5 idea)       |

---

## 7. Edge cases

- **Region with no backlinks.** Renders as a solo body. The
  constellation halo appears only if at least 2 notes cluster
  around it (current MIN_CLUSTER_SIZE is 2). Solo region: no
  halo, just the body + label.
- **User renames a region to match an existing note title.**
  Title-collision resolution kicks in; the wikilinks `[[Title]]`
  across the vault become ambiguous. Batch-link already handles
  this via `composeBatchLinkToken`. New link writes from the
  editor should get the same treatment for regions — future
  polish, not a blocker.
- **User deletes a region.** Weed, Delete key, or manual file
  removal. Backlinks become dangling. Same as any deleted note.
- **Region in read-only root.** Impossible — regions live in
  writeRoot by construction.
- **Multi-root.** Regions only live in writeRoot. Notes in
  other roots can link to them freely.
- **Physics stability.** A region dragged to an empty part of
  space with 30 linked members becomes a gravitational well —
  the cluster WILL flow toward it. Desired behaviour; worth
  confirming it's not jittery at high member counts.

---

## 8. Phasing

### Phase A — Region kind + file shape · ~1 hour

- Add `kind: region` recognition in `computeKind`.
- Decide on reusing kind 4 (halo) for now.
- New helper `createRegion(title, worldPos)` that writes a
  region note to `<writeRoot>/.universe/regions/`.

### Phase B — Rendering · ~1.5 hours

- Region bodies: larger sprite, always-on label.
- Pan-camera click behaviour; Shift+click opens panel.
- Cluster-name derivation already picks up the region's title
  via heaviest-node fallback — no change needed.

### Phase C — Creation hotkey · ~45 min

- `R` key: prompt at screen center (floor: reuse an inline DOM
  input). Writes the region file, reloads the body, camera
  centers on it.

### Phase D — Drag · ~1.5 hours

- Label drag → body move. `pointerdown/move/up` on the
  constellation label text. World-space projection from screen
  delta.
- Write `position:` to frontmatter on drag end.
- Layout honours frontmatter position on boot.

### Phase E — Rename unification · ~45 min

- If the clicked constellation contains a region note, its
  rename goes through the saver's rename path (real file
  rename + link rewrites) instead of `settings.cluster_names`.

**Total: ~5.5 hours.** Half-day, same budget as LIVE_CLUSTERS.md.

---

## 9. What to deliberately skip

- **Multi-region composition** (regions nested in regions). LP
  on the cluster graph would produce this; don't bother.
- **Region colour picker.** Folder tint inheritance is enough.
- **Region icons / emoji.** Constellation labels are atmospheric
  type; visual clutter isn't welcome.
- **Right-click menu on the label for region actions.** Plain
  right-click is batch-link (BATCH_LINK.md). Region drag uses
  `pointerdown` on the same element — no menu needed.
- **Region creation from a lasso selection** ("wrap these notes
  in a region"). Cool idea; deferred until lasso exists.

---

## 10. Interaction with existing features

- **CONSTELLATIONS.md.** Regions make the "user-named cluster"
  story concrete. A region-anchored cluster has a canonical
  name; the Jaccard-stored name is only for clusters without a
  region.
- **LIVE_CLUSTERS.md.** Region notes participate in the graph,
  so repartitioning Just Works. A region with 10 backlinks is a
  strong LP attractor; its cluster is stable across minor edit
  bursts.
- **BATCH_LINK.md.** The target picker naturally suggests region
  notes when typing — region titles autocomplete like any other.
- **MULTI_PROJECT.** Regions are writeRoot-only. Notes across
  every root can link to them. Cross-root tether rendering
  (Phase 4) applies unchanged.
- **DREAM.** Regions are fair game for dream pair sampling.
  Surprising connections between regions produce the most
  interesting ideas.

---

## 11. One sentence

A constellation should be a thing you can grab, name once, and
place where you want it to be — and if the sky doesn't yet have
a region for a concept you're brewing, you should be able to
make one out of nothing and watch the notes you care about
start gathering around it.

#regions #constellation #drag #node
