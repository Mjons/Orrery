# TENDING_AGENT_MISFIRE_AUDIT.md — What the tending agent did to the working tree

Status: **working-tree damage, not yet committed**. Latest HEAD
(`df56239`) is clean. Everything below lives in the unstaged / untracked
area.

## TL;DR

The tending agent ran on `docs/`, `boltzsidian/`, and
`boltzsidian/src/demo-vault/**` and did four overlapping things, all
visible as a unified mess in `git status`:

1. **Renamed ~33 `docs/*.md` files** to double-extension `.md-—-Title.md`
   form (em-dash between original name and kebab-case title).
2. **Renamed a handful of demo-vault notes** to title-case new names
   (no double-extension; cleaner but destructive to the kebab-case
   convention, and it orphans any `[[kebab-case]]` wikilinks pointing
   at them).
3. **Added garbage to frontmatter** of ~59 docs and ~80 demo-vault
   notes — a growing `tended_on` ULID list, plus a malformed sibling
   line with runaway backslash escaping.
4. **Appended orphan wikilinks** — bare `[[Title]]` blocks, one per
   blank-line, stacked at the END of each modified file. Not
   integrated with the prose. Not tied to any see-also header.

**No data loss.** Every `deleted` file has a rename counterpart.
Checked end-to-end.

**Staged code changes are clean.** The modifications under
`boltzsidian/src/*.js` and the new source files (`render-quality.js`,
`quality-hud.js`, `quality-monitor.js`, `dream-theme.js`) are legit
work that should survive the recovery. Only the vault / docs edits are
damaged.

## Scope — what got touched

Counts from `git status --porcelain`:

| Category                                   | Count |
| ------------------------------------------ | ----- |
| Deleted files (all have rename pairs)      | 28    |
| Untracked files (rename targets + genuine) | 35    |
| Modified tracked files                     | ~95   |
| Staged code/docs (intentional, unaffected) | 14    |

### By folder

- **`docs/`** — 28 files renamed to `.md-—-Title.md` form. 59 files
  have `tended_on` frontmatter additions. Many have orphan wikilinks
  appended.
- **`boltzsidian/CLAUDE.md`** — renamed to `CLAUDE.md-—-Boltzsidian-branch.md`.
- **`boltzsidian/src/demo-vault/**`\*\* — ~80 notes modified (frontmatter +
  orphan wikilinks). 4 notes renamed to title-case variants:
  - `objects/m51-whirlpool.md` → `objects/M51-Whirlpool-Galaxy.md`
  - `project/index.md` → `project/Two-projects.md`
  - `project/boltzsidian/index.md` → `project/boltzsidian/Boltzsidian.md`
  - `project/boltzsidian/phases/phase-3-physical-linking.md` →
    `project/boltzsidian/phases/Phase-3-—-physical-linking.md`

## The four damage patterns

### 1. Rename Pattern A — docs folder (double-extension)

`{STEM}.md` → `{STEM}.md-—-{Title-As-Kebab}.md`

Examples:

- `AMBIENCE.md` → `AMBIENCE.md-—-Cluster-auras-and-the-feel-of-the-universe.md`
- `DOCS_AGENT.md` → `DOCS_AGENT.md-—-Organize-the-docs-in-this-folder.md`
- `BOLTZMANN.md` → `BOLTZMANN.md-—-Fleeting-Observers-in-an-Indifferent-Field.md`

33 files in `docs/`, 1 in `boltzsidian/`. The `MOVIE.md-—-Film-Mode.md`
rename from commit `57ef812` was the same pattern leaking into history.

**Why it's wrong:** double `.md` extension is invalid in every markdown
ecosystem. Tool and editor integrations that expect a `.md` suffix will
see the filename as `.md` (first occurrence) or fail entirely. The
em-dash in filenames is hostile to filesystems that normalize
differently across macOS/Windows/Linux.

### 2. Rename Pattern B — demo-vault (title-case replacement)

`kebab-case-original.md` → `Title-Case-Words.md` or `Title-—-subtitle.md`

Examples:

- `m51-whirlpool.md` → `M51-Whirlpool-Galaxy.md`
- `project/index.md` → `Two-projects.md`
- `project/boltzsidian/index.md` → `Boltzsidian.md`
- `phase-3-physical-linking.md` → `Phase-3-—-physical-linking.md`

**Why it's wrong:** breaks the kebab-case convention the demo vault
uses everywhere else. Any `[[phase-3-physical-linking]]` reference in
another note now targets a missing stem (though we grepped — no such
references exist in the current vault; the risk is future ones).

Also: `index.md` is a _structural_ filename — Boltzsidian, Obsidian, and
most tools treat it as the folder's landing page. Renaming it to
`Boltzsidian.md` loses that semantics.

### 3. Frontmatter corruption

Every touched `.md` grows two lines in its frontmatter block:

```yaml
tended_on: ["obvious-link:01KP...", "obvious-link:01KP...", ...]
"obvious-link: "01KP...\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\...\\\\","
```

The first line is a _legitimate_ YAML list that grows on each tending
pass — ULIDs of each pass's output. Harmless but spammy.

The second line is **malformed YAML**. It looks like the tending pass
tried to record a single obvious-link but serialized it through
multiple escape rounds, producing a line with 80+ backslashes. This
will break any strict YAML parser. The boltzsidian frontmatter parser
at [boltzsidian/src/vault/frontmatter.js](../boltzsidian/src/vault/frontmatter.js)
is lenient, which is why the app hasn't crashed, but any round-trip
through a real YAML library will reject or mangle it.

### 4. Orphan wikilinks appended

At the bottom of every modified note (below the existing `#tag` line if
present), a block like:

```
[[Notes]]

[[new]]

[[One accent]]

[[Michael]]

[[Boltzsidian]]
```

Each wikilink on its own line, separated by blank lines. Some wikilinks
target strings that aren't notes (e.g. `[[new]]`, `[[One accent]]` —
phrases from the author's guidance, not real stems). Others target
real notes (`[[Boltzsidian]]`, `[[Michael]]`).

**Why it's wrong:** these don't live in prose. They read as a dumping
ground for the tending agent's "related-note" guesses. The intended
behavior (per [DOCS_AGENT.md](./DOCS_AGENT.md-—-Organize-the-docs-in-this-folder.md)
Pass 3) was to wikilink the FIRST mention of a sibling stem _in-prose_
— not to append a trailing list of bare links.

The tending agent appears to have conflated Pass 3 (wikilinks in prose)
with Pass 4 (opt-in See-also bullet list) and implemented neither
correctly.

## Why this happened — best guess

Looking at the two contributing agents:

- **[DOCS_AGENT.md](./DOCS_AGENT.md-—-Organize-the-docs-in-this-folder.md)**
  was hardened in commit `5146b26` with a stronger Pass 3 and a new
  Pass 5 (hub doc). But the spec never authorized filename changes.
- The **tend-apply layer** ([boltzsidian/src/layers/tend-apply.js](../boltzsidian/src/layers/tend-apply.js))
  plus the chorus/suggestions system can record "obvious-link" edits.
  That's what's writing the `obvious-link:ULID` frontmatter entries —
  each entry is a bookkeeping stamp of an accepted suggestion.

The three things that combined to produce this mess:

1. An in-session batch-accept run (Tend drawer "Accept all") applied
   proposals faster than the frontmatter writer could serialize them,
   producing the escape-runaway `"obvious-link: "..."` lines.
2. A separate filename-based pass — probably triggered by an agent
   reading DOCS_AGENT.md and going beyond its brief — started
   renaming files to include their titles, but picked the worst
   possible pattern (append-with-em-dash → double extension).
3. The wikilink-append behavior is the chorus "related notes" list
   being dumped verbatim at EOF instead of integrated into prose.

See also: [TEND_BULK_CRASH.md](./TEND_BULK_CRASH.md-—-The-page-crashes-~300-accepts-into-a-1280-proposal-batch.md)
and [TEND_BULK_RESET.md](./TEND_BULK_RESET.md-—-Why-does-Accept-all-reset-the-page-after-~150.md)
— those were written in this same session and describe the same
runaway-apply behavior in the tending system. Adding filename damage
to the existing bulk-crash issue means the Tend pipeline has _three_
bugs, not one.

## Data-loss check — confirmed none

For every deletion, there is a rename pair. Verified by diffing:

```
boltzsidian/CLAUDE.md                      → CLAUDE.md-—-Boltzsidian-branch.md
m51-whirlpool.md                           → M51-Whirlpool-Galaxy.md
project/index.md                           → Two-projects.md
project/boltzsidian/index.md               → Boltzsidian.md
phases/phase-3-physical-linking.md         → Phase-3-—-physical-linking.md
docs/AMBIENCE.md                           → AMBIENCE.md-—-Cluster-auras-...md
docs/BATCH_LINK.md                         → BATCH_LINK.md-—-Adding-...md
... (all 28 deletions paired)
```

Prose in each rename is preserved, frontmatter and trailing wikilinks
are additions. Nothing is gone.

## Recovery plan

A fully reversible, three-phase cleanup. Each phase should be verified
before proceeding to the next.

### Phase 1 — Restore original filenames

**Priority: do this first.** Filenames determine wikilink resolution;
fixing them is the only bit that has downstream effects on the rest of
the vault's semantics.

Bash one-liner (dry-run first):

```bash
# Dry run — list what would be renamed
for f in docs/*.md-—-*.md boltzsidian/CLAUDE.md-—-*.md; do
  new="${f%%.md-—-*}.md"
  echo "mv \"$f\" \"$new\""
done

# Then execute the block without the `echo` wrapper.
```

For the 4 demo-vault Pattern B renames, restore manually by moving the
new file back to the old kebab-case name:

```bash
mv "boltzsidian/src/demo-vault/objects/M51-Whirlpool-Galaxy.md"      boltzsidian/src/demo-vault/objects/m51-whirlpool.md
mv "boltzsidian/src/demo-vault/project/Two-projects.md"              boltzsidian/src/demo-vault/project/index.md
mv "boltzsidian/src/demo-vault/project/boltzsidian/Boltzsidian.md"   boltzsidian/src/demo-vault/project/boltzsidian/index.md
mv "boltzsidian/src/demo-vault/project/boltzsidian/phases/Phase-3-—-physical-linking.md" boltzsidian/src/demo-vault/project/boltzsidian/phases/phase-3-physical-linking.md
```

After this phase, `git status` should show all files as **modified**
(not deleted+untracked).

### Phase 2 — Revert prose modifications to demo-vault + docs

The safest lever is `git restore`:

```bash
# Restore every modified .md to its HEAD content.
git restore -- boltzsidian/src/demo-vault/ docs/ boltzsidian/Boltzsidian.md CHANGELOG.md CLAUDE.md Universe-Sim.md
```

This wipes the frontmatter corruption AND the orphan-wikilink blocks
in one shot. Caveat: it also wipes any intentional edits made to those
files in the same session. Cross-check: the only intentional demo-vault
edit I'm aware of is the DOCS_AGENT.md rewrite (commit `5146b26`,
already safe in HEAD).

`docs/MOVIE.md-—-Film-Mode.md` was renamed in committed history
(`57ef812`). If we want to _undo_ that too (recommended — same pattern
as the misfire), do a separate `git mv`:

```bash
git mv "docs/MOVIE.md-—-Film-Mode.md" "docs/MOVIE.md"
```

### Phase 3 — Stage only the intentional code/docs work

After phases 1–2, the working tree should contain:

- Staged code changes (auto-throttle, avatar quality, dream themes, etc.)
- 5 new design docs (AVATAR_QUALITY.md, RENDER_QUALITY.md,
  DREAM_THEMES.md, TEND_BULK_CRASH.md, TEND_BULK_RESET.md)
- This audit doc (TENDING_AGENT_MISFIRE_AUDIT.md)
- The docs I created this session that were renamed: DREAM_GRAVITY.md,
  MODEL_FACE_OBSERVER.md, STAR_CHARTS.md

Those are the commit.

## Preventing this next time

Three fixes, ordered by effort:

1. **Sandbox the tend-apply writer** so it can only modify frontmatter
   and prose, never rename files. File renames should require an
   explicit user confirmation. Quick win.
2. **Fix the frontmatter escape bug** in the Tend pipeline —
   whichever pass is producing `"obvious-link: "ULID\\\\..."` lines
   is double-serializing. See [TEND_BULK_CRASH.md](./TEND_BULK_CRASH.md-—-The-page-crashes-~300-accepts-into-a-1280-proposal-batch.md)
   for related work on the batch-accept failure mode.
3. **Change the orphan-wikilink behavior** — either inline the links
   into prose (per DOCS_AGENT.md Pass 3 spec), or put them under an
   explicit `## Related` header that the user can opt into. Appending
   bare wikilinks to EOF is nobody's desired behavior.

## What I recommend we do right now

1. Read this doc. Sanity-check my reading of the damage.
2. Run Phase 1 (filename restore) as a single scripted pass.
3. Run Phase 2 (`git restore` the .md files) once filenames are back.
4. Verify `git status` shows only the intentional code/docs work.
5. Commit + push that narrow set.
6. Open an issue (or a TODO in `BACKLOG.md`) capturing the three
   tend-pipeline bugs so we don't hit this again tomorrow.

Do NOT commit the current working-tree state.

#tending #bug #recovery #audit
