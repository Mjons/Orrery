---
tended_on: [tag-infer]
id: 01KPS7VDQBHKX540117HN72ZRN
created: "2026-04-17T14:03:01.653Z"
---

# Universe Sim — Artist Edition Roadmap

Opinionated plan. Built for Michael, one user. Fewer knobs, better defaults, more capture. Every phase ships something usable on its own — don't start Phase N+1 until N feels _done enough to enjoy_.

**North star:** every frame should look like it belongs on an album cover, every tool should feel like muscle memory within a week, and the system should surprise me — behaviors I didn't script, structures I didn't design, moments I couldn't have predicted from the initial conditions.

---

## Guiding principles

- **Emergence is the product.** We don't script outcomes; we design rules whose interactions produce outcomes. Every feature gets judged on whether it adds interesting emergent behavior, preserves existing emergence, or at worst is neutral. Features that _remove_ emergence (over-constraint, canned animations, hand-tweened camera moves, pre-baked "looks") are rejected by default.
- **Defaults are the product.** If a slider's default isn't already beautiful, the default is wrong — fix the default before exposing the slider.
- **No feature without a hotkey.** Mouse is for composition, keyboard is for control.
- **Hide, don't remove.** Keep power-user knobs behind a `~` toggle. Don't bloat the primary surface.
- **Black, glass, one accent color.** No dat.GUI gray. Ever.
- **One file.** `index.html` stays single-file per CLAUDE.md. Budget: aim to keep it under ~3000 lines; if it exceeds that we revisit the rule, not before.
- **GPU-first.** Anything that can run on the 4090 should. No per-frame CPU work on body arrays.
- **Ship small.** Each phase is a commit-worthy chunk. No six-week branches.

---

## Emergence as a first-class concern

Emergence runs _through_ every phase, not after them. It's not a late-stage feature; it's the engine. This section describes the mechanics that produce it. Each phase below has an **Emergence hook** subsection explaining how it contributes.

### Physics-level emergence (the substrate)

- **Multi-species interactions.** Body `kind` stops being just a color tag — it's a physics parameter. Different kinds have different interaction coefficients with each other:
  - A symmetric interaction matrix `K[kindA][kindB]` (~4×4, uniform-fed) scales gravity strength between pairs.
  - Negative entries = mutual repulsion. Asymmetric-feeling results emerge from different masses.
  - Result: dust clouds that avoid stars; dark matter that ignores light matter; heavy bodies that cluster while light ones get flung. Three rules → dozens of recognizable structures.
- **Local rules on top of gravity.** Gravity gives us orbits. Local rules give us _life_. Per-body, sample a small neighborhood (k-nearest via a cheap grid hash, or approximate via stochastic sampling — see below) and apply Boids-style terms at low weight:
  - Alignment (steer toward average neighborhood velocity).
  - Cohesion (steer toward neighborhood centroid).
  - Separation (avoid crowding).
  - Weights scale with kind. Stars mostly ignore these; dust strongly obeys. Produces filaments, wakes, flocking within gravitational wells.
- **Stochastic neighborhood sampling.** True k-NN is expensive on GPU; instead each body samples N=8 random other bodies per frame (deterministic per-frame via hash) and applies rules weighted by distance falloff. Noisy but cheap and emergent.
- **Supernova triggers.** A body meeting (mass > m_crit) AND (local density > d_crit) has a small per-frame probability of going supernova: mass drops to 10%, a shell of light bodies is ejected outward, and a brief radiation-pressure impulse pushes nearby bodies away. Reshapes its neighborhood. No two runs produce the same explosion history.
- **Radiation pressure feedback.** Bright (high-speed or high-density) bodies push neighbors weakly outward. Couples visual brightness to physics → regions that light up also disperse, which dims them, which lets them re-collapse. Breathing galaxies.
- **Curl-noise seeding.** Initial velocity fields aren't random — they're sampled from a 3D curl-noise function (divergence-free). Seeds coherent vortical structure from the start, which gravity then amplifies.

### Phase-space emergence (visible state)

- **Energy / entropy / clustering readout.** A subtle HUD readout (togglable) shows running measurements: total kinetic, total potential, an approximate clustering coefficient, velocity variance. Lets me _see_ the system phase-transition.
- **Age as an emergent visual channel.** Every body tracks its own age (integrated from spawn). Age becomes a palette channel — old bodies redshift, newborns glow. Makes collision/merger fronts obvious.
- **Trails that carry history.** Accumulation buffer with slow fade. Emergent structure is most legible across time; trails make the past visible without extra UI.

### Control-level emergence (user-facing)

- **Perturb, don't dictate.** User controls should be nudges, not commands. Brush adds, magnet pulls, but nothing teleports or snaps. Even "go to viewpoint" is an ease, not a cut.
- **Sensitive dependence, surfaced.** A "Roll the dice" button (hotkey `G`) perturbs the current state with a tiny random velocity kick to every body (magnitude ~0.1% of mean speed). Identical scenes diverge in 10–20 seconds. Lets me sample from the attractor basin around the current state instead of being stuck on one trajectory.
- **Parameter phase transitions.** Certain param combinations sit at boundaries (bound vs unbound collapse, laminar vs turbulent mixing). Mark these in the UI with a subtle "cliff edge" indicator. Encourages me to linger there.

### What we explicitly _don't_ do

- No scripted camera paths triggered by "cinematic moments." The camera has its own dynamics; the sim has its own dynamics; their interaction is the shot.
- No pre-baked particle effects layered on top of the sim. A supernova is a physics event, not a sprite animation.
- No scene-specific hacks ("on Collision preset, apply extra bloom when bodies get close"). If it's worth doing it's worth making emergent and applying everywhere.

---

## The Centerpiece — Event Horizon

This is the hero feature. Not a scene; a _thing in the world_ that the rest of the simulator can orbit, cross, and be torn apart by. When someone opens this app for the first time, the black hole is what makes them stop talking.

It needs to look like nothing else on the web. Not Interstellar-cosplay, not a glowing donut sprite — something that reads as a real gravitational object at a glance and rewards staring. A painting and a physics demonstration at the same time.

### Visual layers (composited in order)

1. **The pit.** A perfect matte-black disc at the event horizon. Nothing inside it. Not "very dark" — _zero_ light. The absence is the point; every surrounding light source must fail at its edge. Rendered as a depth-writing sphere with emissive black, drawn before post so bloom never leaks in.
2. **Photon ring.** A razor-thin, hyper-bright ring at ~1.5× the horizon radius where light orbits a single time before escaping. Thin enough to clip bloom thresholds on purpose — this is the one feature allowed to be over-bright. In reality the n=1, n=2, n=3 subrings exist; we fake 2 of them as concentric hair-thin rings with decreasing intensity.
3. **Gravitational lensing.** A screen-space post-pass that ray-marches a Schwarzschild geodesic approximation: for each fragment, compute the impact parameter to the black hole center, deflect the view ray by the analytic Einstein deflection angle `α ≈ 4GM/(c²b)` (tuned, not literal), then sample the already-rendered frame (and starfield cubemap) from the deflected direction. The result: stars behind the hole wrap around it, the accretion disk's far side appears _above_ and _below_ the horizon (the classic Interstellar look), and bodies passing behind it smear into arcs.
4. **Accretion disk.** Procedural, not particle-based. A thin oriented disc rendered with a shader:
   - Temperature falls off with radius (`T ∝ r^-3/4`, the standard Shakura-Sunyaev profile, tuned for aesthetics).
   - Color via the palette system, channel = temperature, so disk color responds to the scene's palette choice. No "obligatory orange."
   - Turbulence from 3-octave FBM advected azimuthally with Keplerian rotation (inner faster than outer → shear → streaks).
   - Doppler beaming: the approaching side is boosted in brightness and blue-shifted via palette offset; the receding side is dimmer and red-shifted. This single effect is what makes people's eyes widen.
   - Disc is rendered into the lensing pass's sampled scene, so lensing automatically curves it.
5. **Relativistic jets.** Two opposing cones from the poles, rendered as raymarched volumetric noise in a small shader (~30 lines). Emissive palette-tinted, narrow, slightly helical (precessing over tens of seconds). Only visible when the disk is actively accreting mass (see below).
6. **Frame dragging wobble.** Disk's orientation precesses slowly as a function of "spin" parameter. Pure aesthetic — makes the object feel like it has internal life.
7. **Redshift halo.** Just outside the horizon, a subtle darkening gradient (objects approaching get dimmer and more red — render-time shader on nearby particles, based on proximity to horizon). Sells the gravitational time dilation without pretending to simulate it.

### Dynamic behavior (the emergence part)

The black hole is not a set piece. It reacts to the sim:

- **Accretion feeds the disk.** Bodies crossing the disk's midplane at low velocity deposit their mass into the disk (tracked as a scalar). Disk brightness and jet intensity scale with recent accretion rate. Feed it a galaxy and it lights up; starve it and it dims.
- **Tidal spaghettification.** Bodies passing within the tidal radius get stretched along the radial direction — render them as short streaks (elongated sprite oriented toward center) instead of points. Close approaches look violent.
- **Body capture.** Bodies crossing the horizon are removed (kind flag flipped to "dead"), their mass added to the central mass. Horizon radius grows with `r_s ∝ M`, so a well-fed black hole visibly swells over a long session.
- **Ringdown.** After a major infall event (mass jump > 5% in one frame), the horizon briefly ripples — a damped sinusoidal perturbation on the lensing deflection for ~1 second. Suggests gravitational-wave ringdown without simulating GR.
- **Hawking glow (stylized).** Small black holes (below a threshold mass) emit a very faint shell of thermal color around the horizon. Purely aesthetic, but signals "this thing is bleeding."

### Shader architecture

- **One new post-pass** — `BlackHolePass`, runs between bloom and chromatic aberration. Inputs: the rendered scene texture + starfield cubemap + uniforms `{center, radius, spin, accretionRate, ringdownPhase}`. Output: the scene with lensing, photon ring, disk, and jets composited.
- Geodesic approximation uses a 2-step deflection (not full integration) — accurate enough at the scales we render, cheap enough to run at 4K. Single-hole assumption is fine; multi-hole scenes render each in a loop over a uniform array (cap at 4).
- Disk shader is ~60 lines GLSL. Jet shader is ~40 lines raymarch with early-exit. Lensing is ~30 lines. Total centerpiece budget: ~150 lines of GLSL, ~100 lines of JS.

### When it ships

This is distributed across phases, not a single deliverable — the visual is too important to rush and too expensive to redo:

- **In Phase 2 (Scenes):** the _Event Horizon_ scene exists with a placeholder — a single dark sphere + a simple UnrealBloom "halo". No lensing yet. The scene's _feel_ drives later implementation choices.
- **In Phase 3 (Color & light):** the real pass lands. Lensing + photon ring + disk + Doppler beaming. This is where the "stun the eye" milestone is met.
- **In Phase 5 (Seed & sculpt):** the dynamic behaviors land — accretion feedback, spaghettification, capture, ringdown. Brushing bodies toward the horizon becomes a primary play pattern.
- **Also available everywhere.** Not scene-locked. Any scene can have a black hole (via brush-place: `K+click` to drop a hole at cursor). Scenes like _Collision_ with a hole between them become natural experiments.

### Milestone: "the screenshot"

The feature is done when I can capture a single still, with no UI and no annotation, and it looks like concept art for a film. Not a physics-accurate render — a _beautiful_ one that happens to be physically motivated. If the still doesn't stop someone mid-scroll, the feature isn't done.

---

## Phase 1 — Strip the cockpit

**Goal:** the simulation is the entire screen until you ask for controls.

### What changes

- **Remove dat.GUI entirely.** Drop the CDN script tag. Delete the `gui`/`fSim`/`fVis`/`fCam`/`fCol` tree.
- **Build a custom overlay.** Pure HTML/CSS inside `index.html`:
  - Thin left rail (~48px) of SVG icons: scene, palette, camera, capture, settings.
  - Each icon toggles a glass flyout panel to its right.
  - Panels use `backdrop-filter: blur(20px)`, translucent `rgba(10,10,14,0.6)` background, 1px inner border `rgba(255,255,255,0.08)`.
  - Single accent color `--accent: #8ab4ff` (or whatever we land on). Used for active state, sliders, focus rings.
- **Two view modes:**
  - _Performance_ — all UI hidden, cursor fades after 2s idle. Bottom-right shows only a dim FPS counter that can be toggled off.
  - _Studio_ — rail + current flyout visible.
  - `H` toggles. `Esc` closes open panel without leaving Studio mode.
- **Hotkey overlay.** `?` shows a full-screen semi-transparent cheat sheet. Listed grouped: Scenes, Camera, Capture, Sim.
- **Typography.** One webfont (Inter 400/500/600 via CDN, or system `-apple-system, Segoe UI`). Mono only for numeric readouts (IBM Plex Mono or `ui-monospace`).
- **HUD.** Top-left: scene name + body count in small caps. Top-right: time state (`▶` / `⏸` / `◀`) + dt. Nothing else by default.

### Implementation notes

- All UI is plain DOM, no framework. Controls call into the existing `params` object and re-use existing `.onChange` hooks.
- Build one `<Slider>` helper (JS factory returning a DOM node wired to a `params` key) and reuse it everywhere. One `<Toggle>` helper. One `<ButtonRow>` helper. Three primitives cover 95% of the UI.
- Keep `params` as the single source of truth. GUI is only a view of it.
- Panels animate in with `transform: translateX` + opacity, 180ms cubic-bezier — feel, not flash.

### Emergence hook

- **HUD shows emergent state, not just config.** Top-left gets a second line (small, dim): live readouts of total energy, clustering coefficient, and "temperature" (velocity variance). These numbers move on their own — the UI itself becomes a window into the system's self-organization.
- **Idle = live.** Performance mode is designed so that leaving the window alone is an intended use case; the sim evolves, the camera drifts, structure emerges. Nothing auto-pauses, nothing auto-resets.
- **No modal-looking "loading" states.** Scene transitions and parameter changes should blend into the ongoing evolution, not feel like cuts between discrete configurations.

### Done when

- I can open the app, hit `H`, and see nothing but the sim.
- Every control that exists today is reachable without opening DevTools.
- The word "dat" does not appear in the source.

---

## Phase 2 — Presets become Scenes

**Goal:** presets stop feeling like lab setups and start feeling like moods.

### What changes

- **Scene = physics + camera + palette + post-stack.** A scene is not just initial conditions; it's an opinionated bundle of everything that affects the look.
- **Rename & curate.** Target 8–10 scenes, hand-tuned:
  - _Quiet Drift_ — sparse, cold-palette, slow camera orbit. (was Random Cluster)
  - _Sagittarius_ — spiral galaxy, warm palette, slight tilt.
  - _Collision_ — the existing galaxy collision, cinematic framing, high bloom.
  - _Birth_ — big bang, Ember palette, expanding shell.
  - _Event Horizon_ — black hole disk, monochrome, high contrast. **This scene is the showcase for the signature feature described in "The Centerpiece — Event Horizon" above.** The scene's framing, palette, and initial conditions exist to sell the black hole; the black hole itself is a standalone subsystem available everywhere.
  - _Dust Storm_ — new: many light bodies + few heavy attractors, slow.
  - _Orrery_ — solar system, clean palette, no bloom (a technical-drawing look).
  - _Lattice_ — new: bodies initialized on a 3D grid with tiny perturbations; watch structure collapse.
- **Scene browser.** Grid of 3–4 columns, thumbnail + name. Opens full-screen over the sim, click-to-enter. `Esc` dismisses.
- **Thumbnails.** Render each scene to a 256×256 offscreen target on first visit, cache the PNG dataURL in `localStorage` keyed by scene id + version. Regenerate when we bump the version string.
- **Transitions.** When switching scenes, interpolate over 1.5–2s:
  - Camera position + target with `easeInOutCubic`.
  - Exposure / bloom strength linearly.
  - Body swap happens at t=0.8 under a brief black/white flash (radial vignette crush) so the particle discontinuity is disguised.

### Data shape

```js
const SCENES = {
  'quiet-drift': {
    name: 'Quiet Drift',
    make: () => ({positions, velocities, count}),  // existing preset factory
    camera: { position: [...], target: [...], fov: 45 },
    palette: 'ice',
    post: { bloom: 0.6, exposure: 1.1, grain: 0.04, vignette: 0.3 },
    physics: { G: 1.0, softening: 0.12, dt: 0.015 },
  },
  ...
};
```

### Emergence hook

- **Scenes are seeds, not destinations.** A scene defines _initial conditions and a rule regime_, never a trajectory. Every scene must produce visibly different behavior 30 seconds in than at t=0.
- **Scenes specify rules, not outcomes.** A scene's config includes its interaction matrix `K[kind][kind]` and its flocking weights. _Dust Storm_ leans heavy on Boids-like cohesion between dust; _Collision_ turns those off so gravity alone tells the story; _Lattice_ starts ordered but sets high radiation-pressure coupling so the grid self-disassembles in surprising ways.
- **Every scene has "phase transition" headroom.** Tuned parameters sit near — not at — critical thresholds. Small nudges (user or stochastic) tip the system into qualitatively different behavior. Quiet Drift is _almost_ bound; push it slightly and it collapses into clumps.
- **Seeded but not deterministic.** Scenes re-seed curl-noise and supernova RNG per entry — same scene twice is never the exact same evolution. A "lock seed" power-user toggle exists for reproducibility but is off by default.
- **Scene variants emerge from parameter sweeps.** Rather than adding scene #11, we add a slider to an existing scene that sweeps between two regimes. Fewer scenes, more of each scene.

### Done when

- Six scenes feel distinctly different at first glance.
- Switching between any two is smooth enough to screenshot the transition itself.
- First-run loads Quiet Drift automatically (not random).
- Running the same scene twice from first-run produces visibly different evolutions after 60s.

---

## Phase 3 — Color & light

**Goal:** the sim stops looking like a debug visualization.

### What changes

- **Palette system.** Replace the current three `colorMode` enums with a `palette + channel` pair. Channel selects what drives the lookup (mass / speed / kind / radius / age). Palette is a 256×1 texture sampled in the fragment shader.
- **Ship 8–12 palettes:**
  - Aurora (green/teal/magenta)
  - Ember (black → deep red → orange → white)
  - Ice (indigo → cyan → white)
  - Nebula (hot pink → purple → deep blue)
  - Monochrome (black → white)
  - Sunset (navy → magenta → gold)
  - Kodak Portra-ish (muted warm pastels)
  - Vaporwave (teal / pink on dark)
  - Bone (grayscale with a cyan ghost in shadows)
  - Ultraviolet (blacks → violet → hot white)
- **Palettes as GLSL.** Each palette is a small array of RGB stops in a uniform; interpolate in the fragment shader. Easy to tweak, no texture upload needed.
- **Tone mapping.** Switch from Three's default to `ACESFilmicToneMapping` or add AgX (ported GLSL, ~40 lines). Expose exposure only; drop "brightness"-type sliders.
- **Post stack** using `EffectComposer` (already in use for bloom):
  - UnrealBloomPass (keep, tune)
  - Chromatic aberration pass (custom shader, ~20 lines — radial RGB offset)
  - Vignette pass
  - Film grain pass (animated noise, very subtle — `strength * 0.04` ceiling)
  - Optional LUT pass (3D texture sampler; `.cube` loader can come later — for now, bake LUT effects into palette).
- **Background.** Replace black clear with:
  - Procedural starfield: one billion-ish tiny specks on a cube skybox, drawn as instanced points with per-vertex noise-driven twinkle.
  - Optional cheap nebula: single screen-space shader pass, 3-octave FBM noise with palette sampling, very low intensity, drifts slowly.

### Implementation notes

- All new passes live in a single `buildComposer()` function. Each pass is toggleable from the Visuals panel, strength-adjustable from the same.
- Keep post-stack order documented in a comment block — order matters (bloom before CA before grain before vignette).
- Grain should be animated per-frame or it looks like dirt on the lens.

### Emergence hook

- **Color reveals emergence.** Palette channels must include at least: _speed_, _local density_ (computed in the fragment via the stochastic sampling already needed for Boids rules), _age_, and _acceleration magnitude_. These are the channels that make emergent structure _legible_ — density lights up filaments, acceleration lights up shock fronts, age lights up merger events.
- **Brightness ↔ physics feedback loop.** A body's rendered brightness (from palette × bloom response) feeds back into the radiation-pressure term. The prettiest regions are also the most dynamically active, and _because_ they're pretty, they're pushing their neighbors — which matters. The aesthetic layer isn't decoration, it's part of the system.
- **Background is coupled, not wallpaper.** The procedural nebula's FBM phase advances with simulation time, and its color palette is shared with the foreground. Background slowly "breathes" with the sim's total energy — high energy dims the nebula (sim outshines it), low energy lets it glow. Subtle, but it makes quiet moments feel quiet.
- **No "magic hour" presets.** Post-stack parameters never get scripted to fire on specific sim events. Bloom threshold is a threshold — whatever crosses it blooms. If a supernova triggers cinematic bloom, it's because _it actually got that bright_, not because we told the composer it was a supernova.

### Done when

- Swapping palette feels like swapping film stock.
- Black backgrounds are gone unless explicitly chosen.
- A still frame holds up when saved and viewed next day without the sim running.
- Switching the palette channel from `speed` to `density` makes me say "oh, _that's_ what's happening" about structure I hadn't noticed.

---

## Phase 4 — Camera as cinematographer

**Goal:** the camera does beautiful things without being driven.

### What changes

- **Saved viewpoints.** `1`–`9` store the current camera pose (position + target + fov). `Shift+1`–`9` recall with eased transition. Stored in `localStorage` per scene id.
- **Auto-orbit.** Toggle. When on and user is idle >3s, the camera slowly orbits the scene centroid. Orbit parameters (radius, speed, tilt) derive from current framing so the transition in/out is invisible.
- **Procedural drift.** Separate from auto-orbit: small Perlin-noise perturbation on position (amplitude ~0.5% of distance-to-target) always-on in Performance mode. Turns a static framing into a living one.
- **Focus target.** Click a body → camera smoothly reframes so that body is centered and at 1/3 distance. Double-click → dolly-zoom (Hitchcock zoom): dolly in while widening FOV to keep the target the same screen size, background stretches dramatically.
- **Body picking.** GPU pick: render a picking pass where each body's fragment writes its index (packed into RGB). Read single pixel at cursor on click.
- **Depth of field (cheap).** Screen-space bokeh blur whose kernel size is driven by `|depth - focusDepth|`. Focus depth = distance to focused body or scene center. Kernel is small (6–8 taps) so it stays cheap; bokeh highlights come free from bloom halos around in-focus bright points.
- **FOV control.** Slider 20–90°. Low FOV = telephoto compression (great for collision scenes). High FOV = wide / fish-eye-ish (great for "inside the galaxy").

### Emergence hook

- **Camera has physics too.** Procedural drift isn't a scripted loop — it's a lightweight simulation. Position follows a damped spring toward a Perlin-noise-driven target; target slowly follows the sim's center-of-mass-of-interesting-stuff (weighted by local density × acceleration). The camera is a body that's gravitationally disinterested but aesthetically attracted.
- **Auto-framing tracks emergent structure.** When auto-orbit is on, "scene centroid" is the density-weighted center, not geometric mean. If a cluster forms off to one side, the camera slowly drifts toward it. If the cluster disperses, the camera loses interest and wanders.
- **Focus follows interest, not designation.** When nothing is manually focused, the DOF focus distance slowly drifts toward wherever the most "interesting" thing is right now (high local acceleration → high interest score). This produces accidental focus pulls during big events without any scripting.
- **FOV as a tension dial.** Near a phase-transition threshold in parameters, FOV can be the knob that tips perception — low FOV compresses distances and makes interactions look imminent; high FOV makes the same scene feel placid. Same sim, different emergent feel.

### Done when

- Hitting `Shift+1` from anywhere eases me back to my favorite angle in under 2s.
- Leaving the app open shows a shot that evolves slowly on its own.
- Clicking a star feels like clicking a thing, not a pixel.
- At least once a session, auto-framing lands on a composition I wouldn't have chosen — and it's better than what I would have chosen.

---

## Phase 5 — Seed & sculpt

**Goal:** go from consumer of presets to composer of pieces.

### What changes

- **Brush tool.** Hold `B`, drag in 3D space, bodies spawn along the stroke:
  - Rate: bodies per second (slider, default 200).
  - Mass jitter (min/max).
  - Velocity mode: _from stroke tangent_ (feels like painting motion lines), _radial_, _zero_, or _inherit_ (match nearby bodies).
  - 3D placement: project cursor onto a plane that passes through the current focus target and faces the camera. Wheel scrolls the plane closer/farther along view ray.
  - Brush radius controls scatter around the stroke centerline.
- **Symmetry.** Mirror toggle (X/Y/Z axes, independent). Rotational symmetry (N-fold around current up vector) for mandala-style work.
- **Magnets.** Invisible attractors/repulsors. Place with `M+click`. Each has mass sign, magnitude, and softening radius. Rendered as subtle colored rings in Studio mode, invisible in Performance mode. They shape flow without adding visible bodies.
  - Extra velocity shader uniform: array of up to 8 magnets (`vec4` position+strength). Cheap.
- **Undo stack.** Every brush stroke or magnet placement is one entry. `Ctrl+Z` / `Ctrl+Shift+Z`. Undo of a stroke removes the bodies it added (track body index ranges).
  - Caveat: once bodies have evolved, "undo" means delete-and-rewind-scene, not restore-position. Document this. An alternative — snapshot position texture before each stroke — costs VRAM but enables true undo; do it if VRAM allows (the 4090 has plenty).
- **Clear & reset.** `X` clears all user-added bodies/magnets but keeps scene baseline. `Shift+X` full reset.

### Emergence hook

- **Brush adds to a live system, not to a blank.** Painted bodies are immediately subject to every rule — gravity, flocking, radiation pressure, supernova thresholds. A straight brush line becomes a wobble, then a wave, then a structure, within seconds. I paint a shape; the sim makes it alive.
- **Magnets as perturbations, not controllers.** Magnet strength tops out at a fraction of typical local gravitational force. They bias the flow; they don't dominate it. The interesting use is placing a _weak_ magnet and watching the system decide whether to commit to it or shrug it off.
- **"Roll the dice" (`G`).** Small random velocity perturbation to every body. Use it when the sim feels stuck, or to sample adjacent trajectories from the current state. Reveals how sensitively the attractor basin depends on where you are.
- **Scripted undo is fine; time-reversal is better.** For brush strokes, undo removes added bodies (discrete). For evolution, "rewind N seconds" plays the integrator backward (symplectic → time-reversible, mostly). Lets me wind back to a bifurcation point and re-roll from there.
- **Brush velocity modes are seeds for different emergence regimes.** _Tangent_ seeds coherent flow (laminar). _Radial_ seeds explosions (dispersing). _Zero_ seeds collapse (gravity takes over immediately). _Inherit_ seeds "joining" (bodies slot into existing dynamics). These aren't four presets; they're four different rule-entries into the same engine.
- **Symmetry breaks itself.** Perfect symmetry is unstable under any noise, and the sim has noise everywhere. Brushing a 6-fold mandala produces a 6-fold pattern for a few seconds — then it breaks into something irregular and more interesting. That break _is_ the artwork.

### Done when

- I can paint a spiral by hand and watch gravity pull it into a disk.
- I can place a hidden attractor offscreen and watch bodies stream toward it.
- Undo doesn't make me nervous.
- A perfectly symmetric brush stroke produces an asymmetric result within 20 seconds and I don't consider that a bug.

---

## Phase 6 — Capture (the point)

**Goal:** get the art out.

### What changes

- **High-res screenshot.**
  - Shortcut `P`.
  - Render the current frame at 2×, 4×, or 8× viewport resolution to an offscreen `WebGLRenderTarget`. The post-stack must be resized to match — build a `renderAtScale(n)` helper that temporarily swaps render targets and composer sizes, renders one frame, reads pixels, restores.
  - PNG download via canvas `toBlob`. Filename: `universe_<scene>_<timestamp>.png`.
  - UI shows the scale choice; defaults to 2×. 8× on 4K viewport = 15360×8640; make sure we don't OOM — cap at GPU's `MAX_RENDERBUFFER_SIZE`.
- **MP4/WebM recording.**
  - Shortcut `R` to start/stop. While recording, a small red dot blinks bottom-right; HUD otherwise suppressed.
  - Use `canvas.captureStream(fps)` → `MediaRecorder` with `video/webm;codecs=vp9` (Chrome-native) or `video/mp4` where supported. Bitrate slider 5–50 Mbps, default 20.
  - Chunks accumulated in memory, concatenated on stop, downloaded as a Blob. Warn at >60s — memory grows linearly.
- **Timelapse mode.**
  - Slider `sim steps per render frame`, 1–200. At 60 render FPS × 100 sim steps = 6000 sim steps/sec. Integrator stays symplectic but at high ratios energy drift shows — cap at whatever keeps drift < 5%/sec.
  - Useful for: slow scenes turned into short explosive clips; watching galaxy collisions evolve over minutes of sim time in 10s of wall time.
- **Save / load compositions.**
  - Save: JSON with scene id, all params, camera pose, magnets, and — critically — the current position + velocity textures dumped via `readRenderTargetPixels` (base64 Float32Array). Big payload (a few MB at 4096 bodies) but fine.
  - Load: restore everything including in-progress simulation state. You can save "mid-collision" and come back later.
  - Shortcut `Ctrl+S` / `Ctrl+O`.

### Emergence hook

- **Capture is for catching moments I didn't plan.** The whole capture surface is tuned around one-key grab of _whatever is happening right now_, because emergent moments are unrepeatable. Never force me to pause, configure, then capture — by then it's gone.
- **Seed + state = reproducible emergence.** Saved compositions include RNG seeds for curl-noise, supernova triggers, and stochastic sampling. A saved file isn't just "where the bodies are now"; it's "exactly this trajectory from exactly here." I can share a file and someone else sees the same next 30 seconds I did.
- **Timelapse reveals slow emergence.** Many emergent behaviors (cluster merging, ring formation, accretion disk sculpting) take minutes of sim time. Timelapse at 100× compresses those into visible transitions. Don't treat timelapse as a gimmick — it's a microscope for structure.
- **Recording during interaction.** Recording does not pause while I brush, place magnets, or roll the dice. The artwork is the interaction + the response. A recording of _me perturbing the system and watching it reply_ is a more interesting artifact than a recording of a static evolution.
- **Variants button (bonus).** While a composition is loaded, a "generate 9 variants" button applies 9 different small perturbations, runs each forward 10s in parallel (sequential if GPU-bound), renders thumbnails, lets me pick one to continue from. Parameter-space foraging.

### Done when

- I can go from "this frame is nice" to "PNG at 4K on disk" in one keystroke.
- I can record a 30-second clip without checkerboard UI artifacts in the output.
- I can save a composition Monday and reload it Friday exactly as it was — _including the next 30 seconds of its evolution._
- A recording of me live-perturbing the sim feels better to watch than a recording of the sim alone.

---

## Phase 7 — Nice-to-haves

Pick what calls to you. None are required.

### Audio reactivity

- File-drop or mic input → `AudioContext` → `AnalyserNode` → FFT (512 bins).
- Bands: bass (0–10), mids (10–60), highs (60–200) exposed as uniforms.
- Default mappings (togglable): bass → bloom strength, mids → point size, highs → hue shift on palette sample.
- One master toggle + one sensitivity slider. Don't turn this into a VJ app.

### MIDI

- `navigator.requestMIDIAccess()` on user gesture. Map CC knobs to any `params` key via right-click → "Learn MIDI".
- Persist mappings in `localStorage`. The point is hardware control during recording.

### Body mergers

- Skipped in v1 spec. Add it: when two bodies pass within their combined softening radius at low relative velocity, conserve momentum + mass into the heavier one, mark the lighter as dead.
- Requires compacting the body array, which is awkward on GPU — simpler: keep a "dead" flag in the kind channel, skip rendering + skip force contribution. No compaction, slight waste. Fine up to 16k bodies.
- Visually: a brief flash at merge location via a particle burst on the CPU side. Very satisfying.

### Barnes-Hut / WebGPU

- Only if we actually exceed 16k bodies and care about FPS. On the 4090, naive O(n²) handles far more than people usually need for aesthetics.
- Benchmark first: measure current FPS at 8k / 16k / 32k / 64k before touching anything.
- If we cross this bridge, WebGPU compute shaders (not WebGL2 framebuffer tricks) are the right vehicle. That's a ~week-long detour — do it only if the visual payoff is real.

### VR

- WebXR + `THREE.VRButton`. Cool once, then forgotten. Skip unless Quest appears on the desk.

### Emergence hook (for the whole phase)

- **Audio reactivity is two-way.** Standard audio-reactive visuals drive the look _from_ the audio. The interesting version is bidirectional: audio drives small physics perturbations (kick drum → density impulse; sustained notes → sustained attractor), and the sim's emergent state modulates audio analysis thresholds. The visual isn't syncing to the music; the sim is _playing along_.
- **MIDI-modulated parameters cross phase transitions.** The value of MIDI control isn't steady-state tweaking — it's sweeping parameters across critical thresholds in real time during a recording. Record myself taking the system from bound to unbound with a CC knob.
- **Mergers as emergent events.** When we implement mergers, _don't_ hard-code the merger flash. Mergers produce high local mass × high local density → naturally trigger the supernova condition → naturally produce the visual burst. The merger feature is one line: "combine two bodies at impact." The spectacle is emergent.
- **Barnes-Hut matters for emergence, not just FPS.** Past ~32k bodies, qualitatively new behaviors appear (large-scale structure, cosmic-web filaments). This is the justification for the optimization work — not frame rate, but emergent regime change.

---

## Technical debt to watch

- **Single-file discipline.** `index.html` is already ~1100 lines. Budget each phase to add < ~400 lines. If a phase would blow the budget, extract one helper module (still single deliverable, just with `<script type="module" src="./x.js">`) — but only then.
- **Uniform counts.** Every post-pass adds uniforms. Document them in a comment header near the composer so we don't lose track.
- **Texture memory.** At 16384 bodies, position + velocity + ping-pong = 4 × 128² × 16 bytes = 1 MB. Trivial. But if we add history textures for trails, budget goes up fast — plan for it.
- **Energy drift** is our integrator canary. If a feature causes drift to spike, it's buggy — add an assertion in Studio mode that flashes the HUD red above 10%/10s.
- **Emergence regressions.** Keep a small set of reference scenes + seeds in a manual "smoke test" checklist. After any physics or integrator change, run them and eyeball: does Collision still produce tidal streams? Does Dust Storm still form filaments? Does Lattice still collapse with the right timing? Emergent behavior is fragile — a well-meaning optimization can flatten it, and tests won't catch that.
- **Resist "fixing" surprising behavior.** If the sim does something unexpected but interesting, it's not a bug. Before touching physics code, ask: is the behavior wrong, or merely unfamiliar? Log weird observations before deciding they're problems.

---

## Phase ordering rationale

Why strip UI _first_? Because every subsequent phase adds UI, and building it on top of dat.GUI then migrating twice is wasted work.

Why scenes before palettes? Because scenes _use_ palettes — defining palettes first without scenes to test them in is abstract and leads to palettes that don't work in practice.

Why capture before nice-to-haves? Because capture is the reason the thing exists. Everything else is in service of the output.

Where does the emergence work land? **Inside each phase**, not as a phase of its own. The physics substrate (multi-species interactions, flocking, supernova triggers, radiation pressure, curl-noise seeding) comes online gradually — lightweight versions first, during Phase 2 when scenes need them to feel distinct, then deepened during Phase 3 when the color channels need something real to visualize, and finally coupled bidirectionally to controls during Phase 5. Doing emergence as a big-bang phase would either delay shipping or produce an over-engineered physics engine with no feedback from the aesthetic side. Emergence and aesthetics co-evolve or the whole thing feels disjoint.

---

## Rough sequencing (no dates — ship when done)

| #   | Phase         | Rough size | Blocks                             |
| --- | ------------- | ---------- | ---------------------------------- |
| 1   | Strip cockpit | medium     | nothing                            |
| 2   | Scenes        | small      | Phase 1                            |
| 3   | Color & light | medium     | Phase 1                            |
| 4   | Camera        | medium     | Phase 1                            |
| 5   | Seed & sculpt | large      | Phase 1, 4                         |
| 6   | Capture       | medium     | Phase 3 (so captures include post) |
| 7   | Nice-to-haves | variable   | case-by-case                       |

Phases 2–4 can ship in any order once Phase 1 lands. Phases 5 and 6 want the earlier ones under them.

The emergence substrate rides alongside: interaction matrix + curl-noise seeding land with Phase 2 (scenes need them); flocking + radiation pressure + supernovae land with Phase 3 (color needs them); "roll the dice" + time-reversal land with Phase 5 (sculpting needs them). Nothing about emergence waits until the end — if a phase lands without its emergence hook, the phase is incomplete.

#phase #feature #done

[[PULL_INTO_ORBIT.md — Click a node, type a word, attach everything that matches]]
