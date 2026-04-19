# CLAUDE.md — Universe Simulator

Orientation document for future Claude sessions working on this codebase.

## What this is

A single-file, browser-based, GPU-accelerated N-body universe simulator,
tuned for artist use. `SPEC.md` is the original physics/UI spec; `ROADMAP.md`
is the opinionated plan that drives current development.

## Stack

- **Three.js r160** (CDN via importmap) — scene graph, WebGL2 renderer,
  `GPUComputationRenderer`, `EffectComposer`, `UnrealBloomPass`,
  `OrbitControls`.
- **No dat.GUI, no framework.** All UI is plain DOM + inline CSS. Glass look,
  one accent color (`--accent: #8ab4ff`).
- **Plain ES modules**, plain JavaScript. No TypeScript, no bundler, no npm.
- Runs fully client-side. Opens via `file://` or any static server.

## File map

```
index.html   Entry + all application JS inline.  Sections (search the /* === */ headers):
               1  Config & DOM helpers
               2  Renderer / scene / camera
               3  Starfield (procedural twinkle)
               4  Compute shaders (gravity + flocking + radiation + age)
               5  GPGPU setup
               6  Particle mesh (palette + channel)
               7  Post-processing (bloom · CA · vignette · grain)
               8  Palettes
               9  Interaction matrices K[kindA][kindB]
              10  Kind tints
              11  Body state helpers
              12  Scene factories
              13  Scene registry
              14  State upload / blit
              15  Global params
              16  applyScene  (with eased transition + body-swap flash)
              17  UI framework (Slider, Toggle, Pills, Select, ButtonRow)
              18  Left rail
              19  Panel builders
              20  Scene browser & hotkey overlay
              21  Saved viewpoints (localStorage)
              22  Camera drift + auto-orbit
              23  Capture (screenshot, JSON export/import, recording)
              24  Emergence perturbation ("roll the dice")
              25  Stats readout
              26  HUD updates
              27  Studio / Performance view
              28  Keyboard handlers
              29  Resize
              30  Main loop
              31  Boot

SPEC.md      Core physics spec.  Source of truth for integrator + body data layout.
ROADMAP.md   Opinionated phase plan.  Emergence hooks live *inside* each phase.
README.md    User-facing run + hotkey reference.
CLAUDE.md    This file.
```

## Key invariants

- **Never add TypeScript.** Plain JS only.
- **Single-file HTML is a feature.** Don't split into an npm project unless
  explicitly asked. Budget is ~3000 lines of JS body.
- **WebGL2 only.** No WebGL1 fallback.
- **Physics:** softened Newtonian gravity, symplectic Euler integrator.
  Velocity is updated first using old position; position is then advanced
  using the new velocity. Preserves phase-space volume → stable for long
  integrations. Any integrator change must remain symplectic.
- **GPGPU texture layout:**
  - `texturePosition` RGBA32F — `xyz + mass`
  - `textureVelocity` RGBA32F — `vxyz + (kind + ageNorm)`
    where `kind = floor(.w)` and `ageNorm = .w - floor(.w) ∈ [0, 1)`.
    Don't break this without updating shaders + all scene factories together.
- **Kinds** (integer in `floor(vel.w)`):
  `0` star · `1` planet · `2` BH · `3` dust · `4` halo · `5` galaxyA · `6` galaxyB.
- **Interaction matrix** `K[49]` is a uniform `float uK[NUM_KINDS*NUM_KINDS]`
  in the velocity shader. Each scene supplies a key into `K_PRESETS`.
  Values > 1 amplify attraction, values < 1 weaken, negative = repulsion.
- **Coordinate units:** sim units are arbitrary but consistent — positions
  ~0–1000, G = 1.0 by default. Scenes assume this scale.

## Common tasks

**Add a scene.** Append a new factory function and a registry entry in
`SCENES`. The entry needs: `make`, `camera`, `palette`, `channel`, `post`,
`physics`, `K` (key into `K_PRESETS`), `flock`, `radiation`, `tint`. Add its
key to `SCENE_ORDER` so hotkeys and the browser pick it up.

**Add a palette.** Append an RGB-stop array to `PALETTES` (max 8 stops). It
shows up automatically in the Palette pill list.

**Add a palette channel.** Extend the `CHANNELS` map and the `if (uChannel <
n.5)` ladder in the vertex shader. Age/density/acceleration are the obvious
extensions.

**Tune emergence.** Scenes configure `flock` and `radiation` weights plus their
`K` preset. The velocity shader applies flocking only when those weights are >
small epsilon.

**Add a hotkey.** Section 28 keyboard handlers. Add to the hotkey overlay
`GROUPS` array in section 20 so it's documented for the user.

**Change body count cap.** `TEX_SIZE` near the top of section 1. Must be a
perfect square (texture side length). `MAX_BODIES = TEX_SIZE²`.

## Performance notes

- Gravity is O(n²) in the velocity fragment shader — 4096 bodies ≈ 16.7M
  force evaluations per step. Flocking adds 8 extra texture samples per body
  per frame (cheap).
- Stats readout (`computeStats`) reads both render targets at ~1Hz. It stalls
  the pipeline but cost is tolerable. Don't crank its frequency.
- Bloom is the single biggest post cost. Disable when benchmarking.
- Recording via `canvas.captureStream` buffers chunks in memory; warn users at
  > 60s. No chunking-to-disk yet.

## Debugging tips

- Open DevTools → Console. WebGL errors and shader compile logs surface there.
- If the screen is black: check `renderer.capabilities.isWebGL2 === true` and
  that `EXT_color_buffer_float` is available.
- If a scene's colours look wrong, check its `channel` is defined in
  `CHANNELS` and that `palette` key exists in `PALETTES`.
- If a new kind shows as black, remember to bump `NUM_KINDS` and resize
  `K_PRESETS` entries + tint arrays.

## Emergence, not effects

From the roadmap: emergence is a first-class concern that runs through every
phase. If a visual-looking feature is easy to add by hard-coding ("make
supernovae flash"), prefer to make the condition emerge from physics
(high-mass + high-density body gets radiation-pressure kick, which naturally
looks like a burst when bright). Resist the urge to script outcomes.

## User preferences (author: Michael)

- Terse, actionable responses. No preamble.
- Windows 11, Chrome / Edge. RTX 4090.
- Never TypeScript. Never over-engineer. Prefer one good default over two OK
  sliders.
- When in doubt about whether a feature feels right, leave a minimal hook and
  ship the phase — we'll iterate once he's lived with it.
