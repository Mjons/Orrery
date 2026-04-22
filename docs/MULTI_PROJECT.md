# MULTI_PROJECT.md — Linking project markdown into Boltzsidian

Sibling to DREAM_ENGINE.md and MODEL_SURFACES.md. Scoped to the
specific problem of surfacing markdown scattered across many
project directories (`L:/projects_claudecode/*`) inside a single
Boltzsidian universe — while preserving each project's
independent evolution (git history, external edits, periodic
deletes and renames).

The question this doc is trying to answer: **what's the smallest
change that lets the dream cycle cross-pollinate ideas between
projects without turning each repo into a Boltzsidian
dependency?**

---

## 0. The problem stated honestly

A project directory under `L:/projects_claudecode/*` is typically:

- A git repo with its own lifecycle.
- Mostly code, some markdown: `README.md`, `BUILD_PLAN.md`,
  `NOTES.md`, design docs, journal entries.
- Edited by tools that don't know about Boltzsidian (VS Code,
  Cursor, whatever).
- Containing data you may or may not want a dream cycle reading
  (`.env`, private notes, vendored docs, machine-generated logs).

Boltzsidian today:

- Opens ONE workspace via FS Access pick.
- Walks that root, collects every `.md` file into a vault.
- Writes edits back into the same directory (frontmatter, new
  notes on `N`, promoted ideas under `ideas/`, tend stamps).
- Assumes every note's title is unique-enough for `[[wikilink]]`
  resolution.
- Reads note bodies into the dream prompt excerpts (Phase A).
- Stores .universe/ sidecars for state, prune candidates, dreams.

None of that was designed for "ten project roots, each with its
own git history, each with its own ideas of what `README.md`
means." The shortest route to making it work without wrecking the
single-workspace invariant is the question.

---

## 1. Five approaches, ranked by how much they disturb the existing model

### 1.1 Merged-copy vault (cheapest, deepest tradeoffs)

Physically copy every project's markdown into a single flat vault,
e.g. `L:/boltzsidian_vault/` with subfolders per project:

```
L:/boltzsidian_vault/
  claude-code-sdk/
    README.md
    SPEC.md
  panel-haus/
    NOTES.md
    ...
```

The app treats the whole thing as one workspace. Folders become
clusters (already supported). Salience layer pair-finds across
them (already supported).

**Pros:**

- Zero code change. Boltzsidian is already happy with this.
- Fastest to ship — just `cp -r` and point the workspace picker.
- Editing happens in one place; no sync confusion.

**Cons:**

- Files are now DETACHED from their project repos. When you edit
  `BUILD_PLAN.md` in Boltzsidian, the project's git repo doesn't
  see it. Two sources of truth, diverging daily.
- When a project's .md files change externally (a coworker pushes,
  a tool edits), the vault is stale.
- Reverse — Boltzsidian writes (frontmatter, ideas/, .universe/)
  don't flow back to projects.

**Verdict:** only works if Boltzsidian becomes the _canonical_
place you edit your .md files. Viable for personal notebooks,
not viable for project docs that also live in git.

---

### 1.2 Read-only mirror with sync (rsync / watchers)

Same physical layout as §1.1 but a one-way sync keeps it fresh:

```
project repos (write)  →  mirror  →  Boltzsidian (read-only for project .md)
```

Sync can be:

- Filesystem watchers (Node `chokidar`, OS-level tools).
- Periodic `rsync` / `robocopy`.
- A manual "refresh" button in Boltzsidian.

Boltzsidian writes (ideas/, .universe/) land in a SEPARATE folder
that isn't touched by sync — so dream output doesn't churn the
mirror.

**Pros:**

- Project repos stay the canonical source of truth.
- External edits propagate automatically (with watchers).
- Boltzsidian's own writes (promoted ideas, dream log) don't
  pollute project repos.

**Cons:**

- Requires plumbing (watchers or a scheduled sync).
- One-way: edits made inside Boltzsidian to project .md are LOST
  on next sync. Fix: make project .md files read-only in the
  note panel (disable edit button per-note based on path).
- Another layer of state that can drift.

**Verdict:** the "just use symlinks" version of this is
structurally similar. On Windows, junction points
(`mklink /J`) let you alias a project folder under the vault
root without copying — same result without disk usage.
Boltzsidian's vault walker already follows junctions.

---

### 1.3 Junctions / symlinks (sub-case of §1.2)

```
mklink /J L:\boltzsidian_vault\claude-code-sdk L:\projects_claudecode\claude-code-sdk
mklink /J L:\boltzsidian_vault\panel-haus L:\projects_claudecode\panel-haus
```

Boltzsidian sees the vault as one tree; the .md files ARE the
project files, no copy. External edits appear instantly; no sync.

**Pros:**

- No duplication.
- Live edits.
- Trivial to set up; two-line script per project.

**Cons:**

- Boltzsidian writes to project files DO land in the project
  repo. Frontmatter changes (`id`, `created`, `tended_on`)
  modify `README.md` in-place. Those edits get committed with
  everything else unless you add them to `.gitignore` or filter
  them out in a pre-commit hook.
- Cross-platform fragility (Linux / WSL symlinks work
  differently; FS Access API has historically had edge cases).
- Deleting a note in Boltzsidian deletes the real file.
- `.universe/` still lives at the vault root, not in each
  project — so state is centralised.

**Verdict:** the pragmatic short-path. The caveat about
frontmatter edits is real and needs explicit handling — see §3.

---

### 1.4 Multi-root workspace (biggest code change, cleanest result)

Teach Boltzsidian to open multiple root directories at once.
Settings stores a list of roots; the walker concatenates them.
Each note carries its root identity in a new `rootId` field. The
drawer, search, and salience layer all operate over the union.

**Pros:**

- Each project stays its own tree, each with its own `.universe/`
  sidecar if desired — local project state doesn't leak across.
- No filesystem mirroring or symlinks.
- The app explicitly knows about projects — can filter by root,
  group clusters by root, etc.

**Cons:**

- Substantial code work. Touches:
  - `vault/vault.js` — multi-root walker
  - `state/settings.js` — add `workspace_roots: []`
  - Pick flow — lets the user add/remove roots
  - `vault/writer.js` — resolves which root a note belongs to
  - `[[wikilink]]` resolution — cross-root disambiguation
  - Drawer UIs — root-scoped filters
- FS Access API needs separate permission grants per root. The
  first-run UX becomes "pick 10 folders."

**Verdict:** the right answer for the long haul, too much work
for "try this out this weekend." Worth planning as a post-1.0
feature; not worth blocking on.

---

### 1.5 Read-only manifest + query layer

A `boltzsidian.projects.json` file at some stable location lists
project paths, ignore patterns, per-project metadata:

```json
{
  "projects": [
    {
      "id": "claude-code-sdk",
      "path": "L:/projects_claudecode/claude-code-sdk",
      "include": ["docs/**/*.md", "*.md"],
      "exclude": ["node_modules/**", "vendor/**"],
      "readOnly": true
    },
    {
      "id": "panel-haus",
      "path": "L:/projects_claudecode/panel-haus"
    }
  ],
  "writeRoot": "L:/boltzsidian_vault"
}
```

On open, Boltzsidian reads the manifest, walks each path with its
filters, and merges. Writes go to `writeRoot`, never into
project directories. The drawer and search see everything as one
graph.

**Pros:**

- Fine-grained control — ignore `node_modules`, pick only `docs/`,
  etc.
- Per-project read-only flag prevents accidental edits to project
  .md.
- No filesystem tricks — clean separation.
- Manifest is a single file, easy to version, easy to back up.

**Cons:**

- Implementation effort is roughly half of §1.4 — need
  multi-root walker and filter logic but no per-note root
  tracking beyond "which project did this come from."
- User has to author the manifest JSON the first time.
- FS Access permission model still requires a grant per root.

**Verdict:** middle ground. Less clean than §1.4's root objects,
much simpler to build. If Michael is willing to paste a JSON
once, this is probably the right shape.

---

## 2. Cross-project linking — the title collision problem

Two projects both have `README.md` with `# Installation` as an
H1. Boltzsidian's `[[Installation]]` resolves to one of them
(first by vault order, stable-but-arbitrary). Collisions are
common across project docs — `README`, `TODO`, `CHANGELOG`,
`API.md` repeat everywhere.

Three strategies for disambiguating:

### 2.1 Project-prefixed titles

Internally track titles as `{projectId}/{title}` when they
collide. A user-written `[[README]]` still matches the
most-recent-edited README, but the UI shows the project prefix
next to colliding titles in hover and search.

- Zero syntax change for existing `[[wikilinks]]`.
- Relies on heuristics ("most-recent wins") which can silently
  mislink.

### 2.2 Explicit project-qualified wikilinks

Extend the wikilink syntax: `[[claude-code-sdk/README]]`.

- Unambiguous when authored.
- Obsidian-compatible (Obsidian supports nested wikilinks).
- Requires user discipline — unqualified `[[README]]` still has
  the collision problem.

### 2.3 Both — user writes unqualified, app auto-qualifies

When Boltzsidian detects an ambiguous `[[README]]`, it opens a
small picker ("which README? [Project A / Project B / …]") and
rewrites the link to the qualified form on save.

- Best UX — user writes naturally, app disambiguates.
- Implementation effort: medium. One new UI flow plus a
  link-rewrite pass.

**Verdict:** §2.3 is the right long-term answer. For MVP, §2.1
with a visible "project: X" badge in the drawer / panel header
is fine — correctness bugs will be visible rather than silent.

---

## 3. The frontmatter-write problem

Boltzsidian writes these to notes:

- `id` — ULID, stamped on first touch.
- `created` — timestamp, stamped if missing.
- `tended_on` — array of keys set when Tend proposals are
  accepted or rejected.
- `generated_by` / `born_in_dream` / `survived_critique` — on
  promoted ideas.

For a shared vault (§1.1, §1.2, §1.3 where symlinks put writes
back into project repos), these end up in git unless handled:

**Options:**

1. **Let them land in git.** Add a pre-commit hook per project
   that strips boltzsidian-specific frontmatter, OR teach the
   team this is just how the project looks now.
2. **Sidecar frontmatter.** Boltzsidian writes its metadata to
   a sibling file (`README.md.boltz`) that's .gitignored. Note
   panel reads both and merges them for display / editing. More
   code; no git pollution.
3. **Path-gated writes.** A project flagged `readOnly: true` in
   the manifest simply never gets frontmatter stamped. The Tend
   proposal still works (in-memory), but Accept can't write back
   unless the note is in a writable root.
4. **Move ids to the .universe sidecar.** Instead of stamping
   `id:` in the frontmatter, store a `<path>.md → ULID` map in
   `.universe/ids.json`. All the places we currently rely on
   `note.frontmatter.id` read from that map instead. No file
   edits for id tracking. Tend's `tended_on` likewise becomes a
   sidecar.

**Verdict:** (4) is the right architectural change — it solves
the write problem AND fixes the Tend + promote paths
simultaneously. It's also the most intrusive code change — every
place that reads `note.frontmatter.id` or
`note.frontmatter.tended_on` becomes a sidecar lookup. Probably
a full afternoon of refactoring, not scope for MVP.

For MVP: use (3) — manifest flag `readOnly: true`, block writes
from the saver path when the note's root is read-only. Tend
Accept on a read-only note either degrades (shows proposal,
doesn't persist) or is disabled in UI.

---

## 4. The privacy surface expands

Phase A of DREAM_ENGINE.md put note body excerpts into the
idea-seed prompt. That was fine when the vault was one folder of
notes the user chose to point Boltzsidian at. Once we aggregate
many projects, the excerpt surface grows:

- A project might contain `.env` files (Boltzsidian ignores
  non-.md, so fine).
- A project might contain `SECRETS.md`, `api-keys.md`, or
  `internal-customer-data.md` — .md files Boltzsidian WILL pick
  up and feed into model prompts.
- A project might contain vendored documentation (`node_modules`,
  `vendor/`) — a mountain of other people's markdown.

**Required:** per-project exclude patterns in the manifest (§1.5
already sketches this). Reasonable defaults:

```
**/node_modules/**
**/vendor/**
**/.git/**
**/dist/**
**/.next/**
**/target/**
**/build/**
**/*.secrets.md
**/private/**
```

Nice-to-have: a "preview what Boltzsidian will include" step on
first open of a multi-project vault, showing the file count per
project and letting the user paste additional ignore patterns.

---

## 5. Performance at scale

Back-of-envelope for 10 projects × 100 .md each = 1000 notes:

- Vault walk: fine — `openVault` is O(n) over files.
- Body index: ~1000 note objects in memory, ~10 MB at typical
  size. Fine.
- Physics edges: depends on link density. 1000 notes × avg 3
  wikilinks each = 3000 edges. Still fine for the spring solver.
- Salience tick (2 Hz): samples 6 seeds × 4 neighbours per tick
  = 24 pair checks per 500 ms. O(seeds) over the vault. Fine.
- Rendering: body pool cap is currently 4096 (configurable).
  Bodies mesh handles up to that without slowdown on an RTX-era
  GPU.

Where it starts to matter:

- Tether rendering — 3000 line segments is a lot if bloom is on.
- Tend scan — O(n²) in the worst case for detectObviousLinks
  (title appears-in-body check for every note × every other
  note). 1000² = 1M body scans on Run Tend. Probably 500 ms but
  noticeable. Worth measuring.
- Label rendering at zoom-out — 1000 potential labels. The
  cursor-lens mechanism handles this already.

**Verdict:** 1000 notes is comfortable. 10,000 needs profiling
but is probably OK. 100,000+ (monorepo docs, wiki imports) would
need index-stored sidecars and incremental walks. That's a later
problem.

---

## 6. Recommended path — pragmatic minimum

For the specific case of "Michael has `L:/projects_claudecode/*`
and wants a unified Boltzsidian view, today," the shortest useful
path:

1. **Pick §1.5 as the architecture target.** Manifest-driven
   multi-root with per-project ignore patterns and a separate
   write-root.
2. **Ship a weekend-scale first cut:**
   - Settings adds a "workspace roots" text area that takes a
     JSON array of path objects (path + optional include/exclude
     globs).
   - Vault walker becomes multi-root. Each note gets a `rootId`
     field in-memory (not in frontmatter).
   - Writes all go to a single `writeRoot` — ideas/, .universe/,
     frontmatter writes on new notes the user creates from
     Boltzsidian. Project .md files stay untouched.
   - Tend Accept on a read-only note → toast "this note is in a
     read-only project root, applied in memory only." (Degraded
     but useful.)
3. **Ship project-prefixed collision labels** (§2.1). Save §2.3
   picker for later.
4. **Don't solve the frontmatter-write problem yet.** With
   write-root isolated, it doesn't come up — Boltzsidian only
   writes to the single writeRoot it controls. This is the
   actual reason §1.5 + (§3 option 3) is pragmatic.
5. **Ship with sensible default excludes.** node_modules, dist,
   .git, etc., pre-populated.

Estimated scope: ~one focused session. Main touches in
`vault/vault.js`, `state/settings.js`, a new `vault/manifest.js`
for parsing and applying filters, and a settings UI row. No
changes to the saver, drawer, salience layer, or any of the
dream machinery — they all operate on the merged vault object
and don't care where notes came from.

## 7. Risks worth flagging up front

### 7.1 Permissions fatigue

FS Access API requires an explicit grant per root. Ten projects
= ten permission prompts on first open. Solution: grant
persistence via the browser's "remember" option (Chromium
supports this with long-lived origin+dir permissions), plus a
single "re-grant all" action in Settings for when permissions
lapse.

### 7.2 Privacy surface

Addressed in §4. The defaults-plus-manifest approach covers the
common case. Still worth explicit "what's about to cross the
model boundary" disclosure at first open.

### 7.3 The title collision undermining cross-project ideas

If the salience layer proposes an idea linking A's `[[README]]`
with B's `[[setup.md]]`, and the wikilink to A's README silently
resolves to B's README (because we chose the wrong tie-break),
the user clicks through and is looking at the wrong note. This
silently erodes trust in dream output.

Mitigation: whenever a promoted idea contains a wikilink,
qualify it fully (`[[project-a/README]]`) regardless of whether
there's currently a collision. Unambiguous by construction. This
contradicts the "no syntax change" pro of §2.1, but only for
model-authored wikilinks — the user still writes unqualified.

### 7.4 What counts as "the vault" semantically

Dream output, ideas, chorus buffer, prune candidates are all
vault-scoped in the current code. When the vault spans ten
projects, does each project dream its own dream, or is there one
combined dream? Combined is the interesting answer (that's what
makes multi-project worthwhile) but it means a dream's survivors
can reference two projects that barely know about each other.
Fine, but worth naming.

## 8. What this is in one sentence

A manifest of project roots with ignore patterns, walked into
one merged vault whose writes land in a dedicated writable root —
fewer moving parts than any "true multi-vault" design, good
enough for weekend Boltzsidian use across ten repos, leaves
every project's git history untouched.
