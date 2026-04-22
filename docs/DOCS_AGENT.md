# DOCS_AGENT.md — Organize the docs in this folder

Drop this file into any folder of `.md` notes. When an agent is
invoked with "run DOCS_AGENT.md on this folder" (or similar), it
executes the passes below over every sibling markdown file. The job
is to turn a pile of docs into a connected, tagged knowledge graph —
Obsidian / Boltzsidian style — without rewriting the authors' prose.

## Scope

- Operates on every `*.md` file in the SAME FOLDER as this file.
- Do NOT recurse into subfolders.
- Do NOT touch `DOCS_AGENT.md` itself.
- Do NOT delete notes.
- Do NOT create new notes EXCEPT for the single hub doc described in
  Pass 5. That's the one exception — the hub is what makes the folder
  cluster together instead of landing as a cloud of disconnected
  singletons in Boltzsidian.

## Invocation

The agent should be given one instruction: "Run DOCS_AGENT.md on this
folder." It reads this file, then executes passes 1–5 on every
sibling. Each pass is idempotent — re-running the agent must produce
no diff when nothing has changed.

## Why connectivity matters

Boltzsidian derives its "constellations" (regions of the universe)
from the **link graph** via label-propagation clustering. Docs with
no wikilinks to any sibling stay as singleton clusters — visually a
scattered mess, not a region. A folder of great writing that never
says any sibling's stem by name will cluster into chaos. Pass 5 fixes
that by guaranteeing every folder has a hub every doc links to.

---

## Pass 1 — Frontmatter

Every doc ends up with a YAML frontmatter block at the very top:

```yaml
---
id: <ULID>
created: <ISO-8601>
---
```

- `id:` — generate a ULID if missing. Preserve if present.
- `created:` — use file mtime if accessible; otherwise today's date.
- Every other frontmatter key the author wrote stays VERBATIM. Order
  preserved, comments preserved, arrays preserved.
- If there is no frontmatter at all, add one. If there IS frontmatter,
  only add the missing keys.

## Pass 2 — Tags

Append one line at the very bottom of each doc: `#tag #tag #tag`.

- 2–6 tags per doc.
- Derive from: section headings, recurring domain nouns, explicit
  subject matter. Nothing invented.
- Keep the vocabulary CONSISTENT across siblings. If one doc uses
  `#dream`, don't call another `#dreaming`. Pick one form, use it
  everywhere.
- Kebab-case for multi-word tags: `#dream-engine`, not `#DreamEngine`
  or `#dream_engine`.
- If a tag line already exists at the bottom, merge with the existing
  tags — deduplicate, don't append a second line.
- Separated from the body by one blank line above.

### Project tag (required)

Every doc in the folder MUST share one tag derived from the folder's
own name (kebab-cased). Example: docs/ in a folder named
`claude-sdk` get `#claude-sdk` on every sibling. This gives the
folder a shared trait beyond wikilinks, which helps search and
filtering even when two docs don't explicitly cross-reference each
other.

The project tag does NOT count against the 2–6 tag limit — it's
additive on top of the content tags.

## Pass 3 — Wikilinks (REQUIRED — do not skip)

This pass is the whole point of the agent. Tags group docs; wikilinks
_connect_ them. A folder that has tags but no `[[brackets]]` is half-done.
Every doc that mentions a sibling doc's filename stem MUST end up with at
least one wikilink to it. If you finish Pass 3 and the diff added zero
`[[...]]` links while sibling stems clearly appear in the prose, you
missed the pass — go back and do it.

### Procedure (do this explicitly)

1. Build the sibling stem list: for every `*.md` in the folder (except
   `DOCS_AGENT.md`), take the filename without `.md`. That is the stem
   set. Example: files `DREAM.md`, `orion.md`, `summer-triangle.md` →
   stems `DREAM`, `orion`, `summer-triangle`.
2. For each doc D, scan its prose (skipping the exclusions below) for
   case-insensitive matches of any stem other than D's own stem.
3. Replace the FIRST match per paragraph with `[[STEM]]`, using the
   EXACT filename stem casing inside the brackets. If the author's
   prose casing differs, use an alias: `[[STEM|as-written]]`.
4. Do NOT replace subsequent occurrences in the same paragraph. Prose
   stays readable; one link per paragraph is enough to connect the
   graph.
5. Multi-word stems with dashes (`summer-triangle`) match the prose
   phrase "summer triangle" (spaces or dashes, case-insensitive).

### Rules

- Use the FILENAME stem, never the human title. `[[orion]]` not
  `[[Orion the Hunter]]`. Obsidian and Boltzsidian resolve the stem
  shape unambiguously.
- `DREAM.md` in the folder → first occurrence of "dream" / "DREAM" /
  "Dream" in each paragraph of every OTHER doc becomes `[[DREAM]]` (or
  `[[DREAM|Dream]]` if the author wrote it title-case).
- Skip matches inside: code fences ` ``` `, inline code `` ` ``, URLs,
  frontmatter, and existing markdown links `[text](path)` or existing
  wikilinks `[[...]]`.
- Skip the doc's own stem inside itself.
- Skip stems shorter than 3 characters (too noisy — e.g. "id", "go").
- If a doc's prose uses a phrase clearly synonymous with a sibling's
  title (e.g. "dream cycle" when `DREAM.md` exists) but not the exact
  stem, add a bare `[[DREAM]]` at the end of that sentence as a
  see-also — do NOT rewrite the phrase itself.
- Wikilinks with aliases are allowed and encouraged when case doesn't
  match: `[[DREAM|dreaming]]`, `[[orion|Orion]]`.

### Worked example

Folder contains: `orion.md`, `rigel.md`, `summer-triangle.md`.

`rigel.md` before:

```
Rigel is the brightest star in Orion. It anchors the summer triangle
from the southern hemisphere perspective.
```

`rigel.md` after Pass 3:

```
Rigel is the brightest star in [[orion|Orion]]. It anchors the
[[summer-triangle|summer triangle]] from the southern hemisphere
perspective.
```

Two links added, prose untouched. That is a correct Pass 3 output.

## Pass 4 — See-also (opt-in)

Only touch docs that ALREADY contain a `## See also` section.

Populate it with a bullet list of `[[STEM]]` links to every sibling
doc that this doc links to or is linked from (per Pass 3). Deduplicate.
Sort alphabetically.

Do NOT add a See also section to docs that don't have one. Silence
is a valid stance — the author can opt in by creating the header.

## Pass 5 — Connectivity hub (REQUIRED)

The ONE pass that's allowed to create a file. Without a hub, folders
of docs that don't cross-reference each other show up in Boltzsidian
as disconnected singleton nodes — no cluster, no constellation, just
noise.

### The hub doc

Exactly one doc in the folder is the hub. Selection order:

1. `INDEX.md` if it exists. Use it.
2. Else `README.md` if it exists. Use it.
3. Else CREATE `INDEX.md` with:

   ```
   ---
   id: <ULID>
   created: <today>
   ---
   # Index

   <list of bullet wikilinks — see below>

   #index #<project-tag>
   ```

### Hub body

The hub's body contains a bullet list of `[[STEM]]` links to EVERY
sibling doc (except `DOCS_AGENT.md` and the hub itself). Sort
alphabetically by stem.

- If the hub is an existing `INDEX.md` or `README.md` with prose,
  PRESERVE the prose. Add the bullet list under a `## Contents` or
  `## Index` header. Don't rewrite anything the author wrote.
- If the hub already has a `## Contents` / `## Index` list, UPDATE
  it: add missing entries, remove entries for docs that no longer
  exist, sort alphabetically, dedupe.

### Backlinks from siblings

Every sibling (except the hub itself and `DOCS_AGENT.md`) must have
a wikilink back to the hub somewhere in its body. Check in this
order:

1. Does the doc's prose already contain `[[INDEX]]` or `[[README]]`
   (whichever name matches the hub)? Done — skip.
2. Does Pass 3 already have the doc wikilinking to the hub via
   normal stem matching? Done — skip.
3. Otherwise: append a one-line footer above the tag line:
   `See the [[INDEX|folder index]] for context.`
   (or `[[README|folder readme]]` if that's the hub). Exact phrasing
   fixed so re-runs recognise it and don't duplicate.

### Why it's idempotent

- Hub exists already → the agent updates the contents list and
  moves on.
- Backlinks already present → the agent finds them in Pass 3 or the
  explicit footer check and skips.
- Re-running on a green folder produces zero diffs.

---

## Invariants (apply across all passes)

- **Never rewrite prose.** Heading text, sentences, punctuation, and
  formatting stay exactly as written.
- **Never edit code blocks.** Anything inside ` ``` ` or inline `` ` ``
  is off limits, including tag-looking strings.
- **Never delete frontmatter keys**, even ones you don't recognize.
- **Never invent facts.** If you can't determine a tag or link from
  what's already in the file, skip it.
- **Never add comments explaining your edits.** The diff is the
  explanation.
- **Preserve line endings.** If the file uses LF, keep LF. If CRLF,
  keep CRLF.
- **One blank line** between frontmatter and body, between body and
  tag line, between sections. No surprise whitespace.

## Title collisions

If two docs have a title (first `#` heading OR filename stem) that
matches case-insensitively, skip wikilinks for that pair in both
directions and report them. Ambiguous targets are a human decision.

## Output

At the end of the run, print:

```
Files scanned:        N
Frontmatter added:    N fields across M files
Tags added:           N (vocabulary: #a, #b, #c, …)
Project tag:          #<folder-name>
Wikilinks added:      N across M files
Hub:                  <INDEX.md | README.md>  (created | updated | unchanged)
Hub backlinks added:  N footers across M siblings
Title collisions:     [file1.md ↔ file2.md, …]
Skipped (unchanged):  N
```

If anything was ambiguous (a doc that could have gotten either of two
tags, a phrase that might link to two siblings), list the ambiguities
briefly so the human can review.

## What this agent is NOT for

- Summarizing docs.
- Rewriting for clarity.
- Generating new docs.
- Answering questions about the content.
- Running against folders with thousands of files — scope is
  "curator for a docs folder," not "reindexer for a vault."

## Portability

This file is self-contained. Drop it into any repo's `docs/` folder,
invoke the agent, and the passes run. No config file, no companion
script, no environment setup.

#docs-agent #tagging #wikilinks
