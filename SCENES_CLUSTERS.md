# SCENES_CLUSTERS.md — Famous-Cluster Scene Pack

A plan for expanding the scene library with scenes that evoke real, named
astrophotography subjects. Each entry gives the reference image, the
compositional target, the existing tools we already have to build it, and
the minimum new primitives (if any) needed.

Companion to `CLAUDE.md` (scene authoring) and `CINEMATIC.md` (director
consumer). Every scene here must register in `SCENES`, be added to
`SCENE_ORDER`, and ship with a `framing` block so cinematic mode can use it.

---

## Design principles

- **Evocation, not reproduction.** We're not rendering Hubble data. We're
  making the sim's palette + particles read as _"that's the Pillars"_, _"that's
  Antennae"_, etc. The viewer should smile at the resemblance, not fact-check
  it.
- **Emergent, not painted.** If a feature can come from physics
  (tidal tails from a pass, pillar silhouettes from dust vs. radiation
  balance), let physics do it. Hard-coding shapes is the last resort.
- **One primitive per scene.** Where possible, reuse an existing factory
  helper (`makeSpiralGalaxyCore`, `buildGalaxy`, `makeCurlNoise`). Only add
  a new primitive when three or more candidate scenes need it.
- **Readable at 4K.** Real clusters are mostly empty. Don't fill the frame
  — leave black.

---

## Scene slate (priority order)

### 1. **Antennae** — NGC 4038/4039

> We already have `collision`. Antennae is the **specific** variant
> worth promoting to a first-class scene because it's the most
> recognisable interacting pair in all of astrophotography.

- **Body plan:** reuse `buildGalaxy` ×2 at the "prograde" collision
  scenario. Key difference from the current collision scene: the pass has
  already happened. Start bodies at t ≈ +180Myr post-pericentre so the tidal
  tails are already extended.
- **Look:** `ember` palette, `speed` channel, BH highlight strong. Slight
  `doppler` (0.4) to separate the two spin vectors.
- **Camera:** 3/4 off-axis, FOV 42°, both tails in frame diagonally.
- **New primitive needed:** `kickstartTidalTails()` — run the sim headless
  for ~300 frames _before_ uploading state, so tails develop from dynamics
  rather than being drawn. Cheap (4096 bodies, CPU-side Euler), runs once
  per scene load.
- **Emergence hook:** star-formation-looking "knots" appear naturally
  where the two disks overlap; the radiation weight makes them flare.

### 2. **Stephan's Quintet** — five-galaxy compact group

- **Body plan:** five `makeSpiralGalaxyCore` invocations with small disk
  radii (~70 sim-units each), positioned roughly in a Y shape. Four are on
  slow mutual orbits; one is on an intruder vector flying through at 3×
  dispersion velocity.
- **Look:** `bone` palette, `mass` channel. The intruder reads hotter
  because of channel mapping — a free visual cue.
- **Camera:** mid-angle, FOV 50°. Framing should include negative space;
  the group clusters bottom-right.
- **Primitive reuse:** 100% existing helpers.
- **Emergence hook:** the intruder's wake disturbs gas-analogue dust
  puffs in two of the other galaxies. If we enable `radiation` > 0.3,
  those regions self-ignite.

### 3. **Pillars of Creation** — M16 / Eagle Nebula

> Hardest entry. Worth it.

- **Body plan:** three vertical dust columns carved by three off-screen
  bright massive bodies above-left (radiation-pressure kicks clear paths,
  leaving dense pillars by negative-space selection). Heavy use of
  `makeCurlNoise` for volumetric turbulence around the bases.
- **Look:** `nebula` palette, `density` channel, high bloom (1.4),
  aggressive vignette (0.55). This scene lives in the channel mapping.
- **Camera:** looking _up_ at the pillars, FOV 65°, slight Dutch angle.
- **New primitives needed:**
  - `carveColumn(axis, radius, radiationSource)` — seeds dust with an
    initial hollow cone aligned with radiation source direction.
  - A weak point-source radiation term already exists in the vel shader;
    scene just configures its position.
- **Emergence hook:** pillars _erode_ over the course of dwell. Good
  reason for cinematic mode to hold this scene longer than average
  (120–180s).

### 4. **Virgo Cluster core** — M87 + satellites

- **Body plan:** one overwhelming BH (kind 2, mass 40,000) with a
  well-collimated jet (reuse the existing jet factory from the
  `event-horizon` scene). Scatter ~12 small elliptical galaxies around it
  at 250–600 unit radii, on randomised inclined orbits.
- **Look:** `ice` palette, `speed` channel. Jet reads blue-white from
  speed mapping — physically right and visually striking.
- **Camera:** wide, FOV 58°, jet horizontal across the frame.
- **Primitive reuse:** jet factory exists; small-galaxy factory is just
  `makeSpiralGalaxyCore` with radius 25 and BH mass 400.
- **Emergence hook:** occasional satellite passages through the jet
  region scatter dust spectacularly. Don't script this — let it happen.

### 5. **Bullet Cluster** — 1E 0657-56

- **Body plan:** two galaxy clusters _plus_ two separately-positioned
  halo clouds (kind 4) offset from their visible counterparts. This is
  the whole joke of the Bullet Cluster — dark matter and gas have
  separated.
- **Look:** `aurora` palette, `kind` channel so halos read distinct.
  Tint array remapped so kind-4 halos have a subtle pink cast — the
  astrophoto convention.
- **Camera:** two-shot framing, wide FOV 60°. Clusters left and right,
  halos clearly offset.
- **New primitive needed:** `haloOffset` param in scene definition —
  small extension to `buildGalaxy` to place its halo cloud N units
  "behind" the stellar component along a velocity axis.
- **Emergence hook:** the halos continue gravitating the visible matter
  even though they look separate. Visible clumps drift toward the
  halo centres over the dwell. Reads as correct without narration.

### 6. **Coma Cluster** — many ellipticals

> Big, dense, mostly yellow.

- **Body plan:** ~40 small elliptical "galaxies" (tight gaussian blobs,
  each ~80 bodies, no disk) arranged in a 3D gaussian cloud with
  anisotropic variance. No dust kind. No blue stars.
- **Look:** `ember` + custom tint array pushing everything warm-yellow.
  Channel: `mass`. Low flock, low radiation.
- **Camera:** very wide, FOV 68°. Static-feeling composition.
- **Primitive reuse:** 100%. Just loops of `makeSpiralGalaxyCore` with
  `diskN=0` (only the bulge).
- **Emergence hook:** over long dwell, the whole cloud slowly relaxes
  to a rounder equilibrium. A virialisation beat — patient viewers see it.

### 7. **Sombrero Galaxy** — M104

> Single-galaxy portrait. Good pacing variety.

- **Body plan:** one large disk, edge-on, unusually thick dust lane
  achieved by a separate dust-only `makeCurlNoise` layer confined to the
  equatorial plane with |y| < 6. Very bright bulge (raise BH mass).
- **Look:** `sunset` palette, `density` channel. Bloom low (0.5) so the
  silhouette reads clean against the disk glow.
- **Camera:** dead-on edge-on, FOV 35° (tight), tiny vertical drift only.
- **Primitive reuse:** existing galaxy factory + existing dust scene logic
  restricted to a plane.
- **Emergence hook:** dust lane develops density waves over time from
  resonance with the bulge. Self-animating without intervention.

### 8. **Whirlpool + companion** — M51 / NGC 5195

- **Body plan:** one large face-on spiral + one small companion being
  pulled apart, with a dust bridge between. Essentially a reduced Antennae
  with asymmetric mass ratio (6:1).
- **Look:** `vaporwv` palette, `speed` channel. High saturation scene.
- **Camera:** face-on, FOV 46°. Companion upper-right.
- **New primitive needed:** `buildDustBridge(from, to, nBodies)` — a
  cylinder of dust connecting two centres, with initial velocity mid-way
  between the two centres-of-mass. Useful for #1 and #8.
- **Emergence hook:** the dust bridge narrows and thickens over dwell as
  bodies are accreted onto both galaxies. Visibly dynamic.

### 9. **Crab Nebula** — SN 1054 remnant

> Not a cluster — a _remnant_. Included because it's one of the most
> recognisable nebulae and cinematic mode will love it as a palette break.

- **Body plan:** a single massive body at centre, a filamentary shell
  expanding outward on a curl-noise velocity field with a strong radial
  component. ~3500 dust + ~500 higher-mass knots.
- **Look:** `aurora` palette, `age` channel (the outer shell is older →
  differently coloured). High CA (0.35), high grain (0.1).
- **Camera:** dead-centre, FOV 55°, slight orbit during dwell.
- **Primitive reuse:** curl-noise + uniform radial kick.
- **Emergence hook:** central pulsar body emits periodic "radiation
  pulses" (already a free consequence of the radiation term if we make
  its mass high enough). Visible tempo in the sim.

---

## Implementation order

Ship pack-by-pack, not all at once. Each pack lands, gets lived with,
gets tuned.

**Pack A — No new primitives** (ships in one day each)

1. **Stephan's Quintet** (#2)
2. **Coma Cluster** (#6)
3. **Virgo Cluster core** (#4)

These three validate that the slate _feels_ right before we build
infrastructure for the harder ones.

**Pack B — One primitive each**

4. **Sombrero** (#7) — needs equatorial-plane dust mask
5. **Antennae** (#1) — needs `kickstartTidalTails()`
6. **Bullet Cluster** (#5) — needs `haloOffset` extension to `buildGalaxy`

**Pack C — Ambitious**

7. **Whirlpool + companion** (#8) — reuses Pack B's `kickstartTidalTails`,
   plus new `buildDustBridge`
8. **Pillars of Creation** (#3) — hardest; defer until we've lived with
   the rest and know what radiation + density channels can reliably produce
9. **Crab Nebula** (#9) — last; it's a palette cleanser, not a flagship

---

## Shared primitives worth adding

These three helpers justify their weight because multiple scenes use them:

```js
// Runs the CPU-side symplectic integrator for N frames before upload,
// so structural features (tails, bars, lanes) arrive pre-formed rather
// than needing the viewer to wait 30s for them to appear.
kickstartTailsCPU((frames = 300), (dt = 0.015));

// Places a halo (kind 4) cloud offset from a galaxy's stellar component
// along a specified axis. Used for Bullet Cluster, optional elsewhere.
addHaloOffset(galaxyCenter, velocity, offsetVec, nBodies, radius);

// Cylinder of dust between two points, initial velocity linearly
// interpolated between endpoint velocities with perpendicular jitter.
buildDustBridge(startIdx, budget, pA, pB, vA, vB, radius);
```

No other additions. Everything else fits in existing factories.

---

## Framing blocks (for cinematic mode)

Every new scene ships with the `framing` block defined in `CINEMATIC.md`.
Proposed values per scene:

| Scene            | rRange     | thetaRange | fovRange | focalBias |
| ---------------- | ---------- | ---------- | -------- | --------- |
| antennae         | [180, 380] | [0.3, 1.2] | [38, 54] | density   |
| stephans-quintet | [220, 420] | [0.5, 1.1] | [44, 60] | density   |
| pillars          | [80, 200]  | [1.0, 1.6] | [50, 72] | density   |
| virgo-m87        | [300, 700] | [0.6, 1.3] | [48, 66] | bh        |
| bullet-cluster   | [280, 500] | [0.6, 1.1] | [50, 66] | density   |
| coma             | [500, 900] | [0.4, 1.3] | [56, 72] | density   |
| sombrero         | [90, 180]  | [1.4, 1.6] | [30, 44] | bh        |
| whirlpool        | [140, 280] | [0.2, 0.9] | [38, 56] | density   |
| crab             | [60, 160]  | [0.4, 1.3] | [44, 64] | bh        |

Pillars and Crab use a wider polar range so reframes can look _up_ and
_down_ along the pillars / outward along the remnant spokes.

---

## What not to do

- **No new kinds** unless a scene literally cannot be done with the
  existing 7. Pillars especially is tempting ("gas kind") — resist;
  `density` channel + dust kind + radiation term already differentiates.
- **No bespoke shaders per scene.** Tint arrays and palette + channel
  selection already cover everything proposed here.
- **No narrative captions.** The one-line `caption` field stays abstract
  — "knotted · warm" — not educational. This isn't a planetarium.

---

## Test plan

- Each new scene should be navigable by hotkey, visible in the scene
  browser, and survive `applyScene(key, { immediate: true })` and the
  transition path equally.
- Cinematic mode should dwell correctly on each — watch for reframe
  focals that end up outside the body cloud.
- Capture a 30s recording of each at 1080p. They should be recognisable
  to someone who loves astrophotography without being captioned.
- Run cinematic mode for 30 minutes after Pack A lands. Subjectively, does
  variety improve? If not, the rest of the pack may not be worth
  building — reassess before Pack B.
