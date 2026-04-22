---
id: 01KR0000TENDBULKCONCUR0000
created: 2026-04-22
---

# TEND_BULK_CONCURRENCY.md — Why Clear + re-Tend + Accept-all counted down twice and froze

Sibling to [[TEND_BULK_CRASH]]. That doc addressed the per-accept
cost (DOM churn, full re-renders, unbatched physics rebuilds).
This one explains a different class of bug: the bulk-accept loop
outliving the state it was started against.

Observed: user runs Tend, clicks Accept-all, lets it chew through
~300 proposals. Clicks Clear. Runs Tend again — 76 new proposals.
Clicks Accept-all on one. The countdown ticks, flickers, **appears
to go through multiple items per second** (much faster than the
~30 ms paced per-accept should be), then freezes.

The pacing isn't fast; **two bulk loops are running at once**.

---

## 1. What actually happens

### 1.1 The loop captures a snapshot at click-time

Current code in `tend-drawer.js`:

```js
bulk.addEventListener("click", async () => {
  bulk.disabled = true;
  try {
    onBulkStart?.();
  } catch {}
  try {
    const snapshot = proposals.filter((p) => p.pass === passId);
    for (let i = 0; i < snapshot.length; i++) {
      await doAccept(snapshot[i]);
      await new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, BATCH_PAUSE_MS));
      });
    }
  } finally {
    onBulkEnd?.();
  }
});
```

`snapshot` is a JS array captured in the click-handler closure.
It cannot be mutated or aborted from outside. Every `await` is
~28 ms (rAF + setTimeout 12 ms). Over 1280 proposals that's ~36
seconds of yielding. The loop is **alive** for that whole window.

### 1.2 Clear() doesn't stop the loop

`clear()` sets `proposals = []` and clears `reviewedByPass`, then
re-renders the drawer DOM. It doesn't touch the in-flight loop.
The closure's `snapshot` still points at the old array with its
1000+ original proposal objects.

Each iteration:

1. `doAccept(oldProposal)`.
2. `rowFor(oldProposal)` returns null (its DOM row was wiped).
   No-op.
3. `markReviewed(oldProposal.pass)` still increments — **unlocks
   Accept-all for that pass group in the new render.**
4. `await onAccept(oldProposal)` runs main.js's logic, calls
   `applyProposal` which reads `vault.byId.get(oldProposal.noteId)`
   — the note still exists in the vault (Clear only wiped the
   drawer, not the vault). Tag-infer / obvious-link / fm-normalise
   all fire on the note. Saver writes the note AGAIN with an extra
   stamp.
5. `removeProposal(oldProposal)` — `findIndex === -1` on the now-
   cleared array, so removing from `proposals` is a no-op, but it
   also clears `renderedIds` (no-op) and tries to splice a count
   span (no matching row, no-op).
6. Loop continues to next stale item.

### 1.3 setProposals() for the new Tend run doesn't stop the loop either

When the user runs Tend again, `runTendAndOpen` calls
`tendDrawer.setProposals(ranked)`. That REPLACES the `proposals`
array with a fresh reference. The old array survives only in the
first bulk loop's closure. New render shows 76 items.

### 1.4 User clicks Accept-all on the new 76

That starts a SECOND bulk loop. It has its own `snapshot` of 76
items. Now:

- Loop 1: iterating its old 1000+ snapshot, each iteration writes
  a stale tend stamp to a note already tended, at ~35 items/s.
- Loop 2: iterating its new 76 snapshot at ~35 items/s.

Both call the same `doAccept`. Both call `removeProposal`. Both
hit the saver for writes against the vault.

### 1.5 What the user sees

- The NEW 76 proposals vanish from the drawer FASTER than a single
  loop could process them, because both loops are calling
  `removeProposal` on them (Loop 1 no-ops since they aren't in
  its snapshot, but Loop 2 processes them AND Loop 1 keeps firing
  stamps on unrelated stale notes).
- The count span of the new group ticks DOWN multiple times per
  accept because `removeProposal`'s DOM count update fires from
  Loop 2 while Loop 1 is independently stamping reviewed counts.
- `bulk.disabled = true` was set per-group from the closure-bound
  button — but a fresh render after Clear creates a NEW bulk
  button DOM node. Old button ref in Loop 1's closure is a
  detached DOM node. The new button starts enabled.
- Both loops compete for the main thread. FS writes serialize in
  the browser; duplicate writes against the same note collide.
  Eventually the system OOMs or the tab watchdog kicks in.

---

## 2. Root cause

**The bulk-accept loop doesn't have a lifecycle tied to the
proposal list.** It's fire-and-forget. When the proposal list
invalidates — via Clear or setProposals — the loop is unaware.

Three specific failures:

1. No abort signal checked between iterations.
2. `Clear()` doesn't notify any running loop.
3. `setProposals()` doesn't notify any running loop.
4. The bulk button's disabled state is attached to a specific DOM
   element that gets thrown away on re-render — not to any
   drawer-level "bulk in progress" flag.
5. `onBulkStart` / `onBulkEnd` callbacks into main.js only gate
   POLISH + SALIENCE. They don't prevent a second bulk from
   starting inside the drawer itself.

---

## 3. Fix: single bulk-lifecycle, abortable

### 3.1 Drawer-level bulk lock

A single module-scoped `bulkRunId` counter + `activeBulkId`
tracker:

```js
let bulkRunId = 0;
let activeBulkId = null;
```

On `clear()` and `setProposals()`: `bulkRunId++`. Any loop
checking `myId !== bulkRunId` aborts.

Bulk click handler:

```js
bulk.addEventListener("click", async () => {
  if (activeBulkId != null) return; // already running, ignore
  const myId = ++bulkRunId;
  activeBulkId = myId;
  bulk.disabled = true;
  try {
    onBulkStart?.();
  } catch {}
  try {
    const snapshot = proposals.filter((p) => p.pass === passId);
    for (let i = 0; i < snapshot.length; i++) {
      if (activeBulkId !== myId) break; // ← abort check
      await doAccept(snapshot[i]);
      await yieldFrame();
    }
  } finally {
    if (activeBulkId === myId) activeBulkId = null;
    onBulkEnd?.();
  }
});
```

### 3.2 Cancel on proposal-list mutation

```js
function clear() {
  activeBulkId = null; // invalidate any running bulk
  proposals = [];
  reviewedByPass.clear();
  renderedIds.clear();
  render();
}

function setProposals(next) {
  activeBulkId = null; // same
  proposals = Array.isArray(next) ? next.slice() : [];
  reviewedByPass.clear();
  renderedIds.clear();
  render();
}
```

The loop checks `activeBulkId !== myId` on every iteration. If
something else mutates the proposal list, the loop breaks mid-
iteration and the finally re-enables state cleanly.

### 3.3 Global bulk guard across groups

The current per-button `bulk.disabled = true` disables ONE
group's button. A user could click Accept-all on group A, then
immediately on group B (before group A's closure finishes), and
get two concurrent loops from the same session.

Fix: on bulk start, disable EVERY bulk button in the drawer:

```js
function disableAllBulkButtons() {
  for (const b of drawer.querySelectorAll(".tend-bulk-btn")) {
    b.disabled = true;
  }
}
function restoreBulkButtons() {
  for (const b of drawer.querySelectorAll(".tend-bulk-btn")) {
    const passId = b.closest(".tend-group")?.dataset.pass;
    if (!passId) continue;
    const reviewed = reviewedByPass.get(passId) || 0;
    b.disabled = reviewed < BULK_UNLOCK_MIN;
  }
}
```

Call `disableAllBulkButtons()` at loop start, `restoreBulkButtons()`
in the finally.

### 3.4 Defensive: doAccept tolerates cleared proposals

`doAccept` already short-circuits if `rowFor` returns null (no DOM
row = already removed). But it still calls `markReviewed` and
awaits `onAccept`, which triggers the full save cascade for a
proposal that no longer exists in the user's intent.

Guard the entry:

```js
async function doAccept(proposal) {
  if (!proposals.includes(proposal)) return; // already gone
  // … existing body
}
```

Covers the edge case where an in-flight bulk got ONE more
iteration in between cancellation check and loop body.

---

## 4. What not to do

- **Don't share `onBulkStart`/`onBulkEnd` to block externally.**
  They gate background work (polish, salience). They're not the
  drawer's own concurrency lock. Keep those responsibilities
  separate: main.js handles background pausing, drawer handles
  its own loop lifecycle.
- **Don't try to serialize loops with a queue.** If the user
  clicked Accept-all on a different group, they probably meant to
  cancel the previous one. Starting the new one cleanly is better
  than chaining.
- **Don't make `doAccept` async-lock.** The per-accept yield gives
  the loop its paint frame. Re-entering doAccept itself isn't the
  problem — the loops running side by side against the same
  mutable state is.

---

## 5. Verification

After fix:

1. Tend → Accept-all on a 100-proposal group. Clear while it's
   running. Count stops. Drawer empties immediately.
2. Tend → 76 proposals → Accept-all. Single bulk loop runs to
   completion at ~35 items/s. No flicker, no multi-count-down.
3. Tend → Click Accept-all on group A, while it's running click
   Accept-all on group B. B's button is disabled until A's loop
   ends. (Or, if we choose "newest wins" semantics: A aborts and
   B starts.)
4. Tend → during bulk, Clear → run Tend → during NEW bulk,
   previous loop's stamps do NOT appear on notes.

---

## 6. Scope

~30 minutes. All changes in `tend-drawer.js`:

- Add `bulkRunId` / `activeBulkId` module state.
- Guard in bulk button click handler.
- Invalidate in `clear()` and `setProposals()`.
- Disable-all / restore-all helpers.
- `doAccept` membership check.

No main.js changes required. The existing `onBulkStart`/`onBulkEnd`
callbacks still fire on every lifecycle start/end — main.js's
polish + salience pausing continues to work without change.

---

## 7. One sentence

The bulk-accept loop is a fire-and-forget closure that outlives
anything that invalidates its proposal list — Clear, setProposals,
and a second Accept-all all leave the first loop running in the
background, and when two loops run at once against a shared
proposals array the user sees multi-count-down and eventually a
frozen tab.

#tend #bulk #concurrency #race
