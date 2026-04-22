---
tended_on: [tag-infer]
id: 01KPS7VDCBK5JN9TX65TYTZCZ7
created: "2026-04-21T16:52:21.909Z"
---

# CONSTELLATIONS.md — Cluster-level labels that surface when you zoom out

A focused design doc. Today's labels are per-star: a floating title near
every visible body, modulated by the cursor lens and `label_mode`. Zoom
far enough out and they collapse into a field of unreadable noise — the
exact moment the user most wants to know _what region they're flying
over_.

The right move is already in the metaphor: **constellations.** Each
cluster gets its own large, soft, centered label that fades in when
star labels fade out. Not a graph-tool legend; a piece of the sky
announcing its name.

---

## 0. Premise

Three things go wrong when you zoom out:

1. **Star labels become illegible.** They're 11–13 px tall; past a
   certain camera distance they smear into each other.
2. **The user loses local context.** "Am I looking at work or art?"
3. **Bloom smears stars into blobs.** The eye reads regions, not
   individuals, so per-body text is the wrong unit anyway.

All three are fixed by one idea: at the right zoom level, the cluster
itself should speak — one big, atmospheric label sitting at the
cluster's centroid.

---

## 1. When they appear

A single scalar drives the cross-fade: **camera distance to cluster
centroid**, compared to that cluster's own extent.

```
zoom_ratio = cameraDistToCluster / clusterExtent
```

- **ratio ≤ 2** (close): star labels full strength, constellations
  hidden. You're inside the cluster; naming the whole thing would
  overwrite the note titles you're reading.
- **ratio 2 → 5** (middle): cross-fade. Star labels recede, constellation
  labels rise. Both present briefly — never jarring, never competing.
- **ratio ≥ 5** (wide): constellations at full strength, star labels
  gone. You're seeing the sky, not the stars.

Each cluster has its own ratio. The camera might be close to one
cluster and far from another — the near one keeps its stars named, the
far one shows its constellation. Both true at once.

### 1.1 Interaction with `label_mode`

- **Always:** star labels behave normally, constellations layer on top
  only at wide zoom.
- **On hover:** the single hovered star still fires; constellations
  always render where zoom-ratio says they should, regardless of hover.
- **Never:** star labels suppressed; constellations still appear at
  wide zoom. This is actually the cleanest combination — a silent
  universe that only names its continents.

Constellations live on their own layer. They don't inherit the `L`
toggle's state. They're the one annotation Boltzsidian volunteers
without asking.

---

## 2. What they say

Source priority, in order:

1. **User-named.** Right-click a cluster → "Name this region." Stored
   in settings keyed by cluster id. Sticky, survives layout changes
   as long as the cluster is recognizably the same. (Detection is
   structural; we can reconcile via Jaccard overlap of member sets.)
2. **Folder consensus.** If ≥ 60% of cluster members share a top-level
   folder, use the folder's name. A cluster dominated by `/work/`
   becomes **"Work."**
3. **Tag consensus.** If no folder dominates but a tag does (≥ 40% of
   members), use the tag stripped of its `#`. **"Music."**
4. **Title of the heaviest node.** The cluster's most-linked note's
   title. **"Getting into jazz"** names the jazz cluster.
5. **Fallback.** An ordinal (`"Region 3"`) that's clearly a
   placeholder. Invites the user to rename.

The user can override any derivation at any time. The derivation is
what shows until they do.

---

## 3. How they look

The constraints Michael named, expanded:

### 3.1 Ephemeral fade border

No rectangle. No box. The label text sits on a **radial haze** —
a large, low-opacity circular gradient behind it, anchored at the
cluster's screen-projected centroid. Hard cut = graph tool; soft
cloud = part of the sky.

```css
background: radial-gradient(
  circle at 50% 50%,
  rgba(<tint>, 0.28) 0%,
  rgba(<tint>, 0.1) 42%,
  transparent 75%
);
filter: blur(0.5px);
```

Sized proportional to the cluster's screen-projected extent — bigger
clusters get bigger halos. A 30-star cluster has a different
gravitational presence than a 3-star one; the label should carry
that weight.

### 3.2 Pop color

Constraint: Boltzsidian has one accent (`#8ab4ff`). We don't
introduce a rainbow.

Resolution:

- **If folder tints are in use and the cluster has a dominant folder,**
  use that folder's aura tone at elevated saturation. The existing
  8-tone palette (cobalt, teal, sage, amber, ochre, rose, violet,
  slate) is already curated to coexist with the accent; a slightly
  "popped" (saturation +25%, brightness +10%) version of the folder's
  tone becomes the constellation's tint.
- **Otherwise,** tint with the accent itself, but warmer — shift
  temperature toward +0.15 so it reads as slightly different from UI
  chrome without breaking the palette.
- **Text color** is always close-to-white with the tint's warm bias —
  readable, not confettied.

### 3.3 Large type

Base size 24 px. Scales up to ~36 px for the densest / largest
cluster on screen, down to ~18 px for small ones. Letter-spacing
wide (0.08 em) — constellation names feel like proper nouns in
atmospheric type, not UI labels.

Weight 300–400 (light). The softness matters. Bold constellation
labels read as titles of a graph; light labels read as names
whispered from the sky.

### 3.4 Centered on the cluster

Position: the DOM element's transform centers it on the cluster's
screen-projected centroid. Not the densest star, not the heaviest —
the geometric center of member screen positions. The haze radiates
outward from that point.

No pointer leader, no line connecting label to bodies. The haze is
the connective tissue.

### 3.5 Subtle motion

A slow breathing scale on the haze (1.0 ↔ 1.03 over ~8s) makes the
label feel alive without distracting. Text stays fixed. Cluster
labels don't pulse in sync across clusters — each has its own
phase seeded from its id.

---

## 4. How it composes with the rest

| Existing concept           | Behavior                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| Star labels / `label_mode` | Cross-fade with zoom ratio; constellations layer above                |
| Folder tint                | Provides the cluster's tone when available                            |
| Galactic core formation    | Highlighted cluster gets brighter constellation text, larger haze     |
| Solo folder formation      | Only the solo folder's constellations render; others fade             |
| Halo formation             | Halo notes don't belong to any cluster → no change                    |
| Dream mode                 | Constellations fade out as sleep_depth rises — dreaming is silent     |
| Formations rail search     | Constellations dim like everything else under search focus            |
| Pinned notes               | A pinned note that's the only member of a "cluster of 1" is not named |

The dream-mode interaction matters: at depth 0.3+, cluster labels
fade to near-zero. The dreaming universe has no names.

---

## 5. Interaction

Minimal, deliberate:

- **Click a constellation label** → camera arcs to frame the whole
  cluster (zoom out slightly so ratio ~3, rotate so the cluster fills
  the viewport). Same interaction as clicking a body, but targeting
  a region.
- **Right-click / Cmd+click a constellation** → "Name this region"
  prompt. Inline edit with Enter to commit, Esc to cancel.
- **Hover a constellation label** → haze intensifies slightly, text
  brightens. No other change. Not a mouseenter-triggered drawer; just
  the normal response to "someone's looking here."

No selection state on constellations (yet). No drag. No right-side
panel. Clusters are signposts, not destinations in the panel model.

---

## 6. Implementation notes

Small surface; reuses what exists.

1. **Cluster naming** — add a `deriveClusterName(cluster, vault, settings)`
   function that walks the priority order above. Returns a string.
   User-supplied names stored in `settings.cluster_names[clusterKey]`
   where `clusterKey` is a stable hash of the sorted member ids.
2. **Centroid + extent** — already computed by
   `computeLocalDensity` in `sim/clusters.js`. Cluster model already
   carries `centroid` and `extent`.
3. **DOM pool** — new `createConstellations({ vault, bodies, camera })`
   module, parallel to `createLabels`. ~20 elements in a pool. Each
   element is a `div` with inner `<span>` for text; the `div`
   carries the radial-gradient background.
4. **Update loop** — every 3 frames (same cadence as labels),
   project every cluster centroid, compute zoom_ratio, map to
   opacity, write `left / top / opacity / transform` to the pool
   slot. Hide unused slots.
5. **Settings** — one toggle: `show_constellations` default `true`.
   Off is a valid choice for users who want a labeless universe.

No shader work, no render target, no physics changes. Pure DOM +
projection.

Rough budget: half a day for the visual + projection, another half-day
for naming derivation and the rename prompt.

---

## 7. What to deliberately skip

- **Per-constellation color outside the curated palette.** Tempting,
  cheap to offer, would visually break the app.
- **LLM-named clusters.** Deferred to the librarian ([[LIBRARIAN]]).
  Constellations ship with heuristic naming; AI proposals can promote
  from there once that pipeline exists.
- **Nested constellations.** Clusters-of-clusters at very wide zoom.
  Technically clean (re-run label propagation on cluster centroids)
  but visually clutters. Ship flat; revisit if users ask.
- **Editing cluster _membership_.** Users don't define clusters; the
  graph does. They can rename regions; they can't choose which notes
  belong to which. Respect the emergent structure.

---

## 8. Minimal first cut

Shippable in a sprint:

1. `deriveClusterName` with just sources 2 (folder) and 4 (heaviest
   node). Skip user-naming, skip tag consensus for v1. Both can layer
   on later.
2. Constellations appear at fixed zoom threshold (ratio ≥ 3.5 — just
   past the cross-fade midpoint). No gradient cross-fade yet — hard
   cut is fine for first cut.
3. Labels use accent tint only. Folder-tint integration in v2.
4. Click-to-focus. Rename deferred.

One evening of work for that slice. It answers 80% of "what am I
looking at up there" as soon as it ships.

---

## 9. One sentence

When the stars get small enough to stop reading as individuals, the
sky should tell you the names of its regions — softly, centered, in
atmospheric type, fading away again the moment you come close enough
to see the stars themselves.

#constellation #star #user
