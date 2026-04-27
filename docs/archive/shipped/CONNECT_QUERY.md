---
id: 01KR0000CONNECTQUERY00000
created: 2026-04-25
---

# CONNECT_QUERY.md — Type a sentence at the top, get the connections

Sibling to [BATCH_LINK.md](BATCH_LINK.md), [KEYWORD_LINK.md](KEYWORD_LINK.md),
and [WEAVE.md](WEAVE.md). Where those expose three different selectors
(constellation, keyword, hub) bound to deterministic write loops, this doc
specifies the **free-text gesture**: the user types a sentence into the top
bar, and the app figures out the selection, the topology, and the write.

## The idea in one sentence

The user types `connect every note that mentions Cepheid, Polaris, parallax
and link them to each other` into the top bar and presses Enter. The app
resolves the keyword set, finds matching notes, picks a sensible topology,
shows a preview, and writes the links.

## Why this is worth a doc

The existing siblings already cover most cases:

- BATCH_LINK — selection: a constellation. Target: one hub.
- KEYWORD_LINK — selection: notes mentioning one phrase. Target: one hub.
- WEAVE — selection: a hub's satellites. Target: each other (pairwise).

What none of them does: **let the user describe the selection in language
and let the system pick the right topology.** Today the user has to know
which sibling is the right tool, open it, fill the right fields. The
search strip already accepts free text — `Cmd+K` exists. Extending that
strip with a verb (`connect …`) collapses the three siblings into one
gesture for the case where the user already knows what they want.

## Where the gesture lives

The Cmd+K **search strip** at the top
([boltzsidian/src/ui/search.js](../boltzsidian/src/ui/search.js)) already
accepts free text and is the natural surface. Two activations:

1. **Plain text** — current behavior: dim non-matches, draw camera to top
   hit. Untouched.
2. **Verb-prefixed** — if the input starts with `connect`, `link`, `weave`,
   or `/connect`, the strip switches modes: it shows a live count of
   matched notes, an estimated edge count, and an "Apply…" button instead
   of the navigate hint.

A verb-prefix keeps the existing search behavior unsurprising. No second
input bar.

## Parsing the sentence

Two paths, in order of fallback:

### Path A — deterministic parser (default)

A small regex/grammar handles the 90% case without any model:

```
connect [every|all|notes?] [that|which|with] mention(s)? <terms>
        [and link them (to each other|together|pairwise|to <target>)]
```

`<terms>` is a comma- and "and"-split list. Quoted phrases survive the
split (`mention "the pipeline", parallax`). Output of the parser is a
small JSON object:

```js
{
  verb: "connect",
  terms: ["Cepheid", "Polaris", "parallax"],
  match: "all" | "any",          // default "all" — the strict reading
  topology: "clique" | "hub" | "tag",
  target: null | { kind: "title" | "tag", value: "Cosmic distance ladder" },
}
```

Defaults when the sentence is partial:

| Sentence                               | Inferred plan                                        |
| -------------------------------------- | ---------------------------------------------------- |
| `connect notes mentioning A, B, C`     | match=all, topology=hub (synthetic), target inferred |
| `connect notes about A, B, C to [[X]]` | match=all, topology=hub, target=X                    |
| `weave notes mentioning A`             | match=all (one term), topology=clique                |
| `tag #astrophotography to A, B, C`     | match=all, topology=tag, target=`#astrophotography`  |

### Path B — local LLM as intent-parser (fallback)

If the deterministic parser can't extract terms (sentence doesn't fit any
template), the input is passed to the local backend with a strict
intent-extraction prompt:

```
You convert one sentence into a JSON plan for a note-graph operation.
Output STRICTLY this JSON, nothing else:

{"verb":"connect|link|tag|skip",
 "terms":["…",…],
 "match":"all|any",
 "topology":"clique|hub|tag",
 "target":{"kind":"title|tag|new","value":"…"} | null}
```

Crucially, **the LLM never decides which notes to connect.** It only
turns the sentence into structured intent. The match step is always
deterministic against vault content (so the user can audit it).

This pattern is already established in
[utterance/local-backend.js](../boltzsidian/src/layers/utterance/local-backend.js)
— add a new `jobKind: "connect-intent"` with a tight system prompt and
the existing fallback chain (template → local → claude) behaves
correctly: if the local rig is offline, the deterministic parser still
works for the common verb-prefix shapes.

## Resolving terms to notes

For each term, find every note where the term appears in the body or
title. Three matchers, in order of cost:

1. **Literal substring** (case-insensitive, word-boundary-aware) — same
   matcher as
   [keyword-link.js](../boltzsidian/src/layers/keyword-link.js) so the
   semantics line up with the existing wrap operation. Excludes fenced
   code, inline code, existing wikilinks, URLs, headings.
2. **MiniSearch** — already built for `Cmd+K` text search
   ([search.js](../boltzsidian/src/ui/search.js#L24-L47)). Fuzzy + prefix
   gives "parallax" → notes that say "parallaxes" too. This is the
   default: faster than embedding, smarter than literal.
3. **Optional: local-LLM judge per candidate** — if the user types
   "connect notes ABOUT redshift, time dilation" with the word "about",
   the parser sets a `semantic: true` flag and the matcher widens. We
   take MiniSearch's top-N, then ask the local model per-candidate "does
   this note actually concern <term>? yes/no/why" with a tight token
   budget. Expensive — N notes × N terms × one small completion — so
   default-off, opt-in via the `about` keyword in the sentence.

Match policy: by default `match=all` — a candidate is in the set only if
it matches every term. `connect notes mentioning X OR Y` flips to
`match=any`.

Floor for inclusion: term length ≥ 3 chars (matches KEYWORD_LINK's
floor). Below that, the gesture is rejected with a hint.

## Picking the topology

Three plausible writes once the set `S` is known. The doc's opinion: the
user's words choose for them, and we apply a default when they don't say.

### Topology 1 — clique (`link them to each other`)

Every pair `(a, b) ∈ S × S, a ≠ b` gets a `[[…]]` cross-link in `a`'s
body. Quadratic in |S|. Fine for |S| ≤ 8; noisy beyond.

Writes: `|S| · (|S|-1)` body edits → coalesced through tend-apply's
existing saver.

Cap: refuse silently if |S| > 12. Show a toast "12 is the clique cap —
try a hub or tag instead." Quadratic noise creates more graph clutter
than connection.

### Topology 2 — hub (`link them to [[Target]]`, or default)

Every note in `S` gets one wikilink appended pointing at one target. If
the user named a target, use it. If not, **synthesise** one:

- New note title: terms joined with `·` (e.g. `Cepheid · Polaris ·
parallax`).
- Created in the user's `writeRoot` per Phase-3 root-aware saver.
- Frontmatter `generated_by: "connect-query"` and the original sentence
  in a `prompt:` field, so a future audit can answer "where did this
  hub come from?"

This is the **safe default** when the user just says "connect …" without
specifying topology. A hub is one extra note + N edits, not N² edits.

The synthetic-hub path is also where the local LLM could earn its keep
beyond intent parsing: ask it to propose a _better_ hub title than the
joined-terms default. Strict prompt, ≤ 30 chars, single line, never
references vault content not in the term list. If the model is
unavailable, fall through to the joined-terms default.

### Topology 3 — tag

`tag #X to A, B, C` adds `#X` to each match's frontmatter. No prose
edits. Cheapest, also least visible — useful when the user is grouping
for later weaving rather than asserting a connection right now.

### Defaults table

| Sentence shape                          | Topology        |
| --------------------------------------- | --------------- |
| `connect … and link them to each other` | clique          |
| `connect … and link them to [[Target]]` | hub (Target)    |
| `connect …` (bare)                      | hub (synthetic) |
| `tag … with #x`                         | tag             |

## Preview, then apply

The strip stays **read-only** until the user explicitly commits. Pressing
Enter on a verb-prefixed query opens a preview pane underneath the strip
(reuses the toast/drawer style already in `payload-preview.js`):

```
12 notes match all of: Cepheid, Polaris, parallax
Plan: hub note "Cepheid · Polaris · parallax" (will be created)
      → 12 wikilinks added to existing notes
      → 1 new note in /astronomy/

  ▢ Cepheid variable stars        — already mentions Cepheid (3×), parallax (1×)
  ▢ Polaris and the pole          — mentions Polaris (4×), parallax (1×)
  …
  [Apply]   [Cancel]   ☐ skip read-only roots
```

The user can uncheck specific notes (same affordance as KEYWORD_LINK's
preview). Apply runs at Chill pace through the existing root-aware saver,
emits one toast, registers an undo action that diffs the edge list back
out (same machinery BATCH_LINK uses).

## Safety properties

These mirror the safety floor in BATCH_LINK / KEYWORD_LINK:

- **Idempotent.** Re-running the same sentence on the same vault no-ops
  every member (skip if forward graph already contains target).
- **Read-only roots respected.** Sources in read-only roots are listed
  in the summary, never written.
- **Self-skip.** If a match also happens to be the resolved target, skip.
- **Preview always shown.** No silent batch writes from a sentence,
  regardless of |S|. The preview _is_ the consent.
- **Undo for ≤ 50 edits.** Beyond that, modal confirm (same threshold as
  BATCH_LINK §3).
- **LLM never decides selection.** If the local model is used, it
  parses intent or names a hub — the selection comes from a deterministic
  matcher the user can audit term-by-term.

## Why local LLM, not Claude

The local backend already has the right shape for this:

- **Privacy boundary.** The sentence references the user's vault terms;
  sending those to Claude over the network is a Phase-7 utterance and
  needs the explicit-approval flow. The local rig is "same boundary as
  writing to disk" per
  [local-backend.js](../boltzsidian/src/layers/utterance/local-backend.js#L17-L21)
  — fine for query parsing.
- **Latency.** Intent parsing is a single small completion. The local
  backend's existing 20s ceiling is more than enough; even a 7B
  instruct model lands in < 2 s on Michael's rig.
- **Fallback chain.** If the model is down, the deterministic parser
  catches the common cases. The feature degrades gracefully to "you must
  use a verb-prefixed template" rather than failing.

Claude backend stays available as a higher-cost rung in the fallback
chain for users who don't run a local rig — same as everywhere else in
the utterance subsystem.

## Why not pure embeddings

Tempting alternative: embed every note + every term, threshold the
cosine, that's the match set. Rejected for v1:

- New dependency (a transformer-tokenizer-and-embedder in the browser,
  or a server hop).
- Index has to be maintained on every note edit (current MiniSearch
  rebuild is already the bottleneck on big vaults).
- The user asked for "notes which mention" — literal wins on intent
  fidelity. The fuzzy MiniSearch tier already covers most synonym pain.

Embeddings stay on the table as a v2 widen mode (`semantic: true` flag),
gated behind a settings checkbox so the cost is opt-in.

## Recommended v1

Smallest defensible build:

1. Verb-prefix detection in `search.js` — if input starts with
   `connect|link|tag|weave`, switch to plan mode.
2. Deterministic parser for the four sentence shapes in the defaults
   table.
3. Match resolver = MiniSearch with `match=all` filtering.
4. Topology = hub (synthetic) when no target named; clique when "to
   each other" present.
5. Preview reusing the BATCH_LINK confirm/undo machinery.
6. Apply via existing Phase-3 saver.

Punted to v2:

- Local-LLM intent parsing for free-form sentences (Path B).
- LLM-named hub titles.
- `semantic: true` widen via embeddings or LLM-per-candidate judge.
- Tag topology.

Scope estimate for v1: ~1 day. Most of the cost is the preview pane;
the matcher and saver are already in place.

## Open questions

- **Where does the hint live?** A user typing `connect…` for the first
  time needs to discover the gesture exists. Options: a `Cmd+K` empty-
  state line ("try `connect notes mentioning X, Y`"), or a one-time
  coachmark, or just rely on hotkey-overlay docs. Smallest is a single
  empty-state line.
- **What about over-hub'd notes?** If the user runs `connect …` ten
  times with overlapping term sets, a popular note accumulates ten
  synthetic hubs. Probably fine — they're all valid groupings — but
  worth measuring after a week of use.
- **Should the hub be deletable as a "pure clique" sugar?** I.e. the
  user runs `connect … hub` for a week, then says "actually I want
  these to be cliqued, kill the hub" — do we have a "promote hub edges
  to clique" gesture? Not in v1; revisit if the pattern shows up.
- **Verb collisions.** If a user has a note titled `Connect` they may
  legitimately want to search for it. Prefix-only is already a guard
  (the verb has to be the first word). Plain-text searches for
  "connect" still work; only `connect ` (with trailing space and more
  text) triggers plan mode.

#feature #phase
