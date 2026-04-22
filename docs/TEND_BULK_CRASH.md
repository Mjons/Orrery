---
id: 01KR0000TENDBULKCRASH00000
created: 2026-04-22
---

# TEND_BULK_CRASH.md — The page crashes ~300 accepts into a 1280-proposal batch

Sibling to [[TEND_BULK_RESET]]. Previous doc diagnosed Vite's dev
watcher. That fix is shipped. User ran Accept-all again against a
1280-proposal batch; app chewed through ~300 (1280 → 980) then
froze and the tab crashed. This doc identifies why and what to do.

Short answer: **it's not FS I/O, it's DOM.** The tend drawer
re-renders its entire proposal list on every accept. At 1280
proposals × ~8 DOM elements each × 300 accepts, that's ≈ **3 million
DOM node creations + deletions** before the tab dies.

The file system is fine. The renderer is not.

---

## 1. The real cost per accept

In [`tend-drawer.js:render()`](../boltzsidian/src/ui/tend-drawer.js):

```js
function render() {
  drawer.classList.toggle("has-items", proposals.length > 0);
  groupsEl.innerHTML = ""; // ← wipes ENTIRE list
  if (proposals.length === 0) return;
  // … buckets by pass, then per pass:
  for (const p of items) wrap.appendChild(renderItem(p)); // ← rebuilds
  //   every item
  // … appends `wrap` to groupsEl
}
```

And `removeProposal(proposal)` in the same file:

```js
function removeProposal(p) {
  proposals.splice(i, 1);
  render(); // ← full re-render on every accept
}
```

So accepting ONE proposal:

1. `groupsEl.innerHTML = ""` — destroys ALL ~1280 rendered nodes.
2. `render()` loops ALL remaining proposals (~1279).
3. For each: creates `<div class="tend-item">`, plus 5-7 child
   elements (diff, target, reason, actions, 3 buttons with event
   listeners).
4. Appends back into the DOM.

Per accept at mid-batch (say 1100 remaining):

- **~7,700 DOM nodes destroyed.**
- **~7,700 DOM nodes created.**
- **~3,300 event listeners attached.**
- Layout reflow on `appendChild` into a visible panel.

Over 300 accepts, conservative numbers:

| Operation              | Per accept | × 300                            |
| ---------------------- | ---------- | -------------------------------- |
| DOM nodes destroyed    | ~7,500     | **2.25 million**                 |
| DOM nodes created      | ~7,500     | **2.25 million**                 |
| Event listeners bound  | ~3,000     | **900 k**                        |
| Text nodes allocated   | ~4,000     | **1.2 million**                  |
| Layout reflows (panel) | 1          | 300 (each against ~10k children) |

The browser's layout engine can't keep up. Renderer heap bloats
with orphaned detached nodes that GC is struggling to collect while
the next `innerHTML = ""` fires. Eventually the tab's renderer
process OOMs or the watchdog kills it for unresponsiveness.

---

## 2. Why it's 300 and not 1280

Two things decide the cliff:

- **Remaining-proposal count.** Cost per accept is roughly
  `O(remaining)`, since we re-render the full list. At 1280
  remaining, one accept is ~10,000 DOM ops. At 980 remaining,
  still ~7,840. Total cost integrated over 300 accepts is ~3M ops.
- **GC pace.** Most of those DOM nodes are unreachable the moment
  `innerHTML = ""` replaces them, so they should be GC'd. But GC
  pauses during heavy mainloop churn. If GC doesn't get a breath,
  the pile grows faster than it's reaped.

The 300 figure is where the renderer heap runs out of slack between
GCs. On a different machine / different proposal density, the
cliff could be anywhere from 150 to 500.

---

## 3. Other contributors (smaller but real)

### 3.1 physics.rebuildEdges() full rebuild every accept

`tend-drawer.onAccept` in main.js calls:

```js
if (physics) physics.rebuildEdges();
if (tethers) tethers.rebuild();
if (bodies) bodies.refreshAllKinds?.();
```

`physics.rebuildEdges` iterates `vault.forward` (full edge set)
and builds a new array. For a 1000-edge vault, that's 1000 Set
iterations and 1000 object allocations per accept. 300 accepts
× 1000 = 300k object allocations + equivalent garbage. Not
catastrophic, but adds to GC pressure piled on top of §1.

Most tend passes (tag-infer, fm-normalise, title-collision, stub)
DO NOT change the link graph. Only `obvious-link` adds an edge.
Rebuilding the whole edge set on every pass is wasted work.

### 3.2 tethers.rebuild()

Also iterates the full edge set (via `physics.getEdges()`). Same
O(edges) story. Segments pool is reused so no geometry alloc —
cheap relative to §1.

### 3.3 bodies.refreshAllKinds()

Iterates all live bodies (not proposals). For a 500-note vault,
500 iterations per accept = 150k iterations over 300 accepts.
Negligible CPU but more GC work.

### 3.4 State persistence

`persistStateSoon()` debounced at 600 ms. Over a 10s burst,
maybe 15 writes of `state.json`. Non-trivial I/O but the writes
are async and out of the hot loop. Not the cliff.

---

## 4. Why 1280 proposals is outside normal scale

For context: a typical Tend pass on a few-hundred-note vault
produces 10-50 proposals. 1280 implies:

- A freshly-indexed vault that's never been tended.
- Obvious-link pass triggering on most notes (every note mentions
  a sibling title somewhere in its body).
- Tag-infer triggering on most notes.

The drawer was designed for per-session review, not "tidy a fresh
vault in one go." It does not scale past ~200 pending items
because every render walks them all.

---

## 5. Fixes, ranked by blast-radius-per-line

### 5A. Remove just the accepted item, don't re-render the list

**The single biggest lever.** Change `removeProposal` to:

1. Find the DOM row via existing `rowFor(proposal)`.
2. `row.remove()`.
3. Update the group's count span by reading the remaining items.
4. If the group is now empty, remove the whole group wrap.
5. If all proposals gone, toggle the `has-items` class.

That's ~20 lines. No more O(remaining) per accept — each accept
becomes **O(1)** for DOM work.

Projected impact: a 1280 → 0 batch becomes 1280 DOM removals +
1280 count updates ≈ **2,560 DOM ops total** instead of 3
million. Three orders of magnitude cheaper.

### 5B. Skip physics.rebuildEdges for passes that don't touch the graph

Pass-aware post-apply:

```js
const needsEdgeRebuild = proposal.pass === PASSES.OBVIOUS_LINK;
if (needsEdgeRebuild && physics) physics.rebuildEdges();
if (needsEdgeRebuild && tethers) tethers.rebuild();

// Kind changes only come from tag-infer.
const needsKindRefresh = proposal.pass === PASSES.TAG_INFER;
if (needsKindRefresh && bodies) bodies.refreshAllKinds?.();
```

For a batch that's mostly fm-normalise + title-collision (common
after DOCS_AGENT runs), this drops per-accept work to near zero
on the physics side. ~10 lines.

### 5C. Debounce physics/tethers rebuilds to end-of-batch

Even when edges change, we don't need to rebuild per-edge. One
rebuild at the end of the bulk loop is enough. Pattern:

```js
let pendingRebuild = false;
function schedulePhysicsRebuild() {
  if (pendingRebuild) return;
  pendingRebuild = true;
  queueMicrotask(() => {
    if (physics) physics.rebuildEdges();
    if (tethers) tethers.rebuild();
    pendingRebuild = false;
  });
}
```

Coalesces N rebuilds per tick into 1. ~15 lines.

### 5D. Chunked bulk accept with yield

Process 20 proposals, then `await new Promise(r => requestAnimation
Frame(r))` to give layout + GC a chance to breathe. Prevents the
renderer starving.

```js
for (let i = 0; i < items.length; i++) {
  await doAccept(items[i]);
  if (i % 20 === 19) await nextFrame();
}
```

~5 lines. Doesn't fix the root cost but makes the cost survivable.

### 5E. Cap the drawer's rendered set

Only render the first 100 proposals as DOM; show a
"+1180 more, hidden to keep the UI fast — process them in batches"
hint. Re-render when the user accepts enough to drop below 100.

More UX decision than engineering, but protects the drawer from
pathological proposal counts that real users actually hit during
first-tidy-up sessions. ~40 lines.

### 5F. Progress indicator on Accept all

Show "Accepting 42/150… (Esc to stop)." Allows abort. Makes the
slow case feel acceptable instead of frozen. Pairs with 5D. ~30
lines of DOM + escape handling.

---

## 6. Recommended ship order

1. **5A first** (incremental DOM). Three orders of magnitude on
   the hot path. This alone likely eliminates the crash.
2. **5B second** (skip unneeded physics rebuilds). Cheap and
   correct — we were doing wasted work anyway.
3. **5C third** (end-of-batch physics rebuild). Belt-and-suspenders
   for the edge-changing passes.
4. **5D** (chunked yield) if 5A/B/C aren't enough on very large
   batches.
5. **5E + 5F** (cap + progress) if the user still hits it on
   5000-proposal vaults after the above.

5A + 5B alone should handle 1280 proposals without breaking a
sweat. I'd ship those two, ask you to retry the batch, and decide
from there.

---

## 7. Why this wasn't caught earlier

The drawer was designed at a scale of ~30 proposals. At that scale
re-rendering is free. No amount of code review catches "this is
O(n²) against a rare n." Only a real 1280-proposal vault exposes
the asymptote.

This is the normal shape of scaling bugs: the code looks fine, the
cost is buried in a constant that becomes a variable under
pressure. The fix is to notice the asymptote and pay attention to
the hot path.

---

## 8. One sentence

The drawer rebuilds its entire list from scratch on every single
accept, so a 1280-proposal batch spends all its time thrashing
the DOM — the fix is to remove the accepted row in-place and never
touch the other 1279 siblings.

#tend #bulk #dom #performance #scaling
