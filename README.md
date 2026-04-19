# Universe Sim

GPU-accelerated N-body universe simulator. Browser, Three.js, WebGL2.
Artist-first UI — black glass, one accent, keyboard-driven.

## Run

1. Double-click `index.html`, or
2. Serve the folder:
   ```powershell
   cd <this folder>
   python -m http.server 8080
   ```
   Then open http://localhost:8080

## Requirements

- Modern Chrome, Edge, or Firefox (WebGL2 + `EXT_color_buffer_float`).
- Discrete GPU recommended.

## Interface

- Thin left rail of icons — Scenes · Palette · Camera · Capture · Settings.
- Flyouts open to the right with glass blur and a single accent color.
- Press `H` to hide the UI (Performance mode); mouse reveals it briefly.
- Press `?` to see every hotkey.

## Scenes

`C` opens the browser. `1`–`8` jump directly. Each is a bundle of initial
conditions, palette, camera, post-stack, and interaction rules.

- **Quiet Drift** — sparse, cold, curl-noise seeded
- **Sagittarius** — spiral, warm, rotation
- **Collision** — galaxy encounter; the scenario is selected in the scenes panel
- **Birth** — hot expansion
- **Event Horizon** — monochrome accretion
- **Dust Storm** — flocks and attractors (dust-heavy K matrix)
- **Orrery** — clean, technical, no bloom
- **Lattice** — 3D grid collapsing into structure

Every scene re-seeds its RNG each entry — same scene twice diverges.

## Hotkeys (condensed)

| Key             | Action                            |
| --------------- | --------------------------------- |
| `Space`         | pause / play                      |
| `.` / `,`       | single step fwd / back            |
| `T`             | reverse time                      |
| `[` `]`         | slow / speed up                   |
| `1`–`8`         | jump to scene                     |
| `Shift+1..9`    | recall viewpoint                  |
| `Ctrl+1..9`     | save viewpoint                    |
| `G`             | roll the dice (tiny perturbation) |
| `R`             | reset current scene               |
| `M` / `N`       | cycle palette / channel           |
| `P` / `Shift+P` | screenshot 2× / 4×                |
| `K`             | capture panel                     |
| `O` / `D`       | auto-orbit / drift                |
| `F`             | focus origin                      |
| `X`             | show dark-matter halo             |
| `H`             | performance mode                  |
| `?`             | hotkey overlay                    |
| `~`             | settings panel                    |
| `Esc`           | close panel / overlay             |

## Emergence

The simulator aims for surprises. Several mechanics cooperate:

- **Interaction matrix `K[kindA][kindB]`.** Per-scene, kinds (star / planet /
  BH / dust / halo / galaxy-A / galaxy-B) interact with differing strengths.
  Dust-Storm, for example, weakens dust–dust gravity and strengthens
  dust–attractor — filaments form.
- **Stochastic neighborhood sampling.** Every body samples 8 random others per
  frame (deterministic per-frame hash) and applies low-weight alignment,
  cohesion, and separation — Boids-style, GPU-cheap, kind-weighted.
- **Radiation pressure.** Bright regions push their neighbours weakly; couples
  aesthetics to physics.
- **Age as a channel.** Every body carries its age; pick the `age` palette
  channel to see merger and newborn fronts light up.
- **Curl-noise seeding.** Several scenes draw their initial velocity field from
  a divergence-free curl-noise function — coherent vortical motion from the
  start, which gravity amplifies.
- **Roll the dice (`G`).** Per-body velocity kick at ~1% of mean speed; samples
  from the attractor basin around the current state.

## Capture

- Screenshots at 1× / 2× / 4× viewport resolution (capped at the GPU's max
  renderbuffer size). Filename includes scene + timestamp.
- MP4/WebM recording via `MediaRecorder` (`R`-toggle in the Capture panel). The
  red dot blinks while recording; HUD otherwise suppressed.
- `Ctrl+S` / `Ctrl+O` export / import JSON compositions (includes simulation
  state and camera pose — reload exactly where you left off).

## Technical notes

- 4096 GPU-simulated bodies, O(n²) gravity in a fragment shader.
- Symplectic Euler integrator (velocity updates using old position, position
  advances with the new velocity). Reverse-time is negated-dt.
- Bodies render as additive points with an inline palette; 8 palettes × 5
  channels cover most looks.
- Post-processing: Unreal bloom → chromatic aberration → vignette + film
  grain → output (order matters).

See `SPEC.md` for the core physics spec and `ROADMAP.md` for what's planned.
