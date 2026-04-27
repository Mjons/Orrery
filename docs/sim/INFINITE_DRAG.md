---
tended_on: [tag-infer]
id: 01KPS7VDH6B33RX07P29T2MHQ3
created: "2026-04-18T18:29:28.701Z"
---

# INFINITE_DRAG.md — Edge-Wrapping Mouse Drag

Exploration for "when the mouse hits an edge, it teleports to the opposite
edge so the drag can continue." The goal is to let the user orbit or pan
the camera as far as their arm can push, without ever running out of
screen.

---

## Reality check up front

Browsers **cannot move the OS cursor**. There's no API — `mousemove`
events are read-only, `Element.setPointerCapture` doesn't reposition the
pointer, and CSS can't fake it either. A literal "teleport the cursor
sprite to the opposite edge" implementation is not possible in a web
page. Anyone who tells you otherwise is thinking of a native app.

The web has exactly one primitive that delivers the desired _behaviour_:
**Pointer Lock API**. It hides the cursor and streams raw movement deltas
(`event.movementX/Y`) with no edge at all. From the user's point of view,
it's infinite drag — because there is no cursor sprite to collide with an
edge. This is what Blender, Figma (for pan tool), Unreal's editor, etc.
use.

So the honest feature is: **"while a drag is in progress, enter pointer
lock so the drag can extend indefinitely."** The cursor disappears
during the drag, which is exactly what the user wants — they're
manipulating the scene, not pointing at anything.

---

## How this fits OrbitControls

Current setup ([index.html:1177](index.html#L1177)):

```js
const controls = new OrbitControls(camera, canvasEl);
```

OrbitControls binds its own pointer handlers to `canvasEl` and derives
rotation/pan from absolute pointer positions, not deltas. Two options:

### Option A — Wrap OrbitControls (minimal intervention)

Keep OrbitControls as-is. Add a thin layer that:

1. On `pointerdown` (on canvas, with the buttons OrbitControls would act
   on — LMB for rotate, MMB/RMB for pan), request pointer lock.
2. While locked, synthesise fake `pointermove` events with absolute
   coordinates that accumulate from `movementX/Y`. Dispatch them to the
   canvas so OrbitControls sees a pointer that never hits an edge.
3. On `pointerup`, release pointer lock. Cursor reappears where it was.

**Pros:** no OrbitControls changes. ~40 lines. Reversible feature-flag.
**Cons:** synthesising events is a little hacky; if three.js ever
changes its handler to read `clientX` directly from the native event
object we're fine, but if it reads something else we rewrite the shim.

### Option B — Fork a tiny OrbitControls-delta-mode

Copy OrbitControls' rotate/pan math into our own handler, drive it from
`movementX/Y` while locked. Skip OrbitControls for the drag path
entirely; use it only for zoom (wheel) and programmatic camera moves.

**Pros:** cleaner, no synthetic events.
**Cons:** we now maintain a second copy of that math. More code.

**Recommendation: A.** It's clearly reversible and the "hack" is one
small, well-contained function. If it breaks on a three.js upgrade we'll
find out in five seconds and switch to B.

---

## UX details worth thinking through

### When does lock engage?

Only during an actual drag. Idle hover, wheel zoom, and UI panel clicks
should never trigger pointer lock — it'd be disorienting for the cursor
to vanish while the user is trying to click a slider.

Rule: pointer lock is requested on the **first `pointermove` after
`pointerdown` that exceeds a small threshold** (say 3 px). That way a
click doesn't briefly lock. If the user presses and immediately
releases without moving, nothing happens.

### When does lock release?

- `pointerup` on any button.
- `Escape` key (browser does this for free — user's safety valve).
- Window blur / tab switch.
- OrbitControls reporting its drag is done (the existing `"end"` event).

### Does the cursor need to reappear in the same place?

Yes. Browsers handle this for us — on `exitPointerLock()`, the cursor
reappears at the position it was at when lock was requested. No work.

### Visual cue for lock state?

A small hint is nice, since the cursor vanishing might surprise first-
time users. Options:

- Very subtle 2px accent-coloured ring around the canvas border during
  lock. Fade in at 120ms, out at 180ms.
- Or nothing — Blender does nothing, users figure it out in one session.

**Recommendation: start with nothing.** Add a cue only if the first
person to try it asks "where did my cursor go."

### Does cinematic mode interact?

Cinematic mode already pauses the director for 8s on user input
(`markUserActivity` on controls `"start"`/`"end"`). That still fires
when OrbitControls starts/ends a drag, regardless of lock. No changes
needed.

### Pan, zoom, rotate — all three?

- **Rotate** (LMB drag): classic use case. Lock.
- **Pan** (MMB or Shift+LMB drag): same reasoning. Lock.
- **Zoom** (wheel): no drag, no lock.
- **Touchscreen**: pointer lock isn't meaningful here. Skip on touch.

Detection: only engage if the primary pointer is `mouse`. Skip for
`touch` and `pen`.

---

## Edge cases

- **User has "Allow sites to lock your cursor" disabled.**
  `requestPointerLock()` will reject silently. Fall back to normal
  behaviour (cursor hits the edge like today). Never show an error —
  feature degrades, doesn't break.

- **Multi-monitor.** Pointer Lock is scoped to the window, so the drag
  can continue indefinitely even though a real cursor would've escaped
  to the second monitor. This is actually a _positive_ — one less
  edge.

- **Browser fullscreen vs. windowed.** Pointer Lock works in both. No
  special case.

- **Dev tools docked on the right.** Canvas width shrinks; delta drag
  is unaffected. Good.

- **High-DPI mice / acceleration.** `movementX/Y` already reflects the
  user's OS settings. Don't apply our own acceleration.

- **Locked drag interrupted by a modal (e.g. browser "save file"
  dialog from `Shift+R` recording).** Browser releases lock
  automatically. OrbitControls gets its `pointerup` (or we synthesise
  one on `pointerlockchange` → unlocked). Drag ends cleanly.

- **User presses `Esc` mid-drag to escape pointer lock.** Same
  handling: synthesise `pointerup`, let OrbitControls finish its state.
  No ghost drags.

---

## Opt-in / opt-out

New toggle in the left rail under Motion:

```
[●] Cinematic mode
[ ] Infinite drag       ← new
```

Default: **off for the first version, on after one week of use** if it
feels right. Some users will find cursor-vanishing jarring. Hotkey:
`I` (unused).

Stored in localStorage so it persists. `params.infiniteDrag`.

---

## Implementation sketch

Single function, attached once at boot:

```js
function installInfiniteDrag(canvasEl) {
  let locked = false;
  let downX = 0,
    downY = 0,
    accX = 0,
    accY = 0;
  let pendingLock = false;

  canvasEl.addEventListener("pointerdown", (e) => {
    if (!params.infiniteDrag) return;
    if (e.pointerType !== "mouse") return;
    downX = e.clientX;
    downY = e.clientY;
    accX = downX;
    accY = downY;
    pendingLock = true;
  });

  canvasEl.addEventListener("pointermove", (e) => {
    if (pendingLock && !locked) {
      const d = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (d > 3) {
        canvasEl.requestPointerLock().catch(() => {});
        pendingLock = false;
      }
    }
    if (!locked) return;
    accX += e.movementX;
    accY += e.movementY;
    // Synthesise a pointermove at (accX, accY) for OrbitControls.
    // OrbitControls reads event.clientX/clientY, so construct one.
    const fake = new PointerEvent("pointermove", {
      clientX: accX,
      clientY: accY,
      pointerId: e.pointerId,
      buttons: e.buttons,
      bubbles: true,
    });
    canvasEl.dispatchEvent(fake);
  });

  document.addEventListener("pointerlockchange", () => {
    locked = document.pointerLockElement === canvasEl;
  });

  window.addEventListener("pointerup", () => {
    pendingLock = false;
    if (locked) document.exitPointerLock();
  });
}
```

Read before committing: verify three.js r160 OrbitControls actually
reads `clientX/clientY` from the incoming `PointerEvent`. If it reads
`pageX/pageY` or the target's `getBoundingClientRect`, adjust the fake
event accordingly.

---

## What might kill this feature

- **Synthesised events confuse OrbitControls on version upgrade.** Fix
  by switching to Option B (fork the drag math).
- **Cursor-disappear is too disorienting.** Add the subtle border glow.
  If still disliked, make the feature opt-in only and don't auto-enable.
- **Users expect the cursor to literally wrap and see it vanish as a
  bug.** Put a one-time toast the first time it activates: "Cursor
  hidden — drag freely. Release to restore." Auto-dismiss in 4s.

---

## Test plan

- Rotate the camera 10 full revolutions in one unbroken drag. No
  interruption, no edge stall. Expected.
- Start a drag, hit `Esc`. Cursor returns, OrbitControls is not stuck
  in a mid-drag state (verify by trying to click a UI slider
  immediately after).
- Toggle infinite drag off. Drag hits edge and stops like today.
- Open DevTools mid-drag. Lock releases cleanly.
- Try on a touchscreen laptop with mouse attached. Touch drags still
  behave normally; mouse drags engage lock.
- Try with pointer lock denied in browser settings. Drag behaves like
  today, no console spam.

---

## Build cost

- Core: half day including the OrbitControls-synthesis verification.
- Polish (hint toast, border glow if needed): another half day.
- Not worth building until the core feels right in a live session.

Small feature. Outsized quality-of-life win if it works.

#user #feature
