# STATES.md — What the Universe Does Besides Sleep

A speculative design doc. DREAM.md introduced the idea that "dreaming"
isn't a separate codepath — it's a parameter regime applied to one
physics engine. This doc takes that further: the universe has **several
operational states**, each a different regime, each appropriate for a
different kind of vault work.

Wake is the user writing. Dream is the universe rearranging. Those two
are already shipped. But there's a class of tasks in between that
neither fits — the _tedious structural work_ of tagging a newly
imported folder, finding the three pairs that obviously should be
linked, noticing that two notes are probably the same idea under
different titles.

Call that work **tending**. This doc names it and sketches two or three
other states that live in the same neighbourhood.

---

## 0. Premise

A state is:

- **a parameter regime** — the physics, chorus cadence, scoring
  thresholds, and UI mode are all tuned to one specific kind of work
- **an optional user confirmation surface** — many states produce
  candidate actions rather than taking them (consistent with
  SALIENCE.md §8.3)
- **a transition in/out** — clear entry trigger, clear exit artefact

The app already has two: **wake** (live editing) and **dream**
(idle/manual cycle, parameter-softened, salience produces candidates).
The states below would compose from the same primitives.

Nothing here is a plan. It's the space of reasonable extensions if the
dream loop lands and the user wants the universe to do _more_ work
unattended.

---

## 1. States already in flight (recap)

| State | Trigger                 | What the engine does                             | Artefact                      |
| ----- | ----------------------- | ------------------------------------------------ | ----------------------------- |
| Wake  | User input in last ~10m | Normal physics, chorus, gestures, panel editor   | Your notes                    |
| Dream | Idle or Shift+D         | Soft physics, slow chorus, salience spawns ideas | Morning report + ideas drawer |

Also named but not built: **focus** (DREAM.md §0 mention) and **replay**
(DREAM.md §0 mention). Those are referenced below and in §5/§6.

---

## 2. Tend — the structural-work state

The state the user asked about. Invoked when the vault is messy in
specific, structural ways — freshly imported notes with no tags, a new
cluster sitting in isolation, a folder full of orphans that never got
linked.

Tend is not dream. Dream looks for _salient_ connections; tend looks for
_obvious_ ones. The two are complementary — dream is creative, tend is
janitorial.

### 2.1 What Tend does

Five passes, any subset can be enabled, none write without confirmation:

1. **Tag inference.** For each untagged note, scan the body for
   phrases that overlap with existing tag vocabulary. A body containing
   "character" and "panel" and "webtoon" in a vault where #character /
   #panel / #webtoon all exist on other notes → propose those three
   tags. Never invents new tags.
2. **Obvious-link detection.** For each pair of notes, compute an
   `obviousness` score: `title-mention + shared-tag-count +
affinity-similarity + folder-proximity`. Above a high threshold
   (this is _obvious_, not _interesting_), propose a link.
3. **Title-collision resolution.** If two notes have near-identical
   titles (case-insensitive, whitespace-normalised, ≥90% similarity),
   flag a likely duplicate. Don't merge — just surface.
4. **Frontmatter normalisation.** If a note is missing `id`, `created`,
   or conflicts with another note's `id`, surface it. (The saver in
   Phase 2 already maintains this on edit, but imported folders
   haven't been edited.)
5. **Stub detection.** Notes whose body is under 30 words and whose
   title is a common noun ("Meeting", "Idea", "Notes") — flag for the
   user to either flesh out or discard.

All five produce suggestions, not actions. A tend run finishes with a
**proposals drawer** — similar to the ideas drawer from Phase 6 but
each row shows a concrete diff (add these tags, add this link, delete
this duplicate) that the user accepts or rejects.

### 2.2 When Tend runs

Three modes:

- **Manual.** Settings → Workspace → "Run Tend now." One-shot scan,
  proposals drawer opens when complete. For the user who just imported
  a folder and wants to sit there and accept/reject 40 suggestions.
- **During dream.** At `depth > 0.3`, the dream loop also runs tend
  passes in the background. Tend proposals ride into the morning
  report alongside salience candidates in a "housekeeping" section.
- **Watchful.** A vault-open hook: if >30% of notes are untagged or
  > 20% are unlinked, offer a soft-toast suggesting a tend run.
  > Dismissable.

### 2.3 Why it's a separate state and not just a dream pass

Dream mode's discipline is "candidates, not conclusions" — its scoring
model is explicitly about _unexpected_ connections. Tend's discipline
is the opposite: **find the things any human would spot in 30 seconds
and save them the labour.** If tend lived inside dream, the user
looking at the morning report couldn't tell whether "add #person to
this note" was surprising insight or obvious bookkeeping — and that
distinction matters for how seriously to read it.

---

## 3. Weed — the forgetting state

DREAM.md §7 calls out hoarding as a risk: if nothing ever gets
aggressively pruned, the vault grows and the dreams get bland. Phase 5
already writes prune candidates to `.universe/prune-candidates.json`,
but nothing nudges the user to act on them.

**Weed** is the state that runs the prune list. Triggered weekly (or
manually), it shows a stripped-down drawer:

- Each prune-candidate note: title, path, last-edited, "no links in or
  out, untouched for N weeks."
- Actions per row: **Keep** (never suggest this one again), **Archive**
  (move to `.universe/archive/YYYY/`), **Delete** (permanent).
- Bulk action bar at the top: "Keep all" / "Archive all remaining."

Weed is quiet and slightly uncomfortable by design. No animation, no
glass, just a list. The point is the user getting rid of things they
don't care about, which only works if the UX doesn't gild the act.

Weed composes with tend: a tend run might surface stub notes, and the
user declines to flesh them out — those stubs become weed candidates on
the next weekly pass.

---

## 4. Brief — the impatient morning report

Not every morning has a dream. If the user is opening the app on a
fresh session with no overnight cycle to replay, the morning report is
canned-template content (which is fine — SALIENCE.md lands in time) or
empty.

**Brief** is the state that runs when you open the app and have 90
seconds. It produces a quick snapshot:

- 3 heaviest notes in the vault this week
- 3 protostars (newest) — what you've been writing
- 1 halo note (quietest) — what you might have forgotten
- 1 bridge (cross-cluster pair) — one thing from tend's obvious-link
  pass, presented as a gentle nudge
- No chorus, no physics softening, no disk writes

Brief is explicitly not a dream. No "born in a dream" frontmatter, no
salience scoring, just a panel that says "here's your vault in a
sentence before you get to work." Dismissable with one keystroke.

This is the state that answers: _"I just opened my laptop. Show me
where I am."_

---

## 5. Echo — the replay state

DREAM.md §0 promised this; never built. **Echo** replays a writing
session — the last hour, the last day, the last commit — as an animated
replay in the universe. Shows:

- Which notes got edits, in chronological order
- Which links got created, as tethers lighting up
- Which notes got their mass bumped by inbound links

It's nostalgic and slightly showy — and load-bearing for a specific
case: **proving to the user that the dream didn't silently change
anything.** After a confusing dream, Echo their wake session — "here's
what you did." After a confusing wake session, Echo the dream — "here's
what the universe did, in sequence."

Minimal Echo is a timeline slider at the bottom of the canvas that
scrubs through yesterday's events.

---

## 6. The state machine (if we built all of them)

```
                        ┌───────────┐
                        │   Wake    │
                        │ (default) │
                        └────┬──────┘
         ┌───────────┬──────┼───────┬───────────┐
         ▼           ▼      ▼       ▼           ▼
     ┌───────┐  ┌────────┐ ┌─────┐ ┌──────┐ ┌────────┐
     │ Tend  │  │ Dream  │ │Echo │ │ Weed │ │ Brief  │
     │manual │  │  idle  │ │     │ │weekly│ │on open │
     │       │  │ ShiftD │ │     │ │  ~   │ │        │
     └───┬───┘  └───┬────┘ └──┬──┘ └──┬───┘ └───┬────┘
         │          │         │       │         │
         └──────────┴─────────┴───────┴─────────┘
                         ▼
                   ┌────────────┐
                   │  Proposals │
                   │   drawer   │
                   │ (accept or │
                   │   reject)  │
                   └─────┬──────┘
                         ▼
                     Back to Wake
```

Every non-wake state ends in a drawer. Every drawer ends with an
accept/reject decision. Nothing destructive happens without confirmation
(Weed is the one partial exception — archive is reversible, delete
isn't, and delete needs explicit opt-in per file).

---

## 7. Risks

### 7.1 Mode-menu fatigue

The fastest way to make this unusable is a menu with six mode buttons.
Users don't want to pick states. They want the right work to happen
when it's obvious, and the option to trigger the others when they
specifically want them.

Guard: **at most two states visible in UI** at any time — whichever one
is currently running and the next one the system would suggest. The
rest are manual-trigger via a command palette (Cmd+Shift+P kind of
thing, Phase 6 already proposes one for salience params).

### 7.2 Tend becoming a helpful-robot trap

Tend's value depends on its suggestions being _obvious_. If the bar is
too low, every tend run is 40 rejections, and the state gets
ignored. Tune thresholds to propose roughly 3–10 suggestions per 50
notes — enough to feel useful, little enough to review in a coffee
break.

Same hard gate as SALIENCE.md: if Michael runs tend once on his real
vault and rejects every suggestion, something is wrong with the scoring
function, not with the number of suggestions.

### 7.3 State-overlap confusion

If tend and dream both run during an idle period, and both have
proposals in the morning drawer, the user needs to know which one
surfaced each item. Different drawer sections, different badge colors,
no mixing.

### 7.4 The "always tending" antipattern

Some tools (Grammarly, Copilot auto-accept) have normalised constant
background suggestions. That works for some people and is unbearable
for others. **Tend must be opt-in for background operation.** Manual
is default. The "during dream" mode is behind a settings toggle the
user explicitly enables, and the watchful prompt is a soft-toast, not
a modal.

---

## 8. Ship order (if we keep going after Phase 7)

Post-1.0, if the foundation earns it:

1. **Tend (manual only)** — smallest addition, immediate value after
   an import. The title-collision + obvious-link passes alone would be
   worth the phase. Maybe 1 week.
2. **Weed** — cheap on top of Phase 5's prune candidates. A week.
3. **Brief** — trivial, more of a copy exercise than engineering. Days.
4. **Tend (during dream)** — folds tend passes into the dream loop.
   Requires careful UX to keep the morning report readable. A week.
5. **Echo** — ambitious visually, requires an events log + timeline
   scrubber. Worth it for the "did the dream change things silently?"
   question. A week or two.

Likely order of real usefulness: Tend manual > Brief > Weed > Echo >
Tend-in-dream. The last one is a luxury that only matters if the
first four already feel right.

---

## 9. What ties this together

The underlying claim of the speculative stack (BRAIN, BOLTZMANN,
OBSIDIAN, DREAM, SALIENCE) is that the vault is an active system, not
just a store. A vault that _only_ dreams while you're away is a limited
version of that claim. A vault that also tends (quietly cleans), weeds
(quietly forgets), briefs (quickly orients), and echoes (faithfully
remembers) is closer to the promise.

Five states, one engine, one user deciding. **Wake** is where the user
is. **Dream, Tend, Weed, Brief, Echo** are the places the vault goes
when the user isn't — each one named for what it _does_, none of them
claiming to know what you mean.

> The universe has a small number of jobs. Making it look busy is
> easy; making it useful is the whole project.
