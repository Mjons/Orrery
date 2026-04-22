---
tended_on: ["obvious-link:01KPTWFK2AFEGK7SBDQD5V9HGX", "obvious-link:01KPS7VD7K6WKG085QCSXDVHJS", fm-normalise]
id: 01KPTWFKXNNVRCHH6958NA986D
created: "2026-04-22T15:12:14.607Z"
---
# TENDING_FIX_PLAN.md — The work plan

Follows from the diagnosis in
[TENDING_BUGS_ROOT_CAUSE.md](TENDING_BUGS_ROOT_CAUSE.md) and the
symptoms + recovery in
[TENDING_AGENT_MISFIRE_AUDIT.md](TENDING_AGENT_MISFIRE_AUDIT.md).

This doc is forward-looking: **what we're going to do, in what order,
with what acceptance criteria**. Adjacent bug notes still open:
[TEND_BULK_CRASH.md](TEND_BULK_CRASH.md),
[TEND_BULK_RESET.md](TEND_BULK_RESET.md),
[TEND_STAMP_MISMATCH.md](TEND_STAMP_MISMATCH.md).

## North star (the scope principle)

> Tending only adds or modifies `#tags` and `[[connections]]`.

That's the whole brief. Not filenames, not prose, not frontmatter
beyond a minimal `tended_on` stamp, not EOF wikilink dumps, not
pseudo-rewrites. If a proposed change doesn't fit "add or modify a tag
or a wikilink," the tending layer is the wrong place for it.

Every task below is evaluated against that principle.

## Current state

- **Kill-switch landed** ([save.js::maybeRename](../boltzsidian/src/vault/save.js#L118))
  — auto-rename gated on `settings.auto_rename_on_title === true`
  (default off). Filenames are safe.
- **Escape-runaway frontmatter** still active when tending writes.
  Self-amplifying. Must be fixed before enabling any batch flow.
- **EOF wikilink applier** still appending instead of inlining. Not
  destructive but against the scope principle.
- **~140 working-tree files** carry the corruption; they've been
  restored twice this session. Any future session that opens the app
  with the vault pointing at `docs/` or `boltzsidian/src/demo-vault/`
  will re-dirty them until the frontmatter fix lands.

## Work order

### Phase 0 — Prevent further damage (DONE)

- [x] Kill-switch in [save.js:118](../boltzsidian/src/vault/save.js#L118).
      Opt-in auto-rename; title-equality guard.

### Phase 1 — Fix escape runaway (frontmatter serializer)

**Priority: critical.** Self-amplifying YAML corruption compounds
geometrically with each save. Must land before any tending is safe to
run again.

**Files:** [boltzsidian/src/vault/frontmatter.js:34-78](../boltzsidian/src/vault/frontmatter.js#L34-L78)
(parser), [91-100](../boltzsidian/src/vault/frontmatter.js#L91-L100)
(serializer).

**Change 1 — serializer no longer recurses on string arrays.**
Replace [line 95](../boltzsidian/src/vault/frontmatter.js#L95):

```js
// BEFORE
if (Array.isArray(v)) return `[${v.map(stringifyScalar).join(", ")}]`;

// AFTER
if (Array.isArray(v)) {
  const items = v.map((x) => {
    const s = String(x);
    return /[:#\[\]"']/.test(s) || s !== s.trim() ? JSON.stringify(s) : s;
  });
  return `[${items.join(", ")}]`;
}
```

**Change 2 — parser uses `JSON.parse` for quoted scalars.** Wherever
the parser currently strips outer quotes with string slicing, replace
with `JSON.parse(raw)` when the value starts with `"`. This correctly
unescapes `\\` → `\` and prevents accumulation across saves.

**Acceptance criteria:**

- Round-trip 10× through
  `stringifyFrontmatter(parseFrontmatter(stringifyFrontmatter(...)))`
  with a `tended_on` array of colon-containing strings. Final byte
  count within 1% of cycle-1.
- Existing corrupted files (`"obvious-link: "ULID\\\\\\\\..."`) parse
  without throwing, and on next save collapse to clean form.
- No change to files with no frontmatter and no arrays.

**Test fixtures:** write three fixture files — a clean one, a
2×-amplified one, a 4×-amplified one — in `test/fixtures/frontmatter/`
and a vitest that exercises the round-trip.

### Phase 2 — Fix obvious-link applier (inline, don't append)

**Priority: high.** Violates the scope principle the most visibly.
Every session's tending output accumulates orphan `[[...]]` blocks at
EOF.

**File:** [boltzsidian/src/layers/tend-apply.js:102-118](../boltzsidian/src/layers/tend-apply.js#L102-L118).

**Change — replace first in-prose mention.** Full replacement:

````js
export function applyObviousLink(note, proposal, vault) {
  const target = vault?.byId?.get(proposal.linkTargetId);
  if (!target) return note.rawText;
  const body = note.body || "";
  const linkRe = new RegExp(
    `\\[\\[\\s*${escapeRegex(target.title)}\\s*(?:\\|[^\\]]*)?\\]\\]`,
    "i",
  );
  if (linkRe.test(body)) return note.rawText; // already linked
  const phraseRe = new RegExp(`\\b${escapeRegex(target.title)}\\b`);
  const m = phraseRe.exec(scrubbed(body));
  if (!m) return note.rawText; // no in-prose mention → no-op
  const newBody =
    body.slice(0, m.index) +
    `[[${target.title}]]` +
    body.slice(m.index + m[0].length);
  return replaceBody(note.rawText, body, newBody);
}

// Mask code fences, inline code, frontmatter, and existing
// wikilinks so the phrase search only hits prose. Positions stay
// valid because scrubbed() replaces matched regions with spaces of
// equal length.
function scrubbed(body) {
  return body
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length))
    .replace(/\[\[[^\]]*\]\]/g, (m) => " ".repeat(m.length));
}
````

**Acceptance criteria:**

- If the target's title doesn't appear in the body, the applier is a
  no-op (current bug: it appends anyway).
- If the target's title appears exactly once, it becomes a wikilink
  in place.
- If the target's title appears inside a code fence / inline code /
  existing wikilink, the applier is a no-op.
- Running the pass twice on the same note-target pair is idempotent
  (current bug: it can add another orphan).
- Nothing is ever appended to EOF.

**Non-goal:** the "synonym → see-also" Pass 3 refinement from
DOCS_AGENT.md. That's a later pass; start with literal-match only.

### Phase 3 — Harden the proposer

**Priority: medium.** The detector in
[tend.js](../boltzsidian/src/layers/tend.js) currently proposes short
or ambiguous link targets (`[[new]]`, `[[One accent]]`) that should
never have been candidates.

**Rules to enforce** (matching DOCS_AGENT.md Pass 3):

- Stem length ≥ 3 characters.
- Title must be a noun-phrase, not a common word. Heuristic: if the
  title appears as a standalone word in more than ~5% of notes, it's
  too common — skip.
- No proposals for targets whose own body has fewer than N words (a
  stub note isn't a useful link target yet).
- Per-note per-session cap (e.g. 8 obvious-link proposals max per
  note, per scan) — if one note gets 40 proposals, something's wrong
  upstream.

**Acceptance criteria:** on a fresh demo-vault scan, zero proposals
with common-word targets. If a proposal survives, it's because the
target is a real concept note with enough body to matter.

### Phase 4 — Re-enable rename (eventually)

**Only after Phases 1–3 are green and soaked for a week.**

**File:** [boltzsidian/src/vault/save.js:118](../boltzsidian/src/vault/save.js#L118).

Steps:

1. Fix [titleToStem](../boltzsidian/src/vault/writer.js#L94) to strip
   `.md` substrings and em-dashes so the docs convention
   `# FILENAME.md — Subtitle` produces a clean stem.
2. Change the saver to pass a `skipRename` flag and default it `true`
   for anything flowing through `tend-apply.js`. Only interactive
   editor saves that actually changed the H1 can flip it `false`.
3. Keep the opt-in setting `auto_rename_on_title` but change the
   default to `true` **only** after a week of clean sessions.

**Acceptance criteria:** user edits an H1 in the editor → file
renames on disk. Accepts a batch of 200 tend proposals → no file
renames.

## What we're NOT doing

- Not building a YAML library. The existing parser/serializer is
  fine, it just has a double-escape bug. Fix it in place.
- Not reworking the tend proposer architecture. Scope principle gates
  every proposal; the existing pipeline is OK once it's honest about
  scope.
- Not adding a dry-run / preview mode right now. The kill-switch is
  sufficient until Phase 1 lands.
- Not refactoring `tend-apply.js` structure. Per-pass appliers stay;
  only the wrong one gets rewritten (Phase 2).
- Not touching [DOCS_AGENT.md](DOCS_AGENT.md). The spec is fine; the
  code drifted from it.

## Rollout strategy

Each phase ships on its own commit. Between phases:

1. **Soak period.** Open the app with the vault pointing at
   `boltzsidian/src/demo-vault/`, accept tend proposals, check
   `git status` — expected zero damage. Leave open for an hour;
   recheck.
2. **Existing corruption clears itself.** Once Phase 1 ships, every
   file the user saves (via editing, tending, or any other path)
   normalises its frontmatter. The ~140 already-corrupted files
   heal naturally over use. No migration script needed.

## Test checklist (applies across phases)

Add to `boltzsidian/test/` when Phase 1 lands:

- [ ] `frontmatter.roundtrip.test.js` — 10× round-trip idempotence.
- [ ] `frontmatter.corruption.test.js` — parses historically-bad
      fixtures and serializes them clean.
- [ ] `titleToStem.test.js` — docs-convention H1 never produces a
      stem containing `.md-—-`.
- [ ] `applyObviousLink.test.js` — in-prose inlining, no EOF appends,
      idempotent.
- [ ] `tendProposer.test.js` — no proposals with 2-char titles or
      common-word targets.

Don't block Phase 1 on a full test suite — a single round-trip
fixture test is enough to catch the regression if the escape bug
ever resurfaces.

## Definition of done for the whole initiative

All four checks pass simultaneously:

1. Leave the app open on a vault pointed at `docs/` for 30 minutes.
   `git status` shows zero modified files afterward.
2. Accept-all on a 200-proposal batch. No file renames. No orphan
   EOF wikilinks. Frontmatter `tended_on` grows by one entry per
   proposal, no escape-runaway.
3. The kill-switch `settings.auto_rename_on_title` can be flipped
   `true` without reproducing the rename storm — because a tending
   pass never flows through the rename branch anymore.
4. No proposer output for `[[new]]`, `[[One accent]]`, or any title
   shorter than 3 characters.

When all four hold, this doc is closed.

#tending #plan #frontmatter #rename #scope
