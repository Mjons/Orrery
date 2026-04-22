---
tended_on: [tag-infer]
id: 01KPS7VDN63F6ZE7BMXFJZYDQ3
created: "2026-04-21T22:42:15.111Z"
---

# MULTI_PROJECT_PLAN.md — Sustainable §1.5 implementation

Operational companion to `MULTI_PROJECT.md` §1.5. Each phase is a
shippable unit: at the end of every phase, the app still opens a
single workspace and behaves identically — we just add capability
incrementally. No "big bang" merge day.

## Design commitments

1. **Single-root users see zero change.** Existing settings, vaults,
   behaviours continue working through every phase.
2. **Manifest-driven, not UI-driven, first.** Roots come from a JSON
   manifest at known paths. A UI for managing roots is Phase 7+ only.
3. **Write isolation is the backbone.** Boltzsidian writes (ideas,
   dream logs, prune candidates, tend stamps, frontmatter updates)
   land in a single dedicated `writeRoot`. Project roots stay
   read-only unless explicitly marked writable.
4. **Every phase ends with a green smoke-test.** If a phase can't be
   verified with the demo vault + one extra project root pointing at
   `L:/projects_claudecode/`, we stop and fix before proceeding.
5. **No runtime assumption of `workspaceHandle` is left standing.**
   By end of Phase 3, every place that currently references a single
   handle resolves the correct root handle via `note.rootId`.

## Glossary

- **Root** — one project directory (e.g. `L:/projects_claudecode/panel-haus`)
  plus metadata (id, readOnly, exclude patterns).
- **Manifest** — a JSON document listing the roots + writeRoot + global
  exclude patterns. Stored at a known per-machine path or inside
  `.universe/workspace.json` of the writeRoot.
- **writeRoot** — the one root Boltzsidian is allowed to write to. All
  artifacts (ideas/, .universe/, new Cmd+N notes) land here.
- **RootSpec** — the object shape a root is represented as:
  `{ id, name, path, handle, readOnly, include?, exclude? }`.

---

## Phase 0 — Codebase audit (no code changes)

Before we touch anything, we produce a written inventory of every
place that makes a single-workspace assumption. The audit IS the
deliverable. We don't write code until we've looked everywhere we'll
need to edit.

### Files to audit

| Path                           | What to look for                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.js`                  | `let workspaceHandle`, `setWorkspace`, saver wiring, tend-apply invocation, promote invocation, `applyAccent`, every writer call site |
| `src/vault/vault.js`           | `openVault(rootHandle)` signature, walkDir loop, handle usage                                                                         |
| `src/vault/writer.js`          | `writeNoteAt`, `createNoteAt`, `renameNote`, `deleteNote` — all take `root` as first param today                                      |
| `src/vault/save.js`            | `createSaver({ rootHandle })` closure capture                                                                                         |
| `src/vault/state-store.js`     | `loadState(root)`, `saveState(root, ...)`                                                                                             |
| `src/vault/mutations.js`       | `vault.byTitle` as `Map<title, Note>` (needs to become `Map<title, Note[]>` for collisions)                                           |
| `src/vault/fs.js`              | Permission helpers — `ensurePermission(handle)`                                                                                       |
| `src/vault/opfs.js`            | Demo-vault OPFS flow — does it need multi-root too? (probably not — demo stays single-root)                                           |
| `src/vault/parser.js`          | Just operates on text — should be safe                                                                                                |
| `src/vault/links.js`           | Wikilink add/remove — root-aware? Probably needs prefer-same-root policy                                                              |
| `src/layers/prune.js`          | Writes `.universe/prune-candidates.json` — where to? writeRoot                                                                        |
| `src/layers/weed.js`           | Archive, delete, keep-list writes — where to?                                                                                         |
| `src/layers/dream-log.js`      | Writes `.universe/dreams/<date>.md` — writeRoot                                                                                       |
| `src/layers/promote.js`        | Writes `ideas/<stem>.md` — writeRoot                                                                                                  |
| `src/layers/tend-apply.js`     | Writes frontmatter back to source note — source root, gated by readOnly                                                               |
| `src/state/settings.js`        | Settings schema — add `workspace_manifest_path`, `workspace_roots[]`, `workspace_write_root_id`                                       |
| `src/ui/pick.js` or equivalent | Workspace pick flow                                                                                                                   |

### Every code path that writes to disk

Grep for: `createWritable`, `removeEntry`, `getFileHandle.*create`,
`writeNoteAt`, `createNoteAt`, `renameNote`, `saveState`,
`writePruneCandidates`, `writeDreamLog`, `saveWeedKeep`,
`archiveNote`, `deleteNoteFile`, `applyProposal`, `saver(`. Every
one needs its "which root does this go to" answer documented.

### Verification

Output: a checklist file (can be a sibling doc or inline below) that
lists every grep hit with its intended root resolution:

- "writes to source note's root" (frontmatter stamps, body edits —
  must check `root.readOnly`)
- "writes to writeRoot" (ideas, dream logs, prune candidates)
- "reads any root" (vault walk)

**Do not proceed to Phase 1 until every grep hit has a row.** This
is the main promise of "sustainable" — we know the full extent of
changes before we start.

---

## Phase 1 — Data model + manifest parser (no behaviour change)

**Goal.** Introduce the Root / Manifest types and loading code, but
don't change anything about how the single-root flow actually
behaves. End of phase: if a user's settings still point at one
folder, the app treats that folder as a single-root manifest and
runs identically.

### Changes

1. `src/vault/manifest.js` (new)
   - `RootSpec` type documentation (JSDoc comment).
   - `parseManifest(json)` → `{ roots: RootSpec[], writeRootId, defaults }`.
   - Default excludes: `node_modules/**`, `vendor/**`, `.git/**`,
     `dist/**`, `build/**`, `.next/**`, `target/**`, `private/**`,
     `*.secrets.md`.
   - Validation: unique ids, writeRootId refers to an existing
     root, paths are non-empty.

2. `src/state/settings.js`
   - Add `workspace_manifest: null | { roots: [...], writeRootId }`.
   - Migration helper: if the old single-handle workspace is open,
     synthesize a one-root manifest with that handle as both the
     sole root and the writeRoot.

3. `src/vault/vault.js`
   - Accept EITHER the legacy `openVault(handle)` signature OR
     `openVault({ manifest, handles })`. Internal branch chooses
     which walker to use. Single-handle call path still works.

4. Tests (manual):
   - Open demo vault — still works.
   - Open user workspace — still works.
   - Parse a sample multi-root manifest JSON string in the console —
     `parseManifest(...)` returns the expected object, validation
     rejects malformed input.

### Verification

- App boots without errors.
- `__boltzsidian.__parseManifest` (added as dev hook this phase
  only) can parse a sample JSON.
- Nothing visible changes for existing users.

### Scope estimate: ~4 hours

---

## Phase 2 — Multi-root walker (dormant, optionally activated)

**Goal.** Make `openVault` genuinely multi-root capable, keyed by an
internal flag. Single-root users get the legacy path; anyone who
hand-crafts a manifest can experimentally open multiple roots. Title
collisions are tracked but not yet resolved.

### Changes

1. `src/vault/vault.js`
   - Internal `walkRoot(handle, root, opts)` — the per-root walker.
     Each note gets `rootId: root.id` stamped on it.
   - `mergeVaults(perRootVaults)` — unions into one vault. Handles
     the `byId` and `byTitle` maps.
   - `vault.byTitle` is now `Map<titleLower, Note[]>` (was `Note`).
     Callers updated (see below).
   - `vault.roots: RootSpec[]` — the merged vault knows which roots
     it was built from.

2. `src/vault/mutations.js`
   - All sites that do `vault.byTitle.set(title, note)` / `get(title)`
     updated for the array shape.
   - `resolveLink(title, source)` — new helper that applies the
     prefer-same-root policy when the Map has multiple entries.

3. Every caller of `vault.byTitle` — grep pass:
   - `src/layers/chorus.js` — reads title via `byTitle`? check.
   - `src/layers/salience-layer.js` — ditto.
   - `src/layers/tend.js` — `byTitle` in obvious-link detection.
   - `src/ui/search.js` — search results.
   - `src/ui/link-drag.js` — drag-to-link resolution.
   - Each gets a one-line update to call `resolveLink()` or iterate
     the array.

4. `src/main.js`
   - `setWorkspace(manifest)` path added. Old `setWorkspace(ws)` for
     single-root still works and delegates to manifest-path
     internally.

### Verification

- Legacy single-root still works (demo + user workspace).
- Pasting a two-root manifest into `__boltzsidian.__loadManifest(...)`
  (dev hook added this phase) opens both roots and merges them.
- `__boltzsidian.vault.notes.filter(n => n.rootId === "...")`
  returns the right subsets.
- Title collisions produce arrays in `byTitle`; callers don't crash.

### Scope estimate: ~1 day

---

## Phase 3 — Root-aware writers + write-root isolation

**Goal.** Every write path knows which root to target. Reads stay
multi-root-capable. Any attempt to write to a `readOnly` root is
rejected with a clear toast, never silently.

### Changes

1. `src/vault/writer.js`
   - `writeNoteAt`, `createNoteAt`, `renameNote`, `deleteNote` —
     instead of taking `root` as first arg, take a `getRoot()`
     helper OR an explicit `rootHandle`. The wrapper functions
     that main.js calls resolve note → root → handle.

2. `src/vault/save.js`
   - `createSaver` closure captures a `getRootForNote(noteId)`
     function instead of a single rootHandle.
   - Reject writes to a read-only root: return
     `{ applied: false, reason: "read-only" }`.

3. `src/layers/promote.js`
   - Writes target `writeRoot` instead of `vault.root`. Uses
     `writeRoot.handle` to resolve `ideas/<stem>.md`.

4. `src/layers/dream-log.js`, `src/layers/prune.js`, `src/layers/weed.js`
   - All `.universe/*` writes go to `writeRoot.handle`.
   - Reads may stay at writeRoot for now (Option A from
     [[MULTI_PROJECT]] §1.4 step 5 — shared `.universe/`).

5. `src/layers/tend-apply.js`
   - Writes frontmatter / body edits back to the SOURCE root (the
     note's root).
   - Before writing, check `root.readOnly`. If true, either:
     (a) toast "this proposal can't be applied — the project is
     read-only" and cancel, OR
     (b) skip the write but still mark the proposal as reviewed
     in-memory.
   - MVP = (a). Cleaner UX.

6. `src/main.js`
   - `handleSave` resolves the note's root, checks readOnly, calls
     saver with the right handle.
   - `createNewNote` writes into the `writeRoot` by default.
   - `removeNoteEverywhere` → `deleteNote` called against source
     root (which must be writable).
   - `tendDrawer` onAccept → check root writable before firing
     `applyProposal`.

### Verification

- Single-root user: all writes still work identically. Saves, new
  notes, tend accepts, weed archive/delete, promote — all land in
  the same place.
- Multi-root user (manifest with 2 roots, second one readOnly):
  - Saves on a writable note work.
  - Saves / tend accepts on a readOnly note show the toast and do
    nothing.
  - Promote writes ideas/ into writeRoot.
  - Dream cycle's state.json, prune-candidates, dream logs all
    land in writeRoot/.universe.
- `git status` inside a readOnly project root shows no new files.

### Scope estimate: ~1–1.5 days

---

## Phase 4 — Wikilink collision resolution + UI labels

**Goal.** When title collisions exist, the app resolves them by a
consistent policy and shows the user what it chose.

### Changes

1. `src/vault/mutations.js`
   - `resolveLink(title, sourceNote)` policy:
     1. If sourceNote is present, prefer a target in the same root.
     2. Otherwise, first match by root order (writeRoot first).
     3. Log a diagnostic event if multiple matches existed — users
        can grep for "wikilink collision" in the console during
        dream runs.

2. `src/ui/note-panel.js`
   - Render a "root pill" next to the title in the panel header:
     `claude-code-sdk · decisions/anti-mysticism.md`.
   - When a rendered wikilink resolves to a different root than the
     current note, add a tiny footnote-style marker beside it.

3. `src/ui/search.js`
   - Search results include a subtle root tag when results span
     multiple roots.

4. `src/ui/ideas-drawer.js`
   - Parent links show root when parents are in different roots
     (the common case for interesting dream ideas).

### Verification

- Two roots each with a `README.md` — user clicks `[[README]]` from
  root A's note, lands on root A's README (prefer-same-root wins).
- A dream proposes an idea connecting a note in root A to a note
  in root B — drawer shows both parent titles with their root
  labels.
- Promoted idea written to writeRoot has parent wikilinks that
  work when opened (resolve to the correct roots).

### Scope estimate: ~6 hours

---

## Phase 5 — Manifest discovery + first-load UX

**Goal.** Real users can actually use multi-root without hand-editing
settings JSON. A workspace pick flow accommodates the manifest.

### Changes

1. `src/vault/manifest.js`
   - `loadManifest(writeRootHandle)` — reads
     `writeRoot/.universe/workspace.json`. Missing file → single-root
     implicit manifest.
   - `saveManifest(writeRootHandle, manifest)` — writes the JSON
     back.

2. Pick flow (in `src/main.js` or a helper)
   - First-time pick: user picks a folder → that becomes the initial
     writeRoot with no additional project roots. Single-root
     behaviour.
   - If the picked folder contains `.universe/workspace.json` with
     extra roots, prompt: "This workspace references N other
     project roots. Grant access to each?" → sequence of pick
     prompts, one per project root, tied to the manifest entries.
   - Store all granted handles in IndexedDB keyed by root id.

3. `src/vault/fs.js`
   - IndexedDB helper: `storeRootHandle(id, handle)` /
     `loadRootHandles()`. Each is a per-root blob.
   - On boot: iterate stored handles, `requestPermission` each.
     Prompt only for lapsed permissions.

### Verification

- Fresh install: pick a folder, no manifest exists, app works as
  single-root.
- Power user: write
  `{writeRoot}/.universe/workspace.json` with two extra roots.
  Reload app — prompts for permission on each extra root. Grants
  land in IndexedDB. Subsequent boots don't re-prompt.
- Permission lapses on one root (e.g., Chrome cleared site data
  for that folder only): app boots, that root is quietly dropped
  with a settings-pane indicator saying "re-grant needed."

### Scope estimate: ~1 day

---

## Phase 6 — Default excludes + per-root filters

**Goal.** Projects don't pollute the vault with `node_modules/`
markdown or vendored docs. Secrets never enter model prompts.

### Changes

1. `src/vault/manifest.js`
   - Compile include/exclude globs into regexes at load time.

2. `src/vault/vault.js`
   - `walkRoot` applies root-specific include/exclude filters
     ahead of the `.md` file-type filter.

3. `MULTI_PROJECT.md`
   - Add a "what Boltzsidian reads" footnote to each root's entry
     when rendered in Settings — give users a file-count preview.

4. Settings (stub, no UI yet)
   - `workspace_default_excludes` — the global fallback list.

### Verification

- Manifest with a root pointing at a project that has
  `node_modules/some-dep/README.md` — walker skips that file.
- Manifest with a root that has `include: ["docs/**/*.md", "*.md"]`
  only grabs top-level .md + docs/. Other .md files are ignored.
- Vault note count matches a `find . -name "*.md"` against the
  project filtered by the excludes.

### Scope estimate: ~4 hours

---

## Phase 7 — Minimal Settings UI (optional, can defer)

**Goal.** Power users can manage roots without editing JSON. Not
strictly required — the manifest approach is the real
interface — but friendly.

### Changes

1. `src/ui/settings.js`
   - New "Workspace roots" section.
   - Shows each root with its name, path, readOnly flag.
   - "Add root" button triggers pick + prompt for id/name/readOnly.
   - "Remove root" detaches + clears from IndexedDB + updates manifest.
   - Default write root selector (dropdown over writable roots).

2. `src/vault/manifest.js`
   - `saveManifest` fires on every edit.

### Verification

- Add a new root via the UI → handle stored in IndexedDB, manifest
  updated on disk, vault re-walks on next open.
- Remove a root → handle dropped, vault forgets it.
- Toggle a root to read-only → writes to that root get rejected.

### Scope estimate: ~1 day

---

## Phase 8 — Cross-project dream tuning

**Goal.** The whole point of multi-project is cross-pollination. Make
sure the salience layer actually finds and surfaces cross-root pairs.

### Changes

1. `src/layers/salience-layer.js`
   - Optional bias: `resonance *= 1.2` when the pair spans roots.
     Gated by a setting (`cross_root_bias: true` by default).
   - Candidate object carries `isCrossRoot: boolean` for drawer
     display.

2. `src/ui/ideas-drawer.js`
   - Cross-root candidates get a subtle "cross-project" badge (or
     just colour differently).

3. `DREAM_ENGINE.md` update
   - Note the cross-root dynamic in §11.2.

### Verification

- Run a dream cycle with two roots loaded. Check
  `salienceLayer.getSurfaced().filter(c => c.isCrossRoot).length > 0`.
- Cross-root survivors promoted end up in writeRoot/ideas/ with
  parents from both roots correctly linked.

### Scope estimate: ~4 hours

---

## Total estimate + shipping order

| Phase | Goal                           | Scope    |
| ----- | ------------------------------ | -------- |
| 0     | Audit                          | 3 hours  |
| 1     | Data model + manifest parser   | 4 hours  |
| 2     | Multi-root walker              | 1 day    |
| 3     | Root-aware writers             | 1.5 days |
| 4     | Wikilink resolution + labels   | 6 hours  |
| 5     | Manifest discovery + pick flow | 1 day    |
| 6     | Excludes + filters             | 4 hours  |
| 7     | Settings UI (optional)         | 1 day    |
| 8     | Cross-project dream tuning     | 4 hours  |

Minimum viable multi-project = Phases 0–6 = ~4.5 days.
Polished = Phases 0–8 = ~6.5 days.

Every intermediate phase ships green. We can pause after any phase
and the app is still usable.

---

## Rollback story

If at any phase the single-root flow breaks, the rollback is:

1. Feature flag in `settings.js`: `multi_root_enabled: false` by
   default for users of affected phases.
2. `vault.js` falls back to the legacy single-handle path when the
   flag is off.
3. No forward migration of settings has occurred yet (we don't
   touch persisted state until the flag is flipped).

Practical rollback is "git revert the phase's commits" — each phase
should be one or two commits so revert is clean.

---

## What we don't do in this plan

- **Per-root `.universe/` sidecars.** All state stays at writeRoot.
  If a project gets extracted and opened solo, it loses its tend
  stamps and prune candidates. Acceptable for MVP; revisit if the
  use case becomes real.
- **Qualified wikilink syntax** (`[[root/Title]]`). Prefer-same-root
  policy handles it silently. Qualified syntax is a Phase 9 that we
  build only if collision errors are observed in practice.
- **Per-root dream focus.** The whole merged vault dreams as one.
  Cross-root bias (Phase 8) is the tuning knob.
- **Moving notes between roots.** Not handled. User does this via
  filesystem; vault re-walks on next open.

---

## What this is in one sentence

Eight phases, each independently shippable, every intermediate state
green, total effort under a focused week, with the codebase audit
producing a checklist before any code is written so we never discover
a surprise single-workspace assumption halfway through.

#phase #user #reference
