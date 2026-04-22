# DREAM_GRAVITY.md — A center of gravity for dream mode

Sibling to [DREAM.md](DREAM.md) and [DREAM_ENGINE.md](DREAM_ENGINE.md).
DREAM.md specifies the _mood_ of sleep (physics looseness, tether fade,
ambience). DREAM_ENGINE.md specifies the _cognitive cycle_ (warming →
generating → playing → discerning). This doc specifies the **visual
spectacle** — what the user watches while the engine thinks.

## The idea in one sentence

Something like a quiet black hole wanders into the universe while you're
asleep, and everything gets pulled along for the ride until you wake.

## Why

Today dream mode loosens springs and adds wander noise. The bodies drift,
but drift is the absence of choreography — it reads as "things are slower"
rather than "something is happening." The morning report says the app
dreamed; the visuals don't corroborate it.

A dream needs a protagonist. Not a narrator-voice — a _gravitational_
protagonist, a pull the user can see. When a single moving attractor
dominates the scene for a minute, every node becomes a brushstroke. The
screen stops looking like a paused simulation and starts looking like
weather.

## The mechanic — Dream Attractor

One invisible body with:

- **Position** — a slow-wandering point that drifts through the universe
  on a parametric curve. Not random per-frame — Lissajous-ish, or a soft
  3D noise walk, so its path reads as _intentional movement_.
- **Mass/strength** — modulated by `depth` and the current engine phase
  (see phase coupling below). Zero at wake, peaks during _playing_.
- **Radius of influence** — finite. Past this radius bodies don't feel
  it. This is what lets the attractor _pass through_ the field instead
  of sucking the whole vault into one point.
- **Sign** — mostly attractive, occasionally _repulsive_ (a "breath out")
  during the discerning phase. The exhale disperses the pile before
  morning so the user doesn't wake to a singularity.

Reuses the same force hook the folder basin already uses
([boltzsidian/src/sim/physics.js:194-217](boltzsidian/src/sim/physics.js#L194-L217)) —
just one more term in the integrator, gated on `getDreamDepth() > 0`.

## Phase coupling

The engine's four phases already exist in [layers/dream.js:48-58](boltzsidian/src/layers/dream.js#L48-L58).
The attractor gets a personality per phase:

| Phase      | Attractor behavior                                                   |
| ---------- | -------------------------------------------------------------------- |
| falling    | Appears at the camera's focal point. Weak pull. A "gathering."       |
| warming    | Drifts outward on a slow curve. Strength ramps up with depth.        |
| generating | At max strength. Path becomes more adventurous — figure-eights.      |
| playing    | Splits: second attractor spawns, the two orbit each other.           |
| discerning | Signs flip — the attractors _exhale_, scattering what they gathered. |
| waking     | Strength decays to zero over the 2s wake ramp. Nodes spring back.    |

The "two orbiting attractors" in _playing_ is where the visuals earn
their keep — binary-star choreography of everything the user owns.

## Visual treatment

The attractor is invisible _as a body_ but very visible _by consequence_.
What the user actually sees:

1. **Tethered bodies swing in arcs.** Springs stay loose (per DREAM.md),
   so the attractor bends the filament structure rather than snapping
   it. Log output: fluid, curling motion across the whole field.
2. **Speed shear colors.** Bodies moving fastest toward the attractor get
   a transient velocity-channel tint (blueshift-ish toward the pull,
   redshift-ish falling away). Hooks into the existing palette channel
   system — add a `velocity` channel to `CHANNELS`.
3. **Soft radial haze at the attractor's screen position.** A faint
   vignette-inverse — slightly brighter, slightly warmer, centered on
   the attractor. Communicates "something is there" without drawing
   a mesh. Same trick as constellations' radial-gradient DOM, lowered
   to z=2 so bodies overdraw it.
4. **Tether curvature.** Tethers already fade in dream mode. Let them
   also _bow_ — instead of straight-line segments, sample a midpoint
   and offset it toward the attractor proportional to depth. Cheap
   shader change; visually it turns the graph into a weather system.
5. **Camera falls in too.** The passive auto-orbit ([main.js:2485-2507](boltzsidian/src/main.js#L2485-L2507))
   picks up a second term — a gentle lerp of the orbit target toward
   the attractor position, weighted by depth. The user's viewpoint
   rides the current with the notes.

## Adjusting parameters mid-dream

The ask: the center of gravity _adjusts its parameters_. Proposed knobs
that change on a slow sine over the cycle:

- **Softening length** (gravitational softening) — breathes in and out.
  Small → sharp pulls, extreme arcs. Large → gentle wide drift.
- **Anisotropy** — occasionally the pull becomes flattened onto a plane
  (an accretion-disk moment). Done by scaling the force's Y component
  down for ~20s. Whole vault briefly settles into a disk.
- **Angular injection** — add a perpendicular component, so nodes don't
  just fall in but _swirl_. Same trick as galaxy rotation. Strength
  varies over the cycle; at peak you get a spiral.

These don't need sliders. One function, `attractorParamsForPhaseT(phase,
t)`, returns the tuple. Tune once, ship it.

## Beautiful mess constraints

The attractor must **never collapse the vault to a point.** Two guards:

1. **Hard floor on softening** (no singularity — minimum softening ~20
   sim units regardless of phase).
2. **Discerning-phase exhale is mandatory**, not optional. Before wake,
   20s of net-outward force disperses the pile.

Additionally:

- Cap node speed at the existing `maxSpeed` (1600 in dream profile).
  Prevents the "zooming white streaks" failure mode.
- Pin the attractor's wander curve to the current sim bounding box —
  so it doesn't drift off to infinity and pull half the vault with it.

## What wakes the user

No change to wake mechanics — existing input-triggers in
[layers/dream.js:216-222](boltzsidian/src/layers/dream.js#L216-L222)
stay as-is. The 2s wake ramp now has more to do: attractor strength → 0,
tether curvature → 0, camera lerp target → 0. All keyed on the same
`depth` value, so they settle together.

## What this isn't

- **Not a black hole scene.** No accretion disk graphics, no
  relativistic beaming, no "make it look like Interstellar." The
  spectacle is emergent from physics the user already has, just with
  one more force term.
- **Not interactive.** The user does not steer the attractor. This is
  the dream — they're a passenger. Interactivity is a wake trigger.
- **Not permanent.** At wake, the attractor vanishes and the vault
  returns to its wake configuration over the existing wake ramp.
  Tomorrow's dream spawns a new one with a different wander seed.

## First cut (one-day slice)

The minimum that delivers the feeling:

1. Add a `dreamAttractor` object to the physics integrator: position,
   strength, radius, softening.
2. Wander its position along a seeded 3D Perlin walk, bounded to sim
   extents.
3. Strength = `depth * phaseWeight(phase)` where phaseWeight is
   hardcoded per the phase table above.
4. Apply an inverse-square pull with finite radius in the velocity
   kernel. One extra uniform, one extra force term.
5. Camera orbit target lerps toward attractor position with weight
   `0.3 * depth`.

That's it. No tether curvature, no velocity shear, no twin attractors.
Ship that, live with it for a week, then decide which of the bigger
swings earns its keep.

## Kill condition

If after a week of real dreams the user reports: "I keep opening the app
in the morning and wondering why everything is piled in one place," the
exhale phase failed — either strengthen the discerning-phase repulsion,
or lower peak attractor strength. If the user reports "I don't notice
anything different from before," peak strength was too timid — raise it
until the choreography is unmistakable.

The feature is load-bearing when: someone leaves dream mode running
while they make coffee, and stops to watch.

#dream #visual #emergence #phase
