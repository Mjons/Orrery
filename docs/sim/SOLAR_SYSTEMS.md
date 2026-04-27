---
id: 01KPS9CFDJTR71A86YWAMCXE87
created: "2026-04-21T20:01:50-04:00"
---

# SOLAR_SYSTEMS.md — A System Around Every Star

Click any star. Follow-cam attaches and a small, procedurally generated
**solar system** blooms around it — 2–8 planets on muted orbits, maybe
a ring, maybe a faint debris belt. You see the system for as long as
you're watching this star. Release and it dissolves back into the
starfield as if it was always just a point of light.

Companion to `FOLLOW_CAM.md` (the camera that shows the system) and
`STAR_TRAIL.md` (the line recording the journey). Every clicked star
reveals a pocket universe.

---

## Why this is worth building

- **It makes each star specific.** Today every body is "a point of
  light." After this, every star is an _individual_ — your star has a
  gas giant with pink bands; the next star over has a double-ringed
  ice world. Follow-cam becomes exploration-as-collection: there are
  16,384 systems (at standard density) and each one is its own thing.
- **The "zoom" emotional beat.** Click → scale collapses inward. The
  universe was a chorus; now you're standing inside one star's life.
  This is the move games like _Elite Dangerous_ or _Outer Wilds_ sell
  their entire experience on. We get it for free as a side effect of
  follow-cam.
- **Makes follow-cam instantly more compelling.** Right now you watch
  a dot travel through a starfield. With this, you watch **a system**
  travel through a starfield. Planets arc past the camera; rings catch
  bloom; the whole mise-en-scène is richer.
- **Zero physics coupling.** The system is decoration, not sim. It
  costs a handful of Three.js objects and some sine waves. No GPGPU
  change, no new shader, no new data path beyond what follow-cam
  already has.

---

## The mechanic

1. Follow-cam attaches to body #N.
2. Generate a solar system deterministically from `seed = hash(N)`.
3. Create Three.js child objects (planets, rings, belt) parented to a
   root `Group` that tracks the body's world position.
4. Animate the planets on CPU each frame — Keplerian-ish orbital
   motion, faster for inner orbits, slower for outer.
5. Release → smooth fade-out over ~1.2s, then dispose the objects.
6. If user attaches to a different body, dispose the old system and
   generate the new one.

States:

```
 (none)   ── attach  ──▶  MATERIALISING  (scale 0 → 1 over 1.0s)
 MATERIALISING ── done ──▶  ACTIVE
 ACTIVE   ── release ──▶  DISSOLVING     (scale 1 → 0 over 1.2s)
 DISSOLVING ── done ──▶   (none)
 any      ── scene-change / density ──▶  immediate dispose
```

---

## What gets a system

Branch by `kind` (read from velocity texture along with position —
already happens in `followCamReadBody` if we expose `.w`).

| Kind      | What materialises                                           |
| --------- | ----------------------------------------------------------- |
| 0 star    | Full planetary system: 2–8 planets, maybe rings, maybe belt |
| 1 planet  | Moon system: 1–3 small bodies                               |
| 2 BH      | Accretion disc + 1–2 companion stars on close orbits        |
| 3 dust    | Nothing — dust is dust. Silent no-op.                       |
| 4 halo    | Nothing — halos are dark matter, not luminous objects.      |
| 5 galaxyA | Treat as star. Same as kind 0.                              |
| 6 galaxyB | Treat as star. Same as kind 0.                              |

Dust + halo gracefully degrade: user still gets follow-cam, just no
decoration. Tiny toast on attach: _"no system · dust"_ so they know
it's a feature of kind, not a bug.

---

## Procedural generation

Everything derives from one integer seed so the same body always gives
the same system. Seed source:

```js
const seed = hash32(bodyIndex ^ currentSceneSeed ^ 0x9e3779b1);
```

Including the scene seed means the same body index gives a different
system in different scenes (a star in Antennae shouldn't have the same
companions as that texel in Coma). Use Mulberry32 as the PRNG.

### Planets

- Count: 2–8, weighted toward 3–5.
- Orbital radius: first at `r0 ∈ [4, 9]`, each subsequent scaled by
  `[1.4, 2.1]` (Titius–Bode-ish spacing). Biggest radius clamped to
  40 sim units so the whole system stays within chase-cam range.
- Size: `[0.25, 1.5]` sim units. Gas-giant roll (10%) → 2–3 sim units.
- Tilt: each planet's orbital plane is tilted by `[-10°, +10°]` off
  the system's base plane. Base plane random.
- Speed: Kepler — `T ∝ r^1.5`. Inner planets visibly zip; outer drift.
- Colour: sampled from a palette influenced by the parent's channel
  (scene uses `speed` channel? system colour skews cool-blue-ish;
  `age` channel? warm-amber-ish). Keeps each scene's aesthetic.
- Rings: 10% chance per planet. Flat annulus mesh, tinted slightly
  off the planet's own colour. Rings only on gas-giant rolls.
- Moons: 1-in-4 planets gets 1 moon on a tight orbit. Rare.

### Asteroid belt

- 25% chance per system. Between planets 2 and 3 (or planets 3 and 4
  if there are 4+).
- ~80 small dots on jittered orbital radii in a narrow band, each at
  a random phase. Pure decoration; zero interaction.

### Accretion disc (kind 2 BH only)

- Flat annulus with inner/outer radii `[1.5, 6]` and `[6, 14]`.
- Reuses the existing `ringMat` / photon-ring shader if the geometry
  aligns. Colour biased warm.
- 1 or 2 "companion" stars (small luminous points, same shader as
  particle-body stars but child of the group) on close elliptical
  orbits around the BH.

---

## Archetypes — the catalogue

Pure random parameters produce soup. Archetypes produce _characters_.
Each system rolls one of ~10 named blueprints, then instantiates it
with seeded variation inside that blueprint's lane. Users start to
recognise the patterns after a few attachments — "oh, another Shepherd"
— which is the moment collection-behaviour kicks in.

Blueprint weights bias with the body's mass and kind, so heavy stars
get more giant systems, light stars get more cradles, and so on.

| Archetype       | Feel                                          | Distinguishing features                                                |
| --------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| **Lone Giant**  | One dominant gas giant, a few small moons     | Oversized gas giant at mid-orbit, thick bands, no belts                |
| **Twin Hearth** | Binary — two close stars, planets around both | Second small "companion" star on a tight inner orbit                   |
| **Shepherd**    | Ringworld                                     | One planet has spectacular multi-band rings, others muted              |
| **Cradle**      | Forming / dusty                               | Two belts instead of one, a debris halo, planets look smaller & rough  |
| **Derelict**    | Old, sparse, cold                             | 2 planets max, no rings, palette skews ash-grey and deep blue          |
| **Waltz**       | Resonant orbits                               | Planets lock at 1:2, 2:3 ratios; visually synchronised passes          |
| **Crown**       | Multi-ring                                    | Two or three rings at different angles — dramatic silhouette           |
| **Ember**       | Hot, close-in                                 | 3–5 small rocky planets packed inside r≤10, orange-red glow            |
| **Deep**        | Cold, distant                                 | 2–4 icy planets at r≥20, long slow orbits, palette all cool blue/white |
| **Wanderer**    | One planet + one comet                        | A single planet on a normal orbit plus a highly eccentric body         |
| **Rogue**       | Just chaos                                    | Eccentric overlapping orbits, retrograde mover, asteroid debris        |

Rare archetypes (rolled <5% of the time and never in `serene` mode,
see below):

- **Pulsar** — kind 2 only. The BH/star pulses visibly on a short
  cycle; companions flash with it.
- **Graveyard** — parent is dead/dim; a single skeletal planet drifts
  on a long lonely orbit.
- **Jewel** — absurdly saturated palette, outrageous rings, gas giant
  bands that look unreal. Rewards exploration — "I finally found one."

### Why archetypes beat pure random

Pure random sweeps the whole parameter space evenly. The result is an
average system every time — forgettable. Archetypes concentrate around
recognisable silhouettes. The user learns the shapes subconsciously
and starts wanting to complete the set. Cheap retention loop.

---

## Visual content

### Planet material

Small low-poly sphere (`THREE.IcosahedronGeometry(size, 1)`) with a
flat shader: solid body colour + rim light + subtle procedural
stripes if it's a gas giant.

```glsl
// pseudo
vec3 baseColour = uColour;
float rim = pow(1.0 - dot(normal, viewDir), 2.0);
vec3 final = baseColour + rim * 0.25;
// gas giants: add sinusoidal banding
if (isGasGiant) {
  float band = 0.5 + 0.5 * sin(worldPos.y * uBandFreq + uBandPhase);
  final = mix(final, baseColour * 0.6, band * 0.4);
}
```

Planets are tiny — at close-up scale they still only occupy a few pixels.
That's OK. The silhouettes + rings + rim light give them readability
without detailed textures.

### Star body glow

The followed star (kind 0) gets a subtle halo — a billboard sprite
behind it with a soft radial gradient. Looks like "this star has a
corona." Disabled for kinds 1/2.

### Distance scale

The system lives at `[4, 40]` sim units out from the parent body. The
chase-cam rig sits at `~18-95` sim units behind. So:

- Inner planets are **in front of the camera**, visible mid-frame.
- Outer planets occasionally swing **past the camera** as they orbit.
- The star itself is always the focal point at frame centre.

Tune so the outermost orbit is roughly at the chase-cam distance,
which means outer planets occasionally occlude the camera. That's
fine — adds visual life.

---

## Rare features — the sparkle

Each roll checks a dozen low-probability flags. Most systems have one
or two of these; a unlucky/lucky few have many. The point is: every
attachment has a chance of revealing something you've never seen on
any previous star. Players will screenshot the rare combos.

| Feature             | Freq | What you see                                                        |
| ------------------- | ---- | ------------------------------------------------------------------- |
| **Gas-giant bands** | ~10% | A planet with wide horizontal stripes in two or three palette tones |
| **Aurora poles**    | ~7%  | Faint green/magenta rim glow on a planet's poles                    |
| **Double ring**     | ~4%  | A planet with two distinct rings at different angles                |
| **Ocean shimmer**   | ~6%  | Blue planet with a soft specular highlight that tracks the star     |
| **Lava crackle**    | ~4%  | Red planet with procedural cracks glowing amber, pulsing slowly     |
| **Tilted orbit**    | ~15% | One planet's orbital plane is sharply inclined vs the rest          |
| **Retrograde body** | ~6%  | A single planet orbits backwards — obvious when others pass it      |
| **Eccentric comet** | ~8%  | A small bright point on a long elliptical arc outside the planets   |
| **Binary star**     | ~3%  | Two parent stars, both visible; planets orbit the centre of mass    |
| **Habitable hint**  | ~12% | One planet has a subtle cyan-green aura — the "life zone" wink      |
| **Pulsing star**    | ~2%  | The central star brightens and dims on a 3–5s cycle                 |
| **Star corona**     | ~30% | Soft radial halo sprite behind the parent (all kind-0 stars mostly) |
| **Dust shadow**     | ~5%  | A dark lane crosses the system — suggesting an edge-on disc         |

Probabilities shift by archetype: a **Cradle** triples dust-shadow and
quadruples the eccentric-comet chance; a **Deep** quadruples habitable
hints but drops lava to zero. Archetype × rare-feature is the source of
per-system surprise.

### Palette inheritance

The parent scene's active palette tints the system. Pull three stops
from the scene's palette and use them as "warm / neutral / cool" slots
in every colour decision. Result: systems under Ember-palette scenes
feel warm and nebular; Bone-palette systems feel austere and lunar;
Aurora scenes look genuinely alien. Same archetype reads completely
differently in two scenes, which is exactly what we want.

### Animation niceties

- **Parallax spin.** Each planet spins on its axis at a slightly
  different rate. Free, adds life.
- **Ring precession.** Rings slowly tilt over tens of seconds — barely
  noticeable but makes 30-second follow clips feel alive.
- **Moon orbit planes.** Moons orbit in a plane _not_ aligned with the
  planet's spin — they sweep through the silhouette at an angle.
- **Belt jitter.** Asteroid belt points wobble slightly on their
  orbits via low-amplitude sine displacement.

---

## Lifecycle & animation

### Materialise (0.9s)

Group scale lerps from 0 → 1 with an ease-out-cubic. Each planet starts
at a random orbital phase. The group's **position** tracks the body's
world position every frame (inherits translation but not orientation).

### Active

Per frame:

- For each planet: angle += `orbitSpeed * dt`. Position derived from
  angle + tilt matrix.
- Group position = body world position (from follow-cam readback we
  already do).
- If rings exist: billboard-align to camera or free-rotate — your call.
  Free-rotate is cheaper and looks equally good.

### Dissolve (1.2s)

On follow-cam release, group scale lerps 1 → 0. Once at 0, dispose
all geometries + materials, remove from scene.

### Edge cases

- Scene change: immediate dispose. No graceful fade — the universe is
  rewriting itself.
- Density rebuild: immediate dispose. Same reason.
- Body dies: current plan is follow-cam releases → dissolve animation
  plays. That looks right — "the star died, its system winks out."

---

## Interaction with the rest

- **Physics:** zero interaction. Planets don't affect sim bodies and
  aren't affected by gravity. They're decoration.
- **Trail:** unaffected. Trail records the star's world position; the
  system rides the same position. They happily coexist.
- **Follow-cam rig:** the chase-cam distance may need a slight tune —
  currently `baseDist * 0.08 ∈ [18, 95]`. Outermost planet at ~40 sim
  units could clip into camera. Nudge rig distance to max(rig, outer
  planet radius + 20).
- **Bloom:** planet materials should emit some brightness so bloom
  catches them. A small additive term in the shader output.
- **Cinematic mode:** when `oracle` flavour auto-attaches (see
  `CINEMATIC_MODES.md`), the system generates too — oracle clips get
  to zoom into specific stars' systems automatically. This is the
  killer app for both features at once.
- **Recording:** system is visible in captures. Feature.
- **Performance:** 8 planets × 1 sphere mesh + 1 potential ring + 1
  potential belt of 80 points ≈ 90 Three.js objects max. All animated
  on CPU each frame. At 60fps with 8 planets that's ~480 trig ops per
  frame. Trivial.

---

## UI surface

Everything lives in the Camera panel's Follow section, under a new
"Systems" sub-area below the existing trail controls.

```
[✓] Draw trail
[✓] Show planets

Style            ◯ Serene  ● Natural  ◯ Exotic
Density          ◯ Sparse  ● Normal   ◯ Dense
[ ] Show orbits                                   ← faint path lines
[ ] Include rare features                         ← on by default
Re-roll system                                    ← button
```

### Modes

**Style** biases the archetype roll and the rare-feature probability.
Three presets, one active at a time:

| Mode        | Archetypes allowed                                                | Rare features      | Feel                 |
| ----------- | ----------------------------------------------------------------- | ------------------ | -------------------- |
| **Serene**  | Deep, Derelict, Cradle, Shepherd only                             | half the base rate | meditative           |
| **Natural** | all archetypes, base weights                                      | base rate          | default              |
| **Exotic**  | all, plus rare archetypes (Pulsar, Graveyard, Jewel) at 3× weight | 2× base rate       | hunt for curiosities |

**Density** scales planet count: Sparse = 1–3 planets, Normal = 2–8
(default), Dense = 5–12. Dense also enables moons on every planet.
User picks one; PRNG re-rolls from the same seed if changed.

### Controls

- **Show orbits** — draws a thin `THREE.Line` per planet at the
  orbital radius, tinted low-alpha. Debug-looking but beautiful from
  certain angles. Off by default.
- **Include rare features** — master gate. Off = every planet is plain,
  systems feel "uniform." On is the default. A kill switch for users
  who find the rare features too busy.
- **Re-roll system** — button. Temporarily perturbs the seed with a
  rotating salt, regenerates the system. Resets on next attach to any
  body (so determinism returns). Lets users who want the perfect
  screenshot shuffle a few times before settling.

### Hotkeys

- `;` (semicolon) — re-roll the current system. Only active while
  following.
- No key for toggling planets on/off — this is a preference, set once.

### HUD

Below the follow indicator, a single compact line:

```
● following #3847
  natural · Shepherd · 5 planets · ring
```

Archetype name is the new surprise element — users see "Waltz" and
learn what a Waltz looks like. Mutes after 4s so it doesn't compete
with the scene.

### Phase 1 UI

Ship only the `Show planets` toggle. Style/Density/Re-roll come in
phase 3 once archetypes are built. Don't front-load settings that
don't have anything to govern.

---

## Implementation sketch

### State

```js
const solarSys = {
  enabled: true,
  group: new THREE.Group(), // child of `scene`, translated each frame
  planets: [], // [{ mesh, angle, angularSpeed, radius, tiltMat, ... }]
  rings: [], // subset references into planets[]
  belt: null, // THREE.Points for asteroid belt (or null)
  star: null, // optional corona sprite
  state: "NONE", // NONE | MATERIALISING | ACTIVE | DISSOLVING
  scaleT: 0,
  scaleDur: 1.0, // changes to 1.2 for DISSOLVING
  seed: 0,
};
scene.add(solarSys.group);
solarSys.group.visible = false;
```

### Generate

```js
function generateSolarSystem(bodyIndex, kind) {
  disposeSolarSystem();
  if (kind === 3 || kind === 4) return; // dust/halo
  const rng = mulberry32(bodyIndex ^ 0x9e3779b1 /* ^ scene seed later */);
  // … populate planets, rings, belt per kind
  // Each mesh added as child of solarSys.group
  solarSys.state = "MATERIALISING";
  solarSys.scaleT = 0;
  solarSys.scaleDur = 1.0;
  solarSys.group.scale.setScalar(0);
  solarSys.group.visible = true;
}
```

### Tick

```js
function updateSolarSystem(realDt) {
  if (solarSys.state === "NONE") return;

  // Track parent body position.
  solarSys.group.position.copy(followCam._bodyPos);

  if (solarSys.state === "MATERIALISING") {
    solarSys.scaleT += realDt;
    const t = clamp(solarSys.scaleT / solarSys.scaleDur, 0, 1);
    solarSys.group.scale.setScalar(easeOutCubic(t));
    if (t >= 1) solarSys.state = "ACTIVE";
  } else if (solarSys.state === "DISSOLVING") {
    solarSys.scaleT += realDt;
    const t = clamp(solarSys.scaleT / solarSys.scaleDur, 0, 1);
    solarSys.group.scale.setScalar(1 - easeInCubic(t));
    if (t >= 1) disposeSolarSystem();
  }

  // Orbit planets.
  for (const p of solarSys.planets) {
    p.angle += p.angularSpeed * realDt;
    const x = Math.cos(p.angle) * p.radius;
    const z = Math.sin(p.angle) * p.radius;
    p.mesh.position.set(x, 0, z).applyMatrix4(p.tiltMat);
    p.mesh.rotation.y += p.spinSpeed * realDt;
    // Moons: same treatment in inner loop
  }
}
```

### Hook points

- **followCamAttach:** after the shader highlight is set, call
  `generateSolarSystem(pick.bodyIndex, kindFromPick)`. (We need to
  read kind from the velocity texture's `.w` — already read by
  `followCamReadBody`, just extract `floor(.w + 0.001)`.)
- **followCamRelease:** if `solarSys.state === "ACTIVE"`,
  transition to DISSOLVING.
- **applyScene:** immediate `disposeSolarSystem()`.
- **rebuildPipeline:** relies on applyScene's dispose — nothing extra.
- **main loop:** after `updateFollowCam`, call `updateSolarSystem`.

---

## Phases

1. **Phase 1 — stars only.** Kind 0. 2–8 planets, no rings, no belts,
   no moons, no corona. Plain sphere meshes with solid colour.
   Materialise/dissolve. One day.
2. **Phase 2 — gas giants + rings.** 10% chance rolls get bands and a
   ring mesh. Half a day of shader + tuning.
3. **Phase 3 — asteroid belts + moons.** 25%/25% rolls. Add the
   `THREE.Points` belt and inner-loop moons. Half a day.
4. **Phase 4 — BH accretion + companions.** Kind 2 branch. Reuse
   existing photon-ring shader. Half a day.
5. **Phase 5 — planet kind (moons).** Kind 1 branch. Essentially
   stripped-down phase 1 at smaller scale. Quarter day.
6. **Phase 6 — scene-theming.** System colour palette biases toward
   the parent scene's palette. Quarter day of swatch tuning.
7. **Phase 7 — cinematic integration.** Oracle flavour auto-triggers
   systems. Pairs with existing auto-pick plan. Trivial plumbing.

Ship phase 1 alone and see if the feeling is right. If a plain-star
system already makes users say "oh wow," phases 2–7 are worth the
effort. If not, the concept needs rethinking, not more polish.

---

## What kills this

- **Scale jarring.** If the planets feel _wrong-sized_ — too big and
  they dwarf the starfield; too small and they're pixels — the
  illusion breaks. Tune relentlessly. Orbital radius vs chase-cam
  distance is the only dial that matters.
- **Visual clutter.** Planets + trail + starfield + particles can
  read as noise. Mitigation: trail and planets are independent
  toggles. Bloom might need easing during follow-cam.
- **Overpromising scale.** "Solar system" is a specific thing. Users
  might expect terrain, landing, literal planets. The tagline should
  be **"a sketch of a system around this star"** — evocative, not
  literal.
- **Determinism drift.** If the seed depends on `bodyIndex` only, the
  same texel slot in Antennae and Coma gives the same system — wrong.
  Must XOR the current scene's seed or name hash in.
- **Dispose leak.** Three.js `dispose()` on geometries + materials is
  non-optional. A leak per attach/release adds up over a 2-hour
  stream. Test explicitly.

---

## Invariants

- **System is pure output.** Never alters physics, uniforms, or the
  GPGPU state.
- **System is deterministic per (bodyIndex, sceneSeed).** Re-clicking
  the same body must show the same system forever.
- **System disappears on scene change.** Old world's systems are
  meaningless in the new one.
- **System always dies before a new one is born.** No overlapping
  lifecycles.
- **Physics scale is galactic; system scale is intimate.** Don't try
  to make the two feel continuous. The zoom is the feature, not the
  bug.

---

## Pitch fragments

> Every star has a system. Click to see it.

> A galaxy simulator where any point of light you chase turns out to
> be someone's home.

> Sixteen thousand stars. Sixteen thousand private universes.

That last one is the front-page-of-HN line.

#star #user #feature

[[Security — Index]]
