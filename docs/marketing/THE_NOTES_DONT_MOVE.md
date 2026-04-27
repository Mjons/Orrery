# The Notes Don't Move

_Or: I have 47 markdown files in my docs/ folder and I cannot tell you
which ones are real._

---

There's a folder in my repo I've stopped opening.

It's called `docs/`. It has 47 markdown files. About a third of them
describe features I've shipped. About a third describe features I'm
actively building. About a third describe features I planned, didn't
build, and haven't deleted because I'm not 100% sure I won't want them
later.

I cannot tell you, sitting here, which third any given file is in.

---

## The pile

It starts the way it always starts. You're vibe-coding. You ask the
model for a feature. It — being thorough — proposes a doc. You write
`FEATURE_AUTH.md`. It's good. It captures the plan. You build half of
the feature. You change direction. You write `FEATURE_AUTH_V2.md`.
Then `OAUTH.md` branches off it. Then you have a great idea for
`SESSIONS.md` that kind of subsumes both. You write that one too.

By month two you have thirty .md files and you cannot remember which
ones describe code that exists.

That's not a knock on the workflow. The workflow is the future.
AI-assisted coding generates docs the way bread makes crumbs —
copiously, casually, half of them on the floor. The problem isn't that
you're producing too many. The problem is that you have no way to tell
which ones are alive.

You search for a decision you know you wrote down. Forty hits. A few
contradicting each other. A couple from a direction you abandoned. Two
named almost the same thing because past-you and the model disagreed on
what to call it. You find the right one eventually. Not by remembering
where it is. By remembering which week you must have written it.

That is not retrieval. That is excavation.

---

## What Obsidian got right

Obsidian got the substrate right. Nobody's arguing with markdown in a
folder with `[[wikilinks]]`. Future-proof, portable, vendor-neutral,
grep-able, MIT-able, agent-readable. The format has won. You should use
it. You should keep using it.

The format is not the problem.

The interface is.

A file tree is what you build when you don't know what else to do. A
graph view is a museum: you can walk around it, but nothing in it
changes when you look away. Search rewards exact recall — and exact
recall is the thing that broke the moment you started shipping faster
than you could file.

Obsidian was designed for personal knowledge — slow, deliberate,
hand-curated. What you have isn't personal knowledge. It's _build
artifacts._ Half-finished specs. Abandoned roadmaps. Messaging drafts.
Architecture decisions you might revisit. RFCs that became code. RFCs
that didn't. The third draft of the PRD nobody including you has read.

The failure modes are different. With personal notes you read once and
they sit. With build artifacts you keep checking back — _is this one
current? did I implement it? did I change my mind? is the part I
changed my mind about still in this file or did it move to a v2?_

Tags don't save you. Everything is tagged `#feature`. Folders don't
save you. You're moving too fast to file. We need new tools for what
the format has become — not for the writers who built vaults in 2018,
but for the operators who are spawning .md files at three an hour in 2026.

---

## What I actually wanted

I tried the obvious things first. I collapsed everything into one
`BUILD_PLAN.md`. Too long, immediately stale. I split it back out into
per-feature docs. Couldn't tell them apart. I tried Notion. Tried
Linear. Tried a single `STATUS.md` at the root, updated by hand. Tried
a single `STATUS.md` updated by the model. Tried emoji conventions.
Tried prefixing files with `[DONE]` / `[WIP]` / `[IDEA]` and renaming
them when state changed.

That last one almost worked. Then I shipped a feature and forgot to
rename the doc.

None of it stuck, because none of it touched the actual problem, which
was this:

**My docs were dead between sessions.**

I would write a plan. I would build half of it. The plan didn't update.
I would write another plan. The first plan didn't get archived. I'd
come back two weeks later and they both looked equally alive in the
file tree.

Every other tool in my stack was doing something while I wasn't
looking. The compiler was watching files. The linter was nagging. The
agent I was coding with was indexing my repo the moment I opened the
project. My `docs/` folder — the place where the _plan_ of the work
lived — was the only inert thing in the loop.

That was the friction. Not search speed. Not folder discipline. Not my
taste in filenames.

The notes don't move.

---

## So I built one where they do

**Boltzsidian** is a local-first markdown editor whose workspace is a
real-time GPU-accelerated particle universe. Every doc is a star. The
folder on disk is the same plain markdown your repo already has. You
can open it in Obsidian, or `cat` it, or feed it to a coding agent —
it's just files.

But while Boltzsidian is open, your docs are bodies in a field. They
have mass — heavier when more docs reference them, heavier when you've
written more in them. They cluster by tag. They drift toward the halo
when you stop touching them. They glow when you open them.

When you write a `[[FEATURE_AUTH]]` link in another doc, two stars find
each other. There's a small spring pull, a brief resonance, then they
settle into orbit. You can _feel_ the dependency, not just see it.

When you search, the universe doesn't show you a list. It glows the
matches and arcs the camera to the brightest one — which is usually
the one you wrote last week and have already forgotten the title of.

When you open a doc, you don't lose its neighborhood. Every spec it's
gravitationally close to — its callers, its callees, its near-twins —
is right there at the edges of the panel. You see the shape of the
feature, not just one file.

This is not a visualization of a docs folder.

The universe **is** the docs folder.

---

## The part nobody else is building

Here's the part I care about.

When you close the laptop, the universe doesn't stop. It dreams.

While you're away, the physics regime changes. Gravity softens.
Thresholds drop. Old docs you haven't opened in months drift back
toward your recent ones. Some collide. Most of those collisions are
noise. A few of them resonate, and the universe writes the resonance
down.

In the morning, before coffee, you open the laptop and the universe
has three things to tell you about your own docs.

Not a chatbot. There is no text box. You are not asking it questions.

It noticed something. It is showing you what it noticed. Three things,
hard cap. Plus a weather report — what got pruned, what got
reinforced, which docs nothing has linked to in three nights.

The three things tend to look like:

- _"`FEATURE_AUTH` and `FEATURE_OAUTH` have been circling each other
  for two weeks. No doc references both. Possibly the same feature."_
- _"`BUILD_PLAN` says you'll ship `STREAMING` next. Nothing in the
  repo references `STREAMING`. The plan may have drifted."_
- _"`ARCH_DECISION_3` and `ARCH_DECISION_7` describe contradictory
  routing layers. The newer one is older."_

Some mornings the three things are nothing. You discard them.

Some mornings one of them is the conflict you'd been coding around
without naming. Those, you fix, and the doc gets archived.

Over months, this loop has a property I cannot stop talking about:
**your docs folder stops being inert.** Someone is acting on it every
night. You are no longer the only one keeping it honest.

---

## Handing someone a feature

The other thing I wanted — and didn't realize I wanted until I had it
— is the ability to lift a region out of the universe and hand it to
someone.

Not the whole repo. Not a single file. A _region_ — the cluster of
docs that grew into each other to define one feature, with the links
between them, with the spatial layout you built up over time, with the
dream-born notes that orbited the cluster long enough to keep.

A whole feature, exported as a small bundle of markdown plus the
geometry that holds it together. A teammate drops it into their
Boltzsidian and your auth subsystem lives in their universe with the
same shape it had in yours.

Or: an open-source maintainer hands their contributors a starter
region — the architecture, the conventions, the why-we-don't-do-X
decisions — as one bundle, instead of pointing at twenty .md files and
hoping people read them in the right order.

This is what `[[wikilinks]]` always wanted to be.

---

## The honest disclaimer

A system that surfaces patterns in your own docs can become
authoritative if you let it. It can't tell you which feature to build.
It can't tell you whether a spec is good. It can show you which ones
overlap, which ones nothing references, which ones have been circling
unresolved.

Treat it as a collaborator. Useful, fast, occasionally surprising,
still bounded by what you've written. If it ever starts to feel like
it's deciding what's important, that's the moment to close the laptop
and write something it hasn't seen yet.

---

## Where it is right now

Pre-alpha. Branch named `boltzsidian` on a public repo. MIT license,
free, donation-supported, single-user, single-machine, no telemetry,
no cloud, no account. The optional Claude API path for the dream voice
is off by default, opt-in, and shows you exactly what would be sent
before any request leaves your machine.

I am still tuning the bits that have to feel right — the spring on a
freshly-created link, the cadence of the morning report, the exact
moment a backgrounded universe decides it is dreaming. None of that is
shippable yet. The first version that is, will be.

If your `docs/` folder has more than twenty .md files and you cannot
say which ones are current, this is for you.

If you're starting a project and you already know it's going to grow
that way — this is for you sooner.

The plans can move. They were always supposed to.
