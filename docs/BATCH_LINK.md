---
id: 01KR0000BATCHLINK0000000000
created: 2026-04-21
---

# BATCH_LINK.md — Adding `[[connections]]` to many notes at once

The pain point: the user has 30 notes that should all link to a new
hub / bibliography / index / shared concept. Opening each one and
typing `[[Thing]]` is slow and breaks flow. The spatial + cluster +
tag machinery already in Boltzsidian gives us natural ways to
**select** a batch; this doc explores how to **apply** a link across
that batch in one gesture.

The ask is small on paper — "write one line to N files" — but the
right UX matters. A bad batch tool encourages sloppy linking; a good
one feels like pulling a string through bodies that want to be
connected anyway.

---

## 0. Premise

Today Boltzsidian has:

- **Link-drag** — drag from body A to body B in the universe, create
  one link.
- **Wikilink-in-editor** — type `[[Title]]` in the note panel,
  autosave creates the edge.
- **DOCS_AGENT** (external) — batch-applies connectivity at the
  filesystem level outside a session.

None of those covers "I've just added a new hub note and I want
every member of this region to link to it," which is a frequent
operation any time the user adds a new shared concept.

---

## 1. Selection surfaces

The selector is 80% of the UX. Six plausible sources:

### 1.1 Lasso in the universe

Shift-drag (or a dedicated hotkey + drag) across bodies in 3D
space to select N. The universe becomes the selector.

**Pros.** Pure spatial, matches the app's metaphor. No mental
translation between "what I see" and "what's selected."
**Cons.** New UI — needs a screen-space rectangle cast against
body positions, selection render state per body, modifier
gymnastics. Depth ambiguity: a lasso over a dense cluster may
grab bodies behind a formation.

### 1.2 Constellation batch

Right-click a constellation → "Link members to…" — operates on
every note in the clicked cluster.

**Pros.** Selection is already represented visually (the halo).
Zero new selector UI — the constellation IS the selection
indicator. Trivial to bolt onto the existing
`onConstellationClick` hook.
**Cons.** Cluster membership can shift (live repartition in
LIVE_CLUSTERS.md Phase D) — the set the user sees might not
match what actually gets linked if the gesture races a
repartition. Mitigation: snapshot `cluster.noteIds` at
invocation.

### 1.3 Tag-scoped

"Link all notes tagged `#research` to `[[Bibliography]]`." Pick
from Settings or a `/tag` palette.

**Pros.** Scales to non-spatial groupings. Users who already
tag well get batch linking for free.
**Cons.** Requires a tag picker. Non-visual — user can't see
what they're about to touch.

### 1.4 Search-scoped

Cmd+K → search → "link all results to X." Current results
become the set.

**Pros.** Reuses existing search + minisearch index. Text-match
as selector is powerful (e.g., "every note that mentions
'consciousness'" → link all to `[[CONSCIOUSNESS]]`).
**Cons.** Fuzzy matches make "which notes?" ambiguous. Could
produce surprising results on rare searches.

### 1.5 Folder / root-scoped

"Link every note in root `claude-sdk` to `[[INDEX]]`." The
agent-y path, replicating DOCS_AGENT's connectivity pass from
inside the app.

**Pros.** Scales to whole projects. Intuitive for the add-a-root
→ tidy-it-up workflow. Natural fit with the Workspace pane.
**Cons.** Selection is massive (hundreds of notes is common).
Needs a confirm + preview step.

### 1.6 Drag-weave gesture

Lasso N bodies (1.1), then drag OUT of the lasso toward ONE
target. Combines spatial selection with spatial target.

**Pros.** Single continuous gesture. Feels like "pulling a
string through." Visually readable.
**Cons.** Highest new-UI cost. Depth ambiguity inherited from
1.1 plus the extra direction-pick phase.

---

## 2. Comparison

| Approach          | Selection cost | Target cost       | New UI       | v1?    |
| ----------------- | -------------- | ----------------- | ------------ | ------ |
| 1.1 Lasso         | High           | Autocomplete pick | Yes          | ✗      |
| 1.2 Constellation | **Low**        | Autocomplete pick | Minimal      | ✓      |
| 1.3 Tag-scoped    | Medium         | Autocomplete pick | Tag picker   | ✗      |
| 1.4 Search-scoped | Low            | Autocomplete pick | Hook into /K | ✗      |
| 1.5 Folder/root   | Low            | Autocomplete pick | Workspace    | ✓ (v2) |
| 1.6 Drag-weave    | Very high      | Free (drag-end)   | Big          | ✗      |

---

## 3. Recommended v1 — Constellation batch (1.2)

### Invocation

- **Right-click a constellation label** → "Link members to…" menu
  item. Replaces the current bare right-click-to-rename gesture;
  rename moves to **double-click** only (already works).
- Alternatively: a small `+link` button appears next to the
  constellation label when the camera is held close enough that
  only one halo is in frame.

### Target picker

A small floating input below the toast bar:

- Title input with autocomplete over `vault.notes`.
- Debounced, shows top 8 matches, ranked by
  `prefer-same-root(firstMember.rootId)` so a cluster sitting
  mostly in root X surfaces X's notes first.
- Enter to commit, Esc to cancel.
- If the typed text doesn't match any note, prompt "Create
  `<title>` in writeRoot and link to it?" — opt-in note
  creation.

### Apply step

Snapshot `cluster.noteIds` at invocation time so live
repartitioning doesn't mutate the set mid-flight. For each id:

1. Skip if id === target.id (self-link).
2. Skip if forward graph already contains target.id.
3. Skip if the source note's root is read-only; collect for the
   summary.
4. Skip if `_isPhantom` (shouldn't happen, but defensive).
5. Otherwise:
   - Compute `nextText = applyObviousLink(note, { linkTargetId:
target.id }, vault)` — reuses
     [tend-apply.js](../boltzsidian/src/layers/tend-apply.js)'s
     existing body mutation.
   - `await saver(note, nextText)` — goes through the Phase-3
     root-aware saver with all its guarantees.

### Post-apply

- `physics.rebuildEdges()` once.
- `tethers.rebuild()` once.
- `search.invalidate()`.
- Toast summary:
  - `Linked N members of "<constellation name>" to [[Target]]`
  - Skipped: `M already linked, K read-only, 1 self`.
- Dream + salience layers pick up the new edges on their next
  scoring pass. No explicit notify needed.

### Idempotent

Re-running the same batch on the same cluster should no-op
every member (rule 2 above). That's the correctness floor; a
user who forgets they've done this can hit it again safely.

### Confirmation threshold

- N ≤ 10: apply silently.
- 10 < N ≤ 50: toast with "Undo" action that reverses the batch
  (stores the edge list so we can diff it out).
- N > 50: modal confirm before writing.

### Scope estimate

- Constellation right-click menu: 30 min
- Target-picker floating input: 1 hour
- Batch apply loop (using existing saver + applyObviousLink):
  45 min
- Toast + summary + undo (for the middle band): 45 min
- Physics/tether/search refresh wiring: 15 min

**Total: ~3.25 hours.** Ships in an afternoon.

---

## 4. Plumbing

Reuses, doesn't add new infrastructure:

- **Writes**: `saver(note, nextText)` — same path as every other
  edit. Read-only enforcement, rename throttling, link rewrite
  planning all inherit for free.
- **Body mutation**: `applyObviousLink` from
  [tend-apply.js](../boltzsidian/src/layers/tend-apply.js). Already
  handles the "doesn't already contain `[[Target]]`" check and the
  "append to body end" placement.
- **Target resolution**: `vault.resolveTitle(raw, sourceNote)` —
  multi-root prefer-same-root for free.
- **Undo**: a simple in-memory ring buffer of the last batch's
  edits, wiped on navigation / refresh.

---

## 5. Edge cases

- **Target is in a different root than some members.** Cross-root
  wikilinks work (Phase-4 renders the `·rootId` marker).
- **Target note doesn't exist.** Offer to create it in writeRoot.
  If the user declines, cancel the batch.
- **A member has the target already linked.** Skip, count in
  summary.
- **Source is read-only.** Skip, count. (`saver` already returns
  `{ applied: false, reason: "read-only" }` — batch just respects
  the return.)
- **Concurrent edit.** If the user has the note panel open on a
  member and it's `dirty`, flush the panel first before the
  batch writes. Same pattern the note panel already uses on
  close.
- **Single-member cluster.** Still valid — the "batch" becomes one
  write. Toast reads `Linked 1 member…`.
- **Live repartition mid-flight.** Snapshot noteIds at
  invocation. LIVE_CLUSTERS.md Phase D's debounce (1500ms)
  already gives us margin; the batch should finish well inside
  that window.

---

## 6. What v2 unlocks

Once the machinery lands in v1, the other selectors become cheap:

- **Tag-scoped**: replace `cluster.noteIds` with
  `vault.notes.filter(n => n.tags.includes(tag)).map(n => n.id)`.
  Same apply loop, different selector.
- **Search-scoped**: `search.getMatches().map(m => m.id)` → same
  apply loop.
- **Folder/root-scoped**: filter by `note.rootId` or
  `topLevelFolder(note)`.
- **Lasso**: new selector UI, same apply loop.
- **Drag-weave**: lasso + the drag-end as the target, same apply
  loop.

The hard part is the apply loop + UX polish. The selectors are
one-liners once that's solid.

---

## 7. What to deliberately skip

- **Multi-target** ("link selected to A AND B") — encourages
  cluttered graphs. Do it twice if needed.
- **Directional batch** ("link A→B AND B→A for every pair") —
  weave, not link. Different tool.
- **Removing links via batch** — deletion is already right-click
  on tether; deleting 50 at once is rare and risky.
- **Running inside a dream cycle** — explicit user action only.
- **Cross-root bulk hub creation** — DOCS_AGENT already does
  this at the filesystem level. Don't compete.

---

## 8. One sentence

When you've made a new hub, you should be able to grab the region
that needs it and pull the connection through every member at once
— without leaving the sky you're looking at.

#batch #links #selection #constellation
