---
id: 01KR0000KEYWORDLINK000000
created: 2026-04-22
---

# KEYWORD_LINK.md — Wrap every mention of a keyword as a wikilink to a picked target

Sibling to [[BATCH_LINK]]. BATCH_LINK scopes selection by
constellation — right-click a cluster, pick a target, every member
of the cluster gets `[[Target]]` appended at the end of its body.
This doc specifies the **keyword-scoped** path: the user types a
phrase (e.g. "the API"), picks a target note (e.g. `[[Claude SDK]]`),
and the app wraps every in-prose occurrence of that phrase as
`[[Claude SDK|the API]]` across the entire vault. Prose reads
naturally, the link resolves to the exact target the user meant.

Where BATCH_LINK's strength is "this region should all point at
this hub," KEYWORD_LINK's is "every time I wrote 'the API', I
meant this note."

---

## 0. Premise

Users coin shorthand for concepts long before they formalise the
noun. A project might be called "the pipeline" in a dozen notes
before "Pipeline V2" becomes a formal region. Once the formal note
exists, the user wants to backfill — make those twelve older
mentions clickable without opening twelve files.

Today Boltzsidian offers:

- **Tend** `obvious-link` pass: proposes links when a note's
  FULL TITLE is mentioned in another note's body. Doesn't help
  for synonyms.
- **BATCH_LINK**: constellation-level apply. Doesn't help when
  the mentions are scattered across clusters.
- **Manual edit + wikilink**: open each note, find, type. Slow at
  any scale.

Gap: a way to say "these 12 scattered phrases all mean this one
target." KEYWORD_LINK fills it.

---

## 1. End-to-end example

1. User has a note "Pipeline V2" in `/projects/`.
2. Ten other notes scattered across folders mention "the pipeline"
   or "Pipeline" in their bodies.
3. User hits `Cmd+Shift+L` (or Settings → Tend → Link keyword).
4. Modal opens with two fields:
   - **Keyword / phrase**: user types `pipeline` (or pastes a
     multi-word phrase).
   - **Link to**: autocomplete picker, user selects "Pipeline V2".
5. **Preview** step shows grouped matches:
   - `notes/design-log.md`: `"…the pipeline architecture is…"` →
     will become `"…the [[Pipeline V2|pipeline]] architecture is…"`.
   - `notes/retro-q1.md`: 3 matches, first one will be wrapped.
   - (per-match checkboxes so user can skip specific instances)
6. User reviews, unchecks one false-positive, clicks **Apply**.
7. App runs the write loop at Chill pace (250 ms per file).
8. Toast summary: `Linked 11 mentions of "pipeline" to [[Pipeline
V2]] · 1 skipped by you · 1 already linked`.

Done. No note panel opened, no file hand-edited.

---

## 2. Inputs

### 2.1 Keyword / phrase

- Single word or multi-word phrase.
- Case-insensitive by default. Checkbox to require case match
  (opt-in for acronyms like `API` vs `api`).
- Minimum length 3 chars — avoid "it", "an", "of" trivial matches.
- Internal whitespace in the phrase matches any whitespace
  (space, tab, newline) so soft-wrapped prose still matches.

### 2.2 Target note

- Autocomplete picker over `vault.notes`, same component
  BATCH_LINK uses.
- Seeded with the keyword as the initial filter — often the user
  IS picking a note named after the keyword (the common case,
  Option A from the prior discussion).
- If the typed target doesn't match any note, prompt: "Create
  `<title>` in writeRoot and link to it?" — opt-in note creation,
  same pattern as BATCH_LINK.

### 2.3 Scope (optional filters)

Reveal with a "Scope…" expando:

- **Root**: `All roots` (default) / a specific root.
- **Folder**: `Any folder` / a specific top-level folder.
- **Tag**: `Any tag` / a specific tag.
- **Already-linked notes**: `Skip` (default) / `Include`.

All v1 can ship with just the first option. Folder/tag are
one-liners on top of the filter path. Ship unscoped first.

---

## 3. Matching rules

### 3.1 What counts as a match

- **Word-boundary** regex around the phrase: `\bphrase\b`
  (case-insensitive by default).
- Multi-word: `\bword1\s+word2\b` (whitespace between words
  tolerates any single or multi-space break).
- Escaping: special regex chars in the phrase are escaped before
  composition so a user's `C++` or `foo.bar` works literally.

### 3.2 What's excluded

Scrub these regions from the body before matching (same logic
`applyObviousLink` now uses):

- Fenced code blocks ` ``` `.
- Inline code `` `foo` ``.
- Existing wikilinks `[[…]]`.
- Existing markdown links `[text](url)`.
- URLs (`https?://…`).
- The note's own title (first `# H1`).
- Frontmatter (everything between `---` blocks at the top).

Matches inside these regions are ignored.

### 3.3 First-per-paragraph rule

Same as `applyObviousLink`: if a paragraph has multiple matches,
wrap only the first. Keeps prose readable. The other mentions
remain plain text; a reader who wants to jump to the target
clicks the first one.

Paragraph boundary = blank line (`\n\n+`). Single-line headings
count as their own paragraph.

### 3.4 Already-linked detection

If the note's body ALREADY contains `[[Target]]` or
`[[Target|anything]]` anywhere, that note is marked "already
linked" in the preview and excluded from the apply by default.
The user can opt-in via the Scope checkbox to re-include.

Self-link (target's own note is in the match list) is always
skipped.

---

## 4. Preview stage

Non-optional. KEYWORD_LINK without a preview is a foot-gun —
one mis-cased phrase could blanket the vault in wrong links.

### 4.1 Layout

Modal, ~560 px wide. Above the match list:

```
Linking [pipeline] → [[Pipeline V2]]          [Change]
Vault-wide · case-insensitive                 [Scope…]
```

Below: scrollable list of match groups, one per note:

```
▸ notes/design-log.md                              1 match
    …the pipeline architecture is the part we've never…
    →  …the [[Pipeline V2|pipeline]] architecture is the part we've never…

▸ notes/retro-q1.md                                3 matches
    [shows each match, first wrapped, rest plain]

▸ projects/pipeline-v2.md                          self — skipped
```

### 4.2 Interactions

- Each match is a checkbox-defaulted-to-on row.
- Click to expand a note → see full surrounding paragraph.
- Uncheck individual matches or "Skip this note" to disable all
  matches for that note.
- "Apply all" button reads the current checkbox state.
- Cancel button closes without writing.

### 4.3 Counts bar at top

```
58 matches across 19 notes · 3 already-linked notes skipped
```

Live-updates as the user unchecks.

### 4.4 Safety threshold

- Matches > 100: inline warning "This will touch N notes. Review
  carefully before applying."
- Matches > 500: Apply button requires a second confirm click.

---

## 5. Apply step

Reuses BATCH_LINK's plumbing:

1. Collect the final match list (one entry per note, with the
   first-in-each-paragraph byte offsets).
2. For each note, build `nextText` by walking offsets in reverse
   (so earlier indexes don't shift after insertions). Wrap each
   match as `[[<target-token>|<matched-text>]]` where
   `<target-token>` is `target.title` or `target.id` if the title
   collides across roots (same logic from `composeBatchLinkToken`).
3. `await saver(note, nextText)` — Phase-3 root-aware saver handles
   read-only declines.
4. Yield between writes at the user's **Bulk pace** setting
   (Chill default = 250 ms), so KEYWORD_LINK shares the same
   no-crash guarantee as BATCH_LINK.
5. Running abort flag from [[TEND_BULK_CONCURRENCY]] — if the
   user opens the modal again mid-apply, the old loop aborts.

### 5.1 Reusing applyObviousLink

`applyObviousLink` (exported from `tend-apply.js`) already does
the first-match-in-prose + excluded-regions logic for ONE
occurrence of the target's title. For KEYWORD_LINK we need:

- Different search pattern (keyword, not target title).
- Different replacement tokens (handle collision-proof token).
- **Multiple** replacements per body (first per paragraph, not
  just first overall).

Clean path: extract a pure helper `wrapKeywordInBody(body, {
keyword, targetToken, caseSensitive }) → { nextBody, matches }`,
and have both callers (KEYWORD_LINK apply + any future per-note
invocation) share it. `applyObviousLink` stays as the tend-path
adapter; the new helper is the core mutator.

---

## 6. Entry points

### 6.1 Cmd+Shift+L (primary)

Global hotkey. Opens the modal with empty fields. Works anywhere
except inside text inputs (respects the `isEditable` guard already
wired for other hotkeys).

Why `L`: mnemonic for "link." `L` alone toggles label mode;
`Cmd+Shift+L` is free.

### 6.2 Cmd+K → action (secondary)

When the search strip has results, expose an action row:
`Link mentions of "<query>" to…` that opens the modal pre-filled
with the query as keyword + an empty target.

Discoverability bonus — many users live in Cmd+K already.

### 6.3 Editor selection right-click (v2)

When the user selects text in the note panel editor and right-
clicks the selection, menu offers "Link all mentions to…" —
opens the modal with the selection as keyword, the current
note's title as the default target guess.

Requires right-click menu support in the editor, which today
CodeMirror handles but Boltzsidian doesn't specialise. Defer.

### 6.4 Settings → Tend → Link keyword button

For discoverability. Same modal.

---

## 7. Edge cases

- **Target note is itself in the match list.** Always skipped (the
  target linking to itself is degenerate).
- **Matched text equals target title exactly.** Write
  `[[Target]]` without alias — cleaner.
- **Matched text differs only in case.** Write `[[Target|matched]]`
  with alias so the prose preserves the author's casing.
- **Keyword contains regex metacharacters** (`C++`, `foo.bar`,
  `A|B`): escape literally before composing the word-boundary
  regex.
- **Phrase crosses a line break.** Regex `\s+` between words
  handles single breaks. Multi-paragraph keywords are rejected
  at input: "keyword must be a single phrase."
- **Target title itself contains the keyword** (e.g., keyword
  "pipeline", target "Pipeline V2"). The target note's body
  content would match, but we exclude the target from the match
  list anyway. Other notes whose titles contain the keyword (not
  just their bodies) could surprise the user — we only match
  body text, never titles, so this is safe.
- **Read-only root members.** Saver declines; entry appears in
  summary as "N read-only skipped."
- **A note with 50 matches of the keyword.** First-per-paragraph
  rule caps the practical count. If the note is one huge
  paragraph with 50 mentions, only the first gets wrapped; the
  rest remain plain text. Acceptable.
- **User undoes mid-apply.** Apply is file-by-file; abort flag
  (TEND_BULK_CONCURRENCY pattern) stops the loop. Already-written
  files stay written — manual revert per file.
- **Keyword too generic** (e.g., "the"). Match count may exceed
  thousands. Safety threshold at 500 requires explicit confirm.
  Past 10,000 we just refuse: "Too broad a keyword for this
  tool. Narrow the phrase."

---

## 8. Interactions with existing features

- **[[BATCH_LINK]]**. KEYWORD_LINK and BATCH_LINK are siblings —
  one scopes by cluster membership, the other by keyword match.
  Share the saver, the target picker, the collision-proof token,
  and the bulk loop with pace/abort semantics.
- **Tend `obvious-link` pass.** Tend looks for title mentions
  and PROPOSES. KEYWORD_LINK lets the user ACT on any
  keyword, with manual target selection. They don't compete;
  tend is the ambient janitor, keyword-link is the precision
  tool.
- **[[RENDER_QUALITY]]**. Apply loop respects the Bulk pace
  setting from [[TEND_STAMP_MISMATCH]] §7.5 — Chill by default.
  No new pace knob.
- **[[MULTI_PROJECT]]**. Respects read-only roots; cross-root
  links written with the collision-proof `[[id|alias]]` token
  when the target's title exists in multiple roots.
- **Tended_on stamp.** KEYWORD_LINK is manual, not a tend pass;
  does NOT stamp `tended_on`. Future tend scans can still re-
  propose their own obvious-link suggestions — but since the
  user's link is already in the body, `applyObviousLink`'s
  already-linked check will skip them.
- **[[LIVE_CLUSTERS]] (planned)**. New edges added by
  KEYWORD_LINK will trigger the repartitioner once shipped.
  Before it ships, a Rescan may be needed to see new cluster
  membership. Not blocking.

---

## 9. What to deliberately skip

- **Regex input.** Tempting. A power-user escape hatch for
  patterns like `\bpipeline(s|V2)?\b`. Adds a parser sanity
  surface, a way for users to accidentally match `^[\s\S]*$` and
  break things. Keep the input to literal phrases; power users
  can run multiple passes.
- **Saving a "keyword map" that re-applies on every new note.**
  This is re-inventing the tend `obvious-link` pass with a user-
  editable dictionary. Big scope, better suited to a dedicated
  KEYWORD_MAP.md in the future. Today: the user runs the tool
  when they want the backfill.
- **Auto-linking while typing.** Distracting. The whole point
  of the manual modal is that the user gets to see the diff
  before committing.
- **Cross-vault keyword linking.** Not a thing Boltzsidian does
  yet; defer until multi-vault composition is on the roadmap.
- **Synonym expansion via model.** Could expand "pipeline" to
  ["pipeline", "the pipeline", "pipeline v2", "our pipeline"].
  Interesting, but model-dependent, and the user can just run
  the tool three times for three phrasings.

---

## 10. Implementation phases

### Phase A — Core matcher · ~1 h

1. New pure helper `wrapKeywordInBody(body, { keyword,
targetToken, caseSensitive }) → { nextBody, matches }` in
   `src/layers/keyword-link.js` (new module).
2. Excluded-regions scrub (code fences / inline code / wikilinks /
   markdown links / URLs / frontmatter).
3. First-per-paragraph wrapping rule.
4. Unit-testable — no DOM, no vault, pure string in/out.

### Phase B — Vault scan + preview data · ~1 h

1. `scanVaultForKeyword(vault, { keyword, targetId, scope,
caseSensitive }) → { matches: [{ note, occurrences }],
alreadyLinked: [...] }`.
2. Builds the list of (note, per-paragraph byte offsets).
3. Filters self-link + already-linked (unless user opted in).
4. Pure — no writes.

### Phase C — Modal UI · ~2 h

1. New module `src/ui/keyword-link-picker.js`.
2. Keyword input + target autocomplete (reuse
   `batch-link-picker`'s pattern).
3. Scope expando.
4. Preview list with per-match checkboxes.
5. Apply / Cancel buttons + safety threshold confirm.

### Phase D — Apply loop · ~45 min

1. `applyKeywordLink(selection, target, saver) → { written,
skipped, readOnly, failed }`.
2. Reuses `isBulkInProgress` + abort flag from
   TEND_BULK_CONCURRENCY.
3. Respects `tend_bulk_pace` (yields at user's preferred
   tempo).
4. Rebuilds physics/tethers once at end of loop (rAF-coalesced
   via scheduleGraphRebuild).

### Phase E — Entry points · ~30 min

1. `Cmd+Shift+L` hotkey in `main.js`.
2. Cmd+K search result action row.
3. Settings → Tend → Link keyword button.

**Total: ~5.25 hours.** A full day.

Editor-selection right-click (§6.3) deferred to v2.

---

## 11. Verification

1. Fresh vault with 20 notes. One is `pipeline-v2.md` titled
   "Pipeline V2". Ten others mention "pipeline" (mixed case) in
   prose.
2. `Cmd+Shift+L` → keyword `pipeline` → target `Pipeline V2` →
   Preview.
3. Modal shows 10 notes, 14 matches (some notes have multiple).
   `pipeline-v2.md` is marked self, skipped.
4. Uncheck one obvious-false-positive match.
5. Apply → writes 13 matches across 10 files. No crashes.
6. Open `design-log.md` → body shows
   `…the [[Pipeline V2|pipeline]] architecture…`.
7. Open the 3D view → 10 new tethers flow into Pipeline V2.
   Gradient direction shows them arriving (TETHER_DIRECTION
   working).
8. Run Tend. `obvious-link` proposes 0 new pipeline matches —
   already linked, respected.

---

## 12. One sentence

KEYWORD_LINK is a precision complement to BATCH_LINK: where
BATCH_LINK takes "this region points at this hub," KEYWORD_LINK
takes "every time I wrote this phrase, I meant this note" and
backfills the wikilinks across the whole vault with a preview
step, first-per-paragraph wrapping, and alias-preserving prose
so the reader never knows the links weren't always there.

#keyword #link #batch #backfill
