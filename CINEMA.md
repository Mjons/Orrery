# CINEMA.md — Cinematic Polish Layer

Two upgrades that make scripted camera work feel like _film_, not a
scripted slideshow:

1. **Camera smoothing** — a critically-damped spring layer between the
   shot system's intended camera and the actual rendered camera. No more
   visible velocity discontinuities at move boundaries.
2. **Movie recording mode** — a dedicated capture pipeline that auto-
   hides UI, starts/stops with the film, and produces clean, consistent
   files without user choreography.

Complements `MOVIE.md` (scripted films) and `CINEMATIC.md` (infinite
director). Both already work. This makes them _look shipped_.

---

## Why this matters

### The smoothing problem

Every shot today computes `camera.position / target / fov` directly per
frame. Each shot has its own easing curve. At the **boundary** between
two shots, the velocity of the camera can snap — one move's exit
velocity doesn't match the next move's entry velocity. The viewer sees
a subtle "kick" at every transition.

Examples from Film 1:

- `drift-wide` (60s) exits with an active orbital velocity.
  `cross-dissolve` (4s) happens, then `slow-reveal` starts its dolly.
  The orbit-to-dolly transition has no velocity matching. At t=64 the
  camera's motion visibly _snaps_.
- `hold-still` (45s) ends with zero velocity. `warp` (6s) begins with
  zero-velocity camera, but the warp's FOV-narrow + forward-kick fires
  instantly. The camera looks _pushed_, not _moved_.

Inserting an easing curve into each move doesn't fix this — the issue
is between moves, not within them.

### The recording problem

`toggleRecording` already exists. But for movies specifically:

- The user must start it _before_ pressing Play. Easy to miss the
  opening seconds.
- The rail, panel, and HUD are recorded along with the canvas unless
  the user manually enters Performance mode first.
- No fixed framerate guarantee — if the machine stutters, the captured
  video has uneven motion.
- File naming is generic (`universe_<scene>_<ts>.webm`); doesn't
  record _which film_ was being played.
- No bitrate target tuned for "looks good on replay."

Neither problem is fatal. Both block the medium from feeling finished.

---

## Part 1 — Camera smoothing

### The idea

Insert a **target transform** between the shot system and the camera.

```
  ┌───────────┐    writes every frame    ┌───────────┐
  │   Shot    │ ─────────────────────▶   │  target   │
  │  program  │                          │ (pos,tgt, │
  └───────────┘                          │    fov)   │
                                         └─────┬─────┘
                                               │ spring-damped
                                               ▼
                                         ┌───────────┐
                                         │  camera   │
                                         │ (actual)  │
                                         └───────────┘
```

Shot programs continue to compute their _intended_ camera pose each
frame, but they write it into `target`, not directly into `camera`.
Each frame, the actual `camera.position / target / fov` springs toward
`target` via **critically-damped exponential decay**:

```js
function smoothTo(current, target, dt, halflife) {
  // Critically damped: no overshoot, halflife = time to close 50% of gap
  const alpha = 1 - Math.exp((-dt * Math.LN2) / halflife);
  return current + (target - current) * alpha;
}
```

### What this solves

- A shot program that snaps its target at a boundary gets a physical
  easing _for free_ — the spring naturally blends the two.
- Shot programs no longer need to worry about exit velocity or entry
  coupling. Every program writes its truth; the spring takes care of
  the rest.
- Warp's forward-kick is softened at start and finish — it feels like
  _the camera is moving_, not _being teleported_.

### Parameters

Three halflives, tuned for cinematic feel:

| Channel | Halflife (s) | Rationale                                                               |
| ------- | ------------ | ----------------------------------------------------------------------- |
| `pos`   | 0.30         | Matches the physical feel of a 1000 kg rig — responsive but not twitchy |
| `tgt`   | 0.40         | Slightly lazier so pans feel anchored to subject, not lockstep          |
| `fov`   | 0.22         | FOV changes should land quickly — lag here reads as "zoom lag"          |

These are the v1 defaults. Per-shot override optional:

```js
{ at: 186, kind: "shot", program: "push-in", duration: 75,
  smoothing: { pos: 0.45, fov: 0.35 }, ... }
```

Longer halflives for dreamier shots, shorter for snappier climaxes.

### When to disable

Smoothing is always on while a scripted system owns the camera. But
three cases need _snaps_:

1. **Scene swap under travel cover.** The body cloud changes at t=0.5
   of a travel; the camera may jump to a new framing at the same
   moment. Spring would visibly drag behind.
2. **Film start.** First frame of the first shot should be exactly the
   intended framing, not halfway there.
3. **Film end.** Same — the exit pose shouldn't drift.

Implementation: a `snapCamera()` call that sets `current = target`
zero-lag. Fired by the scheduler at scene-swap points, film boot, and
film end.

### Interaction with user input

`controls.enabled` is already `false` during a movie, so this layer
only exists when scripted. Cinematic mode can optionally use the same
layer (shorter halflives — 0.18s pos, 0.22s tgt — since its beats are
shorter). Free-roam with OrbitControls uses its own damping, untouched.

### LOC

- Add `smoothedCamera` state: `{ pos: Vector3, tgt: Vector3, fov }` —
  the _current_ filtered values. Replace direct camera writes in shot
  programs with writes to `targetCam = { pos, tgt, fov }`.
- Spring tick function: ~30 lines.
- Per-frame apply: ~15 lines.
- `snapCamera()` helper: ~10 lines.

**Total: ~100 lines** + touching each shot program to write to target
instead of camera. ~60 lines of touches.

---

## Part 2 — Movie recording mode

### Two distinct capture approaches

**Realtime capture** — what `toggleRecording` already does, tuned for
films:

- Uses `canvas.captureStream(fps)` + `MediaRecorder`
- Records at the actual frame rate
- Subject to frame drops on slow machines
- Ships immediately (extension of existing code)

**Offline rendering** — frame-by-frame at a guaranteed rate:

- Decouple sim + composer from `rAF`
- Step the scheduler by fixed `dt = 1/fps` each iteration
- Read pixels via `WebCodecs VideoEncoder` (or chunked MediaRecorder
  fed from a hidden canvas)
- 100% deterministic playback regardless of machine speed
- Complex — defer to a later pack

**Pack α = realtime. Pack β = offline.** Ship α first; offline only
becomes essential if a user reports drops during capture.

### Flow (realtime)

```
User selects film + toggles "Record" in Movie panel.
  ↓
Press Play (or Shift+C).
  ↓
startMovie():
  ↓
  if (film.recording) {
    filmCaptureStart({ fps: 60, bitrate: 25_000_000 });
  }
  ↓
  UI auto-hides (Performance mode toggle + cursor hidden).
  ↓
Playback runs. Events fire. Film progresses.
  ↓
End event at t = duration.
  ↓
stopMovie(graceful):
  ↓
  if (recording) filmCaptureStop();  // encode + download
  ↓
  UI restored.
```

### What gets hidden during recording

- Rail
- Panel (if open)
- HUD time-state + fps counter
- Rec-dot (**not** hidden — viewer can confirm recording is happening
  by seeing the small dot, optional flag)

**Not hidden**:

- Title overlay (it's _part of the film_)
- Toast banners (only used for user-initiated state changes; won't
  fire during playback anyway)
- Flash element (part of transitions)

### Filename convention

```
universe_<filmKey>_<YYYYMMDD-HHMMSS>.webm
```

Examples:

- `universe_first-light_20260419-210233.webm`
- `universe_passage_20260420-084501.webm`

Scene-of-the-moment is irrelevant for films; filmKey + timestamp is
enough.

### Bitrate targets

| Quality      | Bitrate           | File size (5-min film) |
| ------------ | ----------------- | ---------------------- |
| Stream-ready | 12 Mbps           | ~450 MB                |
| Polished     | 20 Mbps (default) | ~750 MB                |
| Archive      | 40 Mbps           | ~1.5 GB                |

Selectable in the Movie panel. Default is Polished.

### Encoder selection

Prefer in order:

1. `video/mp4;codecs=avc1.42E01E` (H.264) — Widest compatibility
2. `video/webm;codecs=vp9` (VP9) — Chrome-native
3. `video/webm;codecs=vp8` (VP8) — Older fallback

Existing `toggleRecording` already iterates candidates; reuse that
logic.

### Chunked writes (for long films)

Film 3 is 8 minutes at 20 Mbps ≈ 1.2 GB in memory. Safe on a 4090
workstation; risky on lower-RAM machines.

Use `MediaRecorder.start(timeslice=2000)` so chunks are available
every 2 seconds. Push each chunk to an `IndexedDB` staging store
instead of an in-memory array. On stop, concatenate and present for
download.

This also lets the user **salvage a partial recording** if they hit
Esc mid-film — we've got the chunks up to now on disk.

### LOC

- `filmCaptureStart(opts)`: ~60 lines (extends current `toggleRecording`
  logic)
- `filmCaptureStop()`: ~40 lines (encoder finalise + IndexedDB concat
  - download trigger)
- Movie panel additions: recording toggle, bitrate picker: ~30 lines
- Auto-hide integration: reuse existing Performance mode (`H`); set
  - restore the `performance` class: ~15 lines

**Total: ~150 lines.**

---

## Part 3 — How they work together

Smoothing makes the camera motion _record well_. A jerky motion
captured at 60 fps plays back at 60 fps still jerky. A smooth motion
records to smooth bits.

If smoothing isn't landed first, recordings will show all the current
boundary kicks magnified by 1080p compression. Smoothing is the
**prerequisite**, not an optional polish.

**Recommended ship order:**

1. **Smoothing** — lands in Movie mode first, validate on Film 1
   playback (visual). A single before/after recording tells you
   whether it's right.
2. **Realtime recording** — add to the capture pipeline. Record Film 1
   with smoothing on. Compare against recording with smoothing off
   (disable via config) — the difference should be obvious.
3. **Offline rendering** — only if recording Film 3 drops frames on the
   target machine. Don't pre-emptively build it.

---

## Part 4 — Specification

### Smoothing spec

```js
const smoothing = {
  enabled: false, // gate: only movie mode or cinematic-with-smoothing
  halflife: { pos: 0.3, tgt: 0.4, fov: 0.22 },
  // Current filtered state
  pos: new THREE.Vector3(),
  tgt: new THREE.Vector3(),
  fov: 55,
  // Last written target from the active shot/program
  targetPos: new THREE.Vector3(),
  targetTgt: new THREE.Vector3(),
  targetFov: 55,
};

function smoothingTick(realDt) {
  if (!smoothing.enabled) return;
  const a = (dt, hl) => 1 - Math.exp((-dt * Math.LN2) / hl);
  smoothing.pos.lerp(smoothing.targetPos, a(realDt, smoothing.halflife.pos));
  smoothing.tgt.lerp(smoothing.targetTgt, a(realDt, smoothing.halflife.tgt));
  smoothing.fov +=
    (smoothing.targetFov - smoothing.fov) * a(realDt, smoothing.halflife.fov);
  camera.position.copy(smoothing.pos);
  controls.target.copy(smoothing.tgt); // for sanity even if disabled
  camera.lookAt(smoothing.tgt);
  camera.fov = smoothing.fov;
  camera.updateProjectionMatrix();
}

function snapCamera() {
  smoothing.pos.copy(smoothing.targetPos);
  smoothing.tgt.copy(smoothing.targetTgt);
  smoothing.fov = smoothing.targetFov;
}

// In shot programs:
// OLD:  camera.position.set(x,y,z); camera.lookAt(t); camera.fov = f;
// NEW:  smoothing.targetPos.set(x,y,z); smoothing.targetTgt.copy(t); smoothing.targetFov = f;
```

### Recording spec

```js
const filmCapture = {
  active: false,
  filmKey: null,
  mediaRecorder: null,
  stream: null,
  mime: "",
  chunks: [], // or IndexedDB handle
  fps: 60,
  bitrate: 20_000_000,
  uiWasHidden: false,
};

function filmCaptureStart(opts) {
  /* ... */
}
function filmCaptureStop() {
  /* ... */
}
```

Exposed:

```
{ fps:    60,     // capture fps
  bitrate: 20_000_000,  // video bits per second
  hideUI: true,         // temporarily enter Performance mode
  showRecDot: true,     // leave the blinking red dot visible
  chunked: true }       // IndexedDB-backed chunking
```

### UI

Add to Movie panel, under the film list:

```
Record: [ ]                  (off by default)
Quality: ○ Stream  ● Polished  ○ Archive
```

During playback with recording on, a small banner top-left:

```
REC · 02:43
```

Not in the HUD proper — in a tight overlay above the film-title layer.

---

## Part 5 — Edge cases

- **User hits Esc mid-recording.** `stopMovie(abort=true)` calls
  `filmCaptureStop(abort=true)` which _still_ finalises and downloads
  the partial file. The user wanted out, but the recording up to that
  moment is theirs.
- **Browser denies MediaRecorder.** Gracefully degrade to "no
  recording," keep the film playing, toast "recording unavailable."
  Don't crash.
- **Smoothing during overlays.** If the user opens the hotkey overlay
  during a film, smoothing continues (camera isn't interactive); when
  they close it, no state loss.
- **Zoom during smoothing.** Mousewheel input is disabled
  (`controls.enabled = false`). But the browser's native pinch-zoom
  still dispatches `wheel`. Catch `wheel` during movie and
  `preventDefault()` to suppress.
- **Scene swap discontinuity.** At travel t=0.5, `doSceneSwap` fires.
  Body positions change; camera framing may not need to change. But if
  the new scene's `framing.rRange` differs drastically, the next shot
  might start from an awkward pose. Smoothing already handles this —
  the spring drags through the change. If it looks bad, add
  `snapCamera()` call into `doSceneSwap`.

---

## Part 6 — Invariants

- **Smoothing never snaps silently.** All snaps are explicit
  `snapCamera()` calls at known boundaries (film start/end, scene swap
  within travel). Never lerp-then-snap.
- **Recording never misses the first second.** MediaRecorder must be
  started before the first `rAF` of the film, not on the first event.
- **Neither feature blocks the UI.** If recording setup takes 200ms,
  the film still begins on time (film runs on its own clock; the
  recording catches up).
- **Recording is optional.** Movie mode works identically with or
  without it. Smoothing is on by default; recording is opt-in per
  playthrough.

---

## Part 7 — Test plan

### Smoothing

- Play Film 1 with smoothing **off** (config flag). Observe the shot-
  to-shot boundaries. Any visible kick = failure mode.
- Play Film 1 with smoothing **on**. The same boundaries should flow.
- Toggle smoothing mid-film (dev console). Should seamlessly change
  feel; no jumps.
- Scene swaps under travel: no rubber-band effect. Smoothing snaps at
  the exact right moment.

### Recording

- Record Film 1 with Polished quality. Playback in VLC / Chrome.
  Motion should be smooth. File should be 600–900 MB.
- Start Film 1 with Recording off, halfway through toggle it on (dev
  console). Should start fresh recording from that moment.
- Record + hit Esc at 0:30. Partial file should download with 30s of
  content.
- Record Film 3 (8 min). Should complete without OOM.
- Record, inspect file: first frame = black/title-up, last frame =
  black (fade-to-black). No UI visible.

---

## Part 8 — Open questions

- **Should smoothing apply to the Cinematic director's reframes?**
  _Proposal_: yes, but with shorter halflives (0.18s pos, 0.22s tgt)
  since cinematic beats are shorter. Ship after Movie smoothing proves
  out.
- **Should Cinematic mode also be recordable?** _Proposal_: no. It's
  infinite — you'd need a stop button the user explicitly presses. It
  already has `toggleRecording` via the Capture panel. That's enough.
- **What about audio?** The music player is just an `<audio>` element.
  `canvas.captureStream` doesn't include audio. To include it, mix the
  audio source into a `MediaStream` via `MediaStreamAudioSourceNode`
  and merge. ~50 lines. _Proposal_: ship without audio first; add in
  Pack β alongside offline rendering.
- **Output as something other than webm/mp4?** No — those are what
  browsers speak. If the user wants ProRes or DNxHD, they re-encode.

---

## Part 9 — Ship order

### Pack α — Smoothing

Single focused change: add the smoothing layer and convert Movie mode's
4 shot programs to write through it. Validate by eye against Film 1.

- `smoothing` object + `smoothingTick()` + `snapCamera()`
- Shot programs `drift-wide`, `slow-reveal`, `push-in`, `hold-still`
  write to `smoothing.targetXxx` instead of `camera.xxx`
- `snapCamera()` called in `startMovie()`, after `doSceneSwap()`
- Config toggle in dev to disable for A/B comparison

One evening.

### Pack β — Realtime recording

- `filmCapture` module with start/stop + IndexedDB chunking
- Movie panel recording toggle + quality selector
- Auto-hide UI + "REC · mm:ss" mini-banner
- Filename convention
- Esc abort with partial-file download

One focused day.

### Pack γ — Polish

- Apply smoothing to Cinematic mode with shorter halflives
- Per-shot smoothing overrides
- Audio mixing into recording
- Performance mode UI clean-up during recording (ensure all overlays
  are truly hidden)

Half day.

### Pack δ — Offline rendering (defer)

- Decouple sim + composer tick from rAF
- Fixed-dt frame stepping
- WebCodecs `VideoEncoder` integration
- Progress bar in UI
- Handle cancellation

Week-long, only if the realtime path stutters in practice.

---

## Not doing

- **Live timeline scrubbing** during recording. Movies play linearly,
  period. Editing happens after capture, not during.
- **Keyframe editing in a GUI.** Film authoring stays in code.
- **Exporting individual shots as separate files.** One film = one
  file.
- **Real-time preview of the captured stream.** The canvas already
  _is_ the preview.
- **Watermarks / overlays specific to captures.** Same aesthetic
  whether playing or recording; no "recorded-with" badges.
