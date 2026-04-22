# VISIBILITY_FILTER.md — Hide/dim nodes by keyword or tag

Sibling to [FORMATIONS.md](FORMATIONS.md) (curated lens presets) and
[CONSTELLATIONS.md](CONSTELLATIONS.md) (cluster-level labels). This doc
specifies the **user-typed filter** — the "show me only what I care
about right now" lens you reach for when the vault is too full to see.

Where formations are named presets (`Halo`, `Protostars`, `Galactic
core`), a filter is ad-hoc and compositional: `#project AND pipeline`.

## The idea in one sentence

A narrow bar (or hotkey-triggered palette) where the user types
`#tag` and/or free text; the universe fades every non-matching note
to near-invisibility so the remaining structure reads clean.

## Why

Today, looking at a vault of 300 notes is a single cloud. The
existing formations help ("Protostars" shows only notes from the
last 14 days) but the vocabulary is fixed — four presets, one
parameter each. Keyword filtering is the natural next axis:

- "Show me everything tagged `#delphica`."
- "Show me every note mentioning `'pipeline'`."
- "Both — `#delphica AND pipeline`."

These aren't presets; they're queries against the user's own
vocabulary. Users already know what they're looking for; the app
shouldn't require them to name the lens first.

## The mechanic

Reuse the existing **formations pipeline** rather than inventing a
parallel filter system. Each active formation already contributes a
`Set<noteId>` of matches; the renderer intersects them into a single
glow filter. Two new formation kinds:

- **`keyword`** — parameter: free-text phrase (literal substring,
  case-insensitive). Match = note's body OR title contains the
  phrase. Uses the same `scrubExcluded` pass as the keyword-linker
  so matches inside code fences / existing wikilinks don't count.
- **`tag`** — parameter: tag string (with or without `#`). Match =
  note has that tag (frontmatter `tags:` array OR inline `#tag` in
  body).

Both formations allow **multiple instances** with different
parameters, e.g. `tag:project` + `tag:active` (logical AND, matches
notes with BOTH tags) or `keyword:pipeline` (matches notes with
"pipeline" in body AND also matching the tag filter if present).

## Interaction model

One text field at the top of the viewport (or a palette opened
with `Cmd+F`). The user types:

```
#project pipeline
```

Parser splits on whitespace:

- Tokens starting with `#` → tag filters
- Other tokens → keyword filters (quoted phrases allowed for
  multi-word keywords: `#project "pipeline v2"`)

Each token contributes one formation instance. All AND together by
default (matching the existing formations-compose-via-intersection
rule). An explicit `OR` or `|` between tokens flips them to union —
`#work | #personal` shows notes with EITHER tag.

### Keyboard

- `Cmd+F` — focus the filter bar / open palette.
- `Enter` while focused — commit + defocus, filter stays active.
- `Esc` while focused — clear the filter, defocus.
- Empty string — filter inactive.

### Visual feedback

While the filter is active:

- **Matching bodies** stay at full brightness (what we call 100%).
- **Non-matching bodies** dim to ~10% brightness AND their labels
  disappear AND their tethers dim to ~5%. They still render so the
  surrounding structure reads.
- **Physics still runs on everything** — we don't want the vault
  to collapse because 80% of the springs stopped pulling.
- **Matched count** shown in a subtle pill near the filter bar:
  `47 / 312`. Clicking it frames the camera to fit the matches.

When the filter string contains no matches at all, keep everything
at normal brightness and show a "no matches" note under the bar so
the user isn't staring at a blank universe wondering why.

## Composition with existing formations

The formations rail already has `Halo`, `Protostars`, etc. The
filter bar's tokens add to the active-formations set. Example:

- User clicks **Halo** (orphaned notes) in the rail.
- Then types `#project` in the filter bar.
- Result: orphaned notes tagged `#project`. Intersection.

To exit filter mode, clear the bar (or Esc). The rail-selected
Halo stays active.

## Implementation

### Phase A — Filter bar (DOM + parser)

1. Add `<input id="filter-bar">` to the HUD, positioned below or
   near the search field. Same glass styling as other HUD inputs.
2. Parse the live value into tokens on every `input` event:
   ```js
   function parseFilter(raw) {
     const out = { tags: [], keywords: [], mode: "and" };
     const tokens = raw.match(/"[^"]+"|\S+/g) || [];
     for (const t of tokens) {
       if (t === "|" || t.toLowerCase() === "or") out.mode = "or";
       else if (t.startsWith("#")) out.tags.push(t.slice(1).toLowerCase());
       else out.keywords.push(t.replace(/^"|"$/g, "").toLowerCase());
     }
     return out;
   }
   ```

### Phase B — Two new formation kinds

Extend [src/ui/formations.js:FORMATIONS](../boltzsidian/src/ui/formations.js#L17)
with `keyword` and `tag` entries. Each formation function:

```js
// Tag: note has this tag in frontmatter OR inline body
function matchTag(vault, tagLower) {
  const out = new Set();
  for (const n of vault.notes) {
    const fmTags = (n.frontmatter?.tags || []).map((t) =>
      String(t).toLowerCase(),
    );
    const inlineTags = (n.tags || []).map((t) => String(t).toLowerCase());
    if (fmTags.includes(tagLower) || inlineTags.includes(tagLower)) {
      out.add(n.id);
    }
  }
  return out;
}

// Keyword: body OR title contains the phrase (scrubbed, case-insensitive)
function matchKeyword(vault, phraseLower) {
  const out = new Set();
  for (const n of vault.notes) {
    const hay = (n.body || "") + "\n" + (n.title || "");
    if (hay.toLowerCase().includes(phraseLower)) out.add(n.id);
  }
  return out;
}
```

Feed the parsed tokens into `formations.setMultiple(...)` which sets
one formation instance per token. The formations module already
intersects them; for `OR` mode, union the per-kind matches instead
before intersecting with other formations.

### Phase C — Visibility treatment

Map the filter result into the renderer's existing `aGlow` attribute
pipeline (see [src/sim/bodies.js:381](../boltzsidian/src/sim/bodies.js#L381)):

- Matched bodies: `aGlow = 1.0` (unchanged / brightened).
- Unmatched bodies: `aGlow = 0.10` (dim, still visible as fading
  starfield).

Also:

- Hide labels for unmatched notes (labels already filter on
  matches-glow-filter elsewhere).
- Dim tethers whose endpoints are both unmatched. Partially-matched
  tethers stay at half brightness so cross-project bridges read.

### Phase D — Camera helpers

- The `<count>/<total>` pill at the top: click = call
  `fitCameraToMatches(matchedIds)` — a new helper that computes the
  centroid + extent of matched bodies and tweens the camera to
  frame them.
- Keyboard: `F` while the filter is active + bar unfocused →
  same as clicking the pill.

## Performance notes

- Tag match: `O(n)` per token. On 10k notes, runs in <5ms.
- Keyword match: `O(n * body_length)` per token. Pre-lowercase
  bodies once per vault load (store on `note._bodyLower`) so each
  filter keystroke doesn't re-allocate.
- Debounce filter re-compute on `input` to 100ms — typing "pipeline"
  shouldn't run 8 full scans.
- The glow update itself is cheap (write one Float32Array, mark
  geometry attribute dirty).

## What this isn't

- **Not a full-text search.** Search (`Cmd+K`) jumps to a single
  note. Filter stays on and narrows the whole view. Different tool
  for a different job.
- **Not a boolean query language.** Start with `AND` default and
  `OR` escape. No `NOT`, no parentheses, no regex. Most filters are
  1–3 tokens; a heavier syntax only pays off past that.
- **Not persistent across sessions.** Filters are scratchpad
  queries. If the user wants a saved lens, that's a **formation**
  (curated, named, re-openable) — separate doc,
  [FORMATIONS.md](FORMATIONS.md).

## First cut (one afternoon)

Ship only the essentials:

1. Filter bar in the HUD. `Cmd+F` focuses it, `Esc` clears it.
2. Parser: tags (`#foo`), keywords (plain text). AND-only (no `OR`).
3. Dim unmatched bodies to 10% glow via the existing filter pipeline.
4. Show match count.

Skip: OR mode, quoted phrases, camera-fit-to-matches, tether dimming.
Live with the baseline for a day; let the annoyances tell you which
of the skipped items earn their weight.

## Kill condition

If the user reports "I keep turning on the filter and then forgetting
it's active, then wondering why half my vault disappeared" — the
dimming is too aggressive or the filter indicator is too subtle.
Consider:

- Make the filter bar's background accent-tinted while active.
- Raise dim to 25% so unmatched bodies are more visibly "still there."

The feature is load-bearing when: the user types a tag, three-quarters
of the sim fades, and they pan around reading the remaining shape
without having to remember what's hidden.

#filter #formations #search #phase
