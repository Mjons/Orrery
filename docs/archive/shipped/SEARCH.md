---
tended_on: [tag-infer]
created: "2026-04-23T00:00:00.000Z"
---

# SEARCH.md — Finding notes

Status + plan for search in Boltzsidian. Companion to
[MODEL_SURFACES.md](MODEL_SURFACES.md) §2.4 (which already sketches
semantic search as a future surface) and [WORKSPACE.md](WORKSPACE.md)
§2.4 (the "Find" interaction spec).

---

## 1. What we have today

**Full-text search across every note's body is already shipped.** It
isn't just a title search — the question in the prompt that led to this
doc implied otherwise; the code doesn't.

Source of truth: [`boltzsidian/src/ui/search.js`](../boltzsidian/src/ui/search.js).

- **Indexer:** MiniSearch, built lazily on first Cmd+K open, rebuilt
  when the note count changes.
- **Indexed fields:** `title` (boost ×3), `tags` (boost ×2), **`body`**
  (full content, unboosted). Body indexing is the thing that makes
  "cmd+k a phrase from a two-year-old note" actually work.
- **Matching:** prefix + fuzzy 0.2. "attenton" finds "attention",
  `[[par` finds the paragraph starting with "paragraph".
- **Ranking:** MiniSearch's built-in TF-IDF. Top 12 results surfaced.
- **UI:** glass strip at top of viewport (search stays visible, sim
  keeps running), matching bodies glow, camera arcs to top hit, ↑↓
  walks the ranked list, Enter opens, Esc restores.

So the floor is in. The upgrade is **semantic** search.

---

## 2. What's missing

Lexical search answers _"which notes contain this string?"_ It misses:

- **Concept matches.** A note about "meditation" doesn't surface when
  you search "attention" or "focus." They're semantically adjacent,
  lexically disjoint.
- **Paraphrase.** "The piece about the thing we talked about on the
  boat" doesn't find the note titled "Lido trip, 2025-06-11."
- **"Notes like this one."** There's no way to ask the field for the
  nearest neighbours of the note you're currently reading — the graph
  tethers only follow explicit `[[links]]`.

The upgrade path is embedding-based semantic search, scoped and gated
per the already-committed design.

---

## 3. What's already decided (don't re-litigate)

From [MODEL_SURFACES.md](MODEL_SURFACES.md) §2.4, §6, §7, §9:

- **Semantic search is the highest-payoff local-model surface.** Listed
  as step 5 in the staged model-surfaces rollout.
- **Local-only.** Claude is off the table for this surface — it would
  require sending every note to Anthropic for embedding. Privacy
  invariant violates that by a mile.
- **Behind a settings toggle.** Greyed-out until the local backend is
  ready.
- **First-run is user-confirmed.** "You're about to download ~500 MB
  to run an on-device embedding model. One-time cost." Cancel leaves
  the search pane in MiniSearch-only mode.
- **Template / keyword search remains authoritative.** Semantic is
  additive, not a replacement. If the toggle is off, the app behaves
  exactly as it does today.

These rules inherit directly from the model-surface §1 invariants:
deterministic floor, privacy by default, emergence not effects.

---

## 4. Integration plan

Six steps. Each ships independently; none breaks the existing search.

### 4.1 Decide on the embedding model

Two realistic candidates:

- **`all-MiniLM-L6-v2`** via transformers.js — 22 MB quantised,
  384-dim, 7000+ sentences/sec on a mid-tier laptop. The industry's
  default "small" embedder. Good enough quality for English notes.
- **`bge-small-en-v1.5`** — 33 MB, 384-dim, better on retrieval
  benchmarks (MTEB) but a touch slower. Worth the upgrade only if the
  MiniLM quality floor feels off after a week of use.

**Default: MiniLM.** Ship the smaller one, live with it, swap if
needed. Both run in-browser via transformers.js with WASM SIMD, no
Python, no backend server.

### 4.2 Chunking

Embeddings are per-chunk, not per-note. A 5000-word note collapsed to
one 384-dim vector is lossy garbage.

- **Chunk size:** 256 tokens, 32-token overlap. Matches MiniLM's
  sweet spot.
- **Boundary preference:** paragraph > sentence > token. Never split
  mid-wikilink or mid-frontmatter.
- **Metadata per chunk:** `{ noteId, chunkIndex, charStart, charEnd,
vector }`.
- **Frontmatter is excluded from chunk text.** It's structural, not
  semantic.

### 4.3 Storage

- **IndexedDB** via a small wrapper. Store one record per chunk.
- **Schema:**

  ```js
  {
    noteId: string,
    chunkIndex: number,
    charStart: number,
    charEnd: number,
    vector: Float32Array(384),  // or Uint8Array after quantisation
    modelHash: string,          // invalidate on model swap
    contentHash: string,        // invalidate when the note changes
  }
  ```

- **Quantise to int8** after profiling if Float32 is too fat — saves
  4× space at ~0.5% recall cost. Defer until we've measured.

### 4.4 Index lifecycle

- **On note save:** diff `contentHash`; re-embed only the chunks that
  changed. Incremental, not full rebuild.
- **On first enable:** process the vault in a Web Worker, 200 ms
  between batches so the UI doesn't jank. Progress bar in the settings
  pane. Cancellable.
- **On model swap:** invalidate everything with the old `modelHash`,
  re-embed on the next idle.
- **On vault switch:** per-workspace index keyed by root id. Don't
  cross-pollinate.

### 4.5 UI

Keep the existing Cmd+K strip. Add:

- **Mode toggle** in the strip, left of the input: `lexical ⟷ semantic`.
  Defaults to lexical. Cmd+Shift+K opens straight into semantic mode.
- **Mixed ranking** (stretch goal, not phase 1): default mode runs
  both, blends with Reciprocal Rank Fusion. One list, both signals.
  Skip until we've lived with the toggle and confirmed users want
  blending over choice.
- **Loading state.** If the worker is mid-embedding the first time,
  show "indexing 1,247 / 3,284 notes…" and fall back to lexical for
  the current query.
- **"Notes like this"** surface: a button in the note panel footer
  that opens the strip pre-loaded with the note's centroid embedding.
  This is the feature that only semantic can deliver — worth shipping
  alongside toggle, not after.

### 4.6 Acceptance criteria

Ship when _all_ of the following hold on Michael's vault (1000+ notes):

1. First-index completes in under 90 s on an RTX 4090, under 5 min on
   a Macbook Air.
2. Incremental re-embed on a saved 500-word note completes in under
   200 ms.
3. Query latency under 80 ms end-to-end for 10k chunks.
4. "Notes like this" surfaces at least one non-obvious neighbour on
   half of the notes Michael tests — i.e., it finds something the
   `[[links]]` and tags don't already reveal. If the surface only
   re-confirms what explicit links already say, semantic isn't
   earning its 500 MB.
5. Disabling the toggle returns the search pane to bit-exact
   pre-semantic behaviour.

---

## 5. Non-goals (explicit)

- **Claude embeddings.** Rejected. See §3 and MODEL_SURFACES.md §7 —
  the privacy cost is unrecoverable and the quality gap isn't worth it
  for note-sized chunks.
- **"Ask my vault" / RAG chat.** Different feature. Rejected at spec
  time in MODEL_SURFACES.md §2.5 (no deterministic floor). Semantic
  search is retrieval only; the generated answer stays out of scope.
- **Cross-user search / shared indexes.** Single-user product, §7
  privacy invariant.
- **Re-ranking with a cross-encoder.** Quality bump is real (5–15%
  on MTEB) but adds a second model download and another 50 ms of
  latency per query. Defer until users tell us ranking feels off.
- **Replacing MiniSearch.** Lexical is fast, offline, zero-dependency,
  and often what the user actually wants (a quote search, a tag lookup,
  a filename). Keep it as the authoritative floor.

---

## 6. One-sentence framing

We already search every word in every note. The next step is to search
every _meaning_, on-device, behind a user-confirmed download, with the
existing lexical search intact as the floor.

#feature #phase #privacy
