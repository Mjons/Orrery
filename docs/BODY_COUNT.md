---
tended_on: [tag-infer]
id: 01KPS7VD8NT4GD1QZAFSR6SX6A
created: "2026-04-19T01:05:59.401Z"
---

# BODY_COUNT.md — Density Levels

Plan for runtime-selectable body counts. Today the sim boots at a single
hard-coded `TEX_SIZE = 128` (16,384 bodies). We want four named levels
the user can switch between: a **lite** tier for weaker GPUs, a
**standard** tier that is today's default, and two **dense / lush** tiers
that push the 4090 toward its fun ceiling.

Companion to `CLAUDE.md` (performance notes) and `CINEMATIC_MODES.md`
(the flavours that will consume whatever count is live).

---

## Why this matters

- **Visual payoff scales sub-linearly with count.** 4× bodies ≠ 4× prettier.
  But for dust-heavy scenes (horsehead, dust-storm, crab, pillars) the
  difference between 16k and 65k is dramatic.
- **Hardware varies wildly.** The 4090 is overkill at 16k. An integrated
  Intel GPU chokes at 16k. A single dial covers both.
- **Stream vs. capture.** 24/7 stream wants rock-solid 60fps →
  standard. Recording a hero clip wants max density, framerate be
  damned → lush.

---

## The levels

Perfect squares only (texture side length). `state.count` can still be
less than `MAX_BODIES` for scenes that want sparse.

| Level        | TEX_SIZE | MAX_BODIES | Pair-ops / step | Target fps (4090) | Notes                                          |
| ------------ | -------- | ---------- | --------------- | ----------------- | ---------------------------------------------- |
| **lite**     | 64       | 4,096      | 17M             | 60 (any laptop)   | fallback when WebGL reports weak adapter       |
| **standard** | 128      | 16,384     | 268M            | 60                | current default. Stream runs here.             |
| **dense**    | 181      | 32,761     | 1.07B           | 45–60             | recording default. Dust scenes shine.          |
| **lush**     | 256      | 65,536     | 4.3B            | 15–25             | demo / screenshot only. Bloom off recommended. |

`181` is close to `√32768`. Rounding to 182 gives 33,124 — pick whichever
compiles cleaner into the shader's inlined `for` loops. I'd go with 181.

**Future tier** (not shipping now): `demo · 362² = 131k bodies`. Needs
Barnes-Hut or it's a slideshow. Listed only to say "no, not yet."

---

## Where TEX_SIZE threads through today

Search-and-destroy list — anything that references `TEX_SIZE` or
`MAX_BODIES` has to be rebuilt when the level changes.

- `index.html:1129` — `const TEX_SIZE = 128;` (the seed)
- `index.html:1298-1299` — shader source uses `${TEX_SIZE}` in template
  literals for the inlined gravity loop. Shader must recompile.
- `index.html:1382` — `new GPUComputationRenderer(TEX_SIZE, TEX_SIZE, …)`
- `index.html:1557-1565` — point mesh `refs` + `positions` arrays sized
  to `MAX_BODIES`. Geometry must rebuild.
- `index.html:2257-2258` — CPU-side `state.positions` / `state.velocities`
  Float32Arrays sized to `MAX_BODIES * 4`.
- Every scene factory — loops are bounded by `MAX_BODIES` or budgets
  derived from it. They read the current value at call time, so
  re-running the factory is enough.

Nothing else. Kind counts, palette stops, K preset size are all
per-kind not per-body.

---

## Implementation: live resize vs. hard reload

Two options. I recommend **live resize**.

### Option A — hard reload (easy, ugly)

Store the level in `localStorage`. Changing it writes the new value and
calls `location.reload()`. The page boots fresh against the new size.

- **Pros:** ~10 lines of code. Zero risk of stale state.
- **Cons:** Kills cinematic mid-stream. Kills any ongoing recording. Drops
  the user's saved viewpoint state if not also persisted. Feels like a
  settings-menu change from a 2002 game.

### Option B — live resize (real)

Factor the GPGPU bootstrap into a function. On level change:

1. Cancel any in-flight transition (`cancelAnimationFrame(transitionRaf)`).
2. Snapshot scene key + camera + params.
3. Dispose current: GPGPU renderer (render targets, materials, variables),
   point geometry, trails render target, recording stream.
4. Regenerate shader source strings with new `TEX_SIZE` baked in.
5. Rebuild `GPUComputationRenderer`, register variables, call `init()`.
6. Rebuild point geometry (`refs`, `positions` arrays), attach to mesh.
7. Reallocate `state.positions` / `state.velocities`.
8. Re-run current scene factory. It reads new `MAX_BODIES` and fills up.
9. Upload state. Apply K preset. Apply scene look.
10. Blank-frame flash to hide the discontinuity (reuse `#flash`).

Estimated 120–180 lines of refactor, most of it moving existing
bootstrap code into a `rebuildPipeline(newTexSize)` function. One-time
cost; after that, level switches are ~500ms with the flash.

**Decision:** Option B. Keep the flash covering the rebuild and it reads
as a scene transition, not a settings change. Stream stays live.

---

## Scene factory guidance

Factories already use `MAX_BODIES` or explicit budgets — they adapt
automatically. Two things to watch:

- **Scenes with hand-tuned counts** (e.g. "5000 stars in the disk"):
  either rewrite as fractions of `MAX_BODIES`, or leave as absolute and
  accept that these scenes will look identical across levels. Sombrero
  is a good candidate to keep count-absolute; horsehead should scale.
- **Density-tuned look params** (bloom strength, dust halo opacity):
  scenes are tuned at today's 16k. At 65k, the same bloom over 4× more
  emitters blows out. Add an optional `densityCompensation` block per
  scene; applier reduces bloom strength by `sqrt(MAX_BODIES / 16384)`
  when non-null.

---

## UI surface

Left rail, "Settings" panel (not "Motion" — this is a system-level dial):

```
Density
  ◯ lite     4k
  ● standard 16k     ← current
  ◯ dense    33k
  ◯ lush     65k

  [ ] Adaptive (auto-downshift if fps < 45 for 5s)
```

HUD, bottom-right of the stats block:

```
16k bodies       ← today's HUD shows "16384 bodies"; shorten to "16k"
```

(The `#hud-scene-count` element already shows body count — just reformat.)

Hotkey: none. This isn't something the user should bump into mid-stream.
The panel and the one-shot change are enough.

---

## Guardrails

**FPS watchdog.** Already have a frame timer. Add:

```
if (params.adaptiveDensity
    && smoothedFps < 40
    && stableForMs > 5000
    && currentLevel > "lite") {
  stepDownLevel();
  showToast("Density", "stepped down to " + newLevel);
}
```

Only ever steps down, never up — auto-upshift would cause a wobble loop.
User can manually upshift again if they want.

**Max-level warning.** When user selects `lush`, toast:
"lush · recording mode. disable bloom for 60fps." Don't silently let
them hit 15fps and assume the sim is broken.

**Memory sanity check.** Before rebuilding, check
`renderer.capabilities.maxTextureSize ≥ newTexSize`. WebGL2 guarantees
2048 minimum, real hardware is 16k+. Only matters as a defensive guard.

---

## What breaks at higher counts

Known issues that need separate fixes, not blockers for the level system:

1. **Stats readout at 1Hz reads the full texture.** At 65k bodies that's
   a 1MB GPU→CPU sync. Today it's 256KB and already stalls. Fix: drop to
   0.33Hz at lush, or read a subsampled region.
2. **Bloom cost is screen-resolution-bound, not body-count-bound.** It
   doesn't get worse at 65k — but it was already the biggest post cost
   at 16k. Warn the user, recommend toggling off for recording.
3. **Trails render target** is screen-sized, not body-sized. No scaling
   issue. But trails get busier at higher counts; the existing decay may
   feel wrong. Tune once we're living with dense.
4. **JSON export state blob** grows linearly with body count. 65k bodies
   × 8 floats × 4 bytes = 2 MB per save. Acceptable, but warn in toast.

---

## Persistence

Store selected level in `localStorage` as `universeSim.density`. Read on
boot, default to `standard`. Bumping TEX_SIZE on boot is free (the GPGPU
initialises once); the live-resize machinery is only needed for
mid-session changes.

URL param fallback: `?density=dense` overrides localStorage for a single
session. Useful for sharing links that preview the lush setting without
changing the visitor's default.

---

## Build order

1. **Refactor bootstrap into `rebuildPipeline(texSize)`.** Biggest piece.
   Ship this alone, rebuild at the same value it already has, verify
   nothing regresses. This is the real work.
2. **Add level selector UI + persistence.** Pure plumbing on top of step 1.
3. **Density compensation for bloom.** Per-scene opt-in.
4. **Adaptive downshift.** Half a day.
5. **Per-scene absolute-count review.** Skim the factories, decide which
   scale and which stay fixed. Ship as a tuning pass.
6. **HUD reformat** (16384 → 16k). Trivial, do it first if you want a
   quick win.

Step 1 is ~a day and touches maybe 200 lines. Everything after is
bookkeeping. The sim already has all the physics headroom it needs —
this is a plumbing project, not a graphics one.

---

## Invariants

- **TEX_SIZE must be an integer.** No half-resolutions.
- **MAX_BODIES must equal TEX_SIZE².** All factories assume this.
- **Scene factories never cache `MAX_BODIES` at module load.** They must
  read it at call time. Today they do — don't regress this.
- **Symplectic integrator properties are preserved regardless of count.**
  Nothing about the integrator depends on N. Obvious, worth stating.
- **The level selector must not be a "Pace" slider in disguise.** It's
  density, not speed. Do not conflate.

#user #panel
