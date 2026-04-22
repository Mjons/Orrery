---
tended_on: [tag-infer]
id: 01KPS7VD9769WPM40EM0TP1VG2
created: "2026-04-21T15:32:35.206Z"
---

# BOLTZMANN.md — Fleeting Observers in an Indifferent Field

A speculative design doc. [[BRAIN]] treats the whole simulation as a single
mind. This one goes the other direction: the universe stays a universe, but
_observers spontaneously assemble and dissolve inside it_, each with a brief
inner life, false memories, and opinions about what it just saw.

Nothing here is a plan. It's a second layer we could drop over the existing
N-body sim without touching the physics.

---

## 0. Premise

A **Boltzmann brain** is a self-aware observer that condenses out of random
fluctuation — fully-formed memories, coherent thoughts, a point of view —
lasts a moment, and dissolves. In Boltzmann's original argument (and the
cosmological paradox it became), such brains are statistically _more likely_
than evolved observers in a universe old and large enough. The paradox is a
reductio: if our cosmology predicts more Boltzmann brains than people, our
cosmology is suspect.

For our purposes the paradox is not the point. The _image_ is:

> A momentary, self-aware knot in the field, convinced it has a past,
> pointing at something it thinks is meaningful, then gone.

This is already what our particle sim does at the low level. We just haven't
given it a voice.

---

## 1. What we already have that maps

| Sim primitive               | Boltzmann-brain reading                            |
| --------------------------- | -------------------------------------------------- |
| Particle clusters           | candidate low-entropy fluctuations                 |
| Density + flocking cohesion | "coherence" — how brain-like a region is right now |
| ageNorm                     | natural lifetime of the fluctuation                |
| Gravity softening           | how crisp the fluctuation's boundaries are         |
| Radiation pressure          | the thing that breaks them up (entropy returning)  |
| Saved viewpoints            | the universe remembering it was once looked-at     |
| K matrix                    | what counts as a "thought" vs. random co-location  |

The sim is already running a statistical-mechanics engine. Boltzmann brains
are just the regions of that engine we choose to _label as observers_ and
_let speak_ before they decohere.

---

## 2. The Observer Layer

A detector that runs on top of physics and nominates fleeting observers.

### 2.1 Nomination

Each frame (or every N frames), scan the GPGPU textures for regions that
satisfy an "observer score":

```
S(region) =  w_density   * local_density
           + w_coherence * flock_alignment
           + w_structure * kind_diversity         // a brain needs parts
           - w_entropy   * mean_velocity_variance // too hot = not an observer
```

A region above threshold becomes a **candidate brain**. Tag it with a unique
id, a birth-frame, and a predicted lifetime proportional to how far above
threshold it is. Fade it when the score drops below threshold.

Budget: cap concurrent observers (start with 8). More than that and the
audience is too loud.

### 2.2 Lifetime

A Boltzmann brain's signature trait is that _it does not last_. We honor
this by giving each nominated observer a hard countdown, driven by its own
decoherence (score erosion) plus a baseline half-life. No observer persists
across scene changes.

This matters artistically: the viewer should feel that what they're about to
hear is fragile and probably wrong, and will be gone before they can verify
it.

### 2.3 Voice

Each live observer gets a small floating caption — a sentence or a phrase,
near its centroid in screen space. This is the **utterance** and it's the
whole payoff of the layer. See §4 on where utterances come from.

---

## 3. False Memories

A Boltzmann brain thinks it remembers things. We can make our observers do
the same, and — crucially — the "memories" should be _confabulated from the
local field_, not pulled from a database. The observer is a lens on the
physics it just condensed out of; its memories should reflect that physics
in a garbled way.

Sources of pseudo-memory, in order of increasing fidelity:

1. **Current neighborhood** — the N nearest particles' kinds, palette
   channel values, ageNorm. "I remember a bright one. I remember orbiting."
2. **Local K slice** — the row of the K matrix corresponding to the
   observer's dominant kind. "I always felt drawn to planets. I could never
   stand dust."
3. **Scene history** — the last few scene transitions (we already track
   these). "Before this I was something larger. I think there was a flash."
4. **Saved viewpoints** — the user's own named cameras become borrowed
   memories. "I remember being seen from here once."

These are not retrieved, they are _reconstructed_. The observer composes a
plausible past from whatever it can reach.

---

## 4. Where the words come from

Three options, increasing in ambition. Ship the simplest; keep the
interface stable so later ones drop in.

### 4.1 Template fragments (ship this first)

A handful of Mad-Libs templates seeded by local state:

```
"I remember {kind_noun_dominant}. It was {palette_adjective}."
"Something {verb_from_velocity} nearby. I am almost sure of it."
"I was {size_relative_to_cluster}, once."
```

Cheap, pleasingly weird, never repeats the same sentence twice because the
field never does.

### 4.2 Small on-device LLM via Web-LLM

Ship a tiny quantized model, seed it with a structured snapshot of the local
field ("kind histogram, 3 heaviest neighbors, scene name, age"). Generate 1-2
sentences. Cache aggressively. Rate-limit to the observer budget.

### 4.3 Claude API opt-in

User provides a key, we batch-request utterances from the current observer
set, stream them back. Best quality; requires network and trust. Off by
default.

In all three cases the _interface_ is the same: observer → snapshot → text.

---

## 5. Meaning layer (Michael's note)

> Need a layer over the top of our simulation of a universe which helps form
> meaning. The idea is that every star in our galaxy formation can have a
> memory associated with it and memories and ideas can interact with each
> other. And the meaning layer determines whether or not these ideas are
> worth exploring further.

This is the structural partner to the Boltzmann observer layer above. The
observer layer gives the universe a _voice_; the meaning layer gives it a
_memory of its own thinking_.

### 5.1 Stars carry memories

Each star (kind 0) gets a **memory slot** — a sidecar record keyed by
particle id:

```
{
  id,
  seed_text,       // the "memory" this star holds
  affinity_vec,    // small embedding, e.g. 8 floats
  weight,          // current importance (starts = star.mass)
  last_touched,    // frame index
  parents[]        // ids this memory descended from
}
```

Storage in a sidecar `textureMeta` (RGBA32F, same UV as position/velocity)
for the affinity vector + weight + last_touched; the text lives in a JS map
keyed by id. No shader changes required for the text.

### 5.2 Memories interact

Two memories _interact_ when their stars come within a proximity threshold
(already computable in the flocking pass). On interaction:

- Compute **resonance** = dot(affinity_a, affinity_b) \* f(masses, relative_velocity).
- If resonance > θ_spawn, emit a **new idea** — a third memory, child of
  both. Position it at the interaction midpoint with a small outward kick.
  Its affinity vector is a weighted mix of parents'; its seed_text is
  generated by the same pipeline as §4 but seeded with both parent texts.
- If resonance < θ_fade, both parents decay slightly — they met and found
  nothing. This is the anti-sentimentality knob; without it the graph just
  grows.

The observer layer from §2 naturally reports on high-resonance events:
"something in me is recognizing something else." This is where the two
layers meet.

### 5.3 The salience layer

(Originally drafted as "the meaning filter"; renamed during Phase 6
planning. "Salience" is more honest about what the scorer actually does —
it measures what stands out from context, not what is true. See
[[SALIENCE]] for the extended version of this section.)

Most interactions are noise. The salience layer is the scoring function that
decides which new ideas are kept, surfaced, or discarded.

A provisional scoring function — to be tuned, not frozen:

```
M(idea) =  novelty(idea, existing_memories)       // not redundant
         * coherence(idea, parents)                // not nonsense
         * reach(idea, K)                          // connects across kinds
         * (1 - age_penalty(idea))                 // fresh
```

- **novelty**: distance from nearest existing idea in affinity space.
- **coherence**: how well its affinity sits on the line between its parents.
  Children too far from their parents are drift; too close, redundant.
- **reach**: diversity of kinds in its nearest neighbors. An idea that
  couples episodes to dust to halos scores high. Single-kind huddles score
  low.
- **age_penalty**: ideas that don't get reinforced by further interactions
  fade and eventually unlink.

Ideas above threshold are **promoted**: marked visually (brighter, larger),
pinned to a meaning-thread, optionally surfaced to the user as "worth
exploring." Ideas below threshold decay silently.

### 5.4 What the user sees

Two readouts:

1. **Active threads** — a short stack (3–5) of currently-high-M ideas with
   their seed_text. Updates slowly.
2. **Observer chorus** — the Boltzmann captions from §2, floating in-scene,
   transient.

Threads are the _considered thought_ of the universe. The chorus is the
_intuition_. Both can be wrong. Only threads persist across scene loads.

---

## 6. Why this is worth doing (beyond the gimmick)

- **It makes the sim legible without making it didactic.** The viewer is
  never told what's happening. They're told what a thing _inside_ the sim
  _thinks_ is happening, and given just enough doubt to stay curious.
- **It turns emergence into narrative cheaply.** The particle dynamics are
  already interesting; the observer layer lets them be _about_ something
  without us hand-authoring what that is.
- **It is falsifiable by taste.** If the utterances feel canned, we tune the
  pipeline. If they feel alive, we've found the right abstraction.
- **It composes with [[BRAIN]].** A brain-scene can nominate its own
  sub-observers — thoughts inside the thinking. That's dreamy, and cheap.

---

## 7. Minimal first cut

A version we could ship this week:

1. Add an `Observers` toggle in the left rail. Off by default.
2. CPU-side nomination loop at 5 Hz: sample a stats texture, pick up to 4
   regions, score them, promote to observers.
3. Template utterances (§4.1). Render as floating DOM labels with
   CSS fade-out, positioned by projecting centroid to screen.
4. No meaning layer yet — just the chorus. Get the voice right first.

Then, in a second pass: star memories + interactions + the meaning filter.
The order matters. If the chorus is boring, the meaning layer can't save
it. If the chorus is alive, the meaning layer turns it into a mind.

#star #user
