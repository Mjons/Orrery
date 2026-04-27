# WEAVE.md — Find and propose connections between siblings of a hub

Sibling to [KEYWORD_LINK.md](KEYWORD_LINK.md),
[PULL_INTO_ORBIT.md](PULL_INTO_ORBIT.md), and [BATCH_LINK.md](BATCH_LINK.md).
Those build **star-shaped** connections: one hub, many satellites, all
satellites → hub. This doc specifies the **network-completion** pass:
given a hub with many satellites, look for links that ought to exist
_between_ the satellites themselves.

## The idea in one sentence

Pick a hub note. The app scans every note that links to it, looks for
honest evidence that two of those satellites belong together, and
proposes `[[satellite → satellite]]` links — turning a star into a web.

## Why

Hubs accumulate satellites faster than the user writes cross-links.
A project note with 40 incoming links usually has a dozen pairs of
satellites that reference each other in prose but have never been
wikilinked. The hub can be read; the web can't.

The visual outcome the user wants: instead of 40 stars orbiting one
center (sparse, centrifugal), the same 40 stars plus the real
cross-references between them (dense, legible as a neighborhood).
That's what "looks more complete" means — not more links for the sake
of more, but the links that were _implied_ by the existing prose.

## The signals

The weave pass proposes a link `A → B` only when at least one piece
of honest evidence supports it. No speculation. Signals, ordered by
confidence:

1. **Prose mention.** A's body contains B's title (or an obvious
   alias — "the pipeline" for `[[Pipeline V2]]` if the user has
   already wikilinked that phrase elsewhere). Strongest signal.
   Same matcher as the obvious-link pass.
2. **Shared significant tag.** A and B both carry a tag that's rare
   across the vault (e.g. `#delphica` when only 12 notes have it),
   AND neither is already wikilinked to the other. A tag shared by
   80% of the vault (`#note`) doesn't count.
3. **Co-mention in a third note.** A third satellite C mentions both
   A and B in the same paragraph. Weak but real — the user has
   implicitly tied them.
4. **Backlinks-to-same-set.** A and B both link to a large common
   set of OTHER satellites (> 50% overlap). Suggests they occupy
   the same region of the graph; cross-linking them completes an
   obvious triangle.

Signals 1 and 2 are the first cut. Signals 3 and 4 come later if
the first two don't surface enough.

## The flow

1. User clicks a hub note (or has one open in the panel).
2. Press **`Shift+O`** — or the **"Weave"** button in the panel
   header (variant of `O` / [PULL_INTO_ORBIT.md](PULL_INTO_ORBIT.md)).
3. App collects the satellite set: `{ n ∈ vault.notes : n links to
hub OR hub links to n }`. Dedupe, drop the hub itself.
4. For each pair (A, B) in the satellite set where A ≠ B and no
   existing wikilink `A ↔ B`, run the signal checks.
5. Open a preview drawer (similar in spirit to the Tend drawer)
   listing proposed links grouped by signal strength:

   ```
   Weave preview for [[Delphica]] — 47 satellites, 31 proposals

   Prose mention (12)
     ✓ [[AI Physician Portal]] → [[Infra Deploy]]
         "…handoff blocked until infra deploy is green…"
     ✓ [[Landing Page]] → [[Brand Update]]
         "…once the brand update ships, we can refresh the landing…"
     …

   Shared tag #delphica (11)
     ✓ [[Pitch Feedback]] → [[Business Plan]]

   Co-mention in [[Design Handoff]] (8)
     ✓ [[Portal Spec]] → [[Design Handoff]]   (already via backlink)
     …
   ```

6. User unchecks false positives, clicks **Weave 27**.
7. Each accepted proposal is applied via the same inline-replace
   path as `applyObviousLink` — the matched phrase in A's body
   becomes `[[B]]` (or `[[B|matched]]` with alias).
8. Toast: `Wove 27 links into [[Delphica]]'s 47-node neighborhood.`

## What gets written vs what doesn't

**Written to disk** (following the scope principle: tending only
adds/modifies `#tags` and `[[connections]]`):

- For prose-mention proposals: the matched phrase in A's body is
  wrapped as `[[B]]` in place. Same behavior as obvious-link.
- For shared-tag proposals: **nothing**, unless the user opts in
  via a checkbox to also wrap a mention. Shared tags alone don't
  justify injecting a link at EOF — that's the EOF-wikilink
  anti-pattern we already banned.

**Not written to disk, but shown as "consider"**:

- Shared-tag pairs with no prose mention → listed under a
  `Consider adding` section. User eye-balls them and either
  opens the notes manually to link inline, or checks "also add a
  See also entry" (opt-in per proposal).
- Weak signals (co-mention, backlink overlap) are suggestions
  only in the first cut — require explicit user action to apply.

The rule: **the weaver never invents a link. It only wraps phrases
the user already wrote.**

## Scoring and thresholds

A preview with 400 proposals is not a preview — it's a wall. Cap
the pass:

- **Per-pair confidence threshold.** Prose-mention: always propose.
  Shared-rare-tag + prose-mention: strong. Shared-rare-tag alone:
  propose under "consider" only.
- **Hub degree cap.** For hubs with >100 satellites, only scan the
  top N = 60 by most-recent-mtime. Warn the user: "60 of 143
  satellites scanned — run `weave --deep` for the rest." (Console
  command; keyboard shortcut TBD.)
- **Maximum proposals per satellite.** At most 10 outgoing
  proposals per A. Prevents one central node from dominating the
  preview.
- **REFUSE threshold.** >300 proposals → "refuse & narrow" (same
  pattern as the keyword-linker). Split the hub first.

## Implementation

### Reuse

- **Satellite set:** `vault.forward.get(hubId)` + `vault.backward.get(hubId)`
  gives the neighborhood in O(1).
- **Signal 1 (prose mention):** `findKeywordMatches` from
  [layers/keyword-link.js](../boltzsidian/src/layers/keyword-link.js)
  — exact function the obvious-link detector already uses.
- **Apply path:** identical to the keyword-link picker's `onApply`
  handler ([main.js](../boltzsidian/src/main.js)) — parse
  frontmatter, splice body, save.
- **Preview drawer:** can reuse the Tend drawer's list
  component pattern — checkboxes, per-proposal context, bulk
  accept/reject.

### New

1. **`src/layers/weave.js`** — scanHub(vault, hub) →
   `{ proposals: [{from, to, signal, context}] }`. Pure, no
   side effects. Runs signals 1 + 2 in parallel per satellite pair.
2. **`src/ui/weave-drawer.js`** — the preview + apply UI. Groups
   proposals by signal. Per-proposal checkbox. Bulk
   accept/reject.
3. **`Shift+O` hotkey** — when a note is selected, opens the
   weaver on that note as the hub.
4. **"Weave" button in note panel header** — same action as the
   hotkey, discoverable.

### Performance

- `O(k²)` pair scans where `k` = hub satellite count. On `k=60`,
  that's 3540 pair checks. Each is a substring scan of two notes'
  bodies. Budget: <500ms on a typical vault, which is fine for a
  one-shot pass the user explicitly triggers.
- Don't run weave continuously. It's a button, not a background
  task. That's the same scoping rule we apply to tending.

## Composition

- **With tending:** overlap is minimal — tend proposes A → hub
  (spoke), weave proposes A → B (rim). The user's mental model is
  "tend builds the spokes; weave closes the rim." Both respect the
  scope principle (only #tags and [[connections]]).
- **With the visibility filter:** if the filter is active when the
  user presses `Shift+O`, scope the satellite set to notes matching
  the filter. "Weave just my active Delphica notes."
- **With pull-into-orbit:** `O` pulls X-labeled notes TOWARD the
  hub. `Shift+O` connects notes that already circle the hub to
  each other. Symmetric gestures.

## First cut (one afternoon)

1. `src/layers/weave.js` — signal 1 only (prose mention),
   returning proposal list.
2. Simple console trigger first:
   `__boltzsidian.__weave(hubNoteId)` logs the proposal list.
   No UI yet.
3. If the proposal list looks sensible on a real hub, wire the
   drawer next. If proposals are mostly noise, tune the signal
   threshold before building UI.

Skip: signal 2 (shared tags), drawer, Shift+O hotkey, panel button.
All come after the first signal is proven to produce good output.

## What this isn't

- **Not graph completion by analogy.** We don't propose "A often
  links to B because A looks like C which links to B." That's
  speculation.
- **Not invented links.** Every proposed link has to correspond to
  a phrase the user has already written. No hallucinated tethers.
- **Not auto-apply.** Always previewed, always opt-in. Even an
  obvious-looking proposal can be wrong in context.
- **Not a semantic embedding.** We're doing substring + tag
  analysis. If you want "find notes that talk about the same
  concept in different words," that's an embedding-driven doc
  and a separate feature.

## Kill condition

If the first-cut console output on a real hub shows mostly false
positives (proposals where A mentions B's title coincidentally,
not as a conceptual link) — tighten the match rule: require that
the mention fall in a paragraph that isn't a code block or a
heading, and require at least three total word-tokens in the
sentence. Still noisy? Require a shared rare tag in addition to
the prose mention.

If the output is sparse on a hub with many satellites (< 10% of
satellite pairs surface any signal) — then the hub's neighborhood
genuinely isn't cross-referenced yet, and this pass can't invent
what isn't there. That's a correct result, not a bug.

The feature is load-bearing when: the user looks at their
Delphica node's neighborhood after a weave pass and says _I
didn't know those two related until just now, but of course
they do_.

#weave #linking #graph #phase
