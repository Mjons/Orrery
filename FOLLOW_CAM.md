# FOLLOW_CAM.md — Follow a Single Body

Attach the camera to one particle and watch where it goes. A dust mote
tumbling out of the Pillars. A star falling toward Sagittarius A\*. A disk
body captured by the other galaxy during the Antennae pass. This is the
feature that makes the sim feel lived-in instead of observed.

Companion to `CINEMATIC.md` (the autonomous director) and
`BODY_COUNT.md` (pipeline). Nothing here requires new physics.

---

## Why this is worth building

- **It answers "what are these particles actually doing?"** Today the sim
  is a chorus. Follow-cam isolates a soloist. The emotional payoff is
  enormous — people ask "what happens to _that_ one?" about any particle
  they can focus on.
- **Best clip this sim can produce.** A 20-second follow-cam of a body
  being slung around a BH, ejected at escape velocity, then drifting off
  into starfield — that's the viral Twitter post, not a wide establishing
  shot. Every "physics sim on the front page of Reddit" ever has been a
  follow-cam moment.
- **Cheap, thanks to an accident of architecture.** Bodies already have
  stable identities in the GPGPU texture — each sits in a fixed texel
  (`aRef` UV) until its mass goes to zero. Tracking a "star" is just
  remembering a `vec2`.

---

## The mechanic

1. **Pick.** User clicks on the canvas, or hits `F` to pick a nearby
   interesting body, or runs the auto-picker for cinematic integration.
2. **Attach.** Camera swings from its current pose to a follow rig
   anchored to the picked body, over ~1.2s, then holds.
3. **Travel.** Every frame, CPU reads the body's current position and
   velocity from the GPGPU texture (1 texel), places the camera at
   `position + offset`, aims at the body.
4. **Release.** Mass goes to zero, user presses `Shift+F`, user clicks
   away, or the cinematic director wants the camera back. Camera
   eases out and resumes whatever was happening before.

Nothing else. Four states: **SEARCHING → ATTACHING → FOLLOWING → RELEASING**.

---

## Data: the lucky accident

- Every body lives at one fixed `(x, y)` in the position/velocity texture
  for its whole life. The existing `aRef` attribute on `refGeom` is
  exactly the UV to sample.
- Body identity = `vec2 followUV` stored on the CPU.
- Body death = `position.w <= 0.0`. Release on detect.

No changes to the GPGPU layout. No new attributes. This is why the
feature is cheap — the plumbing for it was built for free by the
existing architecture.

---

## Picking

Three pickers, all worth shipping. Each produces a `followUV`.

### 1. Click-to-pick (canonical)

On canvas click:

1. Cast a ray from `camera` through the click NDC.
2. Project every live body's world position to NDC (CPU pass — same
   readback used for stats, hopefully cached for the frame).
3. Find the body whose NDC is closest to the click point _and_ within a
   radius threshold (16px).
4. If nothing within threshold → no-op (don't pick sky).

The CPU project loop is O(N) at 16–65k bodies — fine for a one-shot on
click, not fine to do per-frame. Only runs on click.

### 2. Hotkey shuffle

`F` picks the nearest body to the _current_ look-at point that has
"interest" (non-zero mass, reasonable distance from camera).
Subsequent `F` presses cycle through the next-nearest candidates. Lets
the user explore without having to aim.

`Shift+F` releases.

### 3. Auto-picker (smart)

`Alt+F` picks a body likely to do something dramatic soon. Heuristics,
from cheap to expensive:

- Highest kinetic energy (fast movers are fun to watch).
- Closest to the nearest BH (captures + slingshots).
- Highest acceleration last-frame (something's happening to it).
- Inside a "density gradient" (about to cross from dust → empty).

Pick weighted-random across the top-20 of whichever metric the current
scene's framing block suggests. Scene-specific bias; the Antennae
shouldn't pick a dust grain. See Scene Integration below.

---

## Camera rigs

Three modes, cycle with `Tab` while following. Each is an offset policy.

| Mode              | Offset                                          | Reads as                       |
| ----------------- | ----------------------------------------------- | ------------------------------ |
| **Shoulder**      | `-velocity.normalised() * d` above, looking fwd | video-game third-person chase  |
| **Wide observer** | fixed world-space offset of ~100–400 units      | spectator; scene context lives |
| **Front**         | `+velocity.normalised() * d` — facing the body  | claustrophobic, intense        |

Distance `d` is scene-dependent. For intimate scenes (orrery,
event-horizon) `d ≈ 30–80`. For cosmic (collision, bullet) `d ≈ 200–500`.
Keep `d` inside a scene-supplied `followRange` block, same pattern as
`framing`.

Default rig: **wide observer**. Most legible.

---

## The readback

One `readRenderTargetPixels(rt, px, py, 1, 1, buf)` per frame, where
`(px, py)` is the texel of the followed body.

- 16 bytes per read. Negligible on its own.
- Synchronous, so it stalls the pipeline. Cost ≈ a GPU/CPU roundtrip,
  maybe 0.3–1.0 ms on a 4090. Acceptable.
- Read both position and velocity texture (2 × 16 bytes). Velocity
  needed for the shoulder/front rig offsets.
- Do both reads in the same frame to share the fence stall.

If profiling shows this actually hurts at 120fps, drop to every-second-frame
and interpolate between reads. Don't premature-optimise.

---

## Visual affordance for the followed body

The viewer must know what they're watching. A tiny dot in a field of
dots is not enough.

- **Highlight ring.** A scene-space circle drawn around the body, 1.2×
  its size, pulsing slightly. Uses a new cheap pass — 1 draw call.
- **Size bump.** The followed body draws 1.4× larger than normal. Shader
  branch: `if (aRef == uFollowUV) sz *= 1.4`.
- **Tint boost.** Followed body gets a +0.3 white mix. Distinct without
  breaking the palette.
- **Ephemeral halo on attach.** Like the scene-swap flash, a brief
  accent-coloured halo pulses out from the body when first attached.
  Tells the viewer "that one, there."

All four combined is just right. Any fewer and the target gets lost
the first time it crosses a cluster.

---

## State machine

```
          ┌──────────────┐
     ┌───▶│  SEARCHING   │  no follow target; normal camera behavior
     │    └──────┬───────┘
     │           │  pick() succeeded
     │           ▼
     │    ┌──────────────┐
     │    │  ATTACHING   │  1.2s ease from current pose to rig pose
     │    └──────┬───────┘
     │           │  ease complete
     │           ▼
     │    ┌──────────────┐
     │    │  FOLLOWING   │  per-frame readback; camera tracks body
     │    └──────┬───────┘
     │           │  release reason fires
     │           ▼
     │    ┌──────────────┐
     │    │  RELEASING   │  0.8s ease back to orbital controls or director
     └────┴──────────────┘
```

Release reasons, in priority order:

1. **Body death** — `pos.w ≤ 0` at read time.
2. **User release** — `Shift+F` or `Esc`.
3. **User orbit input** — mouse drag on canvas releases, like existing
   cinematic-yield behaviour.
4. **Timeout** — 90s hard cap. Keeps the feature moving.

---

## Interaction with cinematic mode

Cinematic mode is the autonomous director. Follow-cam is a user-directed
override. Rules:

- Entering follow-cam **pauses** the director's state machine (dwell
  timer freezes, next reframe cancelled). Flavour stays selected; when
  follow-cam releases, director resumes its previous state.
- Flavour `oracle` can _opt into_ follow-cam: when an event fires (high
  radiation kick, close BH pass), oracle calls `followCam.pick(body)`
  automatically with a 15s timeout. This is how the "oracle" mode
  delivers its promised close-ups.
- Other flavours never auto-pick. They keep their existing camera-move
  repertoire.

User manually enabling follow-cam during cinematic mode always wins.
Director never overrides the user.

---

## Scene integration

Each scene ships a `followRange` block (like `framing`):

```js
followRange: {
  d: [80, 200],          // shoulder/front rig distance
  wide: [200, 500],      // wide observer rig distance
  bias: "speed" | "bh-proximity" | "density" | "age",
}
```

Used by the auto-picker and by the rig distance selector. Optional —
scenes without it default to `{ d: [60, 180], wide: [200, 400], bias: "speed" }`.

Scenes where follow-cam _shines_ (tune these first):

- **event-horizon**: follow a doomed star spiralling in. `bias: "bh-proximity"`.
- **antennae**: follow a disk body that gets pulled into the tidal tail.
  `bias: "speed"`.
- **birth**: follow a condensing clump. `bias: "density"`.
- **dust-storm**: follow a dust grain through curl-noise turbulence.
  `bias: "speed"`.
- **bullet-cluster**: follow a halo particle — invisible normally but
  gravitationally active. Needs `Show halo` on. `bias: "density"`.

Scenes where it _doesn't_ (accept the degradation):

- **lattice**: everything's stationary. Follow-cam is just a worse
  orbital cam.
- **orrery**: follow-cam works but the planets are already small; the
  rig has to go close and you lose the system view.

---

## UI surface

Not a new panel. Use what's there.

**HUD** — when following, show in the top-right block below the flavour tag:

```
● following  #3847           ← accent dot + compact body ID
  age 0:12   v 4.3           ← optional: live readout from the readback
```

**Left rail** — no new button. Feature is hotkey-driven by design.

**Hotkeys** (add to overlay):

- `F` — pick nearest interesting body (or next, if already following)
- `Shift+F` — release
- `Alt+F` — smart auto-pick (for the current scene's bias)
- `Tab` (while following) — cycle rig mode
- `Esc` (while following) — release, same as `Shift+F`

Clicking the canvas when not following does nothing today (orbit
controls). Add: if `followCam.enabled` (always true by default), a
_short_ click (< 180ms, no drag) picks the body under the cursor.
Drag still orbits as before.

**Right-click menu** — maybe. Nice to have: right-click a body →
"Follow" / "Lose" / "Go to scene where this lives". Phase 3.

---

## Implementation sketch

```js
const followCam = {
  enabled: true, // feature flag, user-disable via settings
  state: "SEARCHING",
  targetUV: null, // vec2 in [0..1]
  texel: null, // ivec2 derived from targetUV
  rig: "wide", // "shoulder" | "wide" | "front"
  easeT: 0,
  attachDuration: 1.2,
  releaseDuration: 0.8,
  timeout: 90,
  age: 0,
  lastPos: new THREE.Vector3(),
  lastVel: new THREE.Vector3(),
  startPose: null, // snapshot at attach/release
  endPose: null,
};
```

Main loop adds one `updateFollowCam(realDt)` call after
`tickCameraMove`. That function:

1. If state is FOLLOWING, read 1 position + 1 velocity texel into
   pre-allocated `Float32Array(4)` buffers.
2. If `pos.w <= 0`, transition to RELEASING.
3. Compute rig offset, write camera.position + controls.target, no
   `camera.lookAt` interpolation — just hard assignment per frame.
4. If ATTACHING / RELEASING, ease between startPose and endPose over
   the respective duration.
5. Accumulate `age`; if > timeout, transition to RELEASING.

Shader change: add `uniform vec2 uFollowUV` to `pointMat`, and a
compile-time-bounded branch in the vertex shader:

```glsl
if (uFollowUV.x >= 0.0 &&
    abs(aRef.x - uFollowUV.x) < 0.0005 &&
    abs(aRef.y - uFollowUV.y) < 0.0005) {
  sz *= 1.4;
  c = mix(c, vec3(1.0), 0.3);
}
```

`uFollowUV = vec2(-1.0)` when inactive disables the branch.

The highlight ring is a separate small `THREE.Mesh` with a billboard
shader — 1 tri, updated per frame with body position. Easy.

---

## Build order

1. **Phase 1 — core follow.** State machine, one rig ("wide observer"),
   click-to-pick, readback, `F` / `Shift+F` hotkeys, shader highlight.
   About a day.
2. **Phase 2 — three rigs + cycle.** Add shoulder and front rigs,
   `Tab` to cycle, ease transitions between rigs without releasing.
   Half a day.
3. **Phase 3 — auto-picker + cinematic hookup.** `Alt+F`, oracle
   flavour opt-in, per-scene `followRange` blocks. One day.
4. **Phase 4 — HUD readouts.** Age, speed, body ID. Trivial plumbing.
5. **Phase 5 — affordances.** Attach halo pulse, highlight ring mesh,
   tuning the size/tint bump. Half a day of fiddle.

Ship phase 1 alone. Live with it for a day. Pick one event-horizon
body, watch it fall in. If it doesn't feel inevitable and cinematic,
don't build 2–5 yet — tune 1.

---

## What kills this

- **Rig distance wrong.** Too close and you're inside a cluster
  blindfolded; too far and you lose the feeling of "this specific
  body." Tune per scene.
- **Dead-body follow.** Releasing via `pos.w <= 0` must fire within
  one frame or the camera will snap to `(0,0,0)` and look broken. Test
  with a scene that kills bodies quickly (event-horizon, birth).
- **Picker picks a halo particle the user can't see.** If
  `showHalo === false`, the picker must exclude kind 4. Otherwise
  clicking picks "empty space" in the user's perception.
- **Cinematic + follow fighting for the camera.** Needs a clear owner.
  Rule: whichever was invoked last owns the camera until it releases.

---

## Invariants

- **Body identity is texel-stable.** A body at `(x, y)` in the
  position texture stays at `(x, y)` until its mass goes to 0. Never
  re-pack the texture without updating follow-cam.
- **Follow-cam never modifies physics.** It's pure output — reads the
  state, positions a camera, draws a ring. No uniforms change.
- **Readback is synchronous, small, and optional.** If the feature is
  off, no readbacks. If on, exactly two per frame.
- **Release must be possible from every state without hang.** Even
  mid-attach, mid-release. Mouse drag, `Shift+F`, `Esc`.

---

## The pitch (what this gets put in a tweet)

> A single-file browser universe sim where you can **click any star and
> watch its life.** Falls into a black hole. Gets ejected in a galaxy
> collision. Drifts forever. WebGL. 65,000 bodies. No install.

That's the pitch. Follow-cam is what makes the third sentence land.
