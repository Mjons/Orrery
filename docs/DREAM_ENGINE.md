# DREAM_ENGINE.md — The generative recipe

Sibling to [DREAM.md](DREAM.md) (high-level "what dreaming is for") and
[MODEL_SURFACES.md](MODEL_SURFACES.md) (where model output is allowed to
live). This doc is about the specific **mechanic** by which dream state
produces ideas worth reading in the morning.

The observation that prompted this doc: the first pass of dream output
landed as summaries. "Note X sits in folder Y near Z, tagged #W" is
accurate, grounded, observational — and completely uninteresting.
Summaries aren't what dreams are. Dreams _warp_ what you know, _amplify_
one attribute until it dominates, let the thing _wander_, and when it
_bumps_ into another thing that was doing the same, _spawn_ a new
association that neither half on its own would have produced.

This doc names those five phases, what each one does, and what the
prompt has to ask for so the model actually produces them.

---

## 0. The five phases

```
  ┌──────┐   ┌──────────┐   ┌────────┐   ┌──────┐   ┌───────┐
  │ WARP │ → │ MAGNIFY  │ → │ WANDER │ → │ BUMP │ → │ SPAWN │
  └──────┘   └──────────┘   └────────┘   └──────┘   └───────┘
     │            │              │           │           │
     │            │              │           │           └─ writes candidate
     │            │              │           │              seed to drawer
     │            │              │           └─ proximity check in world space
     │            │              └─ loose physics, damping, low K
     │            └─ one attribute of the note becomes dominant
     └─ existing note attributes are jittered
```

Each phase is **optional** in the sense that a weaker version of the
whole mechanic already runs (salience layer picks random pairs, scores
them, spawns candidates). This doc is about making each phase explicit
and legible — both in the code and in the model's prompt.

---

## 1. Warp — the attribute jitter

**What it does.** Takes an existing note's affinity vector (or its set of
observable slots — tags, folder, age, neighbours) and _slightly rotates_
it. The note is still recognisable, but it's "wearing" a subtly
different aspect than its waking self.

**Why.** Wake-state pair-scoring uses the note's actual attributes.
That's correct when the user is reading — you don't want invented
tags. But at the point where the system is trying to surface
_unexpected_ connections, treating each note as a fixed point of slots
prevents the kind of associative leap that makes a dream interesting.
Warp is a controlled, bounded form of "what if this note were slightly
other than itself."

**Scope.** Warp is _within_ the note — never invents vault content.
Examples of legal warps:

- "What if this note's strongest attribute were #decision instead of
  #feature?" (shuffling within the note's actual tag set)
- "What if this note's age were interpreted as how long it's been
  _ignored_ rather than how long since its last edit?"
- "What if this note's folder were read as a role rather than a
  location?"
- "What if the neighbour list were read as rivals rather than
  siblings?"

No warp ever adds a tag or link that isn't in the note. Warp is a
_reading_, not an addition.

**Current state in code.** Not implemented. The salience layer passes
the raw note attributes through `buildPairSnap`; the model sees
unwarped slots. Phase-7.5-ish work.

**Minimal first cut.** At snap time, mark ONE of the note's actual
slots (chosen by a seeded hash of the note id + day) as the "warped
attribute." Pass it to the prompt under a new field `warped: <attr>`.
The prompt then asks the model to _over-read_ that attribute when
generating. Nothing is invented; the model is just told where to focus.

---

## 2. Magnify — making one attribute dominant

**What it does.** The warped attribute doesn't just get named — it gets
_loud_. Think of it like the dream-version of a person who's mostly
themselves, but with one feature enlarged: a bigger nose, a louder
laugh, more intensity on one trait than they'd normally have.

**Why.** Summary output reads as a balanced readout — each slot gets
equal weight. Interesting output often comes from the model being
forced to privilege one angle over the others. Magnification is how we
instruct "this is the thing to stare at."

**Scope.** Stays legible. The magnified attribute is still a real
attribute of the real note. What changes is the prompt's framing:

- Default prompt: "here are six slots about this note, write about
  the note"
- Magnified prompt: "here are six slots, but slot X is the one that
  matters right now — write about what that attribute _means_ for the
  note"

**Current state.** Same as warp — not implemented.

**Minimal first cut.** Inside the prompt, prefix the warped attribute
with `**` so the model reads it as emphasised. In the user prompt body,
add one line: "treat `warped:` as the note's strongest aspect during
this dream."

---

## 3. Wander — the physics is already doing this

**What it does.** With dream K-noise and loose damping (see DREAM.md
§2.2), particles drift further per unit time than they would at wake.
Notes that normally never come within proximity do so briefly during
dream.

**Why.** Proximity is the mechanic by which the salience layer spawns
pair candidates (`NEIGHBOURS_PER_SEED=4` within a 220-unit radius).
Wander is what makes a pair _novel_ — two notes bumping that never
would bump at wake.

**Current state in code.** Works. The physics layer has loose dream
coefficients already, and the salience tick only runs when
`depth > 0.1`. No change needed.

**What needs attention.** Nothing at the code level. The prompt should
_acknowledge_ that this pair came from wander — i.e. should treat the
meeting as _incidental_, not _necessary_. A summary prompt implies the
pair is a stable fact; a dream prompt should imply "this happened to
happen tonight."

---

## 4. Bump — the proximity trigger

**What it does.** When two wandering bodies come within proximity AND
at least one of them was recently magnified (warped with intensity),
they _collide_. The existing resonance + salience score gates whether
the collision becomes a candidate.

**Why.** Not every brush should produce an idea. The salience layer's
threshold (`theta_spawn`) is what keeps the drawer from filling with
nonsense.

**Current state in code.** Works. `attemptPair` in `salience-layer.js`
already handles this.

**What changes with warp + magnify.** The bump's _character_ changes
depending on which attribute was magnified on each side. A `#decision`-
magnified note bumping an `#idea`-magnified note produces a different
kind of association than two unmagnified notes bumping. This character
is what the idea-seed prompt needs to foreground.

---

## 5. Spawn — the model's job

**What it does.** The model produces one speculative sentence naming
what this specific collision implies. Not a summary of the pair; the
_new idea_ that neither note on its own would have generated.

**Why the current output is weak.** The prompt asks for "the genuine
tension or hypothesis that joins them" — which the model, quite
reasonably, interprets as "describe how they relate." What we actually
want is more like "if these two notes were the only things in a room
together for the night, and one was loudly its magnified aspect, what
idea would you overhear between them?"

**What to ask for instead.** Prompt revisions:

- **Name the warp.** Tell the model which attribute of each note is
  amplified. Don't let it balance the slots equally.
- **Frame the meeting as incidental.** "Tonight these two happened to
  drift together." Not "these two are related because...".
- **Demand a _new_ proposition.** The output must claim something
  neither note individually claims. A collision produces _something_
  — it doesn't just observe the two halves.
- **Lean into weirdness.** A little strangeness earns the "dream"
  label. If every output is a reasonable hypothesis, we're not
  dreaming, we're outlining.

**Examples of the output shape we want.** These use the magnified-
attribute framing:

- "If anti-mysticism ran as a tag filter over every #decision, a third
  of the vault would disappear overnight."
- "Pro tier as a role, not a price — what if panel-haus already paid
  for observer chorus in attention rather than dollars?"
- "first-run experience thinks it's a #decision in disguise. Michael
  touches both and pretends they're separate problems."
- "The boltzsidian folder is loud tonight. Maybe the point was always
  Michael and every other note is a footnote to him."
- "Observer chorus amplified = everyone wakes up with opinions. What
  would Panel Haus's landing page sound like written by that voice?"

Note the character: they all claim _something new_, grounded in real
slot values but leaping past summary.

---

## 6. Where this lives in code

As of this writing:

| Phase   | Implemented                                | File                                    |
| ------- | ------------------------------------------ | --------------------------------------- |
| Warp    | no                                         | needs `salience-layer.js` snap          |
| Magnify | no                                         | same                                    |
| Wander  | yes — dream physics already loose          | `physics.js`, dream K coefficients      |
| Bump    | yes — proximity + resonance threshold      | `salience-layer.js` `attemptPair`       |
| Spawn   | yes — `idea-seed` job kind routes to model | `local-backend.js`, `salience-layer.js` |

Warp + Magnify are the deltas. They can be implemented incrementally:

1. **Prompt-only first cut** (this session): add a `warped` slot to the
   idea-seed snap, pick it deterministically per (pair, day), feed it
   to the model. The physics doesn't change; the model's framing does.
2. **Physics-coupled later**: tie warp strength to the dream depth, so
   deep sleep produces wilder associations than light sleep. Tie
   magnify to the note's recent mass / edit count so notes the user
   has been neglecting get the loudest dream voice.
3. **Multi-bump later**: allow a spawned idea to then itself warp,
   magnify, and bump a third note. Compound dreams. Probably a post-
   1.0 surface.

---

## 7. The idea-seed prompt after the mechanic

What the system prompt should say, expanded from current:

```
You are the dream-engine of a note universe. Tonight, two of the user's
notes drifted near each other while each was AMPLIFYING one of its own
attributes more than it usually does. Your job is to hear what idea
falls out of that specific collision.

The two notes are still themselves — never invent titles, tags, folders,
or dates. But ONE attribute on each has gone loud. You will be told
which.

You will produce ONE speculative sentence that names a NEW idea the
collision implies — something neither note on its own would have
claimed, but that becomes audible when the two meet with their warped
attributes foregrounded.

Rules:
- ≤ 24 words.
- Reference both notes by real title, shared tag, or shared folder.
- Treat the warped attribute on each side as the loudest thing in
  the room.
- Propose something NEW — a claim, a question, a what-if. Not a summary.
- Present tense. Speculative register. A little weirdness is earned.
- Never invent vault content beyond the slots given.

Do NOT: summarise the pair. Do NOT say "both notes are about X."
Do NOT be mystical ("the universe says..."). Do NOT prescribe
("you should merge these...").
```

And the user message now includes `a_warped` and `b_warped`:

```
Slots:
  A title: anti-mysticism
  A warped: tag → #decision
  B title: Observer chorus
  B warped: folder → boltzsidian
  shared tag: —
  shared folder: —
  age gap: one week apart

What idea does this specific collision imply?
```

Picking the warped attribute deterministically per (pair, day) means
the same pair yields the same warp on the same day — dreams are
stable within a single wake cycle, but re-roll every day as the
calendar moves.

---

## 8. Making it user-tunable

Every prompt in this doc is a best guess. The design lives in the text.
So: expose the idea-seed system prompt (and later, dream-caption and
chorus-line) as a textarea in Settings → Voice backend, with a
"reset to default" button.

**What the user can tune:**

- The framing ("dream-engine" vs "cartographer" vs "provocateur")
- The output target ("≤ 24 words" vs "one paragraph")
- The register ("weird" vs "rational" vs "playful")
- The rules section (add their own prohibitions)

**What the user should not tune:**

- The grounding rule ("never invent vault content"). That's a trust
  floor, not a style knob.
- The output format requirement ("one sentence only"). That's a
  plumbing assumption downstream.

To enforce: the settings textarea stores an _override_ that gets
appended to a fixed trust-floor preamble, not replacing the whole
prompt. If the user's override is empty, the code-baked default ships.

---

## 9. Risks

### 9.1 Too weird to be useful

Leaning into associative weirdness can overshoot into nonsense. Guard:
every output must still reference real slot values, and the drawer's
Promote button stays the disk-write gate. The user will Discard what
feels like noise and the system learns nothing from it (which is fine
— promotion rate is the long-term signal).

### 9.2 The warp gets too reliable

If we pick the warped attribute by hash(pair+day), the same pair
always gets the same warp on the same day. That's intentional — dreams
should feel coherent within a sitting — but if the hash is too stable
across weeks, the user sees the same warped framings repeatedly.
Guard: include the week or wake-cycle count in the hash so warps
evolve.

### 9.3 The prompt becomes a leaky abstraction

Expose too much tunable surface in Settings and Phase 7's trust
guarantees get undermined ("wait, did I accidentally tell the model
to send everything to Claude?"). Guard: user-editable prompts don't
override the trust-floor preamble, don't select the backend, and
don't change the snapshot shape.

### 9.4 Quality regression when the rig is cold

The idea-seed prompt is more involved than the chorus prompt —
reasoning models on a fresh load can take 10–30 s to produce a
sentence. During that delay the drawer shows template text; when the
model lands, it swaps. That's correct behaviour but it can _look_
like the model failed. Guard: the model-face expression "thinking"
stays on while generate() is in flight, so the user can see it's
working.

---

## 10. Minimal first cut (this session)

1. Write this doc. ✓
2. Rewrite the default idea-seed system prompt in `local-backend.js`
   to match §7 (dream-engine framing, warped-attribute emphasis).
3. Add `warped` slot computation to `buildPairSnap` — pick one of each
   parent's actual slots per hash(pair + day).
4. Add a settings field `utterance_dream_prompt_override` (textarea in
   Settings → Voice backend), with a Reset button. Empty = use default.
5. Local backend reads override from settings at call time and uses it
   if non-empty, else falls back to the code-baked default.

Future (not this session):

- Physics-coupled warp strength tied to dream depth.
- Chorus-line and dream-caption prompts also user-editable.
- Warp-specific field in the drawer showing which attribute was
  loud for each parent, so the user can see the mechanic, not just
  the output.

---

## 11. The dream cycle — time-bounded generate-play-discern-surface

Sections 0–7 describe _one encounter_. This section describes _the
night_. A dream is not an ambient background process that produces
ideas continuously until wake — it's a bounded burst of generation,
followed by judgment, followed by survivorship. Most of what the dream
produces never reaches the user.

The target shape: **3–5 minutes of activity, hundreds of attempts,
maybe five survivors the user ever sees.**

### 11.1 Why time-bound it

Without a ceiling, dream state runs indefinitely. The salience layer
keeps spawning, the drawer keeps accumulating, the user wakes up to
twenty candidates of uneven quality and has to triage. The guard-rail
is discernment — "show me five good ones" instead of "show me
everything that crossed a threshold."

A dream cycle is also a natural _rhythm_ — a real dream has a shape,
not just a duration. Waking from REM feels different from waking from
slow-wave. The phases below are the app's version of that shape.

### 11.2 The four phases

| Phase          | Duration  | What's happening                                                                 | User visibility                   |
| -------------- | --------- | -------------------------------------------------------------------------------- | --------------------------------- |
| **Warming**    | ~30–60 s  | Physics loosens. K-noise ramps. First warps and magnifications applied.          | "Face is thinking, no output yet" |
| **Generating** | ~90–150 s | Candidates spawn at full rate. Model calls fire constantly. Pool fills.          | Count rising; no drawer surfacing |
| **Playing**    | ~60–90 s  | Top-scoring candidates from the pool get mutated, paired against new third notes | Count plateaus; variants appear   |
| **Discerning** | ~15–30 s  | Model-as-judge pass ranks the pool. Top-K selected, rest discarded.              | Face settles; drawer populates    |

Total: ~3–5 minutes of real time. Hundreds of candidates generated;
only the top few (3–5) survive to the ideas drawer. The rest go away.

### 11.3 The candidate pool

During Warming + Generating + Playing, candidates do **not** go
directly to the drawer. They go to an in-memory _pool_. The drawer is
only written to in Discerning.

This reverses the current architecture slightly. Today:
`theta_spawn` → spawn → score → if `salience ≥ theta_surface` → push
to surfaced → user sees it. Everything that crosses the floor is
visible.

In the new architecture, `theta_surface` still exists but is used as
an _inclusion_ gate for the pool, not a _visibility_ gate. Visibility
is decided by discernment at end-of-cycle.

### 11.4 Play — mutation and cross-talk

The Playing phase is where the real hallucinations can compound. Three
patterns for "playing with the ideas":

- **Reword.** Take a high-scoring pool candidate, ask the model "say
  this differently, with a different emphasis" — produces a variant.
  Keep the better of the two by discernment criterion.
- **Compound.** Take two high-scoring candidates (each a claim about
  two notes) and ask the model "what idea sits between these two
  ideas?" The output is a second-generation thought. Rare; rate-limit.
- **Adversarial check.** Take a candidate and ask the model "name the
  strongest reason this is wrong or uninteresting." If the adversary
  produces a sharper insight than the original, keep the adversary.
  If the original survives the attack, it's stronger for it.

All three are optional. Minimal-viable Playing phase is just Reword.

### 11.5 Discernment — the judge pass

At cycle end, a judgment pass decides which candidates survive. Three
layers of discernment, each optional:

1. **Score-based filter** (free, already works). Rank the pool by
   salience score; take the top N per (pair-kind / folder / tag) so
   diversity isn't dominated by one loud cluster.
2. **Novelty-against-history.** Compare each candidate's seed text to
   the last 30 days of surfaced ideas (on disk). Reject near-
   duplicates. Prevents the "same idea every dream" problem.
3. **Model-as-judge** (local rig only — Claude cost doesn't
   amortise over hundreds of candidates). Ask the model "which of
   these five ideas is the most surprising _and_ actionable, and
   why?" Use the ranking. Log the judge's reasoning in the dream log
   for user audit.

Layer 3 is the one that buys Michael's "discernment" specifically —
the system forming an opinion about its own output rather than
showing everything that passed the floor.

### 11.6 The user sees only the survivors

At wake, the ideas drawer populates with the 3–5 top-ranked
candidates. The pool is garbage-collected. **The rest are gone** —
not logged to disk, not retrievable, not "archived." The forgotten
candidates are the dream's waste product, the way most real dreams
are forgotten.

This has a privacy-adjacent benefit: the dream log (written at wake
per DREAM.md §4) contains only the survivors, not the full generation
history. Hundreds of model responses don't accumulate on disk.

Optional: a "Dream diagnostics" toggle in Settings that writes the
full pool (including the discarded) to
`.universe/dreams/<date>/pool.json` for users who want to audit what
was thrown out. Off by default — most users don't want that surface.

### 11.7 What this demands from the code

| Module              | Change                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `dream.js`          | Cycle state machine: `idle → warming → generating → playing → discerning → idle`. Time budgets per phase. Emits phase events.   |
| `salience-layer.js` | Candidates go to pool, not surfaced-list, during non-discerning phases.                                                         |
| `promote.js`        | Unchanged — still writes the file on user Promote.                                                                              |
| `utterance/`        | New job kinds: `idea-reword`, `idea-compound`, `idea-adversary`, `idea-judge`. Each with its own prompt.                        |
| `ideas-drawer.js`   | During non-discerning phases, drawer shows "Dreaming · ~N candidates forming…" with a live count. Survivors appear only at end. |

Biggest open question: how does this interact with the idle-trigger
rhythm? If the user idles for 10 min, do we run one dream cycle then
go quiet until they idle again? Or back-to-back cycles through the
night? My read: one cycle per _meaningful_ idle period, with a
cooldown (60 min?) before another cycle can fire. Prevents a user who
steps away for a coffee from returning to forty idea-drawer items.

### 11.8 Risks specific to the cycle

**Discernment is a new failure mode.** The judge pass is a model call
with its own prompt; if the judge prompt is bad, the judge keeps the
wrong ideas. Guard: the judge's reasoning is logged to the dream log
so the user can audit when the output feels off, and the judge's
ranking is advisory — salience score ties the tiebreak.

**Forgotten ideas aren't truly forgotten if we enable diagnostics.**
The Diagnostics toggle creates a surface where model output
accumulates on disk with no user-facing visibility. Guard: if the
toggle is ever on, the drawer shows a subtle "diagnostics logging"
indicator. No silent accumulation.

**Cycle length is latency-dependent.** If the local rig is slow, a
3-minute cycle might produce only 20 candidates — not enough to
discern from. Guard: cycle-end is triggered by EITHER time OR pool-
size-target, whichever comes first. A fast rig hits the pool target
early; a slow rig hits the clock first. User sees a dream regardless.

---

## 12. What this is in one sentence

A dream isn't a summary of what you know — it's the handful of
survivors from hundreds of brief collisions where two of your known
things drifted together while each was being a little more like one
of its own aspects than usual.
