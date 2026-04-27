---
tended_on: [tag-infer]
id: 01KPS7VDA6BY4GFVAYWPJHCGMC
created: "2026-04-19T16:24:18.432Z"
---

# BRAIN.md — The Simulator as Memory Substrate

A speculative design doc. What if we stopped treating the 4096 particles as
"bodies in space" and started treating them as memories in a mind? Every
primitive this framework already has — gravity, flocking, radiation,
interaction matrices, palettes, scenes, ageNorm, saved viewpoints — maps
almost embarrassingly well onto cognition. This is the exploration.

Nothing here is a plan. It's a map of what the tool _wants_ to become if you
squint.

---

## 0. Premise

A brain is not a database. It is a dynamical system at equilibrium with its
own past. Retrieval is not a key lookup; it is a trajectory through an energy
landscape. Memories do not "exist" at rest — they are metastable eddies that
re-assemble when the landscape tilts the right way.

This framework already simulates dynamical systems with attractive and
repulsive fields, phase-space-preserving integrators, and emergent clustering.
The ingredients are sitting in the texture samplers. We don't have to invent a
brain model. We have to reassign nouns.

The rest of this file is that reassignment.

---

## 1. The Core Mapping

### 1.1 Particles as memories

A particle is one memory. One concept. One fragment. The choice of
granularity is up to the scene.

- A song you heard once in 2014 — one particle.
- Your mother's face — one particle (or a small galaxy of them).
- The feeling of a Wednesday — one particle, heavy with dust.

The particle's **position** is where the memory lives in semantic space. Not
a retrieval key — an _address in a landscape_. Nearby particles are
associatively close. Distance is the substrate of analogy.

Its **mass** is salience — how hard it pulls on attention, how much it
deforms recall around it. Traumatic memories have high mass. So do identity
anchors.

Its **velocity** is drift — the direction the memory is currently heading
under the field of everything else. A memory with high velocity is active,
being re-shaped, in flux. A memory at rest is consolidated.

Its **kind** is the cognitive type (episodic, semantic, affective,
self-referential, social — see §2).

Its **ageNorm** is how long since the memory was last re-activated.

### 1.2 The two textures as mental substrate

The existing GPGPU layout is already suspiciously well-suited:

| Texture                        | Current meaning | Memory meaning                                |
| ------------------------------ | --------------- | --------------------------------------------- |
| `texturePosition.xyz`          | world position  | semantic-space embedding                      |
| `texturePosition.w`            | mass            | salience / arousal weight                     |
| `textureVelocity.xyz`          | velocity        | directional drift under current context field |
| `textureVelocity.w` (int part) | kind            | cognitive type (episodic, semantic, etc.)     |
| `textureVelocity.w` (frac)     | ageNorm         | 1 − rehearsal-recency, [0,1)                  |

Zero bits wasted. Zero new textures needed for the minimal version.

For anything we can't pack — emotional valence, provenance, a pointer to
content — we add a third data texture (`textureMeta`, RGBA32F) indexed by the
same UV. See §8 on sidecar content.

---

## 2. Kinds as Cognitive Ontology

The seven existing kinds map eerily cleanly to a working ontology of
memory. This is the one place where you have to trust the metaphor a little,
because once it clicks the rest of the system writes itself.

### Kind 0 — Stars → **Episodes**

Discrete events. "The day we moved." "Reading the diagnosis." Bright,
individuated, anchored to a place and time. Stars are the bodies recall
_cites_; they're what shows up in narrative.

### Kind 1 — Planets → **Facts**

Facts orbit an episode. "My brother's name" is a planet around "meeting my
brother." Detach a fact from its episode and it becomes free-floating trivia
(high orbital eccentricity → eventually flung out). Facts inherit mass from
the episode they orbit; that's why "the date you lost your job" is
remembered in a way "the date of the Treaty of Westphalia" isn't.

### Kind 2 — Black Holes → **Identity attractors**

Heavy, small-count, warp-everything. These are the memories that are load-
bearing for the self: "I am the person who X." Traumatic cores are black
holes too — negative-affect BHs trap nearby episodes and deform their orbits
for years.

Crucially, identity BHs should be _few_ (2–10) and _immovable-ish_ (huge
mass, near-zero velocity). A healthy mind has a couple of gravitational
centers, not a hundred.

### Kind 3 — Dust → **Mood / affect**

Fills space, low mass, high density. Dust doesn't store content; it _tints_
retrieval. When you remember something "through a haze," the haze is the
dust. A depressive episode is a global dust recoloring — the landscape is
the same but the light is different.

Dust is the mechanism for **state-dependent recall**: the current dust
distribution biases which memories get recalled by shifting the local
effective potential. This is why you can't remember being happy when you're
sad.

### Kind 4 — Halo → **Subconscious scaffolding**

Rarely interacted with directly. Provides the structural potential that
holds everything else in orbit. Core beliefs, deep priors, trained intuitions.
You don't retrieve halo memories; they retrieve _you_.

### Kind 5 — Galaxy A → **Working memory / current self**

The currently-loaded cluster. What you're thinking about _right now_. High
coupling to the camera. When the camera drifts away, Galaxy A loses its
coherence and re-mixes into the larger field.

### Kind 6 — Galaxy B → **Models of others**

Internal simulations of other people. A separate galaxy per close person
would be ideal but we only have one kind slot; in practice, Galaxy B holds
all of them as sub-clusters, differentiated by position and K-coupling.

These have their own internal dynamics and can be _queried as oracles_ —
"what would Mom say?" is a literal physics operation: briefly re-center the
camera on the Mom-cluster, let its local K dominate, read what particles
fluoresce.

---

## 3. K as the Shape of a Mind

The 7×7 interaction matrix `K` is the single most important knob. It tells
you how each type of content pulls on every other type of content. It is
not hyperbolic to say: **the K matrix is personality.**

### 3.1 Personality as a K preset

- **Ruminative**: `K[BH][episode]` very high → identity-core endlessly
  summons and re-plays a small set of episodes. Classic depressive lock-in.
- **Dissociative**: `K[dust][*]` near zero → affect does not couple to
  content. You remember what happened but not what it felt like.
- **Artist**: `K[planet][planet]` > 1 → facts attract facts across their
  original episodes. This is cross-domain analogy. This is metaphor-finding.
- **Child**: all K values close to 1, narrow spread. Everything couples to
  everything, weakly. High mixing, low structure, high emergence.
- **Expert**: K highly structured with deep wells on specific (kind, kind)
  pairs. Strong associations in-domain, weak cross-talk elsewhere.

Saving `K` presets as named personalities is free.

### 3.2 Learning as K updates

The existing K matrix is static per scene. The brain version wants Hebbian
updates: **particles that spend time close together increase their
between-kind coupling.** Implemented as a slow integrator on K itself:

```glsl
// conceptual, not literal
dK[a][b] += η * ⟨closeness(a, b)⟩  - λ * K[a][b]
```

- `η` (learning rate) — tiny. Minutes of interaction shift K by a hair.
- `λ` (decay) — slower still. Unused couplings fade but don't vanish.

This is coarse learning (7 × 7 = 49 numbers). For finer grain, you'd want
per-particle embedding updates — but resist that first. The coarseness _is_
part of why this stays tractable. Fine-grained association should emerge
from **position**, not from K.

---

## 4. Forces as Cognitive Operations

### 4.1 Gravity = salience

`G` and `softening` set the global salience field. High G, low softening →
everything is urgent, attention collapses to the nearest heavy particle.
This is a panic brain. Low G, high softening → attention glides, nothing
grabs. This is dissociation or boredom.

Attention itself is the camera. Salience is "what the camera gets pulled
toward if you stop steering."

### 4.2 Flocking = semantic clustering

The existing alignment / cohesion / separation loop is a textbook
self-organizing-map without the map. Set `cohesion > 0` and particles with
similar neighbors drift together. Over minutes of sim-time, a random
sprinkling of episodes and facts self-sorts into thematic regions.

This is semantic gravity. It's also what makes analogies possible: a
particle encountering a cluster of similar-kind neighbors gets pulled in;
pulled in, it now _is_ one of them; the cluster grows; the analogy network
compiles itself.

Separation prevents collapse — without it, all memories of a kind would
fuse. Separation is **differentiation** — the force that lets similar
memories stay distinct enough to still be individually retrievable.

### 4.3 Radiation = affective charge / forgetting

Radiation pressure is currently used for "high-mass bright things kick their
neighbors." For a brain, it's two things at once:

- **Affective heat**: high-valence memories radiate. Nearby memories get
  re-oriented by them. This is why one emotional memory can color an entire
  afternoon of recall.
- **Forgetting as radiation-driven drift to periphery**: scale radiation by
  `ageNorm`. Old, unrehearsed memories get a slow outward kick. They drift
  to the halo. Eventually they fall off the active sphere entirely
  (§8 on cold storage).

### 4.4 Age channel = recency

`ageNorm ∈ [0, 1)` is already there. Needs two ops:

- **Rehearsal reset**: when a particle is "looked at" (camera proximity,
  explicit recall, query hit), age resets toward 0. This is literal
  rehearsal — the thing psychology books have been telling us makes memories
  stick for a hundred years.
- **Decay**: age advances each frame at a scene-configurable rate. Different
  scenes could simulate different forgetting regimes — sleep scenes slow
  decay, dream scenes accelerate it selectively.

---

## 5. Scenes as Mental States

Scenes already provide: full K preset, palette, channel, post-processing,
physics params, flocking weights, radiation weights, tint. A scene is
literally a cognitive state.

Named scenes in the BRAIN build:

| Scene          | What it is                                                          |
| -------------- | ------------------------------------------------------------------- |
| `waking`       | baseline; balanced K; dust visible but not dominant                 |
| `focus`        | low dust, high gravity on working-memory galaxy, camera lock-on     |
| `wander`       | low gravity, high flocking, camera drift on, no lock-on             |
| `sleep-NREM`   | near-zero radiation, high flocking, cohesion up, separation down    |
| `sleep-REM`    | high radiation, high perturbation, K randomized ±10%, camera fly-by |
| `rumination`   | K[BH][episode] cranked, camera trapped in orbit of heaviest BH      |
| `meditation`   | all K flattened toward 1.0, dust uniform, camera auto-orbit slow    |
| `grief`        | one BH mass ×10, palette dark, radiation high in that BH's vicinity |
| `inspiration`  | K[planet][planet] ×2, separation down, expect cross-cluster jumps   |
| `dissociation` | K[dust][*] zero, palette desaturated, mass variance squashed        |

Transitions between scenes are already eased via `applyScene`. A **mood
shift** is a scene transition. This is not a metaphor — it is how the thing
would actually be implemented.

---

## 6. Palettes & Channels as Introspective Lenses

The palette/channel system already answers the question "what do you want to
see when you look at the mind?"

Channels we'd want:

- **kind** (existing) — see the cognitive ontology directly
- **age** — see what's stale and what's fresh
- **salience** (mass) — see what's load-bearing
- **affective valence** — positive / negative tint (requires 3rd texture)
- **coupling** — brightness proportional to Σ K[kind][neighbor kinds] actually
  experienced in the last N frames. Shows what's _actively talking_.
- **query match** — brightness = semantic similarity to the current query.
  Turns the entire sim into a live retrieval UI.

A user with different moods / needs picks different channels. This is
introspection-as-camera-filter. Which, again, is just true.

---

## 7. Retrieval Mechanics

Three retrieval modes, all already affordable with existing primitives:

### 7.1 Query

Text in → embed → mass-boost every particle with cosine similarity > τ.
Camera gets a gentle pull (the same one `OrbitControls.target` already
allows) toward the weighted centroid of boosted particles. The screen lights
up with the answer emerging as an attractor.

This is _not_ a ranked list UI. The visual is the ranking.

### 7.2 Associative walk

Click a particle. Its mass briefly spikes. Its neighbors light up under the
current K. The camera orbits the clicked particle and slowly sweeps outward.
You are literally walking the association graph, except there is no graph,
just positions and forces.

This is the closest thing to how introspection actually feels.

### 7.3 Method of loci

Save viewpoints as named palace rooms. "The kitchen" is a specific
`(target, position, zoom)`. Memories placed in that volume are what lives
in that room.

The saved viewpoint system (localStorage, already implemented in §21) is
already the correct substrate. A memory palace is a keymap of viewpoints
over a stable particle configuration.

### 7.4 Auto-orbit = mind-wandering

The existing camera drift is mind-wandering. Let it run, let flocking
mutate the field, watch what floats to the top under the current scene's K.
This is the brain's default-mode network. Do not think of it as a screensaver.

---

## 8. Temporal Dynamics

### 8.1 Consolidation (sleep)

Transition to `sleep-NREM`:

- radiation → ~0 (no emotional heat stirring things)
- cohesion up, separation unchanged
- slow the integrator (smaller `dt`)
- run for a long wall-clock while user is actually asleep (or for N
  sim-minutes in a timelapse)

What emerges: thematic regions tighten. Nearby memories fuse into tighter
clusters. Spurious cross-links fade under K decay. The landscape smooths.

### 8.2 Dreaming

`sleep-REM`:

- jitter K by ±10% per frame (random coupling distortions)
- radiation up
- perturbation ("roll the dice", already in §24) triggers on a schedule
- camera auto-fly through random high-salience clusters
- record to video

Record dreams. Play them back on waking. This is genuinely interesting as
an artifact — an emergent, non-scripted, physically-driven dream sequence.

### 8.3 Rehearsal / rumination

Same mechanism. Rehearsal is camera-near + query-match resetting age.
Rumination is what happens when one BH's orbital potential captures the
camera and the user can't break out. The `wander` scene is how you escape.

### 8.4 Forgetting curves

Ebbinghaus as a texture op. Per frame:

```glsl
age += dt * decayRate;
mass *= (1.0 - agePenalty * pow(age, exponent));
```

Particles that drop below a mass floor get flagged for eviction. On scene
save, the eviction list gets serialized to a cold-store file. Nothing is
actually deleted — it's just unloaded from the GPU.

---

## 9. Ingestion & Serialization

The particle carries **no content**. "The day we moved" is a position, a
mass, a kind, an age. The actual text/image/audio of the memory lives
elsewhere, keyed by the particle's stable UV.

### 9.1 Sidecar content store

```
memories.json:
[
  { "uv": [0.02, 0.15], "kind": 0, "text": "...", "media": "...", "tags": [...] },
  ...
]
```

UV is the stable key because positions drift. Every particle on spawn gets
a permanent UV; sidecar rows attach to UV.

### 9.2 Writing a new memory

1. User pastes text (or speaks, or drops an image).
2. An embedding model (transformers.js, runs in-browser) produces a 3D
   projection (PCA down from whatever native dim).
3. Kind is inferred from content (regex + simple classifier is fine to
   start: "yesterday we..." → kind 0 episode; "I am a person who..." →
   kind 2 BH).
4. Particle spawns at the projected position, mass from a salience heuristic
   (punctuation, repetition, affect words), age 0.
5. Sidecar row written.

### 9.3 Hot / warm / cold tiers

- **Hot** — 4096 slots on GPU. What's "in mind."
- **Warm** — JS Map of up to ~50k sidecar entries not currently on GPU.
  Swapped in on query hit or scene load.
- **Cold** — IndexedDB or downloadable JSON. Anything the user wants to
  persist beyond the session.

Eviction from hot → warm is driven by mass-floor (§8.4). Promotion from
warm → hot is driven by query match or explicit recall.

### 9.4 Export/import

The existing JSON export (§23) already serializes particle state. Extend it
with K, sidecar, saved viewpoints, and scene = **a full mind snapshot in one
file**. Import is the inverse.

---

## 10. What We Would Actually Have to Build

In roughly increasing cost:

1. **Third data texture** (`textureMeta`) for valence + provenance + UV stamp.
   Small shader change, small scene-factory change.
2. **Query bar + mass-boost operator** on matched UVs. Pure JS — no shader
   change if we piggy-back on existing mass field.
3. **Sidecar content store** + UV stable IDs. Local-storage / IndexedDB.
4. **Embedding frontend** — transformers.js with a small sentence encoder
   (~25 MB download, runs on GPU). PCA to 3D done offline per session.
5. **Hebbian K updater** — a cheap CPU-side integrator over per-kind
   proximity histograms.
6. **Sleep / dream scenes** — new entries in SCENES. Zero engine changes.
7. **Palace mode** — UI for placing / naming saved viewpoints; minimal.
8. **Consolidation timelapse** — a "run sleep for 1 hour of sim time in 30s
   wall time" button. Pure loop work.

Roughly ordered, this is a two-weekend project on top of what already exists.

---

## 11. What We Should Resist

The CLAUDE.md doctrine — _emergence, not effects_ — is load-bearing here too.

- Do not script "traumatic memory pulls the camera in." Make it a heavy BH
  and let the existing gravity do it.
- Do not script "dream visions." Let a jittered K and high perturbation run
  in a low-dt integrator and record whatever comes out.
- Do not script "mood darkens palette." Make the palette a function of the
  dust-channel mean affective valence and let it change on its own.
- Do not add ranked retrieval UI. The screen is the retrieval UI. A list
  UI would flatten the one thing that makes this worth building.
- Do not add TypeScript. (CLAUDE.md §1.)
- Do not split the file. (CLAUDE.md §1.)

The temptation to add "brain" features by hard-coding is immense because
the metaphor is evocative. Resist. Every scripted behavior is a cognitive
feature the model will not teach you anything about.

---

## 12. The Payoff

Nothing in this file requires a new cognitive model. It requires rethinking
what the existing primitives mean.

What you would get, if you built it:

- A memory system whose **retrieval dynamics you can see and steer.**
- A mood knob that **literally re-weights recall** because dust biases the
  local potential.
- Dreams that are **generated, not sampled** — from your actual memories,
  under a perturbed version of your actual K.
- Forgetting curves that are **a property of the physics**, not a cron job.
- A way to **look at yourself thinking**, because the channels are already
  introspective lenses.

The simulator already does the hard part: stable, GPU-accelerated, emergent
N-body dynamics at 60 fps. The "brain" reframing is 80% just naming.

---

## 13. A BRAIN Scene, Concretely

A near-minimal entry that would drop into `SCENES` today:

```js
SCENES.brain_waking = {
  make: makeBrainSeed, // scatters particles by kind, reads from
  // sidecar if present, random otherwise
  camera: { target: [0, 0, 0], position: [0, 120, 380], zoom: 1 },
  palette: "noctis",
  channel: "kind",
  post: { bloom: 0.7, ca: 0.25, vignette: 0.35, grain: 0.08 },
  physics: { G: 1.0, softening: 2.5, dt: 0.016 },
  K: "brain_balanced", // 7x7 with mild identity attraction
  flock: { cohesion: 0.05, alignment: 0.02, separation: 0.04 },
  radiation: { weight: 0.02, ageScale: 0.3 },
  tint: "kind_default",
};
```

Then `brain_focus`, `brain_wander`, `brain_sleep_nrem`, `brain_sleep_rem`,
`brain_rumination`, `brain_meditation` — each a tweak of the same entry.

This is the thinnest possible onramp.

---

## 14. Hotkeys We'd Want

Existing hotkey system (§28) would take these gladly:

- `[`, `]` — prev/next mood scene
- `Q` — focus query bar
- `R` — start/stop dream recording
- `Shift+S` — save current memory snapshot
- `Shift+L` — load memory snapshot
- `Space` — pause the mind
- `Shift+Space` — step one frame
- `M` — cycle palette channels (already there, repurposed)
- `⌫` on a hovered particle — mark for forgetting (accelerate its age)

---

## 15. Open Questions

No tidy answers. These are the parts that would have to be lived with.

1. **How do you embed a memory in 3D?** 3 dims is too few for real semantics.
   PCA from a larger space loses a lot. Maybe UMAP. Maybe let flocking do
   the projection — seed random positions, let K sort it.
2. **What's the right particle count?** 4096 is one active day. A life is
   more. Maybe the GPU holds "today" and the disk holds "everything."
3. **Does K need to be 7×7 or per-cluster?** 7×7 is probably too coarse for
   adult memory. But going fine-grained loses the scene-preset ergonomics.
4. **Does the user control forgetting?** Auto-decay is cleaner but violates
   consent. Explicit forgetting (`⌫`) is more honest but fiddly.
5. **Is content-storage in JSON enough?** For text, yes. For audio/video,
   links to local files is fine. Sync across machines is out of scope.
6. **Does this actually help anyone remember anything?** Unknown. It might
   just be the most beautiful possible way to forget.
7. **Is it ethical to build a tool that visualizes your own mind?** Probably.
   But the affordances matter. A "delete a traumatic memory" button is
   different from "let its age accumulate."

---

## 16. One-Line Summary

The simulator is already a brain. Wire up the sidecar, name the moods,
don't script the dreams.

#user #person #feature
