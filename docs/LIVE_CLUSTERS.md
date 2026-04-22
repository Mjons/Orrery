---
id: 01KR0000LIVECLUSTERS000000
created: 2026-04-21
---

# LIVE_CLUSTERS.md — Re-cluster in session, not on reload

Today `vault.clusters` is baked once at `openVault` time and never
touched again. Centroids follow physics (via
`recomputeCentroidsLive`), but cluster **membership** is frozen until
the user hits Rescan. This plan removes that limitation: add a
`[[link]]`, watch a note migrate between regions, see the
constellation names redraw — within a couple of seconds, no reload.

## Goals

- Graph edits (link add, link delete, note create, note delete,
  title rename that creates/breaks a link) trigger a re-partition.
- Partitioning is **stable**: unchanged clusters keep their ids so
  constellation names don't jump.
- Warm-start from the previous labelling so small changes produce
  small diffs — not a full shuffle.
- Debounced (~1.5s idle) so a burst of edits doesn't thrash.
- Zero user-visible jitter. A rename that flips one note shouldn't
  rename every constellation on screen.

## Non-goals

- Live re-walking the filesystem. Rescan still required for external
  edits (that's a separate FS-watcher problem).
- Hand-editing cluster membership. Clusters remain graph-derived.
- Inventing new cluster shapes (clusters-of-clusters, hierarchical).
  Flat LP only.

---

## Phase A — Graph mutation event bus

**Goal.** Make link-graph changes observable without every call site
wiring its own listener.

### Changes

1. `src/vault/vault.js`
   - Add `vault.onGraphChanged(fn)` / internal `emitGraphChanged()`.
   - Fires on: forward-link set mutation, note add, note remove.

2. `src/vault/mutations.js`
   - `reparseNote` already diffs `prevForward` vs `nextForward`. If
     the diff is non-empty, call `emitGraphChanged()` after
     `syncBackward`.
   - `addNoteToVault` / `removeNoteFromVault` fire on entry/exit.

3. `src/vault/links.js` (planLinkCreate / planLinkDelete consumers)
   - Already route through the saver, which goes through `reparseNote`.
     Nothing to add — just verify it fires once per save.

### Verification

- Dev hook `window.__boltzsidian.__graphEvents` returns a count.
  Write a test note with a wikilink → save → count bumps by 1.
- Delete a tether → count bumps by 1.
- Save a note with no link changes → count does NOT bump.

### Scope: ~1 hour

---

## Phase B — Deterministic, warm-start label propagation

**Goal.** Turn `detectCommunities` into a function that converges on
the SAME answer given the same inputs, and converges quickly when
given a good starting labelling.

### Changes

1. `src/sim/clusters.js`
   - `detectCommunities(vault, { seedLabels = null } = {})`:
     - If `seedLabels` supplied (Map<noteId, clusterId>), start each
       note with that label instead of its own unique index. New
       notes without a seed fall back to their own index.
     - Replace `shuffle(order)` with a stable sort by note index so
       two runs with the same input produce the same output.
     - Tie-breaking already prefers the smaller label; keep that —
       it's deterministic.
   - Export an explicit `repartition(vault)` that calls
     `detectCommunities(vault, { seedLabels: vault.clusters.byNote })`
     when clusters already exist.

2. Verify initial-boot behaviour unchanged. The first call has no
   seedLabels, so it's the original algorithm minus the shuffle —
   the tie-break rule keeps it converging.

### Verification

- Run `repartition` twice on an unchanged vault → byNote entries
  equal across runs.
- Modify one link → run `repartition` → most labels unchanged.
- Benchmark: 5000 notes, full LP, warm-start: should be <80ms.
  Cold-start from scratch on the same graph: <200ms.

### Scope: ~1.5 hours

---

## Phase C — Stable cluster-id reconciliation

**Goal.** After re-partitioning, the RENUMBERED cluster ids should
reuse the old id wherever the new cluster is substantially the same
set as an old one. This is what keeps constellation names from
jumping around.

### Changes

1. `src/sim/clusters.js`
   - New helper `reconcileClusterIds(oldByNote, newByNote)`:
     - For each new cluster, compute Jaccard(oldMembers, newMembers)
       against every old cluster.
     - If best match ≥ 0.5 AND the old id isn't already claimed,
       remap the new cluster to that old id.
     - Otherwise, allocate a fresh id from a monotonic counter
       (`vault.clusters._nextId`). Never reuse a just-retired id in
       the same session — avoids any chance of stale caches hitting
       the wrong cluster.
   - Apply the remap to both `byNote` and `byId` before returning.

2. `vault.clusters._nextId` — initialise to `max(existing ids) + 1`
   on first creation. Persists on the vault; survives repartitions.

### Verification

- Add a `[[link]]` that joins two existing clusters → the merged
  cluster keeps whichever old id had more members. The smaller
  cluster's id retires.
- Split a cluster by deleting a critical link → the larger fragment
  keeps the original id, smaller fragment gets a fresh id.
- Add a new isolated note → it's its own cluster with a fresh id;
  no existing cluster id changes.

### Scope: ~1.5 hours

---

## Phase D — Debounced auto-repartition

**Goal.** Graph edits trigger re-clustering after the user stops
typing, not on every keystroke.

### Changes

1. `src/main.js`
   - Subscribe to `vault.onGraphChanged` after the initial vault
     loads.
   - Reset a 1500ms timer on every event. On fire:
     ```
     const result = repartition(vault);
     vault.clusters = result;
     applyClusterUpdate(result);
     ```
   - `applyClusterUpdate` — writes `note.cluster` for every affected
     note, clears the constellation name-cache for clusters whose
     member sets changed, triggers one extra
     `recomputeCentroidsLive` pass (otherwise the halo for a
     newly-appeared cluster has no centroid for half a second).

2. Make the debounce window tunable via
   `settings.reclustering_idle_ms` (default 1500, range 500–5000).
   Hidden setting — no UI in this phase.

### Verification

- Add a link in the note panel → wait 1.5s → console sees one
  `[bz] repartition` line and halos redraw if membership shifted.
- Type a burst of edits including link changes → only ONE
  repartition fires, after the burst ends.
- Disable via `settings.reclustering_idle_ms = 0` → no auto
  repartitioning. Manual Rescan still works.

### Scope: ~1 hour

---

## Phase E — Constellation-name hysteresis (optional)

**Goal.** Single-note membership flips shouldn't rename a
constellation. Only substantive shifts should.

### Changes

1. `src/ui/constellations.js`
   - Name cache becomes `Map<clusterId, { name, signature }>` where
     `signature` is a hash of the sorted member ids.
   - On refresh, re-derive name only if signature drift exceeds 20%
     (Jaccard distance). Otherwise keep the prior name.
   - When a cluster's id is reused via Phase-C reconciliation, the
     signature check fires normally — name updates only if the set
     really changed shape.

### Verification

- Add one note to a 15-note cluster → no name change (6.6% drift <
  20% threshold).
- Add five notes of a new folder to the same cluster → name
  re-derives (25% drift ≥ threshold).

### Scope: ~45 minutes

---

## Phase F — Smoke test playbook

A single workspace, two phases of live editing:

1. Open a mixed-folder vault. Note the initial constellation
   layout.
2. Open a note in folder `work/` and add `[[NoteInPersonal]]`.
   Save. Within 2 seconds:
   - A link tether appears.
   - Either a cluster merges (Work absorbs the personal note or
     vice versa) and one halo vanishes, OR the new link is weak
     enough that membership doesn't shift.
3. Open a different note. Remove an existing `[[link]]`. Save.
   Within 2 seconds: the target note may split off into its own
   cluster, or it may stay with the group based on its other
   links.
4. Cmd+N → new note with one link to an existing cluster member.
   Within 2 seconds: the new note joins that cluster; no new
   "Region N" halo appears.
5. Open devtools → confirm only ONE `[bz] repartition` log per
   burst, not one per save.

---

## Scope rollup

| Phase | Hours | Deliverable                      |
| ----- | ----- | -------------------------------- |
| A     | 1.0   | Graph-change event               |
| B     | 1.5   | Deterministic, warm-start LP     |
| C     | 1.5   | Stable cluster-id reconciliation |
| D     | 1.0   | Debounced auto-repartition       |
| E     | 0.75  | Name hysteresis (optional)       |

**Total: ~5.75 hours** (5 without Phase E). Half-day of focused work.

---

## What this deliberately skips

- **Animation of cluster handoff.** A note "moving" between
  constellations is a potentially beautiful moment (see CINEMATIC),
  but it's a visual polish pass that shouldn't block the functional
  fix. The halo opacity transition (220ms) already softens the id
  flip.
- **User-renamed clusters surviving repartition.** Deferred until
  Phase 7 of CONSTELLATIONS.md. The reconciliation here keeps the
  id stable when the set is stable, which is the lion's share of
  the concern — user names can layer on top once we add them.
- **Density / folder-influence recompute.** Density is O(n²) and
  doesn't change meaningfully on graph edits. Folder-basin physics
  reads `note.cluster` which we DO update in Phase D. No explicit
  re-apply needed.
- **Incremental LP (touching only subgraph around the changed
  edge).** Clean idea; premature optimisation. Full warm-start LP is
  already sub-100ms at current scales.

#live-clusters #graph #repartition #debounce
