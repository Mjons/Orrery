---
tended_on: [tag-infer]
id: 01KPS7VDWB8BKJT77BQ9GV3E2M
created: "2026-04-21T19:08:18.427Z"
---

# SUGGESTIONS.md — Auto-suggesting tags and connections while writing

A focused design doc, triggered by Michael's note "I Love Untitled"
with body `Make it work\n[]` — the user literally typed the start of a
link and found nothing waiting there for them. The library-layer
librarian ([[LIBRARIAN]]) handles batched curation _after_ writing;
this doc is about what happens _during_ writing.

---

## 0. The moment

You open a new note. You type a sentence or two. You want to:

- attach it to something already in your vault (a link)
- tag it so it joins a cluster you've been building
- not have to remember the exact spelling of either

Current state:

- `[[` autocomplete against vault titles + ULIDs — **wired**, good.
- `#` autocomplete against existing tags — **not wired**. Typing `#m`
  should offer `#music`, `#michael`, `#morning-walk`; it doesn't.
- Passive "here are candidates" suggestions without a trigger character
  — **doesn't exist**.

Michael's screenshot shows the gap: the moment of "I want to link
something but don't know what's there" happens _all the time_, and we
have no affordance for it beyond "start typing `[[` and hope."

---

## 1. Three surfaces, not one

Three places suggestions could surface. Ship the first two; the third
is opt-in.

### 1.1 Inline autocomplete on trigger characters

What every Obsidian-adjacent editor does. Already done for `[[`; needs
to ship for `#`.

- User types `#` → tooltip pops with all vault tags, sorted by
  frequency in the vault overall with a light boost for tags used in
  notes this one is currently linked to or tagged adjacent to.
- Free-text completion (typing `#xyz` against `#xenon`) is handled by
  CodeMirror's built-in fuzzy matcher; we supply the candidate list.
- `Tab` or `Enter` accepts. `Esc` cancels. Identical ergonomics to the
  existing `[[` flow.

**Cost**: a few hours. One new completion source in
`src/editor/editor.js`, wired to `getVault().tagCounts`.

### 1.2 Passive suggestion chips below the editor

The surface that doesn't exist yet. A thin row beneath the CodeMirror
pane showing 3–6 dimly-glowing pills — **candidate tags** on the left,
**candidate links** on the right, with a ∙ separator. Click a pill to
insert it at the cursor. Dismiss a pill with `×` to not see it again
for this note.

Design:

```
                       ─── editor ends ───
  ╭──────────────────────────────────────────────────╮
  │  #decision  #panel-haus         ·                │
  │         [[First-run experience]]  [[Voice to panel]] │
  ╰──────────────────────────────────────────────────╯
  suggestions · shift+s to dismiss · shift+a to accept all
```

- Appears after the note has ≥ 20 words (don't spam empty notes).
- Only tags / links NOT already in the note. Dismissed pills stay
  dismissed.
- Ranked by signal (§2). Most-likely-true on the left.
- Subtle; never animates once shown. Hover brightens. Click inserts.

**Cost**: half a day. New DOM surface under the editor, debounced
updater on text-change, one keybind (`Shift+S` dismiss, `Shift+A`
accept all).

### 1.3 Post-save nudge (opt-in)

Rarely: on save, if the note just crossed a threshold (e.g. first 100
words) and we have high-confidence suggestions that didn't land in the
passive row, show a one-line toast:

> _"3 tags and 2 links look strongly right. Review?"_

Click → the Librarian drawer opens pre-filtered to this note.
Dismiss → gone. Never two toasts in a row.

**Cost**: another half-day, only worth it if §1.2 ships first and is
well-used. Behind a per-user toggle, default off.

---

## 2. Where the suggestions come from

Two tiers: cheap heuristics (always on) and LLM-assisted (opt-in,
shares the Librarian's key plumbing).

### 2.1 Cheap heuristics

All of these run in the browser, no network, no LLM. Together they
are "80% of the value for 0% of the cost."

| Signal                     | What it does                                                                     |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Tag frequency**          | The vault's most-used tags that don't appear in the note yet                     |
| **Tag co-occurrence**      | Tags that frequently appear in notes sharing a tag with this one                 |
| **Title-mention matching** | Scan the note body for strings matching existing note titles (case-insensitive)  |
| **BM25 neighbours**        | Re-use the MiniSearch index — top-scoring notes for the body's distinctive terms |
| **Folder kinship**         | If the note's folder has common tags, surface the ones not yet on this note      |

The title-mention signal is the biggest win for links. If you type
"Panel Haus" in the body and a note called "Panel Haus" exists, we
_should_ offer `[[Panel Haus]]`. This is not hard — `vault.byTitle`
already indexes every title.

### 2.2 LLM-assisted (opt-in)

Phase 8 librarian ([[LIBRARIAN]] §1.4 + §1.5) eventually fills the
same slots, but with smarter signal:

- Tag suggestions that capture semantic themes the heuristic missed.
- Link suggestions across different phrasings ("my dad" → `[[Dad]]`).

These backends plug into the passive row when enabled; the row's UX
doesn't change. A tiny icon on each pill shows whether its source was
heuristic (dot) or LLM (small sparkle). The user sees which.

---

## 3. Composition with the rest

- **Librarian drawer** ([[LIBRARIAN]]): batched review of proposals
  across the whole vault. This doc: suggestions for _this one note,
  right now_.
- **Tag discovery prompt**: fires at vault-open when the mapping
  covers < 80% of notes. Independent of per-note suggestions.
- **Note-panel read mode**: suggestions are edit-mode only. In read
  mode, there's nothing to accept.
- **Formations — Solo folder**: if active, bias tag/link candidates
  toward the solo'd folder.
- **Dream mode**: suggestions do not update during sleep-depth > 0.3.
  Dreaming is silent; writing wakes it.

---

## 4. What to skip

- **No "write this paragraph for you" completion.** Bottom-of-editor
  prose suggestion is a different product. Boltzsidian writes nothing
  inside a note body.
- **No grammar / style nudges.** Red/green underlines belong in
  Grammarly, not here.
- **No emoji pickers.** The app has one aesthetic anchor (the accent)
  and the text layer stays typographic.
- **No "rewrite for clarity" button.** If the user wants that, paste
  into their LLM of choice. Out of scope.
- **No suggestion for people or titles that don't exist in the vault.**
  Suggestions are always of things already in the vault. Inventing
  targets turns the tool into a speculative assistant, which is a
  different category.

---

## 5. Privacy

Same floor as the Librarian:

- Heuristic suggestions run entirely in-browser. Nothing leaves.
- LLM-assisted suggestions route through the existing utterance
  backend chain (local → webllm → claude). Payload is scoped to
  the current note body + candidate tag list + candidate title
  list. Never sends the whole vault.
- Respects `.universeignore` — notes in ignored folders are invisible
  to both the heuristic and the LLM.

---

## 6. Minimal first cut

Half a day of work, plus prompt tuning.

1. **`#` tag autocomplete** — clone the `[[` path in `editor.js`,
   match `/#[\w-]*/`, pull candidates from `vault.tagCounts` sorted
   descending. Ship by end of day.
2. **Title-mention detection** — run once per save (or on panel open)
   over the body text, match against `vault.byTitle`, emit candidates
   that aren't already linked. Sugar over existing indexes.
3. **Passive suggestion chip row** — new DOM under the editor, two
   flex rows (tags, links), debounced refresh on text change, pills
   accept on click, dismiss on `×`.
4. **Per-note dismiss set** kept in memory only — don't persist;
   users change their mind. Resets on panel close.

Skipping for v1:

- LLM-assisted suggestions (Phase 8 territory).
- Post-save toast (§1.3).
- Semantic neighbour ranking via affinity vectors (later, when the
  salience layer's vectors are stable enough to repurpose here).

---

## 7. Phase fit

Lands naturally in **Phase 3.8 (Heuristic librarian)** — same window
as tag normalisation, orphan rescue, link density check. All four
share the "surface vault-grounded signal without an LLM" posture.

Could be broken out as its own Phase 3.9 if 3.8 feels loaded, but the
engineering overlap (both touch tag/link computation over the vault
index) argues for keeping them together.

---

## 8. One sentence

Suggestions meet you in the sentence you're writing — not in a drawer
you have to remember to open — and they only ever propose things your
own vault already contains.

#user #phase #panel
