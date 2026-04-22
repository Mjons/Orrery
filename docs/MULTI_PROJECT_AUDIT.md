---
tended_on: [tag-infer]
id: 01KPS7VDMJP20SD4H90X1YM5HM
created: "2026-04-21T22:45:40.611Z"
---

# MULTI_PROJECT_AUDIT.md — Phase 0 inventory

Output of `MULTI_PROJECT_PLAN.md` Phase 0. Every single-workspace
assumption in the current codebase, every write path with its
intended root resolution, and every `vault.byTitle` call site. This
is the reference doc Phases 1–6 cross off.

**Do not edit during implementation.** If a new call site is
discovered mid-phase, add a row here first, then touch code.

---

## Headline numbers

- `workspaceHandle` references: **27** (all in `main.js`)
- `vault.root` references: **5** (1 in `promote.js`, 4 in `save.js`)
- `ws.handle` references: **4** (all in `main.js` — initial capture)
- Writer-functions that take `rootHandle` explicitly: **6** distinct
  functions across `weed.js`, `prune.js`, `dream-log.js`, `writer.js`
- `vault.byTitle` call sites: **10** across 5 files

---

## Category A — The `workspaceHandle` module-level variable

Single `let workspaceHandle = null` in `src/main.js:101`. Assigned
once on workspace load at `main.js:855` (`workspaceHandle = ws.handle`).
Every Boltzsidian write path (outside the saver pipeline) reaches
through this variable for the root directory handle.

### A.1 Reads (need root resolution)

| Site                            | File:Line               | Current behaviour             | Phase-3 target                                                        |
| ------------------------------- | ----------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `saveWeedKeep`                  | main.js:266,490,517,586 | Writes keep-list              | writeRoot                                                             |
| `deleteNoteFile` (panel delete) | main.js:381             | Deletes source note           | **source note's root**, gated by `root.readOnly`                      |
| `archiveNote` (weed bulk)       | main.js:494,527         | Moves to archive              | **source note's root** for the read, writeRoot for the archive target |
| `deleteNoteFile` (weed single)  | main.js:503             | Deletes source note           | **source note's root**, gated by `readOnly`                           |
| `loadPruneCandidates`           | main.js:579,605         | Reads prune candidates        | writeRoot                                                             |
| `loadWeedKeep`                  | main.js:604             | Reads keep-list               | writeRoot                                                             |
| `writePruneCandidates`          | main.js:1083            | Writes prune candidates       | writeRoot                                                             |
| `writeDreamLog`                 | main.js:1087            | Writes dream log              | writeRoot                                                             |
| `saveState`                     | main.js:1363            | Writes positions cache        | writeRoot                                                             |
| `ws.handle` (init)              | main.js:855,858,865,884 | Initial single-handle capture | Phase 5 — becomes multi-root boot                                     |

Also exposed via the dev hook at main.js:1938 — `__boltzsidian.handle`
returns `workspaceHandle`. Phase 5 should rename to `roots` returning
the array + make the legacy getter still work (return writeRoot's
handle) for backwards-compat with any session-saved console snippets.

---

## Category B — Writer functions (already parameterised)

These already take `rootHandle` as their first argument. They don't
need refactoring; they need their CALL SITES to pass the right
handle. Good news — the signature is already right.

### B.1 Vault writers (`src/vault/writer.js`)

All take `root` as first param. Pure pass-through.

- `writeNoteAt(root, path, text)` — line 10
- `createNoteAt(root, path, text)` — line 16
- `renameNote(root, oldPath, newPath)` — line 22
- `deleteNote(root, path)` — line 52 (separate from `deleteNoteFile` in weed.js)

Called from:

- `save.js:40,43,78,95` — uses `vault.root` (single-root assumption)
- `promote.js:116` — uses `vault.root` (single-root assumption)

These two callers are the ones that break in multi-root mode.

### B.2 Weed module (`src/layers/weed.js`)

Already takes `rootHandle` as first arg:

- `loadPruneCandidates(rootHandle)` — line 30
- `loadWeedKeep(rootHandle)` — line 53
- `saveWeedKeep(rootHandle, state)` — line 76
- `archiveNote(rootHandle, path)` — line 111
- `deleteNoteFile(rootHandle, path)` — line 149

All Phase-3 call sites just need to pass the right handle instead of
`workspaceHandle`.

### B.3 Dream log (`src/layers/dream-log.js`)

- `writeDreamLog(rootHandle, artifacts)` — line 13

Good shape.

### B.4 Prune (`src/layers/prune.js`)

- `writePruneCandidates(rootHandle, list)` — line 54

Good shape.

### B.5 State store (`src/vault/state-store.js`)

- `loadState(root)` — somewhere around line 14
- `saveState(root, state)` — line 27

Good shape. All `.universe/state.json` writes route through here.

---

## Category C — Writers using `vault.root` (single-root baked in)

Two files reach into `vault.root` instead of taking a handle param.
These MUST be refactored in Phase 3.

### C.1 `src/vault/save.js`

```
line 40:   await createNoteAt(vault.root, note.path, canonText);
line 43:   await writeNoteAt(vault.root, note.path, canonText);
line 78:   await renameNote(vault.root, note.path, newPath);
line 95:   await writeNoteAt(vault.root, patch.note.path, patch.text);
```

`createSaver` closure captures a reference to the vault. In
multi-root, `vault.root` doesn't exist — there isn't one root. Fix:
resolve `note.rootId` → `rootHandle` inside each call.

### C.2 `src/layers/promote.js`

```
line 116:  await createNoteAt(vault.root, path, rawText);
```

Promoted ideas go to writeRoot, not to any individual project root.
Fix: take writeRoot as an explicit param OR read it from the vault's
roots list.

---

## Category D — `vault.byTitle` callers (collision handling)

`vault.byTitle` is `Map<lowercased-title, Note>` today. For multi-
root, titles can collide across roots. Becomes `Map<title, Note[]>`
with a `resolveLink(title, sourceNote)` helper that applies the
prefer-same-root policy.

### D.1 Call sites (mutations.js is the owner; others are callers)

| Site                   | File:Line                          | Current usage                        | Phase-2/4 target                               |
| ---------------------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Owner writes           | mutations.js:40,56,104,105,204,206 | Map set/get/delete/has               | Become array ops (`push`, `filter`, `indexOf`) |
| Tend obvious-link      | tend.js:158                        | `for ([lower, target] of byTitle)`   | Iterate all notes from all arrays              |
| Note-panel link hover  | note-panel.js:189                  | `byTitle.get(lower)`                 | `resolveLink(lower, current)`                  |
| Note-panel link render | note-panel.js:568                  | `byTitle?.get(target.toLowerCase())` | `resolveLink(target, current)`                 |
| Suggestions            | suggestions.js:112                 | Iterates entries                     | Iterate all notes from all arrays              |

Everywhere `byTitle.get(x)` returns a single note today. In multi-
root, it must return an array. Callers either iterate, or call the
new `resolveLink` helper with context.

---

## Category E — New-note creation paths

When a user creates a note (Cmd+N, or dream promote), which root
does it land in? Today there's only one option. Multi-root needs to
pick `writeRoot`.

### E.1 `createNewNote` (main.js:1368)

```
const taken = new Set(vault.notes.map((n) => n.path));
const path = uniquePath("", titleToStem("Untitled"), taken);
const note = makeEmptyNote({ path, title: "Untitled", settings });
...
addNoteToVault(vault, note);
```

- `taken` computed from ALL roots' notes → Phase-3 should filter to
  notes with same rootId as the target write-root to avoid false
  collisions between projects.
- `path` is relative to write-root (not any specific project).
- `makeEmptyNote` sets `note.path` but not `note.rootId` — Phase-1
  adds `rootId` param with default of the writeRoot's id.

### E.2 `promoteIdea` (promote.js:137)

```
addNoteToVault(vault, note);
```

New promoted idea needs `rootId: writeRoot.id` stamped on it.
Uniqueness check against `vault.notes` should be writeRoot-scoped.

### E.3 `makeEmptyNote` signature

```
makeEmptyNote({ path, title, settings })
```

Phase 1 adds `rootId` to this signature. Callers default to
writeRoot when not specified.

---

## Category F — The pick flow

### F.1 Current initial workspace pick

`src/main.js` has a welcome pane with "Pick workspace" / "Start
demo" buttons. On pick, it calls `showDirectoryPicker()`, gets a
handle, and hands the result to `setWorkspace(ws)` where `ws =
{ handle, kind: "user" | "demo" }`.

Phase 5 target: the pick remains the "sole or writeRoot" pick. If
a manifest is found at `writeRoot/.universe/workspace.json`, prompt
for additional root grants. If no manifest, single-root behaviour
continues.

### F.2 Demo vault

`src/vault/opfs.js` installs a demo vault into OPFS and hands back
an OPFS-backed directory handle. The rest of the code doesn't
distinguish FS-Access vs OPFS handles (both implement the same API).

**Phase 5 decision**: demo vault stays single-root. The `kind` field
(`"demo"` vs `"user"`) persists — demo never gets a manifest.

### F.3 Permission persistence

Currently the workspace handle is stored once on pick, and re-
requested for permission on every reload via `ensurePermission`.
No IndexedDB storage. Phase 5 adds per-root IndexedDB persistence.

---

## Category G — The `vault` object shape

Defined in `src/vault/vault.js` line 69+:

```js
{
  root,           // single directory handle
  notes,          // flat array of Note
  byId,           // Map<noteId, Note>
  byTitle,        // Map<lowercased-title, Note>
  forward,        // Map<noteId, Set<noteId>>   outgoing links
  backward,       // Map<noteId, Set<noteId>>   incoming links
  tagCounts,      // Map<tag, count>
  densityById,    // Map<noteId, density>
  stats,          // { notes, links, tags, elapsedMs }
}
```

### G.1 What changes in Phase 2

```js
{
  // root removed; replaced by:
  roots,          // Array<RootSpec>          — all opened roots
  writeRootId,    // string                   — which root receives writes
  // existing fields:
  notes, byId, forward, backward, tagCounts, densityById, stats,
  // byTitle becomes:
  byTitle,        // Map<lowercased-title, Note[]>
}
```

### G.2 Helper API to add

```js
vault.getRootHandle(rootId); // returns FileSystemDirectoryHandle
vault.getWriteRoot(); // returns the writeRoot RootSpec
vault.getRootForNote(noteId); // returns RootSpec for that note
vault.resolveLink(title, from); // apply prefer-same-root policy
```

These become the only API surface for "where is this note." All
code that today reaches into `vault.root` or `note.path` without
context should use one of these.

---

## Full file touchlist — per-phase

This is the shopping list. Each column is the phase that first
touches the file; some files get multiple passes.

| File                          | P1  | P2  | P3  | P4  | P5  | P6  |
| ----------------------------- | :-: | :-: | :-: | :-: | :-: | :-: | ---- |
| src/vault/manifest.js (new)   |  ✔  |     |     |     |  ✔  |  ✔  |
| src/state/settings.js         |  ✔  |     |     |     |  ✔  |  ✔  |
| src/vault/vault.js            |     |  ✔  |     |     |     |  ✔  |
| src/vault/walker.js           |     |  ✔  |     |     |     |  ✔  |
| src/vault/mutations.js        |     |  ✔  |     |  ✔  |     |     |
| src/vault/save.js             |     |     |  ✔  |     |     |     |
| src/vault/writer.js           |     |     |     |     |     |     |
| src/vault/state-store.js      |     |     |  ✔  |     |     |     |
| src/vault/fs.js               |     |     |     |     |  ✔  |     |
| src/vault/opfs.js             |     |     |     |     |     |     |
| src/layers/promote.js         |     |     |  ✔  |  ✔  |     |     |
| src/layers/tend-apply.js      |     |     |  ✔  |     |     |     |
| src/layers/tend.js            |     |  ✔  |     |  ✔  |     |     |
| src/layers/prune.js           |     |     |     |     |     |     |
| src/layers/dream-log.js       |     |     |     |     |     |     |
| src/layers/weed.js            |     |     |  ✔  |     |     |     |
| src/ui/note-panel.js          |     |     |     |  ✔  |     |     |
| src/ui/ideas-drawer.js        |     |     |     |  ✔  |     |     |
| src/ui/search.js              |     |     |     |  ✔  |     |     |
| src/ui/suggestions.js         |     |  ✔  |     |     |     |     |
| src/ui/pick.js or main-inline |     |     |     |     |  ✔  |     |
| src/ui/settings.js            |     |     |     |     |     |     | (P7) |
| src/main.js                   |  ✔  |  ✔  |  ✔  |  ✔  |  ✔  |  ✔  |

`main.js` shows up every phase because it's the glue. That's
expected — each phase is a small diff there, not a rewrite.

Files marked with no ticks are already safe: `writer.js` already
takes `root` as a param (category B), `prune.js`/`dream-log.js`
already take `rootHandle`, `opfs.js` is demo-only, `parser.js` is
pure text transformation.

---

## Risk map (specific to what the audit surfaced)

### R1 — The saver closure captures a single `vault`

`createSaver({ vault, onChanged })` in `save.js` keeps `vault` in
its closure. When that `vault` has multiple roots, `vault.root`
doesn't exist. **Fix is localised to save.js Phase 3.** Everywhere
the saver is _called_ already passes the note — saver can resolve
note → root internally.

### R2 — `vault.byTitle.get(x)` returns a single note, callers assume it

Five places do this (Category D). The new `resolveLink(title,
sourceNote)` helper needs to land with a compatible single-note
return signature — even under multi-root with collisions, the
helper returns one note (or null), just with the prefer-same-root
tie-breaker applied. That keeps the callers' shape unchanged.

### R3 — `uniquePath` collisions are cross-root today

`createNewNote` in main.js does `new Set(vault.notes.map(n =>
n.path))`. In multi-root, two notes in different projects can have
the same `path` relative to their own root. The "taken" set must
be scoped to the target write-root. **Fix is in createNewNote
Phase 3.**

### R4 — The workspace pick flow knows about `kind: "demo" | "user"`

Phase 5 needs to preserve that distinction. A demo workspace should
NOT try to load a manifest. Easiest: `kind: "demo"` short-circuits
to single-root behaviour before manifest parsing runs.

### R5 — No current place stamps `rootId` on notes

Phase 2 is where `rootId` first appears. Any code path that creates
a Note object and doesn't go through `walkRoot` → `makeEmptyNote`
→ `promoteIdea` (e.g. test fixtures, future importers) MUST stamp
`rootId`. Add the field to `makeEmptyNote` with a required param —
omission should throw loudly in development.

### R6 — OPFS demo path

`src/vault/opfs.js` builds demo content and passes its OPFS
directory handle as a single rootHandle. Phase 5 must keep this
path alive. Simplest: demo's manifest is synthesised as a
single-root manifest with the OPFS handle as both sole root and
writeRoot. No code change in opfs.js itself.

### R7 — The dev hook exposes `workspaceHandle`

`__boltzsidian.handle` returns `workspaceHandle`. Phase 5 should
preserve this as writeRoot's handle for backward compat with any
session snippets.

---

## Smoke-test plan per phase

Each phase's "done" criteria mapped to a specific console command or
UX check against the **demo vault** (single-root baseline) OR a
**two-root manifest** with the writeRoot + one of Michael's real
project directories.

### P1 smoke-test

- Demo vault still opens, reads, edits as before.
- `__boltzsidian.__parseManifest('{"roots":[{"id":"a","name":"A","path":"/x"}],"writeRootId":"a"}')`
  returns a normalised RootSpec array.
- `parseManifest` rejects `{"writeRootId":"nope"}` with a readable
  error.

### P2 smoke-test

- Demo vault `__boltzsidian.vault.notes.every(n => n.rootId === "demo")`
  is true.
- `__boltzsidian.vault.byTitle.get("...")` returns an ARRAY, not a
  single note.
- `__boltzsidian.vault.resolveLink("README", sourceNote)` returns
  the same-root match when a collision exists.

### P3 smoke-test

- Single-root user: Cmd+N creates a new note at writeRoot (= their
  sole root). All behaviour identical.
- Two-root user: Cmd+N creates a note at writeRoot only. The other
  root stays untouched (`git status` inside it is clean).
- Tend Accept on a read-only note shows a toast and skips write.
- Tend Accept on a writable note updates the file as before.

### P4 smoke-test

- Two-root setup, both have `README.md`. Click `[[README]]` from
  within root A → lands on root A's README.
- Drawer shows "root: A" tag next to README when hovered.

### P5 smoke-test

- Fresh install, pick one folder, no manifest — single-root.
- Drop a `workspace.json` in `writeRoot/.universe/` with one extra
  project. Reload. Single permission prompt for that one project.
  After grant, walk loads both roots.

### P6 smoke-test

- Point a root at a real project with `node_modules` → walker skips
  those .md files entirely.
- Note count matches `find <path> -name "*.md" | grep -v node_modules
| wc -l`.

---

## Next action

Phase 1 — `src/vault/manifest.js` + `src/state/settings.js` schema
change + dev-hook for `parseManifest`. Estimated 4 hours. No
user-visible change; the sole-root flow is dormantly still in
place.

#phase #panel #reference
