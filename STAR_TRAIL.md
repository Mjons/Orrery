# STAR_TRAIL.md — The Endless Trail

Draw a persistent line through the world showing where the followed body
has been. Attach the camera to a star, watch it fall toward Sagittarius
A\*, release — and the whole arc of its approach is still hanging in the
sky. Orbit around, screenshot it, post it. That's the feature.

Companion to `FOLLOW_CAM.md` (the follow-cam is what records the trail)
and to the existing screen-space `trail` post-process (unrelated — that's
an AfterimagePass over every body; this is one line in world space).

---

## Why this is worth building

- **Turns a moment into an artifact.** Follow-cam is kinetic — you watch
  the star travel. Trail leaves the residue behind so you can walk
  around the finished drawing. The sim becomes a plotter.
- **The shareable asset.** A follow-cam clip is 20s of video. A trail
  screenshot is 1 image, portable everywhere, still legible on a phone
  thumbnail. HN upvotes the screenshot; Twitter reshares the GIF; both
  come from the same code.
- **Makes orbits legible.** Viewers don't have to imagine the path — they
  see it. Kepler ellipses around a BH, tidal-tail extrusions, escape
  trajectories all read instantly.
- **Almost free to build.** We already read the followed body's
  position every frame. The only new thing is a line geometry that
  accumulates.

---

## The mechanic

1. When follow-cam attaches, start recording the body's world position
   each frame into a growing buffer.
2. Render the buffer as a line (or ribbon) in world space — bright at
   the head (current position), fading toward the tail (starting point).
3. When follow-cam releases, **stop recording but keep displaying**.
   The trail remains in the scene. User can orbit freely to admire it.
4. When follow-cam attaches to a _different_ body, clear the old trail
   and start fresh. Scene change does the same.
5. User can manually clear or freeze via UI / hotkey.

States:

```
 (no trail)  ── follow attach ──▶  RECORDING
 RECORDING   ── release        ──▶  FROZEN
 FROZEN      ── new follow     ──▶  RECORDING (clear first)
 FROZEN      ── scene change   ──▶  (no trail)
 any state   ── manual clear   ──▶  (no trail)
```

---

## Data: a ring buffer, not an append-forever array

"Endless" is aspirational. In practice cap the length so we don't chase
memory creep during hours-long streams.

- **Cap:** 65,536 samples. At 60fps that's ~18 minutes of continuous
  recording. Float32 xyz = 768KB GPU, trivial.
- **When full:** two options, both worth shipping:
  - **Ring mode (default):** oldest samples get overwritten, trail
    shows only the last 18 minutes. The tail drops off the back.
  - **Keep mode:** once full, stop extending. The body's _first_ 18
    minutes become its trail forever. Better for "capture this orbit."

Also **spatial downsampling**: don't log a point if it's within ε
(say, 0.4 sim units) of the last logged point. Saves samples when the
body is orbiting tightly or parked. Makes the 18-minute cap stretch
dramatically for quiet bodies.

**Temporal downsampling** (future): every N minutes, decimate the
oldest half of the buffer by 2×. Trail stays readable, memory bounded,
detail survives where the body moved fastest.

---

## Visual treatment

### Geometry

Single `THREE.Line` or `THREE.Line2` (from addons) with a dynamic
`BufferGeometry`. `Line2` gives world-space-thickness lines, which
read much better than 1px `Line` on a 4K display.

- **Line2** with `LineMaterial({ linewidth: 1.5, worldUnits: false })`
  — thickness is pixel-based, looks consistent at any zoom. Probably
  the right default.
- **Line** (1px) falls back if we don't want the addon bundle. Thin
  but with bloom catching, still reads.

Both support vertex colors, which we'll use for the fade.

### Colour

Per-vertex, baked at record time:

- **Hue:** from the body's _speed_ at that moment — slow = warm amber,
  fast = cool blue. This is the same Doppler feel the palette already
  has, only now permanent along the path.
- **Brightness:** age-based. Head of the trail = full brightness, tail
  = fades toward the scene's background. Fade runs over the last 30%
  of the buffer. Keeps the eye on "now."

Alternative fallback: single-accent color (`var(--accent)`), just fade.
Works, but the speed-coloured version is the post-worthy one.

### Width

Constant pixel thickness (1–2px) at phase 1. Phase 2: width tapers
toward the tail so the head feels heavy and the tail feathery. This
looks painterly; worth the effort once the feature proves out.

### Bloom interaction

Trail geometry should be on a layer that **bloom sees**. The trail's
glow is what makes it feel like starlight, not a UI overlay. Check
against `UnrealBloomPass`'s existing config — additive material with
HDR-ish emission should pass right through.

---

## Frozen trails: orbit back and look

This is the payoff moment. When follow-cam releases, the trail:

1. Stops advancing.
2. Stays at its full length.
3. Becomes interactive to the user — drag to orbit, zoom to inspect.
4. Is no longer tied to the cursor or follow-cam HUD.

The camera snaps back to wherever release left it (currently just
stops tracking). User can immediately drag-orbit to see the trail from
a side angle, or press V → "Default pose" to pull back and frame it.

Consider: brief toast on release — _"Trail frozen · drag to orbit"_ —
so the user knows the residue is still there.

---

## Interaction with other systems

- **Follow-cam attach (new body):** clear existing trail, start new.
  Unless the user has hit "pin" (see UI below), in which case the old
  trail stays and the new one records alongside it. That's phase 3.
- **Release:** stop recording, keep visible (FROZEN state).
- **Scene change:** clear trail. The world beneath it just changed, so
  the path's anchor points are meaningless.
- **Density change:** trail keeps its world-space positions; the mesh
  is independent of the GPGPU texture. Survives the pipeline rebuild.
- **Time reverse / pause:** pause stops recording (no new samples).
  Reverse time is ambiguous — do we unroll? Don't try. Pause it.
- **Cinematic mode:** while cinema is on _and_ follow-cam is off, no
  trail. If cinema's `oracle` flavour auto-attaches (see
  `CINEMATIC_MODES.md`), the trail will record for the duration of
  that auto-follow. That's _great_ — oracle clips get a ghost path.
- **Recording (screen capture):** trail is visible in captures. No
  extra plumbing needed.

---

## UI surface

One button and one toggle in the Camera panel under "Follow a body":

```
[Follow] [Release]
─────────────────
[ ] Draw trail            ← on by default
Clear trail               ← button, one-shot
Keep past trails          ← phase 3, off by default
```

HUD: when trail exists (recording or frozen), show small label below
the follow indicator — `trail · 4:12` (minutes recorded). Nothing else.

Hotkey: `T` clears the current trail (only if not also used — check
the hotkey table). Otherwise `Shift+T`. `Alt+F` could "follow without
trail" for quick exploration.

---

## Implementation sketch

### Data

```js
const starTrail = {
  mesh: null, // THREE.Line2 (or Line fallback)
  geometry: null, // dynamic BufferGeometry
  positions: null, // Float32Array[MAX * 3]
  colors: null, // Float32Array[MAX * 3]
  MAX: 65536,
  writeIdx: 0, // head (next write position)
  count: 0, // number of live samples
  ringMode: true, // ring (overwrite) vs. keep
  recording: false,
  lastLoggedPos: new THREE.Vector3(),
  minStepSq: 0.16, // spatial-downsample threshold squared
};
```

### Recording hook

In `updateFollowCam`, after the `followCamReadBody()` call and the
mass check, when in FOLLOWING state:

```js
if (starTrail.recording) {
  const d2 = followCam._bodyPos.distanceToSquared(starTrail.lastLoggedPos);
  if (d2 >= starTrail.minStepSq) {
    appendTrailSample(followCam._bodyPos, followCam._bodyVel);
    starTrail.lastLoggedPos.copy(followCam._bodyPos);
  }
}
```

`appendTrailSample` writes xyz into `positions`, colour into `colors`,
handles ring wrap-around, and updates `geometry.setDrawRange`.

### Lifecycle hooks

- `followCamAttach`: `startTrail()` — clears, sets `recording = true`.
- `followCamRelease`: `starTrail.recording = false` — trail stays.
- `applyScene` (at top): `clearTrail()`.
- `rebuildPipeline` (density change): trail is world-space — just
  ensure the mesh is still in `scene`.

### Mesh

Use `Line2` if we already bundle it; else plain `Line`. Sample:

```js
const mat = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
starTrail.mesh = new THREE.Line(geometry, mat);
starTrail.mesh.frustumCulled = false;
scene.add(starTrail.mesh);
```

Ring wrap-around requires two draw calls (or an index buffer with the
wrap). Simplest-first: use an index buffer ordered `[write, write+1,
..., write-1]` and update on every write. At 60Hz that's 64k index
writes per second — acceptable.

Alternatively, skip the ring entirely at MVP and just use **keep mode**:
once the buffer is full, stop recording and show a toast. Ship ring
mode later.

---

## Phases

1. **Phase 1 — the line.** Keep-mode only. 16k samples. Single-colour.
   No fade. `Line` (1px). Recording starts on attach, stops on full
   buffer or release. Clears on scene change. One day.
2. **Phase 2 — speed colour + fade.** Vertex colors from speed; brightness
   fades along the last 30%. Half a day.
3. **Phase 3 — ring mode.** 64k cap, overwrite-oldest. Index buffer
   wrap. Half a day, all risk.
4. **Phase 4 — Line2 thickness + taper.** Swap to Line2 for real
   pixel-width control. Taper toward the tail. Half a day, mostly
   tuning.
5. **Phase 5 — keep past trails.** Multi-trail ("pin" checkbox). Each
   pinned trail gets a different hue. Great for Stephan's Quintet-style
   scenes where you map out several bodies' paths. One day; mostly UI.
6. **Phase 6 — export.** Screenshot mode + SVG export of the trail
   geometry only (project vertices to screen, write `<path>`). The
   art-object feature. Half a day.

Phase 1 alone is already useful. Ship it. See how it feels. Then
decide if phases 2–6 are worth the complexity.

---

## What kills this

- **Trail clutters the screen.** At 16k samples through a dense scene,
  the line crosses through clusters, making the sim unreadable. Mitigate:
  default off until user enables, or add a "dim trail" toggle that
  drops alpha to 0.4.
- **Colouring by speed looks muddy.** If the speed range is compressed,
  vertex colors blend to one lump. Use the same `uSpeedMax` scene
  setting the particle shader uses, or compute per-trail min/max for
  the active recording.
- **Performance at 65k samples with Line2.** Line2 uses instanced
  geometry and can get expensive at high counts. If we see framedrops,
  downsample on the fly rather than capping lower.
- **Multiple scene-change traps.** Trail clear must fire on _every_
  path that rewrites bodies (applyScene, import JSON, rebuildPipeline
  _if scene regenerated_). One missed hook = trails from the previous
  universe hanging over the new one. Add a test scene to verify.
- **The "now" end is ambiguous.** If the body died, the head of the
  trail is at its death position. That's honest, and probably fine.
  Add a small marker dot at the head to make it legible.

---

## Invariants

- **Trail positions are world-space.** They never transform with any
  camera or follow rig. They are the truth of where the body was.
- **Trail is a pure output.** Recording it must not alter physics or
  the followed body in any way. Pure passive observer.
- **Trail clears on scene change.** Old scene's geometry is meaningless
  in the new one. No carry-over, no "sky-writing across scenes."
- **Trail survives follow-cam release.** The whole point is to look at
  it afterward.
- **Max samples is a constant the user doesn't see.** Don't expose
  `MAX` as a slider. Pick one, live with it, tune if needed.

---

## Pitch fragments

For future launch copy, prose shamelessly stolen from this doc:

> Follow a single star. When you let go, its whole journey hangs in
> the sky as a line of light.

> Every orbit, every slingshot, every free fall — drawn once, in real
> time, through 16,000 simulated stars.

> Click a star. Look at where it came from.

That last one's the tweet.
