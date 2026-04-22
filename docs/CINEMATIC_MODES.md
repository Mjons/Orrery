# CINEMATIC_MODES.md — Director Flavours

`CINEMATIC.md` defines _one_ director (dwell → reframe → approach →
transition). This doc locks in the **flavours** that director can run in.
Each mode is a preset of timing, framing bias, transition grammar, breathing
depth, and scene filter. Same state machine, different personality.

Goal: press `C`, then `Shift+C` cycles through a small, distinct menu.
Each flavour should feel obviously different within 30 seconds of watching.

---

## Design rules

- **Few, distinct, named.** 4–6 flavours max. If two feel similar at a
  glance, merge them.
- **Every flavour is shippable alone.** A user who only ever uses one mode
  should still feel the sim is complete.
- **No new physics per flavour.** Timings, weights, post, framing bias,
  scene filter. That's it.
- **One-word names.** They show in the HUD. Long names get truncated.
- **Each has a home.** Stream / HN demo / capture / background — flavours
  map to use cases, not moods. Moods are a side effect.

---

## The options

Eight candidates. Ship 4. The rest are seeds for later.

### 1. `Drift` — the default

The ambient one. What the stream runs 23 hours a day.

- **Dwell:** 45–90s. **Reframe:** 8–14s, 3–5 per scene. **Transition:** 3.2s dissolve.
- **Breathing:** full (bloom, exposure, FOV, CA all on).
- **Framing bias:** density clusters and saved viewpoints. Rarely chases
  fast bodies.
- **Transition grammar:** dissolve > pull-back > push-in. No flare cuts.
- **Scene filter:** all scenes. Weighted toward calm
  (Quiet Drift, Sagittarius, Lattice, Horsehead, Coma).
- **Use case:** 24/7 stream. Living-room screensaver. "Put it on and forget."
- **One-liner:** _A slow river. Every reframe earned._

### 2. `Pulse` — the demo reel

The HN / X clip flavour. Front-loaded beats, no dead air. Made to be
screen-recorded for 60 seconds and posted.

- **Dwell:** 18–35s. **Reframe:** 5–8s, 2–3 per scene. **Transition:** 1.6s flare cut.
- **Breathing:** bloom + exposure only. FOV locked (so clips don't breathe
  out of composition).
- **Framing bias:** highest-mass body, then densest cluster.
- **Transition grammar:** flare cut > push-in > dissolve.
- **Scene filter:** high-energy only — Collision, Bullet Cluster, Antennae,
  Event Horizon, Birth, Stephan's Quintet.
- **Use case:** recording shareable clips. "Pulse mode" is what the
  launch-week teaser videos are captured in.
- **One-liner:** _Every 20 seconds, something happens._

### 3. `Long Shadow` — the piece

Gallery / installation flavour. Long holds, rare cuts, deep stillness.
Would be the mode running if this were projected in a museum loop.

- **Dwell:** 120–240s. **Reframe:** 12–20s, 1–2 per scene. **Transition:** 4.0s dissolve.
- **Breathing:** exposure + FOV only. Bloom locked (no "beats").
- **Framing bias:** saved viewpoints > density. Almost never the fastest body.
- **Transition grammar:** dissolve only. Pull-back on scene exit.
- **Scene filter:** quiet scenes only — Quiet Drift, Sagittarius, Lattice,
  Horsehead, Sombrero, Coma.
- **Pace modifier:** slow all oscillators to 0.6×. Everything breathes deeper.
- **Use case:** art context. Focused viewing. Deep background music.
- **One-liner:** _A painting that remembers it is moving._

### 4. `Kino` — the orchestrated one

A director that _composes shots_ rather than picks them. Uses push-in/
pull-back pairs deliberately — an intimate scene is always followed by a
wide one, and vice versa. The eye learns the rhythm.

- **Dwell:** 30–60s. **Reframe:** 6–10s, 2–4 per scene. **Transition:** 2.4s, grammar-driven.
- **Breathing:** full. Oscillator phases aligned across reframes so moves
  feel _scored_, not random.
- **Framing bias:** alternates close / wide deliberately. Close reframe →
  next reframe is wide. Enforces scale contrast.
- **Transition grammar:** strict alternation. intimate → wide uses pull-back,
  wide → intimate uses push-in, same-scale uses dissolve.
- **Scene filter:** all, but paired — Event Horizon always followed by
  Coma / Sagittarius. Orrery always followed by Stephan's Quintet.
- **Use case:** the "good taste" flavour. What you show to someone to prove
  it isn't a screensaver.
- **One-liner:** _Someone is cutting this._

### 5. `Restless`

Fastest flavour. The one that looks alive on a muted phone. Not recommended
for viewing at length, but sells the range in a 10-second glance.

- **Dwell:** 10–20s. **Reframe:** 3–5s, 1–2 per scene. **Transition:** 1.2s flare.
- **Breathing:** bloom only, amplified (±15%).
- **Framing bias:** fastest body, then highest-mass. Never saved viewpoints.
- **Transition grammar:** flare cut only.
- **Scene filter:** all, no weighting.
- **Use case:** Twitter autoplay thumbnails. Mobile demos. Short previews
  embedded in the README.
- **One-liner:** _For muted autoplay._

### 6. `Oracle` — emergence-first

The director _watches_ rather than schedules. Dwell is unbounded. The
transition trigger is an emergent event in the sim (supernova-like kick,
BH merger, cluster collapse) detected via stats. When nothing happens,
the camera reframes. When something happens, the director cuts to it.

- **Dwell:** ∞ (bounded by a 6-minute failsafe).
- **Reframe:** 8–14s, unlimited until event.
- **Transition:** event-driven. 800ms cut to close-up on the event body.
  Dwell there 30–60s, then back to normal state machine.
- **Breathing:** full.
- **Framing bias:** scans for event candidates each reframe.
- **Transition grammar:** push-in for event cuts. Dissolve for timeout.
- **Scene filter:** high-event-rate scenes — Collision, Birth, Bullet,
  Antennae, Event Horizon, Stephan's Quintet.
- **Use case:** "is this really emergent?" demo. Stream highlight material.
  The moments this captures are the clips you'll actually remember.
- **One-liner:** _Waits for the universe to say something._

### 7. `Single` — one-scene mode

Not really a flavour — a modifier. Pair with any other flavour. Locks
scene transitions off; reframing only. Drift + Single is the 24/7
stream's "hold on Coma for 45 minutes" option.

- Phase 2 shuffler disabled.
- All other timings inherit from the paired flavour.
- HUD shows the locked scene name.
- **Use case:** long stream holds on viewer-requested scenes
  (`!scene coma` in Twitch chat, run Single for 30 minutes, move on).

### 8. `Seed` — reproducible

Also not a flavour, also a modifier. When active, director is deterministic
from a seed. Pair with Drift for "here is a 2-hour film I recorded, here is
the seed, run it yourself."

- Wraps the existing cinematic log (phase 7 of `CINEMATIC.md`).
- `Shift+S` in cine mode copies `cine://<flavour>/<seed>` to clipboard.
- **Use case:** sharing specific captures. "Watch this exact run."

---

## What to ship

**Pick four. Cycle with `Shift+C`.**

Recommended ship list:

1. **Drift** — default on first `C`.
2. **Pulse** — for clip capture.
3. **Long Shadow** — for holding.
4. **Oracle** — the one that sells the thesis.

Kino is tempting but needs per-scene "scale" tags (intimate vs. wide) that
don't exist yet. Add after the first four are stable.

Restless is a one-off. Save it for the README autoplay GIF and skip the
HUD slot.

Single and Seed are modifiers, not flavours — surface as `Shift+1` and
`Shift+S` respectively, orthogonal to the main cycle.

---

## UI surface

HUD top-right, under the scene name:

```
● Drift          ← current flavour, dot uses --accent
[ single ]       ← only shown when Single is on
[ seed a3f9 ]    ← only shown when Seed is on
```

Left rail, under "Motion":

```
Cinematic
  ◯ off  ● drift  ◯ pulse  ◯ long shadow  ◯ oracle
  [ ] hold on current scene       (Single modifier)
  [ ] reproducible run            (Seed modifier)
```

Hotkeys:

- `C` — toggle cinematic off / on.
- `Shift+C` — cycle flavour (Drift → Pulse → Long Shadow → Oracle → Drift).
- `Shift+1` — toggle Single.
- `Shift+S` — toggle Seed + copy link.

Everything else stays invisible.

---

## Parameter table (for the implementer)

| Flavour     | Dwell (s) | Reframe (s) | Reframes | Transition (s) | Grammar                 | Breathing       | Focal bias        | Scene filter       |
| ----------- | --------- | ----------- | -------- | -------------- | ----------------------- | --------------- | ----------------- | ------------------ |
| Drift       | 45–90     | 8–14        | 3–5      | 3.2 dissolve   | dissolve / pull / push  | full            | density, saved    | all, calm-weighted |
| Pulse       | 18–35     | 5–8         | 2–3      | 1.6 flare      | flare / push / dissolve | bloom+exp       | mass, density     | high-energy        |
| Long Shadow | 120–240   | 12–20       | 1–2      | 4.0 dissolve   | dissolve only           | exp+fov, slowed | saved, density    | quiet only         |
| Kino        | 30–60     | 6–10        | 2–4      | 2.4 grammar    | strict alternation      | full, aligned   | scale-alternating | all, paired        |
| Restless    | 10–20     | 3–5         | 1–2      | 1.2 flare      | flare only              | bloom only      | speed, mass       | all                |
| Oracle      | ∞ / 360   | 8–14        | ∞        | 0.8 event-cut  | push-in on event        | full            | event candidate   | high-event         |

---

## What kills this

- **Too many flavours.** If `Shift+C` needs a legend, we've lost. Cap at 4.
- **Flavours that blend.** Drift and Kino feel similar if Kino's alternation
  is too subtle. Tune Kino aggressive or drop it.
- **Stream running Pulse.** Exhausting to watch for more than 10 minutes.
  Drift is the 24/7 default; Pulse is opt-in for recording.
- **Oracle with no events.** If the stats detector misses for 6 minutes, the
  failsafe cut will feel random. Start with a permissive detector and
  tighten later.

---

## Build order

1. **Drift** — it's essentially `CINEMATIC.md` phases 1–4 with defaults.
   Ships when cine mode ships.
2. **Long Shadow** — almost free once Drift works. Change timings, slow
   oscillators, filter scenes. Half a day.
3. **Pulse** — needs flare-cut transition (phase 5). One day.
4. **Oracle** — needs the event detector. Biggest flavour bet. Two days.
5. **Single** / **Seed** modifiers — quarter day each, after the four.
6. **Kino** — only after per-scene `scale: "intimate" | "wide"` tags exist.

Ship Drift alone first. Live with it for a week before adding Long Shadow.
Pulse and Oracle earn their keep during launch week.
