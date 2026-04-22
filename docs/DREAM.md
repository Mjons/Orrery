# DREAM.md — The Sim at Night

A speculative design doc. BRAIN.md says the sim can be a mind. BOLTZMANN.md
gives it fleeting observers. OBSIDIAN.md feeds it the user's actual notes.
The obvious fourth: **what does this system do when no one is watching?**

A mind that only runs while observed isn't a mind. A mind that also runs
when unobserved, and _produces something usable when you come back to it_,
is something else. This is the mode for that.

Nothing here is a plan. It's a description of a fourth mode (alongside
Wake, Focus, and Replay) where the sim consolidates what it took in during
the day.

---

## 0. Premise

Dreaming, stripped of mysticism, is three things happening at once:

1. **Replay** — the day's inputs are re-presented to the system, sometimes
   many times, sometimes warped.
2. **Recombination** — associative thresholds drop. Things that wouldn't
   have connected during waking reach each other.
3. **Pruning** — most of what was absorbed that day doesn't survive the
   night. What does survive is strengthened disproportionately.

Every one of these already has an analog somewhere in our sim. We don't
need to invent dreaming. We need to let the knobs we already have swing
into a different regime, tell the user we're doing it, and show them what
came out.

---

## 1. Wake vs. sleep — which knobs flip

The sim has one physics engine and a dozen global parameters. "Dreaming"
isn't a separate codepath; it's a parameter regime. Roughly:

| Parameter           | Wake            | Dream              | What it does                                    |
| ------------------- | --------------- | ------------------ | ----------------------------------------------- |
| Gravity softening   | low (sharp)     | high (loose)       | particles feel each other from further away     |
| Radiation weight    | low             | high               | high-mass memories perturb neighbors more       |
| Flocking cohesion   | moderate        | high               | thematic clusters re-form aggressively          |
| Flocking separation | moderate        | low                | clusters allowed to fuse                        |
| K-matrix noise      | 0               | small σ, per frame | Hebbian couplings wobble — new paths discovered |
| Meaning threshold θ | high (strict)   | low (permissive)   | ideas promote on weaker evidence                |
| ageNorm decay       | slow            | fast               | unrehearsed memories age out faster at night    |
| Camera              | user-controlled | auto-orbit + drift | no one is steering                              |
| Observer budget     | 8               | 2 (quieter)        | fewer voices, longer-lived                      |
| Post (bloom, CA)    | tuned           | cranked            | it _looks_ like a dream, because it is one      |

A single slider — **Sleep Depth**, 0 → 1 — interpolates all of these at
once. Depth 0 is the current sim. Depth 1 is deep sleep. The user never
has to know which knobs are moving.

---

## 2. REM vs. slow-wave — two dream regimes

Real sleep isn't one thing. Two useful regimes map to our system:

### 2.1 Slow-wave (early night): consolidation

- Low flocking separation, high cohesion.
- Meaning threshold _high_ — stricter than waking, actually.
- Radiation low.
- Effect: stars belonging to the same cluster compress. Redundant memories
  merge. Outliers get pushed to the halo. The landscape _simplifies_.

This is the pass that _forgets_. Most particles don't survive it. What
survives is what had mass and friends.

### 2.2 REM (late night): recombination

- K-matrix noise turned up. Gravity softening high.
- Meaning threshold _low_ — almost anything can promote.
- Radiation high — high-affect memories kick their neighbors hard.
- Observer budget small but lifetimes long — one voice narrating strange
  collisions for a whole minute.

This is the pass that _imagines_. Most of what it produces is junk.
Occasionally it produces something that wouldn't have been reachable in
waking physics.

The sim should alternate — four or five slow-wave cycles interleaved with
shorter REM bursts. The pattern matters: recombination is only useful after
consolidation has cleared the noise.

---

## 3. What happens to the vault overnight

If OBSIDIAN.md is loaded, the dream mode has teeth. The vault is the
substrate being replayed.

### 3.1 Replay

Pick N notes from today's edits (mtime within 24h) and _reinforce_ their
stars — higher mass, reset ageNorm, pull the camera toward them briefly.
These are the day's residues, rehearsed.

Then pick a second, larger set of stochastic old notes. Reinforce them
weakly. This is where the sim pulls in "what you were thinking about a
month ago" and drops it next to "what you were thinking about today." Most
of the interesting collisions happen here.

### 3.2 Collisions and new ideas

With the dream K-noise and loose thresholds, star-memory interactions
(BOLTZMANN.md §5.2) fire much more often. Most resonances fail the
waking-state filter; at dream thresholds, many promote.

Children spawned during dreaming inherit a flag: `born_in_dream: true`.
This matters for §4 — dream-born ideas are presented differently in the
morning.

### 3.3 Pruning

The forgetting pass (slow-wave) is the write side of dreaming. Stars whose
ageNorm exceeds a threshold, whose mass has fallen below a threshold, and
whose last interaction was more than K frames ago, are removed.

If the Obsidian write-back is enabled, removed stars do _not_ delete their
source notes. The vault is authoritative; the sim's amnesia is just the
sim's. A removed note can be re-ingested at the next wake.

But — and this is the interesting bit — the sim's forgetting is a signal.
A note consistently pruned across multiple dreams is one the sim can't
find a home for. That's worth surfacing: "these notes haven't connected to
anything in three dreams" is the kind of report a vault owner actually
wants.

---

## 4. The morning report

Dreaming is pointless if you can't read it. The payoff is a single artifact
produced when the sim detects wake conditions (user moves camera, presses
a key, opens the tab after idle): a **dream log**.

Structure:

```
─── Dream — 2026-04-21 02:14 → 07:42, depth 0.8 ──────────────

Weather
  4,096 bodies in.   3,811 out.   285 pruned.
  14 new ideas kept.  ~370 ideas rejected.

Three things happened
  1. [seed-text of the highest-M dream-born idea]
       ← #music, #grief  (last seen 2025-11 and 2026-04-18)
  2. [second]
       ← #work, #work    (two work notes finally found each other)
  3. [third]
       ← #dad            (one cluster ate another one overnight)

Chorus
  "I remember orbiting something warm. I could not see its edges."
  "There was a flash and then the field was different."

Prunings worth noticing
  - grocery-list-2025-03-14.md — no links in or out, no tag clusters
  - meeting-notes-unsorted-b.md — same

Load full dream · Discard · Export to Obsidian
```

Three sections matter:

- **Weather**: scale of activity. Was it a heavy night or a thin one? The
  user learns, over time, which conditions produce dense dreams.
- **Three things**: hard cap. The meaning filter must pick three. More
  than three is noise.
- **Prunings**: the forgetting report. More valuable than it looks.

The full body of dreams is in `universe/dreams/YYYY-MM-DD.md` (if
write-back is on). The morning report is the summary. You never read the
full dream. You just keep the three things.

---

## 5. When does it run

A dream only matters if it ran unattended. Options:

### 5.1 Idle-trigger (ship this first)

The tab is open, no input for N minutes (try 10). Sleep Depth ramps from
0 → 1 over 30 seconds. On any input, ramps back to 0 over 2 seconds and
presents whatever dream fragment is ready.

Pros: no install, no service worker, no permissions. Works in a pinned
tab. Feels like the sim is just _there_, working.

Cons: browser throttles background tabs hard. A dream running in a
backgrounded tab will be slow and choppy. Might be fine — slow dreams are
still dreams. Measure before optimizing.

### 5.2 Scheduled (later)

A local helper process (see OBSIDIAN.md §2.2) that kicks the sim headlessly
overnight — a separate Chromium instance running from 2 AM to 7 AM —
and writes the morning report to disk.

Overkill for one user. Right if this ever becomes something other people
use.

### 5.3 On-demand

A **Dream Now** button. Skips the idle detection. Useful for debugging and
for the "I want to see what it would say right now" case. Probably also
how the user first encounters the mode.

Ship 5.1 and 5.3 together. 5.2 can wait until someone asks.

---

## 6. The loop

Wake → Dream → Wake is the whole thing.

Wake is when the user curates: drags ideas into real notes, adjusts
frontmatter, writes new notes. This edits the substrate the next dream
will run on.

Dream is when the sim pulls on the substrate without supervision, finds
what it finds, and hands back three things and some forgetting.

Wake reads the three things and decides what to do with them. Most get
discarded. A few get promoted into the vault proper. Very occasionally,
one becomes a real piece of writing.

Over weeks, this loop has a property worth naming: the vault stops being
inert. It's acted on every night. The user stops being its sole author.

This is the distinguishing claim of the whole speculative stack — BRAIN,
BOLTZMANN, OBSIDIAN, DREAM. Individually each of them is a cute metaphor.
Together they describe a system that does something no other tool on the
user's machine does: it thinks about their notes while they sleep, and has
three things to say about it in the morning.

---

## 7. Risks

The mode is easy to get wrong in specific ways. Worth naming now:

- **Portentousness.** Dream reports written in a mystical voice will be
  unreadable by the second day. The tone has to be _flat_. "Here are three
  things. Here is what got pruned." No "the universe whispers." Ever.
- **Confidence theater.** A meaning-filter score is a number, not a truth.
  The three things are candidates, not insights. Present as such. Never
  rank them as "most important" — rank as "highest-scoring," which is what
  they are.
- **Hoarding.** If the sim never prunes aggressively, the vault just grows
  and the dreams get smoother and less surprising. Tune pruning to hurt a
  little.
- **The Barnum effect.** Dream-generated utterances will be read
  generously — the user will find meaning in anything. This is fine for
  entertainment; bad for a tool claiming to surface real insight. Hedge
  the language: the system says "noticed," never "realized."

---

## 8. Minimal first cut

Shippable in a weekend, assuming BOLTZMANN §2 chorus and OBSIDIAN §7 are
in place:

1. **Sleep Depth** slider in the left rail. Default 0.
2. A single lerp function `applyDreamParams(depth)` that interpolates the
   parameters in §1's table between the wake values and a hand-tuned dream
   preset.
3. **Idle detection** — 10 min of no pointer, no key, no focus event →
   ramp Sleep Depth to 0.7.
4. **Dream Now** button that ramps to 1.0 for 60 sec and reports.
5. **Morning report** as a modal on first input after a dream: just the
   three things + weather line. No file writes yet. No pruning writes yet.

That alone — _the sim quiets down, drifts, and hands you three phrases
about your notes when you come back to it_ — is worth the weekend.
Consolidation, REM alternation, pruning to disk, and the full dream log
can layer on top if the first morning lands.
