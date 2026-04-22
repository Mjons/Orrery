---
tended_on: [tag-infer]
id: 01KPS7VDWR54MXY517CS6DSYQG
created: "2026-04-19T22:06:57.485Z"
---

# TRAILS.md — Star-Path Trail Persistence

Plan for letting the **followed star's journey trail** run much longer
— ideally indefinitely — without the trail cutting off and leaving the
star to continue untracked.

Focused on the `starTrail` feature (section 22e in `index.html`, planned
in `STAR_TRAIL.md`). Unrelated to the post-process `AfterimagePass`
screen-space trails, which is a separate system and not what this plan
covers.

---

## What "release" is

From [index.html:7469](index.html#L7469):

```js
if (
  followCam.state === "FOLLOWING" &&
  starTrail.recording &&
  starTrail.count < starTrail.MAX        // ← the cliff
) {
  ...appendTrailSample(...);
}
```

And [index.html:7482](index.html#L7482):

```js
if (starTrail.count >= starTrail.MAX) {
  starTrail.recording = false; // ← hard stop
  showToast("Trail", "full · " + starTrail.MAX + " samples");
}
```

When the followed body's path has consumed **16,384 samples**, recording
flips off. The star keeps moving but no new points are added. That's
the "release" — the star visually escapes its trail and continues into
uncharted space.

At `minStepSq = 0.16` (ε ≈ 0.4 sim units between samples), 16,384
samples covers ~6,500 sim units of path. For a Milky Way star at
r=120, v=10, one orbit is ~750 units, so **~8 orbits before the trail
fills**. In real time at speed=1 that's roughly 60–90 seconds of
following — then the star breaks free.

---

## Why it was built this way

`STAR_TRAIL.md` (the original design) explicitly called for **two
modes**:

- **Ring mode (default)**: oldest samples get overwritten, trail
  shows only the last N samples.
- **Keep mode**: once full, stop extending — preserve the opening orbit
  forever.

The current implementation shipped Keep mode as the _only_ behaviour
and skipped ring mode. That's the direct cause of the "release" —
Keep was meant for deliberate capture ("screenshot this orbit"), not
for the default follow-along experience.

`MAX = 16384` was also a conservative first pick. The plan suggested
65,536 — four times the current cap.

---

## Options, in order of cost

### Option A — Raise the cap (smallest fix)

Bump `starTrail.MAX` from 16,384 → 131,072 (8× higher, matches the
plan's ceiling with headroom). Memory cost: 131,072 × 6 floats ×
4 bytes = **3 MB**. Trivial.

Effort: one-line change.
Result: same behaviour, but the release happens after ~60+ orbits
instead of ~8. For a followed disk star that's roughly 10 minutes
of watching.

**Where this breaks:** still breaks eventually. For a 24/7 stream or
a patient user, "10 minutes then cuts off" still reads as a bug.

### Option B — Switch to ring mode as default

When the buffer is full, overwrite the oldest sample and advance a
`tailIndex`. The trail always shows the last N samples, never
releases.

Effort: ~30 lines.

- Add `starTrail.head` (write index) + `starTrail.tail` (oldest valid
  index) alongside `count`.
- `appendTrailSample` writes at `head`, wraps to 0 at MAX, advances
  `tail` when `head` catches up.
- Render path must know to draw from `tail → head` wrapping through
  the buffer, which `BufferGeometry.setDrawRange` alone can't express
  — need **two draw calls** (tail → MAX, then 0 → head) or a single
  `LineSegments` with index buffer.

Result: trail never releases. Tail gently erodes from the oldest end
as the star moves. At MAX=131,072 the ring covers ~10 minutes of
path; older than that is silently forgotten. Good enough for almost
any viewing.

**Where this breaks:** long-term wide orbits in `sagittarius` or
`coma` whose period exceeds the buffer will have a moving tail that
cuts off mid-orbit. Visible but not catastrophic.

### Option C — Adaptive spatial decimation

Let the trail run forever by occasionally _thinning_ the oldest half of
the buffer.

Mechanic: when the buffer fills,

- Take the oldest `MAX / 2` samples.
- Replace them with every-other sample (half resolution).
- Compact back into the first `MAX / 4` slots, freeing space.
- `tail` index now points to the new compacted range.

Repeat each time the buffer fills. After N fills, the oldest region is
at 1/2^N resolution but still present in the geometry.

Effort: ~60 lines. Done during a frame budget window so it doesn't
stutter.

Result: **actually endless** trail. An orbit traced 3 hours ago is
still visible as a rough outline; an orbit from 10s ago is at full
detail. Memory stays bounded.

**Where this breaks:** decimation eventually drops below the point
density needed to draw a smooth line. After 4–5 decimations a circular
orbit becomes a polygon. Visually acceptable for a brief "full
history" overlay; not for sharp detail.

### Option D — User-selectable mode

Expose a pill row or toggle in the Follow panel:

```
Trail mode: [●] Endless  [ ] Ring  [ ] Keep
```

- **Endless** = Option C (decimating, goes forever)
- **Ring** = Option B (rolling, last ~10 min)
- **Keep** = current behaviour (preserve the opening arc, stop at
  fill)

Effort: ~20 lines on top of A + B + C landing. The pill stores the
mode, `appendTrailSample` branches on it.

Result: author-intent preserved. Someone doing a stream picks Endless;
someone capturing a screenshot of a specific orbit picks Keep.

### Option E — Pause / resume on release

When the buffer fills, instead of stopping forever, **pause** for N
seconds (during which the head sample repeats, so nothing grows but
nothing erodes), then start ring-mode overwriting.

Effort: ~15 lines.

Result: a brief "settled" beat where the user can see the full arc
before the erosion begins. Good compromise between Keep and Ring.

**Probably not worth building** unless users specifically ask for the
pause.

---

## Recommended build order

**Ship in one session:**

1. **A + B together.** Raise MAX to 131,072 _and_ default to ring mode.
   Trail runs ~10 minutes at full fidelity before the tail starts
   eroding; never releases. ~40 lines total. Fixes the user's
   complaint immediately.

**Second pass (if someone asks):**

2. **D (the mode toggle).** Trivial once A+B are in. Adds the Keep
   behaviour back as an opt-in for screenshot capture, which is the
   original intent from `STAR_TRAIL.md`.

**Only if people use the feature heavily:**

3. **C (adaptive decimation).** Turns Endless into _actually endless_.
   Worth it for the 24/7 stream's flagship shots.

---

## The parameter numbers to ship with

```js
const starTrail = {
  enabled: true,
  recording: false,
  MAX: 131072,         // was 16384 — 8× more, ~3 MB total
  mode: "ring",        // new: "ring" | "keep" | "endless" (once C lands)
  count: 0,            // same: number of valid samples
  head: 0,             // new: next write index (wraps)
  tail: 0,             // new: oldest valid index (ring-mode only)
  minStepSq: 0.16,     // unchanged — 0.4 unit spacing
  lastLoggedPos: ...
};
```

Existing callers of `starTrail.count` need to be audited — some read
it as "how many points to draw," which stays correct. But any code
that assumes samples live in `positions[0 .. count]` contiguously
needs updating once ring mode lands.

---

## Memory and perf

Current: `MAX * 6 floats * 4 bytes = 394 KB` (positions + colors).
Proposed: `131072 * 6 * 4 = 3 MB`. On any GPU made after 2010 this is
noise. No perf impact on the render — line is already drawn as a
single `LineStrip` per frame with `setDrawRange`.

Ring mode adds one conditional per sample append (branch on whether
to overwrite or grow). Negligible.

Option C's decimation is the only thing with a measurable cost — ~4ms
spike per decimation event. Do it during a frame where we're already
near budget (e.g., scene transition) and the user won't notice.

---

## What should _not_ change

- **Spatial downsample (`minStepSq = 0.16`)** stays. It's how the trail
  keeps detail on tight arcs and doesn't waste samples on quiet
  parked bodies. Not the root cause of release.
- **Line rendering path** (`BufferGeometry` + `THREE.Line`) stays.
  Ring mode can be expressed with a slightly fancier draw call, not a
  rewrite.
- **Clearing on scene change** stays. A trail from the Milky Way
  should not persist visually into event-horizon.
- **The "Keep" mode behaviour itself** stays _accessible_ (via the
  mode toggle in D). It's the right default for screenshot capture,
  wrong for ambient viewing — hence the toggle.

---

## Test plan (once A + B land)

- Attach follow-cam to a disk star in Milky Way. Watch for 15 minutes.
  Trail shows the last ~10 minutes at all times; tail visibly erodes
  off the oldest end as new samples append. No toast, no release.
- Attach follow-cam, immediately press screenshot — the trail is
  partial but legible.
- Detach, reattach to a different star — old trail clears, new one
  starts at 0 samples.
- Set mode to Keep, follow for 15 minutes — expect original "Trail
  full" toast at ~11 minutes, trail freezes. (This is the legacy
  capture mode, behaves as today.)
- Switch back to Ring mid-trail — should accept the switch mid-flight
  without a glitch (the existing samples become the ring's initial
  contents; next append starts overwriting the earliest one).

---

## Why this is the right priority

The follow-cam + star trail is the **single most shareable moment**
the sim produces. A screenshot of an elliptical orbit or a tidal fall
into Sgr A\* is the content that reads on a phone thumbnail. If the
trail cuts off mid-orbit, the shareable asset becomes half-finished
— which is the worst kind of bug because users infer "this sim is
buggy" rather than "this feature has a cap I hit."

10-line fix (A) is the floor. 40-line fix (A + B) is the answer.
Ship A+B before the launch week.

#star #user #feature
