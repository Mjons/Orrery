# CONSTELLATION_NAMING.md — Fixing the duplicate-label problem, giving users control over names

A focused follow-up to [CONSTELLATIONS.md](CONSTELLATIONS.md) and a
companion to [REGIONS.md](REGIONS.md). Triggered by Michael's
screenshot: five identical "Universe sim 4 7" labels stacked inside
one visual cluster, no way to rename them, no way to tell them apart.

REGIONS.md takes the "constellation is a draggable node you can place
in empty sky" approach. This doc takes a narrower one:
constellations stay emergent (computed from clusters), but users gain
deliberate control over **the names**, **which ones appear**, and
**where their labels sit**. Same family of concern; lighter weight;
ship first and see whether the full REGIONS.md mental model is still
needed afterward.

---

## 0. The screenshot diagnosed

Three locally-defensible behaviours stacking into one mess:

1. **Label propagation over-segments.** `sim/clusters.js` treats every
   weakly-connected sub-component as its own community. A single
   visual cluster with internal bridges + locally-dense pockets
   produces 3–6 labelled clusters where the eye sees one.
2. **Naming falls back to heaviest-node title.** If none of {user
   override, folder consensus, tag consensus} match, the name becomes
   the title of the cluster's most-connected note. Over-segmented
   clusters that share the same hub note all inherit its title.
3. **No dedupe pass.** The renderer projects every cluster above the
   zoom threshold to its own label with no awareness that two labels
   sit at nearly-identical screen positions saying the same thing.

Each rule is right alone. Together they produce the screenshot.

---

## 1. The fix stack, in order of cost

Ship 1.1 immediately, then 1.2 and 1.3 if the problem persists.

### 1.1 Dedupe + disambiguate at render time

Shippable in an afternoon. Two-pass rendering:

**Pass 1** — derive the name for each cluster as today.
**Pass 2** — group clusters by derived name. For any group with ≥ 2
clusters, apply disambiguation in this order:

1. **Second-most-salient attribute.** If the colliding clusters have
   different dominant tags, append: `"Universe sim 4 7 · #phase"` vs
   `"Universe sim 4 7 · #risk"`.
2. **Folder path.** `"Universe sim 4 7 (boltzsidian/)"` vs
   `"Universe sim 4 7 (panel-haus/)"`.
3. **Ordinal.** Last-resort suffix — `①` through `⑨`. Honest: it
   communicates "these are different things we couldn't tell apart
   for you; please rename them."
4. **Visual merge.** If two name-colliding clusters' centroids sit
   within N pixels of each other on screen AND no disambiguator
   works, emit a **single** label with a merged-count badge:
   `"Universe sim 4 7 × 5"`. Clicking the badge opens a "merge
   these?" prompt.

### 1.2 Rename + hide (half-day)

The user authors a name for a cluster; the app remembers it. Stored
in a sidecar `.universe/constellation-names.json`:

```json
{
  "version": 1,
  "entries": [
    {
      "memberHash": "f1a2…",
      "name": "Boltzsidian core",
      "hidden": false,
      "created": "2026-04-22T…",
      "updated": "2026-04-22T…"
    }
  ]
}
```

`memberHash` is a stable hash of the sorted member-id list at
rename-time. Same reconciliation approach CONSTELLATIONS.md §2
already describes — Jaccard-match the entry's members against the
current clusters; best-match wins.

Right-click a constellation label → "Rename" / "Hide" menu. Rename
prompts inline; Hide sets `hidden: true` and the label stops
rendering. The notes themselves stay visible — only the _label_ for
the group disappears.

### 1.3 Reposition via drag (~2 hours)

Pointerdown on a label, drag, pointerup. Delta captured as
`offset: [dx, dy]` (screen pixels) in the constellation-names entry.
On render, the offset is added to the projected centroid. Double-
click resets to zero.

The offset is purely visual — the cluster doesn't move; the label
does. For dense regions with multiple centroids near each other,
this is how the user pulls them apart by hand.

---

## 2. Interaction — the right-click menu

Minimal, one surface:

```
┌────────────────────────────┐
│  Rename…                   │
│  Hide constellation        │
│  Merge with nearby (5)     │  ← count reflects how many colliding
│  Reset label position      │
│  Split into two…           │  ← (later; see §3)
└────────────────────────────┘
```

- **Rename** — inline edit, Enter commits.
- **Hide** — toggles `hidden`. A hidden constellation shows a tiny
  crossed-out indicator when "Show hidden" is toggled in settings.
- **Merge with nearby** — if the rendering detected ≥ 2 colliding
  labels, this accepts the merge: union the member sets, keep the
  first one's name, write the result.
- **Reset label position** — clears any stored offset.
- **Split** — enters a lasso mode (deferred to 1.4).

All five actions write `constellation-names.json` and re-render.

---

## 3. Deferred — split

The one action that needs dedicated UX is splitting a cluster the
user thinks should be two. Proposed flow:

1. Right-click a constellation → "Split into two…"
2. Enter lasso mode. Cluster members get outlined.
3. User drags a selection loop around a subset.
4. On release: prompt for the new region's name. Original region
   keeps its members minus the lassoed subset.

Skip shipping this in v1. Users who need splitting usually want to
rename one and move on; we can watch for the case where someone
_actually_ wants two separate names and solve it then.

---

## 4. Composition with existing concepts

| Existing concept               | Behavior                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| Constellation zoom-ratio       | Unchanged. A hidden or merged constellation just doesn't emit   |
|                                | a label at any zoom.                                            |
| Cluster detection              | Unchanged. Rename / merge doesn't alter the graph's clusters —  |
|                                | they're still what physics and density-bloom read from.         |
| Folder tint                    | Merged constellations pick up the dominant folder tint of their |
|                                | expanded member set.                                            |
| Formations (galactic core)     | Still uses the raw cluster detection — renaming doesn't change  |
|                                | which cluster is densest.                                       |
| Suggestions / tend / librarian | See a cluster's user-given name when the heuristic passes them  |
|                                | context, so their prompts can reference "Boltzsidian core"      |
|                                | instead of the auto-derived title.                              |

---

## 5. Persistence — `constellation-names.json`

Lives at `.universe/constellation-names.json`, next to state and
prune-candidates. Structure shown in §1.2.

**Member-hash reconciliation:** on every vault load, iterate the
stored entries. For each, find the cluster with the highest Jaccard
overlap vs its `memberHash`'s original set (stored as a small array
alongside the hash). If best-match ≥ 0.5, the entry applies to that
cluster. Otherwise mark the entry `stale`. Stale entries don't
render; settings exposes a "Forget stale constellations" action so
the user can flush them deliberately.

**What we deliberately don't persist:**

- The cluster's auto-derived name. That's recomputed on every load
  so changes to vault content (new tags, new folders, new hub notes)
  are reflected. Only user overrides persist.
- Any computed centroid / density / extent. These live in memory
  only — they drift during dream mode and get recomputed constantly.

---

## 6. Implementation sketch

Files touched:

- **`sim/clusters.js`** — unchanged. The graph analysis stays emergent.
- **`ui/constellations.js`** — the renderer gains pass 2 (dedupe /
  disambiguate / merge-badge) and reads user overrides from a
  `getConstellationOverrides()` getter.
- **`vault/constellations-store.js`** — new. Load/save
  `constellation-names.json`. Owns the Jaccard reconciliation.
- **`ui/constellations.js`** — right-click menu + drag-to-offset +
  rename-prompt handlers. ~150 lines.
- **`state/settings.js`** — adds `show_hidden_constellations: false`.

No shader work. No physics changes. Pure DOM + JSON.

---

## 7. What's deliberately NOT here

- **Auto-detection of "these should be merged."** The
  merge-with-nearby badge _surfaces_ the suggestion but never
  commits without the user's click. The graph doesn't know what
  _means_ the same to the user.
- **LLM renaming.** The librarian (LIBRARIAN.md) has a
  "cluster-naming" pass that could _propose_ names, but the
  acceptance is always a user click into the Rename dialog. This
  doc doesn't add AI.
- **Per-user multi-session sync.** Single-machine; if two devices
  edit the same vault's `constellation-names.json`, last-write-wins.
  Sync is a separate product concern.
- **Hierarchical names.** One cluster → one name. Nested
  "Boltzsidian › Phases" is tempting but the zoom-cross-fade
  rendering doesn't support two layers of label on a single
  cluster. One layer forever.

---

## 8. Relationship to REGIONS.md

[REGIONS.md](REGIONS.md) proposes a richer concept: a **region
node** that lives in the universe as a body, can be dragged in
space, and can even exist with zero members (as a placeholder to
grow a cluster around). That's a much bigger feature — it touches
the physics layer, body rendering, and the data model for the vault
graph itself.

This doc does the minimum: fix the rendering collision, let users
curate names. If after shipping §1.1–1.3 the "region as node"
gesture still feels missing, REGIONS.md describes the next step. If
naming control turns out to be enough, REGIONS.md stays on the
speculative shelf indefinitely.

One-line decision rule:

> If your complaint is "the labels are wrong or duplicated," you
> want this doc. If your complaint is "I want to place a named
> region in empty sky," you want REGIONS.md.

---

## 9. Minimal first cut

Shippable in two sittings:

### 9.1 Session A (afternoon)

1. `ui/constellations.js` — implement the dedupe + disambiguate pass
   from §1.1. Visual merge badge. No persistence.
2. Acceptance check: re-open the screenshot's vault; the five
   "Universe sim 4 7" labels become either disambiguated (with
   tag/folder suffixes) or merged (`× 5` badge).

### 9.2 Session B (half-day)

1. `vault/constellations-store.js` — load/save `constellation-names.json`.
2. Right-click menu in `ui/constellations.js` → Rename / Hide /
   Merge / Reset.
3. Drag-to-offset handling.
4. Jaccard reconciliation on vault load.

Skip split + regions drawer + hidden-reveal toggle for v1.

---

## 10. One sentence

The detector guesses; the user overrules; and when the two disagree
the user's name always wins while the detector's best guess
disambiguates with a tag, a folder, an ordinal — whatever shortest
signal tells the user's eye "these are different things."
