---
id: 01KR0000TENDBULKRESET000000
created: 2026-04-22
---

# TEND_BULK_RESET.md — Why does "Accept all" reset the page after ~150?

Observed: press `T`, click "Accept all" on a large group, watch it
work through proposals; somewhere around the 150 mark, the whole
app reloads — losing theme selection, camera position, in-progress
Preview peak state, dream cycle, etc.

Previous hypothesis (dream wake → morning report modal) has been
shipped as a fix in tend-drawer.js, so whatever's happening now is
a different failure mode. This doc catalogs what it could be,
ranked by likelihood, and names the diagnostic that would confirm
each one.

---

## 1. What happens per accept (the full cascade)

Every proposal in the bulk loop drives this chain:

```
doAccept(proposal)
├── markReviewed(proposal.pass)
├── applyProposal({ proposal, vault, saver })
│   ├── applyTagInfer | applyObviousLink | applyFmNormalise | (stamp-only for title-collision, stub)
│   ├── stampTendedOn (appends to frontmatter tended_on array)
│   └── saver(note, nextText)
│       ├── canonicalizeForSave
│       ├── writeNoteAt(root.handle, note.path, canonText)
│       │   ├── resolveFileHandle — walks dir handles
│       │   ├── handle.createWritable()  ← creates swap file
│       │   ├── writable.write(text)
│       │   └── writable.close()          ← commits swap
│       ├── reparseNote → mutates vault.forward / backward / tagCounts / byTitle
│       ├── maybeRename (no-op for tend passes — no title change)
│       └── onNoteChanged → handleNoteChanged
│           ├── bodies.updateBody(note.id, { note })
│           ├── bodies.setPinned(...)
│           ├── physics.refreshEdgesFor(note.id)
│           ├── note.affinity = affinityFor(note)
│           ├── stateDirty = true; persistStateSoon()  (600ms debounce)
│           ├── search.invalidate()
│           └── updateStatsHud()
└── after applyProposal resolves:
    ├── physics.rebuildEdges()  ← full O(edges) rebuild
    ├── tethers.rebuild()
    ├── bodies.refreshAllKinds()
    └── removeProposal(proposal) → render() (rebuilds drawer DOM)
```

At 150 proposals, this chain runs 150 times. If the user has ~500
notes with ~1000 edges, that's 150,000 edge recomputations, 150 FS
writes with swap files, 150 reparses, 150 DOM rebuilds of the
drawer. Total disk I/O bytes: ~15 MB of small writes.

---

## 2. Suspect list, ranked

### 2A. Vite dev-server HMR full-reload (HIGH)

If the user opened the vault at a path that Vite's dev server is
watching (e.g., `boltzsidian/docs/` or `boltzsidian/public/` or
anywhere inside the repo), then every `.md` write invalidates
Vite's module graph. Vite handles this with **HMR for code, full
reload for public assets**. A bulk write of 150 files could trip
Vite's reload heuristics — especially if any of the files land
under `public/` or are imported by a module (direct or transitive).

**Why 150 specifically.** Vite's change detector coalesces rapid
changes, but beyond a threshold of pending changes or beyond a
change buffer size, it falls back to a full-page reload rather
than per-file HMR. I don't know the Vite internal number, but 100-
200 is consistent with observed "lots of files changed" heuristics
in similar dev servers.

**Diagnostic.** Ask the user: what path did they pick as the
workspace root? If it's inside the boltzsidian repo (or the
monorepo at `L:/projects_claudecode/`), this is probably it.

**Fix.** Either:

- Pick a workspace folder OUTSIDE the Vite project.
- Add the vault's top-level path to Vite's `server.watch.ignored`
  in `vite.config.js`. Best long-term solution — no behavioural
  difference for end users, kills the surprise in dev.

### 2B. FS Access WritableStream accumulation (MEDIUM-HIGH)

`handle.createWritable()` allocates a swap file per call. In
Chromium, swap files are cleaned up on `writable.close()`. If
close fails silently or a write throws before close, the swap
file leaks. Chromium has observed soft caps on concurrent open
writables that can bite at high write counts.

**Why 150 specifically.** Not a documented constant, but file
descriptor / handle limits are typically in the 100-300 range on
Chromium tabs per browsing context.

**Diagnostic.** DevTools → Application → Storage shows
per-origin quota. Also: `console.log` inside `writeFileHandle` to
count successful vs failed close() calls. If close starts throwing
around 150, this is it.

**Fix.** Throttle the bulk loop — sleep 20ms between accepts, or
use a semaphore of (say) 8 concurrent writes with async pipelining
instead of the current await-each-sequentially pattern. Slower
but stable.

### 2C. Unhandled promise rejection crashing dev mode (MEDIUM)

Vite dev mode shows an error overlay on unhandled rejections. If
the overlay appears, is dismissed, and appears again, Vite
sometimes reloads to recover. Any async error in the cascade that
escapes the `try/catch` in `tend-drawer.js:doAccept` could cause
this.

Known-unsafe spots:

- `handleNoteChanged` is synchronous but calls `persistStateSoon()`
  which schedules `persistState()` → `saveState()` → `.catch(() =>
{})`. Suppresses errors — safe.
- `search.invalidate()` — safe, pure state flip.
- `bodies.updateBody` — safe, buffer writes.
- `physics.refreshEdgesFor` — safe, array mutations.
- `physics.rebuildEdges` — iterates `vault.forward` which is a
  Map. Safe.
- **`tethers.rebuild()`** — iterates `physics.getEdges()`. Safe
  unless edges contains indices beyond `bodies.liveCount`, which
  would break the per-frame update but not throw synchronously.

**Diagnostic.** Open DevTools Console. Look for red errors
immediately before the reload. If there's a stack trace pointing
into `tethers.rebuild` or `physics.rebuildEdges`, that's the
source. If the console is clean but the page reloads, 2A is
confirmed.

**Fix.** Wrap the whole bulk loop body in try/catch that logs and
continues. Would narrow the blast radius of whatever's throwing.

### 2D. Browser tab OOM / renderer crash (LOW-MEDIUM)

150 DOM rebuilds of the tend-drawer + 150 `physics.rebuildEdges()`
creating 150 new JS arrays + 150 reparse calls creating new Sets.
Most is GC-reclaimable, but a momentary spike could exceed the
renderer heap, triggering a crash and auto-reload.

**Why 150 specifically.** Heap growth isn't deterministic, but
cumulative allocation before GC runs can approximate a linear
bound. If one accept allocates ~500 KB (Tethers reuses geom;
drawer DOM is ~10 KB; reparse is ~5 KB), 150 is ~75 MB — survivable
on most machines.

**Diagnostic.** DevTools → Performance → record the bulk-accept.
Look for a memory sawtooth. If it climbs past 1 GB and hits a
cliff (crash), this is 2D.

**Fix.** Same as 2B — throttle, and optionally chunk the DOM
rebuild (render only once at bulk-end instead of per-accept).

### 2E. persistStateSoon race (LOW)

`stateDirty = true; persistStateSoon()` fires in `handleNoteChanged`
on every save. The timer guards against re-queuing (`if
(persistTimer) return`), so at most 1 write per 600 ms. In 6
seconds of bulk accepts: ~10 writes. Each writes `state.json`
(positions for all notes, ~50-200 KB). Not a crash vector.

**Diagnostic.** Count `saveState` calls in the console during a
bulk accept. If it's more than 15, something's wrong with the
timer guard. Otherwise this isn't it.

### 2F. Drawer render churn (LOW)

`removeProposal` → `render()` → `groupsEl.innerHTML = ""` +
rebuild. 150 full DOM rebuilds of the drawer. Each rebuild
creates N `<div>` + `<button>` elements with event listeners.

If listener refs to DOM nodes accumulate in closures unreferenced
elsewhere, they'd be GC'd. The drawer module doesn't retain old
nodes in any long-lived collection.

**Why it's still worth noting.** Repeatedly calling
`innerHTML = ""` does NOT always dispose jsdom listeners in
older browsers, but modern Chromium handles it fine.

**Fix.** Render once at bulk-end rather than per-accept. Cleaner
UX anyway — the user doesn't need to see each item vanish.

### 2G. Dream wake morning report (SHIPPED FIX — should be dead)

Previously the leading suspect. Addressed by the `pointerdown`
stopPropagation in `tend-drawer.js`. If the user reports the
Morning Report modal appears mid-batch, my fix isn't catching it.
The capture-phase listener should fire before the window bubble
listener, but if something in the button click path is using
`pointerup` or synthesized events, it could still slip through.

**Diagnostic.** Does the page reset _with_ a visible Morning
Report modal, or just the app start state (pick pane)?

- Morning Report → fix insufficient, need to also block `pointerup`
  / wheel / keydown at drawer level.
- Pick pane or different state → 2G is not it.

### 2H. An auto-triggered reload from a Rescan / root change (LOW)

The only reloads in the code are explicit user actions: Rescan,
Add/Remove/Reconnect root, Demo reset. None auto-triggers during
a save cascade. Ruled out unless the workspace roots are being
mutated from elsewhere (e.g., a file-system-watcher I'm missing).

**Diagnostic.** Breakpoint on `window.location.reload` in
DevTools → Sources. If it fires during the bulk, check the stack
trace — it'll point at which path is calling it.

---

## 3. The 150 tell

Whatever's happening, the count of **~150** strongly suggests a
**quantized threshold** (not a time-based one). That's more
consistent with:

- A handle / stream limit (2B).
- Vite's change-buffer size (2A).
- A DevTools hint capturing stack traces until a buffer fills.

Time-based triggers (dream cycle at 5 minutes, idle timer) would
show variability across runs. A flat 150 is probably infrastructure.

---

## 4. Confirmation checklist for the user

When the user next sees the reset, ask them to check in order:

1. **What's the workspace folder path?** If it's inside the
   boltzsidian repo or the monorepo, 2A is very likely.
2. **Open DevTools Console before clicking Accept all.**
   - Is there an error right before the reload? If yes, share the
     stack trace — confirms 2C.
   - Any console messages from Vite about "reload" / "change"?
     Confirms 2A.
3. **DevTools → Network tab.** After the reset, is there a fresh
   document request for the app? If yes, it's a true reload
   (either 2A or 2H). If no, the app just re-rendered — 2G still
   in play despite the fix.
4. **DevTools → Performance.** Record the bulk accept. If memory
   climbs unbounded and crashes, it's 2D. If CPU is pegged on FS
   Access I/O, it's 2B.

---

## 5. Proposed fixes, ranked by blast-radius reduction

### 5A. Stop the per-accept DOM rebuild

Change `removeProposal` in tend-drawer.js to batch: mark
proposals removed, defer `render()` to after the loop (or
throttle to every 20 accepts). Eliminates 2F entirely, helps 2D
indirectly. 10-line change.

### 5B. Throttle / batch FS writes

Wrap `saver(note, nextText)` calls with a semaphore (max 4
concurrent). Addresses 2B and 2D. Requires a small Promise pool
helper — 30 lines.

### 5C. Ignore workspace paths in Vite's watcher

Add to `vite.config.js`:

```js
server: {
  watch: {
    ignored: ['**/.universe/**', '**/*.md'],
  },
},
```

Kills 2A dead without affecting end-users (the prod build has no
dev server). 5 lines.

### 5D. Chunked bulk accept with a progress indicator

Instead of await-loop, process proposals in chunks of 20 with a
yield between chunks (`await new Promise(r =>
setTimeout(r, 50))`). Shows a "accepting 40/150…" progress bar.
Lets the browser breathe between chunks. Good UX, fixes 2B+2C+2D
with margin.

---

## 6. Recommended action order

1. **Ship 5C first.** Trivial, removes the most likely suspect.
   No user-visible change except the bulk no longer reloads in
   dev mode.
2. **Ship 5A second.** Cleaner drawer behaviour regardless.
3. **If the user still sees resets, ship 5B.** Definitively
   addresses FS pressure.
4. **5D is polish** — defer until the core issue is gone.

---

## 7. Single-sentence version

The bulk-accept cascade is cheap in isolation but compounds into
~150 filesystem writes + ~150 DOM rebuilds + ~150 edge-graph
rebuilds per batch, and the most likely cause of the page reset
is Vite's dev watcher flipping into full-reload mode when it sees
that many `.md` file changes — the fix is to tell Vite to ignore
`.md` + `.universe/**` paths in `vite.config.js`.

#tend #bulk #reset #vite #performance
