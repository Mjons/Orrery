---
tended_on: [tag-infer]
id: 01KPS7VDEYCV5G0D1N040578MP
created: "2026-04-20T20:51:06.159Z"
---

# FOLLOW_VIEWS.md — Multiple Camera Angles While Following

Plan for letting the user switch camera _view_ while a follow-cam
session is active, **without** interrupting the trail being drawn.
One star, multiple cinematic angles, one continuous path.

Companion to `FOLLOW_CAM.md` (the feature being extended) and
`TRAILS.md` / `STAR_TRAIL.md` (the trail we must not disturb).

---

## The core constraint

The trail records `followCam._bodyPos` every frame while:

```
followCam.state === "FOLLOWING"  AND  starTrail.recording === true
```

Neither depends on where the camera is. So adding view modes is safe
by design — **changing the camera's relationship to the body never
touches recording state.** The plan just needs to preserve that
invariant.

Any view-change implementation that:

- leaves `followCam.state === "FOLLOWING"` alone,
- doesn't call `stopTrail()` or `clearTrail()`,
- doesn't cause the scene to `applyScene()` (which force-resets
  everything),

...can't break the trail. Keep the feature small and this holds for
free.

---

## The six views worth shipping

Opinionated — do these six, nothing else. Each is ~20 lines of
positioning code.

### 1. Chase (current default)

Camera trails behind the body along its velocity vector, slightly
above. The existing behaviour. Don't change it.

```
pos = body + (-velDir * r + up * r * 0.4)
target = body
```

Good for: the moment of motion. Kinetic, visceral.

### 2. Side

Camera orbits to the body's "starboard" — perpendicular to velocity,
in the orbital plane. Shows the body translating across the frame
left-to-right.

```
right = normalize(cross(velDir, worldUp))
pos = body + (right * r + up * r * 0.25)
target = body
```

Good for: seeing the orbit as a _sweep_ rather than a charge-forward.
Readable direction of travel.

### 3. Overhead

Looking straight down on the orbital plane. Shows the full arc of
recent trail at a glance.

```
pos = body + worldUp * r
target = body
(camera "up" set to velDir so orbit reads left-to-right)
```

Good for: reading the orbit geometry. Kepler ellipses become
legible. Tidal tails trace cleanly.

### 4. Ahead (rear-view)

Camera in front of the body looking back. You see the body approaching
the camera, AND the trail extending backward behind it toward the BH
or whatever it's orbiting.

```
pos = body + velDir * r + up * r * 0.2
target = body
```

Good for: watching the trail — because the trail is visible in frame.
The "I can see where I've been" shot.

### 5. Cosmic

Camera pulls way back to show the whole scene. Body is a highlighted
dot, its trail arcs across the frame as an overlay. The "where am I
in the universe" shot.

```
pos = sceneOrigin + worldUp * R_far + outward * R_far * 0.6
target = body           // still tracks the body's screen position
R_far = 3-5× scene radius
```

Good for: context. Reset after a disorienting close sequence.

### 6. Free

User controls the camera via mouse drag, but the camera's target
stays locked to the body. Effectively orbit-controls with a moving
target. Trail still records, body still tracked.

```
on each pointer drag: rotate camera around body by drag delta
pos = body + rotation * currentRelative
target = body
```

Good for: user exploration. This is the "admire the frozen trail from
any angle" mode once the interesting motion has happened.

---

## State machine (extends `followCam`)

Add one new field:

```js
followCam.view = "chase"; // "chase" | "side" | "overhead" | "ahead" | "cosmic" | "free"
```

Modify `updateFollowCam`: read `followCam.view` and branch to the
appropriate positioning logic. Default branch stays chase (current
behaviour), other branches are the new view implementations.

**Important:** the recording guard `followCam.state === "FOLLOWING"`
is unchanged. Neither is `starTrail.recording`. View switch doesn't
touch either.

---

## Transitions between views

Two options, with a clear winner:

- **Instant cuts**: hotkey press → camera snaps to new view next
  frame. Simple, one line of code, but jarring.
- **Eased transitions**: hotkey press → over ~1 second, lerp camera
  position and target from old view to new view. Cleaner, reads as
  cinematic.

**Recommendation: eased, 0.8s, `easeInOutCubic`.** Same curve the
scene transitions use. ~20 lines extra.

Implementation:

```js
function setFollowView(newView) {
  if (followCam.view === newView) return;
  followCam.viewPrev = followCam.view;
  followCam.view = newView;
  followCam.viewBlendT = 0;
  followCam.viewBlendDur = 0.8;
}

// In updateFollowCam, after computing new pose:
if (followCam.viewBlendT < followCam.viewBlendDur) {
  const t = clamp(followCam.viewBlendT / followCam.viewBlendDur, 0, 1);
  const e = easeInOutCubic(t);
  // Compute both old-view pose and new-view pose, lerp between them
  // Actually a simpler approach: just lerp camera.position and
  // controls.target toward their "new view" computed values.
  followCam.viewBlendT += realDt;
}
```

Slightly tricky: during blend, BOTH poses need to be computed each
frame so the "from" pose tracks the moving body. Simpler alternative:
snapshot the starting pose once and lerp toward the computed new pose.
Trail doesn't care either way.

---

## UI surface

### Hotkey — `V` cycles views

Already a free key. Holds to user's existing mental model of one-letter
commands.

```
V       → cycle forward: chase → side → overhead → ahead → cosmic → free → chase
Shift+V → cycle backward
```

### Panel UI

In the Follow panel, show a pill row when follow is active:

```
┌─ Follow — body 2401 ────────────┐
│ View:                           │
│   [Chase] [Side] [Overhead]     │
│   [Ahead] [Cosmic] [Free]       │
└─────────────────────────────────┘
```

Pills reflect current view. Click switches. Uses the existing `Pills`
helper.

### HUD indicator

Show the current view name in the follow HUD pill so users know which
mode they're in without opening the panel. One-line addition.

---

## Interactions with existing systems

### Cinematic mode

Cinematic director owns the camera when running. Follow-cam already
auto-pauses cinematic (per existing behaviour). Views work as
expected during manual follow; no cinematic interference.

### Movie mode

Movie mode's film scheduler owns the camera entirely. Follow-cam
shouldn't coexist with an active film. If a user starts a follow
during a movie, the movie's next shot takes the camera back — view
mode is irrelevant.

### Scene transitions

Scene change still clears follow-cam (intentional, see
`CENTER_VANISH.md` cause 5). View mode resets to "chase" on new
attach.

### OrbitControls

Must be disabled during follow (already is). View = Free uses its own
drag handler that writes to `followCam._freeRotation`, not
OrbitControls. Cleaner isolation.

### Trail (the invariant)

None of the views touch trail state. But test explicitly (see test
plan) — this is the whole point of the feature.

---

## Edge cases

- **Body nearly motionless.** `velDir` is degenerate. Fall back to the
  last valid `_smoothVelDir` (already cached in followCam state for
  the existing chase smoothing). If that's also zero, use worldUp as
  a dummy — rare and visual only.
- **Body's velocity reverses** (e.g., going around a BH on a tight
  pass). Chase view handles it via velocity smoothing. Side view
  flips left/right smoothly because it's based on the smoothed vel
  vector.
- **Cosmic view during a collision scene.** The "scene origin" is
  (0,0,0) but the body might be at (400, 0, 400). Pull-back distance
  should be based on **distance from body to scene origin + scene
  radius**, not just scene radius. Otherwise the body falls off
  screen.
- **Free view pointer loss.** If the user lifts pointer outside the
  canvas and releases there, no `pointerup` fires. Use
  `pointerdown` on canvas to add window-level `pointermove`/`up`
  listeners, same pattern as the movie scrub bar.
- **Shift+V on cosmic:** cycles backward to ahead. Documented in
  hotkey overlay.

---

## Build order

**Session 1 (half day):**

1. Extend `followCam` with `view` field + `setFollowView()`.
2. Implement chase (rename current logic), side, overhead, ahead.
3. Hotkey `V` to cycle.
4. Test: each view works, trail uninterrupted across all switches.

**Session 2 (half day):**

5. Cosmic view. Requires a small helper `sceneRadiusHint(sceneKey)`
   to know how far back to pull.
6. Free view. Pointer drag handlers; `followCam._freeRotation`
   quaternion accumulates on drag.
7. Eased transitions between views.

**Session 3 (polish):**

8. Follow panel Pills UI.
9. HUD indicator.
10. Update hotkey overlay + README.

Ship Session 1 alone if needed — four views + a hotkey is already a
huge upgrade.

---

## Test plan

- Attach follow-cam to a body. Note the trail's start.
- Cycle through all six views (V six times). Each transition eases.
  Trail continues to grow throughout — no restart, no gap, no release.
- Switch to Free view, drag camera 360° around the body over ~30s.
  Trail still records every frame.
- In Cosmic view, verify both the body and the central anchor are in
  frame for the current scene. Not just origin-centred.
- Start a Milky-Way follow, cycle views every 15s for two minutes.
  Trail should reflect two minutes of continuous recording (check
  `starTrail.count` in console).
- Follow on collision scene during a BH pass. Switch to Overhead
  mid-pass. The trail should show the slingshot path as a continuous
  arc, not a cut sequence.

---

## What NOT to do

- **Don't create per-view trail buffers.** One body, one trail,
  multiple ways to look at it. Keeping a single buffer is the entire
  point.
- **Don't change the trail's world-space coords based on view.**
  Trail lives in world space. Views are just camera transforms.
- **Don't "pause" trail recording during eased transitions.** The
  body is still moving; missing those frames would leave gaps.
- **Don't add a "cinematic" view that does auto-camera moves.**
  That's what cinematic mode is for. Follow views are user-driven.
- **Don't couple views to the current scene.** Each view should work
  across all scenes. If one doesn't (e.g., Cosmic in a micro-scale
  scene like `orrery`), fix the view's distance heuristic, not add
  per-scene view logic.

---

## Why this matters

A single camera angle on a single body is _the_ follow-cam. Multiple
angles on the same body become a **short film**. The trail
accumulating across cuts is the narrative: "same star, same arc, here
from the side, here from above, here pulling back to show where it
has been." That's the shareable clip people make from the feature.

#user #feature #panel
