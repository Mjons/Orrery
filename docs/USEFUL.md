---
tended_on: [tag-infer]
created: "2026-04-22T00:00:00.000Z"
---

# USEFUL.md — Earning daily use

A thinking doc, not a spec. The other docs answer "what does Boltzsidian
_do_?" This one answers a harder question: **why would someone open it on
day 30?**

A pretty thing gets opened twice. A useful thing gets opened every day. The
universe sim is already pretty. Boltzsidian's bet is that the sim, pointed
at someone's notes, becomes the first thing they open in the morning. That
bet is unproved.

This doc names the gap, sketches what closing it looks like, and lists the
things to _not_ mistake for utility.

---

## 1. The honest version of the thesis

[WORKSPACE.md](WORKSPACE.md) §1 says the differentiator is: _the tool does
work while the user isn't looking, and has something useful to show them in
the morning._ That sentence is doing a lot of work. Two halves:

- **"Does work while the user isn't looking."** Solved on the engineering
  side — the sim runs, [DREAM.md](DREAM.md) replays, [BOLTZMANN.md](BOLTZMANN.md)
  scores. The substrate exists.
- **"Something useful."** Unsolved. _Useful to whom, for what, on which
  morning?_ The dream layer can produce a hundred associations a night. The
  meaning filter can rank them. Neither of those is utility. Utility is
  whether a person, having read the morning report, did anything different
  with their day.

Day-30 retention is the only honest measure. Everything below is in service
of it.

---

## 2. What "useful" actually means here

The product is a note app. A note app is useful when it reduces the cost of
three things:

1. **Capture.** Getting a thought out of your head into a place where future-
   you can find it.
2. **Recovery.** Future-you actually finding it, fast, when you need it.
3. **Synthesis.** Connecting two things you already wrote into something you
   hadn't yet thought.

Obsidian, Notion, Apple Notes, plain text files — they all do (1) well
enough. (2) is contested but solved-ish (search exists). **(3) is where every
note app is bad and where Boltzsidian has a real chance.** A graph view is
the existing industry's gesture at synthesis; nobody opens the graph view
twice.

The universe is the graph view, but with three superpowers:

- **It moves.** Bodies cluster, drift, get pulled by recent edits. Spatial
  change _over time_ surfaces structure that a static graph hides.
- **It runs while you sleep.** Synthesis happens off the clock. The user
  doesn't have to be in synthesis-mode to get synthesis.
- **It hands you a small number.** Not "here are 1,200 nodes," but "here are
  three things the field noticed about your notes overnight." A morning
  report you can read in 30 seconds.

If we ship those three and they don't make day 30, the thesis is wrong.

---

## 3. Six specific moments to design for

A morning report and a particle field are abstractions. The product is the
specific moments. If we can make these six feel inevitable, the rest
follows.

### 3.1 The first cup of coffee

User opens the laptop. App is already running (it ran overnight). The
scene shows where the camera was when they closed it. The bell in the top-
right has a dot. They click it. A drawer slides in with **three things**:

- _"You've written about `attention` four times this month and never linked
  any of them to your `meditation` notes."_
- _"This morning's daily note is unusually close in space to a 6-month-old
  draft titled `the boredom budget`. Worth re-reading?"_
- _"Three orphan notes from last week have nothing connecting them. They
  all mention `Friday`. Want to sweep them into a single thread?"_

Each is one sentence. Each ends in a verb. Each is dismissible in one
keystroke. **None of them is "here's a graph."**

Test: would a person who writes for a living tolerate this every morning,
or find it twee after a week? If twee, the bar for what counts as "noticed"
is too low. The filter has to be ruthlessly conservative — silence on
mornings when nothing surprised the field is correct behavior.

### 3.2 The mid-thought capture

User is in a meeting. Cmd+N (or even better, a global hotkey from outside
the app). A small panel appears. They type three lines. Esc. Back to the
meeting.

The panel had **no friction.** No title required (auto-extracted from
first line). No tag picker. No "where to file it." It went into the
universe with no kind yet — a colorless body that will get tagged later
or by the auto-tag pass.

Test: if capture takes more than 3 seconds end-to-end, we lose to Apple
Notes and the product is dead. Measure this with a stopwatch. Not "feels
fast." Stopwatch.

### 3.3 The "wait, didn't I write something about this" recovery

User is reading something on the web that reminds them of a note from
months ago. They Cmd+K, type two words, get five glowing stars in space
(not a list). They recognize the right one by _position_ and _neighbors_ —
"oh right, the one near the cluster of cooking notes."

This is the moment that rewards spatial memory. If users don't _develop_
spatial memory of their own vault over time, the universe is decoration.
The test for whether spatial memory is real: can a long-time user, with
their eyes closed, point to where their `parenting` notes live relative to
their `work` notes?

If yes: the spatial layout is doing real work. If no: we have a graph view
in 3D, and a graph view in 3D is still a graph view.

### 3.4 The link that surprises

User option-drags from one body to another to make a link. Both bodies
glow. They get a brief pull toward each other. The act of linking is
_physical_ — they felt it in their hand and saw it in the field.

Then, three days later, those two bodies are noticeably closer in the
default camera view. The link did something visible _over time_. The user
notices. They didn't have to.

This is the cheap version of "the universe thinks." It's not magic — it's
the K matrix doing Hebbian updates ([OBSIDIAN.md](OBSIDIAN.md) §3.2) — but
to the user it feels like the field remembered. That feeling is the
product.

### 3.5 The unlinked second note

User writes their second note ever. The first was about a book. The second
is about a conversation. The system points out: _"this note shares three
words and a tag with [first note]. Link them?"_ One keystroke.

Onboarding hinges on this moment. If the user's second note is alone in
space, the demo is broken. If it gets linked, the user has just experienced
the entire thesis in 90 seconds: _"the field saw something I hadn't."_

The demo vault ([BUILD_PLAN.md](BUILD_PLAN.md) Phase 3.5) is critical
because it lets us trigger §3.1 on day one without waiting for the user to
have a vault.

### 3.6 The closing of the loop

User reads a morning-report suggestion. They act on it — open the two
notes, decide one of them is wrong, edit it, link the right one. **The
field updates.** Their action becomes new gravity for tomorrow's dream
pass.

If the morning report is read-only — "here are three things, ok bye" — the
loop never closes and the product is a notification. The report has to be
_the entry point_ into editing, with one click each. Acted-on suggestions
weigh more in the next dream pass; ignored ones decay.

---

## 4. Anti-patterns: things to not mistake for utility

These are the failure modes specific to a product like this. Each is
seductive because it looks like work.

- **More palettes, more channels, more bloom.** Aesthetic polish at the
  expense of the loop in §3. The sim already looks great. Don't ship a
  third post-process before shipping the bell in §3.1.
- **A graph view fallback panel.** "In case the universe is too weird,
  here's a list." Putting it in is putting one foot out the door. Ship
  without it. If users genuinely can't function without one, that's a
  different kind of feedback than "it would be nice if."
- **Importing every Obsidian feature.** Plugins, themes, daily-note
  templates, kanbans, Dataview. Each one is a request to be exactly the
  thing Obsidian already is. We are explicitly not.
- **Configurability as a substitute for a default.** Twenty settings for
  the dream layer means we don't know what good looks like and are passing
  the buck. One opinionated default, then ship.
- **AI everywhere.** The Claude utterance path ([WORKSPACE.md](WORKSPACE.md))
  is opt-in for a reason. A chatbot that generates the morning report from
  a prompt is _not_ what we're building. The field is the model. The
  morning report is the field's output, not an LLM's.
- **Telemetry-driven design.** We don't have any. Day-30 retention will be
  measured by asking ten people to use it for thirty days, not by dashboards.

---

## 5. The day-30 test

Every feature, before being built, gets asked one question: **does a user
on day 30 use this regularly, or only on day 1?**

Day-1 features (onboarding tour, splash screen, demo vault tour) are
allowed but they are _day-1 features_. Don't confuse them with the product.

Day-30 features:

- The morning bell with three things. (§3.1)
- Frictionless capture. (§3.2)
- Spatial recovery via Cmd+K. (§3.3)
- The closing-loop edit. (§3.6)

Day-1 features:

- The demo vault.
- The hotkey overlay.
- The settings pane.
- The "what is this?" splash.

If we are spending more than 20% of build time on day-1 features after
Phase 3.5, the bet is unfocused. Re-read this section.

---

## 6. The cheaper version of usefulness

Worst case: the dream layer is too speculative to ship well, the meaning
filter outputs noise, and the morning report is twee. What's left?

A note app where:

- Notes are stars in a real-time field. (§3.3, §3.4 still work.)
- Capture is the fastest in the industry. (§3.2 still works.)
- The graph isn't a separate view — it's _always on_, always animated,
  ambient.
- Links have weight you can feel.

That alone is differentiated. It would not justify "the workspace is the
universe" the way the dream loop does, but it would still be a real
product worth shipping. **This is the floor.** If everything speculative
fails, this is what we ship as 1.0 and call it Boltzsidian Lite.

Knowing the floor matters because it tells us when to _not_ keep digging
on the speculative layers. If the floor product is shippable at the end of
Phase 3, and the dream loop isn't producing useful output by Phase 5, we
ship the floor and revisit dreams in 1.1. Don't hold a real product hostage
to a speculative one.

---

## 7. Open questions

These are the things this doc can't answer alone. Each needs the product in
hands, not more thinking.

- **How conservative should the morning filter be?** Three items per
  morning is the guess. It might be one. It might be zero on most days. We
  won't know until we live with it.
- **Does spatial memory actually develop?** §3.3 assumes it does. If after
  a month users still navigate by Cmd+K and never by panning the camera,
  the spatial bet is wrong and we're a search-driven app with a fancy
  background.
- **Is option-drag-to-link discoverable?** It's the most physically
  satisfying interaction in the spec ([WORKSPACE.md](WORKSPACE.md) §2.3),
  and the most easily missed. The onboarding demo has to teach it within
  the first 60 seconds or it stays unused.
- **Will the loop actually close?** §3.6 is a prediction. If users read the
  morning report and never act on it, the dream layer is decoration and
  the meaning layer is editorializing. Watch this hard.

---

## 8. The single sentence

If this whole doc collapsed into one sentence:

> **A note in Boltzsidian feels like it weighs something, and the weight
> does work for you while you sleep.**

If on day 30 a user can describe the product that way without prompting,
we won. If they describe it as "a 3D graph view," we lost regardless of
how good it looks.

#feature #user #phase
