---
id: 01KR0000RENDERQUALITY00000
created: 2026-04-22
---

# RENDER_QUALITY.md — Auto-throttle + user-selectable quality tiers

Boltzsidian looks best at peak settings: heavy bloom, chromatic
aberration, grain, vignette, full label + tether + spark pools,
smooth physics. At peak it also asks a lot of the GPU. On a modest
machine — or when hundreds of bodies suddenly move at once (a dream
gravity peak during a themed cycle, or the settling after a large
tend bulk-accept) — the render pipeline chokes. Frames drop, input
stutters, eventually the tab dies.

The fix is two-layered:

1. **Auto-detect**. Watch frame pacing. When the renderer falls
   behind, temporarily dial quality down. When the motion settles,
   dial back up to the user's ceiling.
2. **User choice**. Four tiers — Low, Medium, High, Ultra — so the
   user can pick a ceiling that matches their hardware, and a "let
   it breathe" setting so the auto-throttle has permission to drop.

The user's choice is the ceiling. Auto-detect can only LOWER quality
from there, never raise above.

---

## 0. Premise

Heavy moments in Boltzsidian's render:

- Dream gravity + theme anchor pulling a cluster together (peak
  frame during _playing_ phase).
- Post-bulk-accept settling (new edges → new springs → cluster
  contraction over ~10 s).
- Camera tween through a dense region (everything moves toward or
  past the viewport).
- Dream ambience swap (the post stack reconfigures each time depth
  crosses a preset threshold).

At peak motion, the render loop does:

1. Physics step → updates position/velocity buffers (~O(bodies)
   - O(edges) for springs).
2. `tethers.update` → streams segment positions to GPU (~O(live
   segments)).
3. `labels.update` → projects up to 80 bodies to screen space (~
   O(visible bodies)).
4. `constellations.update` → projects up to 20 cluster centroids.
5. `bodies` shader → draws all bodies with per-body sprites.
6. Post-processing chain: bloom (multi-pass downsample +
   upsample), CA, grain, vignette.
7. DOM compositor: label positions, constellation halos.

Individually, everything's budgeted. In a peak frame all of them
fire at once AND the physics step may span 2× its usual cost
because many bodies have non-trivial forces on them. The chain
gets long enough that a 16.7 ms budget (60 fps) isn't enough, and
the browser starts dropping frames.

---

## 1. What "too many moving at once" is, measurably

Two signals, either of which is enough:

**1.1 Frame pacing.** Running EMA of frame time. If the EMA
exceeds 33 ms (30 fps) for 2 consecutive seconds, we're lagging.

**1.2 Motion census.** Per-frame count of bodies with
`|velocity| > MOTION_THRESHOLD` (say 15 units/s). If > 60% of
bodies are moving for 2 consecutive seconds, the physics step is
dominating the budget.

Signal 1 is necessary (the renderer is actually slow) and sufficient
(we can't see inside physics to know why). Signal 2 is an optional
confirmation — "yes, it's heavy motion, not a GC stall."

---

## 2. Quality tiers

| Tier   | Target FPS | Post chain                    | Pool sizes                         | pixelRatio       |
| ------ | ---------- | ----------------------------- | ---------------------------------- | ---------------- |
| Low    | 60 easy    | none (bypass `composer`)      | 40 labels, 10 halos, 500 tethers   | 0.75×            |
| Medium | 60 typical | bloom only (reduced)          | 60 labels, 15 halos, 1000 tethers  | 1.0×             |
| High   | 60 peak    | bloom + CA + vignette + grain | 80 labels, 20 halos, 2000 tethers  | 1.0×             |
| Ultra  | 120 ok     | all passes at peak strength   | 120 labels, 30 halos, 4000 tethers | devicePixelRatio |

Notes:

- **Low** turns off bloom entirely and renders straight to screen.
  Biggest GPU win. Still looks good — clean constellation sky,
  just no glow halo around stars.
- **Medium** keeps bloom (the app's signature visual) but lowers
  its radius + strength. Drops CA / grain / vignette.
- **High** is today's default. All passes, budgeted to 60 fps on
  mid-range laptops.
- **Ultra** is for desktop + dedicated GPU. Dial everything up;
  the visuals earn the hardware.

Default: **High**. Auto-detect may drop to Medium or Low under
peak load. User can set the ceiling explicitly.

---

## 3. Levers each tier controls

Grouped by subsystem:

### 3.1 Post-processing (biggest GPU cost)

- `composer.enabled` — if false, render straight via `renderer.render`.
- `bloomPass.strength` / `bloomPass.radius` / `bloomPass.threshold`.
- `caPass.enabled`.
- `grainPass.enabled`.
- `vignettePass.enabled`.

### 3.2 DOM overlays (CPU + layout)

- `labels.MAX_LABELS` (currently 80).
- `labels.UPDATE_EVERY_N_FRAMES` (currently 3).
- `constellations.MAX_CONSTELLATIONS` (currently 20).
- `constellations.UPDATE_EVERY_N_FRAMES` (currently 3).

### 3.3 Tethers (GPU geometry upload)

- `tethers.MAX_SEGMENTS` (currently 4000). Above this, tethers get
  culled. Tether geometry reallocates if the cap changes.

### 3.4 Sparks (dream-mode eye candy)

- `sparks.ENABLED` — whether the pair-spawn spark fires at all.
- `sparks.MAX_LIVE` — concurrent sparks on screen.
- `sparks.RATE` — how many ticks between allowed spawns.

### 3.5 Physics (CPU)

- `physics.maxSpeed` — already tier-adjacent. Could lower on Low so
  bodies don't blur.
- `physics.steps_per_frame` — today always 1. Could drop to 0.5
  (skip every other frame) on Low.

### 3.6 Renderer

- `renderer.setPixelRatio(n)`. 0.75× on Low is ~55% the pixel
  count of 1.0×.
- `renderer.shadowMap.enabled` — already off, leave off.

### 3.7 Camera

- Auto-orbit update rate — currently every frame. Drop to every 2
  on Low.

---

## 4. Auto-throttle heuristic

Simple three-state machine, driven by frame-time EMA.

```
state: "at-ceiling" | "dropped-one" | "dropped-two"
emaFrameTime: running mean (alpha 0.1)
belowStreak, aboveStreak: consecutive sample counts
```

Each frame:

1. Update EMA from `dt`.
2. If `ema > 33ms`: `belowStreak++`, reset `aboveStreak`.
3. If `ema < 18ms`: `aboveStreak++`, reset `belowStreak`.
4. Else: neutral; reset both after a grace of 30 frames.

Transitions:

- `belowStreak > 120` (2 s at 60 fps) and not at bottom → drop
  one tier. Reset streaks.
- `aboveStreak > 300` (5 s healthy) and dropped → raise one tier
  toward the user ceiling. Reset streaks.

Hysteresis intentionally asymmetric: drop fast, raise slow. A
peak moment pulls us down immediately; we only give the peak back
after sustained calm.

**State display.** When auto has dropped below the ceiling, show
a quiet indicator in the HUD:

> Rendering at Medium · auto (ceiling: High)

Clicking the indicator expands to a "why?" (current FPS, motion
census) + a "stick here" button that pins the current effective
tier as the new ceiling.

---

## 5. Settings UI

### 5.1 Settings → Appearance

```
Quality          [Low] [Medium] [High] [Ultra]
                 Auto-throttle  ☑
```

Picker: four-segment control. Radio-style; one selected, becomes
the ceiling.

Auto-throttle checkbox: on by default. Off means the tier the
user picked is final — the app will stutter if it can't keep up
rather than silently dropping features. Some users (recording a
demo, screenshotting) want that.

### 5.2 HUD indicator

Top-right corner, subtle:

- Silent when `effective === ceiling`.
- Shows `Rendering at Low · auto` when dropped.
- Tooltip on hover: FPS, motion census, user ceiling.
- Click to toggle the expanded diagnostic panel (current FPS
  histogram over the last 30 s, which subsystems are throttled).

### 5.3 Persistence

`settings.render_quality_ceiling: 'low' | 'medium' | 'high' |
'ultra'` — defaults to `'high'`.
`settings.render_quality_auto: boolean` — defaults to `true`.

---

## 6. Implementation phases

### Phase A — Quality registry + tier constants · ~1.5 h

1. New module `src/sim/render-quality.js`.
   - Export `TIERS = { low, medium, high, ultra }` each being the
     full lever set (§3).
   - Export `applyTier(tierName, subsystems)` where `subsystems`
     is `{ composer, bloomPass, caPass, grainPass, vignettePass,
renderer, labels, constellations, tethers, sparks }`.
2. Each subsystem exposes a `setQuality(tier)` method. Internals
   do the right thing (update uniforms, pool sizes, skip-rates).
3. No auto-detect yet. Just a plumbing pass so `applyTier('low')`
   is one call from anywhere.

### Phase B — Settings UI · ~45 min

1. `settings.render_quality_ceiling` default `'high'`.
2. `settings.render_quality_auto` default `true`.
3. Settings → Appearance section gains the four-segment picker
   and the Auto-throttle checkbox.
4. `onChange` calls `applyTier(patch.render_quality_ceiling,
subsystems)` and updates the auto gate.

### Phase C — Frame-time EMA + state machine · ~1 h

1. New helper in `main.js` (or a `sim/quality-monitor.js`):
   - Tracks `ema`, streaks, current auto tier.
   - Runs on every `onFrame(dt)`.
   - Fires `onTierChange(next)` when dropping or raising.
2. Wire `onTierChange` to `applyTier`.
3. Never exceed the user's ceiling. `effective = min(ceiling,
autoPick)`.

### Phase D — HUD indicator · ~1 h

1. Small fixed-position pill in the top-right.
2. Hidden when `effective === ceiling`.
3. Tooltip + click-to-expand (expand is v2 — ship pill first).

### Phase E — Motion census signal · ~45 min (optional)

1. Count bodies with `|v| > MOTION_THRESHOLD` each frame.
2. Feed into the quality monitor as a secondary signal: if the
   motion census is high AND ema is elevated, we're
   confident it's motion-driven and the drop should be aggressive.
3. Logged; not used as a primary trigger in v1.

**Total for A–D: ~4.25 hours.** Half a day.

---

## 7. Edge cases & constraints

- **Demo vault + Ultra on a low-end device.** The demo vault is
  small; Ultra should be fine even on integrated GPUs. Leave the
  ceiling user-controlled; don't auto-pick based on the workspace
  size.
- **Screenshot / recording.** User wants peak quality regardless
  of stutter. The Auto-throttle toggle handles this.
- **Low-battery mode.** Chromium triggers battery saver which
  already throttles rAF. Don't fight that — our EMA will see the
  slowdown and drop tiers naturally.
- **Focus/blur.** Tab in background: `document.visibilityState`.
  Pause auto-pick evaluation (EMA goes haywire on throttled rAF).
- **Initial tier during boot.** Pick the user's ceiling right
  away. Don't start at Low and crawl up.
- **Pool resizing is not free.** Changing `MAX_LABELS` from 80
  to 40 means disposing 40 DOM elements. Do it once per tier
  change, not per frame. Expected behaviour — tier changes are
  rare.
- **Physics tier deltas are visual.** At Low, maxSpeed lowered
  means bodies feel more damped. Intentional; Low is supposed to
  feel calmer, not janky.
- **Tether cap shrink mid-motion.** When dropping tier, live
  tether segments above the new cap need to fade out gracefully.
  Reuse the existing ghost-tether fade.

---

## 8. What to deliberately skip

- **Per-subsystem overrides.** "I want bloom on but labels off at
  Low." Too fiddly; the tiers are the product.
- **Automatic ceiling detection.** "Detect GPU → pick ceiling."
  Fragile and patronizing. User picks; auto respects.
- **Adaptive pixel-ratio mid-frame.** Expensive to reconfigure the
  render targets. Change only on tier transition.
- **Custom frame-time budgets** beyond 60 fps target. Ultra can
  do 120, but don't expose a "target fps" slider.
- **Network-based telemetry** of which tier users land at. Nice
  to know for tuning defaults, but out of scope for single-user
  local app.
- **FSR / DLSS-style upscaling.** Deep GPU work; not where
  Boltzsidian's budget lives.

---

## 9. Interactions with existing features

- **[[AMBIENCE]].** Ambience presets tune the post chain for mood
  (warmth, vignette depth, grain). When tier drops, ambience
  effectively attenuates. The mood survives — we just don't
  render the parts of it that cost frames.
- **[[DREAM_GRAVITY]].** Peak attractor strength IS a motion
  spike generator. If the user sets Ultra + peak strength 8000,
  auto will drop to Medium during peak. Correct behaviour.
- **[[CONSTELLATIONS]].** Halo count shrinks with tier. The 5
  biggest clusters always get halos; the tail disappears first
  at Low.
- **[[LABELS]].** Label pool shrinks with tier. Cursor-lens
  priority still wins — the hovered star keeps its label even at
  Low.
- **[[TEND_BULK_CRASH]].** The render-quality drop is the
  missing lever during large settle passes. Pairs naturally with
  the bulk-accept work already shipped.
- **[[STREAM_SETUP]]**. Twitch / YouTube streamers want
  predictable visuals. Auto-throttle honours the user ceiling as
  a hard cap, so a streamer who picks High + Auto-off gets
  exactly High.

---

## 10. One sentence

Four quality tiers with an auto-throttle that respects the user's
ceiling — so Boltzsidian looks best when it can and stays playable
when it can't, without the user having to babysit the renderer.

#render #performance #quality #throttle
