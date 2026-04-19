# Universe Simulator — Technical Specification

**Author:** Michael Jonsson
**Target:** Windows 11, modern Chrome/Edge (WebGL2 required)
**Runtime:** Browser, fully client-side, GPU-accelerated

---

## 1. Goal

A GPU-accelerated, physically plausible N-body universe simulator in the browser using Three.js and WebGL2 compute (via framebuffer ping-pong). User has full control over physics parameters, camera, time, and initial conditions.

Not a toy. Handles thousands of gravitationally-interacting bodies at 60 FPS on a discrete GPU.

---

## 2. Core Requirements

### Physics

- Gravitational N-body simulation, O(n²) all-pairs on GPU
- Support 1024 – 16384 bodies (user-selectable; capped by VRAM + shader steps)
- Softened Newtonian gravity to avoid singularities: `F = G * m1 * m2 / (r² + ε²)`
- Symplectic leapfrog / velocity-Verlet integrator for stability
- Adjustable G, softening length (ε), timestep (dt), and integrator substeps

### Rendering

- Three.js r160+, WebGL2 only (fail fast if unsupported)
- Bodies rendered as `THREE.Points` with custom shader reading position from GPGPU texture
- Additive blending, size attenuation, soft circular sprite
- Color by mass / velocity / temperature (user-selectable)
- HDR + UnrealBloomPass post-processing for realistic star glow
- Optional velocity streaks / trails (accumulation buffer)

### Controls (full control = non-negotiable)

- **Camera:** OrbitControls (mouse) + free-fly (WASD + QE up/down, shift = boost)
- **Time:** pause, reverse, 0.1× – 100× speed, single-step
- **Physics:** G, softening, dt, substeps, integrator toggle
- **Visuals:** bloom strength, particle size, color mode, trails, background stars
- **Bodies:** add/remove via click+drag (velocity from drag vector), clear all
- **Presets:** Solar System, Spiral Galaxy, Galaxy Collision, Big Bang, Black Hole Disk
- **Capture:** screenshot (PNG), copy seed, export state (JSON)

### Performance targets

- 4096 bodies @ 60 FPS on RTX 3060-class GPU
- 16384 bodies @ 30 FPS on RTX 4080-class GPU
- Graceful degradation: auto-reduce body count if FPS < 30

---

## 3. Architecture

```
index.html                Entry + importmap + UI scaffold
  └── inline <script type="module">
       ├── Scene / Renderer / Composer bootstrap
       ├── GPUComputationRenderer setup
       ├── Compute shaders (velocity.glsl, position.glsl) — inlined
       ├── Particle material (points.vert / points.frag) — inlined
       ├── Preset factory (initial conditions)
       ├── UI layer (dat.GUI)
       └── Main loop (requestAnimationFrame)
```

### GPGPU pipeline

1. Two floating-point textures: `texPosition` (xyz + mass in .w), `texVelocity` (vxyz + kind in .w).
2. Each frame:
   a. Velocity shader reads `texPosition` (all N texels) and integrates force on current texel.
   b. Position shader reads new velocity + old position, advances position.
   c. Ping-pong both textures.
3. Render pass: `THREE.Points` with `BufferGeometry` of UV indices. Vertex shader samples `texPosition` by UV → sets `gl_Position`. Fragment shader does soft-disc + color.

### Data layout

- Texture size = `sqrt(N)` square (e.g. 64×64 = 4096 bodies).
- Mass stored in alpha channel of position texture.
- Body "kind" (star / planet / black hole / dust) in alpha of velocity texture, affects color & render size.

---

## 4. Presets (Initial Conditions)

| Preset           | Bodies | Description                                                            |
| ---------------- | ------ | ---------------------------------------------------------------------- |
| Solar System     | 400    | Sun + planets + asteroid belt, scaled for visibility                   |
| Spiral Galaxy    | 4096   | Central black hole + exponential disk with rotational velocity profile |
| Galaxy Collision | 4096   | Proper two-galaxy encounter — see §4a                                  |
| Big Bang         | 4096   | Hot dense sphere with outward radial velocity + noise                  |
| Black Hole Disk  | 2048   | SMBH + accretion disk with Keplerian orbits                            |
| Random Cluster   | 4096   | Plummer sphere distribution                                            |

### 4a. Galaxy Collision Mode

Dedicated proper-simulation mode. Each galaxy has:

- Central black hole (15% of galaxy mass)
- Exponential stellar disk (15% of mass, scale length = 0.33·R)
- Pseudo-isothermal dark-matter halo (70% of mass) — gives realistic flat rotation curves and produces correct tidal tails.

Galaxies are placed in the center-of-mass frame (total momentum = 0, total position = 0) so the camera stays centered on the action throughout the encounter.

**Configurable encounter parameters:**

- Mass ratio (M_B / M_A), 0.1 – 1.0
- Initial separation between BHs
- Approach velocity (relative)
- Impact parameter (perpendicular offset)
- Inclination + azimuth + spin direction for each galaxy independently
- Disk radii

**Built-in scenarios:**

- Antennae (prograde) — canonical long tidal tails
- Milky Way × Andromeda — 1:1 mass, near-parabolic, mixed spin
- Head-on (slow merger)
- Grazing flyby (fast, unbound)
- Minor merger (3:1)
- Retrograde pass (tidal features suppressed)
- Polar passage (one disk tilted 90°)

**Live diagnostics HUD** (visible only in collision mode):

- Current core separation
- Min separation observed
- Encounter phase: `approach` → `first pericenter` → `returning` → `2nd pericenter` → `merger` or `escape`
- Pass count

**Halo visibility:** toggleable with `H`. By default halo is invisible (dark-matter is, after all, dark). Toggle on to see its structure and the way it absorbs orbital energy during the encounter.

---

## 5. Numerical Stability Notes

- Softening ε prevents force blowup at close approach. Default ε = 0.05 in sim units.
- Leapfrog (KDK — kick-drift-kick) preserves energy over long integrations vs. Euler.
- Timestep dt is adaptive-capable but default-fixed for GPU simplicity.
- "Reverse time" = negate dt; symplectic integrators are time-reversible.

---

## 6. UI Layout

- **Top-left:** FPS, body count, energy drift readout
- **Top-right:** preset selector, pause/play/step
- **Right panel (collapsible):** dat.GUI with physics / visuals / camera folders
- **Bottom:** time scrubber, timestep display
- **Click-drag in scene:** spawn body with velocity

---

## 7. File Deliverables

```
/Universe_sim_4_7/
├── index.html          # single-file app, all JS inline, CDN imports
├── SPEC.md             # this file
├── CLAUDE.md           # codebase orientation for future Claude sessions
└── README.md           # how to run
```

---

## 8. Out of Scope (v1)

- General relativity (no GR, just Newton + softening)
- Collisions / mergers (bodies pass through each other)
- Dark matter halos beyond static potential
- WebGPU backend (WebGL2 only for now; WebGPU is roadmap)
- Hydrodynamics / SPH

---

## 9. Roadmap (v2+)

- Barnes-Hut octree on GPU for O(n log n) → 100k+ bodies
- WebGPU compute backend
- Body mergers with conservation of momentum & mass
- Recording → mp4 export
- VR mode via WebXR
