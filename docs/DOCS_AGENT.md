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
- Do NOT create new notes. Only edit existing ones.
- Do NOT delete notes.

## Invocation

The agent should be given one instruction: "Run DOCS_AGENT.md on this
folder." It reads this file, then executes passes 1–4 on every
sibling. Each pass is idempotent — re-running the agent must produce
no diff when nothing has changed.

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

## Pass 3 — Wikilinks

Whenever a doc's prose mentions the filename stem of another sibling
doc (case-insensitive), wrap it as `[[STEM]]` — using the FILENAME
without `.md`, not the human title. Obsidian and Boltzsidian both
resolve that shape unambiguously.

Rules:

- `DREAM.md` in the folder → occurrences of "dream" or "DREAM" in
  other docs become `[[DREAM]]`.
- Only replace the FIRST mention per paragraph. Leave the rest alone
  so prose reads naturally.
- Skip matches inside: code fences, inline code (`` ` ``), URLs,
  frontmatter, and existing markdown links `[text](path)`.
- Skip the doc's own stem inside itself.
- Skip stems shorter than 3 characters (too noisy — e.g. "id", "go").
- If a doc's prose uses a phrase clearly synonymous with a sibling's
  title (e.g. "dream cycle" when `DREAM.md` exists), add a bare
  `[[DREAM]]` at the end of that sentence as a see-also — do NOT
  rewrite the phrase itself.
- Wikilinks with aliases are allowed when the author's prose case
  doesn't match the filename: `[[DREAM|dreaming]]`.

## Pass 4 — See-also (opt-in)

Only touch docs that ALREADY contain a `## See also` section.

Populate it with a bullet list of `[[STEM]]` links to every sibling
doc that this doc links to or is linked from (per Pass 3). Deduplicate.
Sort alphabetically.

Do NOT add a See also section to docs that don't have one. Silence
is a valid stance — the author can opt in by creating the header.

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
Wikilinks added:      N across M files
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
