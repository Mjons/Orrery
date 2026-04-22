---
id: 01KPS9CFDHMBB68XMK5Q5CZMHN
created: "2026-04-21"
---

# ONBOARDING.md — The first vault a new user opens

A focused design doc. Michael's note:

> Make a .md around creating the perfect first template for a new user,
> where the core star is literally instructions on how to use this and
> what to do and where to find hotkeys etc.

The two existing demo vaults (`astronomer` and `project`) show what a
lived-in vault _looks like_ — they're beautiful but they don't teach
the gestures. A brand-new user watching the universe boot has no idea
that hovering a star reveals a title, that `Cmd+K` exists, that
`Alt-drag` creates links. A tutorial vault can teach all of that
through the app's own interaction model — the app teaches the app.

---

## 0. Premise

One more demo theme: **Welcome**. A small (~12–18 notes) curated vault
whose structure itself is pedagogy. The central star is titled
something like "**Start here**" and sits anchored at the universe's
origin; everything else orbits it in a deliberate ring-and-halo shape
that demonstrates the app's own ontology while teaching its
keystrokes.

This is _not_:

- A help document. The body of each star is one or two sentences, not
  a wall of prose.
- A rigid tutorial that advances step-by-step. The user can wander.
- Something the user must keep. Everything can be deleted.

This _is_:

- The third option in the welcome card, shown first because it's the
  default for first-run users who've never used Boltzsidian before.
- A learning-by-using experience that mirrors the real-vault
  interactions: the user opens notes, hovers stars, searches, and
  links as part of learning to do those things.
- The single source-of-truth for current hotkeys — referenced by
  coachmarks and the `?` overlay so there's never drift.

---

## 1. The core star — "Start here"

A single pinned note at the universe origin. Heavy (high mass so it's
visually dominant) and bright.

**Frontmatter:**

```yaml
id: 01J_welcome_start
pinned: true
position: [0, 0, 0]
tags: [welcome]
kind: 0
```

**Body:**

```markdown
# Start here

Welcome. You are looking at a universe. Each bright point is a note;
each thin line between points is a link. Right now you are at the
center — everything else orbits me.

**Try this:**

- **Hover a star** near me. A title appears.
- **Click** that star. A panel opens. Read it.
- When you close it, come back here and pick another.

You're looking at the whole shape of your future vault. Press **?**
any time for the full hotkey list.

Keep this star, or delete it. It's just a note.
```

The final sentence is load-bearing. The user has to feel, from the
first moment, that _nothing is sacred_ — this vault is theirs, these
stars are deletable, the app isn't guilting them into keeping
tutorial content.

---

## 2. The inner ring — one star per gesture

Eight to ten notes, each about a single core interaction. Arranged in
a rough circle around "Start here" (pinned positions in frontmatter,
see §7). Each links back to "Start here" so the graph forms a wheel.

| Title             | Teaches                                           |
| ----------------- | ------------------------------------------------- |
| Reading           | click a star → panel slides in                    |
| Hover labels      | `L` cycles labels always / on hover / never       |
| Searching         | `Cmd+K` opens the search strip                    |
| Making a new note | `N` spawns a star                                 |
| Linking           | `Alt-drag` from star to star, or type `[[`        |
| Deleting          | open a note, click ×. No undo.                    |
| Formations        | `Shift+F` opens filter pills (halo, core, solo…)  |
| Dreaming          | `Cmd+D` shows what the universe noticed overnight |
| Settings          | `\` toggles the settings pane                     |

Each star's body is 2–4 sentences, ending with a **Try it** prompt
that invites the user to do the thing. Example:

```markdown
# Linking

You can connect two stars to make them orbit each other. Two ways:

1. Inside this note, type `[[` and start typing a title. A menu appears.
2. Hold **Alt** and drag from one star to another in the universe.

**Try it:** press **Esc** to close this panel, hold Alt, and drag from
me to any other star. A thin line appears between us.
```

Each tutorial note carries `tags: [welcome, gesture]` so users can
run **Solo folder → welcome** to keep the tutorial grouped, or drop
the `#gesture` tag from notes they've internalised.

---

## 3. The outer ring — concept stars

Six to eight notes a hop further out. These explain what the app's
_layers_ are, not how to press a key:

- "The chorus" — the ambient voice, off by default, quiet opinions.
- "Dream mode" — the regime where the universe thinks about your
  notes.
- "The meaning filter" — how dream-born ideas earn their way to you.
- "The model face" — the little face at top-left, why it changes.
- "Clusters" — what the glowing regions mean.
- "Tags vs folders" — the two axes.
- "Your privacy" — what stays local, what's opt-in.
- "The morning report" — three things before coffee.

Each is ≤100 words. The point is vocabulary, not explanation. These
are the concepts the rest of the app's UI will refer to; the user
should have heard every word once by the time they close the demo.

Tag `welcome, concept`. Folder `welcome/concepts/`.

---

## 4. The halo — intentionally unlinked

Two notes placed **outside** the ring, with zero links to anything.
They exist to:

- Demonstrate the Halo formation (press `Shift+F → halo` and they'll
  glow while everything else dims).
- Prove the "loose notes exist and that's okay" principle.
- Give the Protostars formation a different shape when the user
  presses `Shift+F → protostars` (they're fresh; the core tutorial
  stars aren't).

Titles: something deliberately casual — "A thought I had" and
"Something to remember later." The body is one sentence each. The
user is supposed to read these, recognise them as _real notes_ (not
tutorial content), and leave them alone or delete them.

---

## 5. A single daily note

One note under `welcome/daily/YYYY-MM-DD.md` dated _today_ (generated
at install time), containing:

```markdown
# Today

This is a daily note. They form a bright filament through your
universe, ordered by date. Today's one is the brightest — me.
As you write more daily notes, I'll stretch into a line.

**Try it:** check the bottom-left stats pill. You should see a
protostar (me) and at least one daily note (also me). That's the
filament.
```

Tag `daily`. Filename `welcome/daily/YYYY-MM-DD.md` where YYYY-MM-DD
is the real local date when the vault installs. The installer writes
this file dynamically — every time the user installs the welcome
vault, today's date is current.

---

## 6. The hotkey reference

One canonical note, `welcome/reference/hotkeys.md`, that IS the source
of truth. Every other note in the tutorial that mentions a keystroke
should link to this note rather than restating the full list. If we
ship a new hotkey, we update this note only.

The `?` overlay (`ui/hotkey-overlay.js`) reads from an internal const,
not from this file — but the two should stay in sync by inspection.
Easy test: run the welcome vault, open the hotkeys note, compare.

Body is a plain markdown table grouped by category. No prose. This
note is explicitly a reference, not a lesson.

---

## 7. Pinned positions — the shape itself is pedagogy

The welcome vault is the _one_ place we lean into `pinned: true` with
hand-authored `position: [x, y, z]` coordinates. Reasons:

- The ring-and-halo shape MUST be legible on first render — a
  force-layout would make a random blob.
- Teaching a user about the universe's structure depends on them
  seeing structure.
- Post-install, the positions are just data — the user can drag
  things around (when we ship drag-to-reposition) or unpin individual
  stars.

Proposed coordinates (in sim units, ~800 typical cluster radius):

- "Start here" at `[0, 0, 0]`, mass boosted to ~12
- Inner ring: 9 notes evenly spaced on a circle of radius 180, small
  Z jitter (±15) so it doesn't read as 2D
- Outer ring: 7 notes on a circle of radius 380, larger Z jitter (±40)
- Halo pair: `[-720, 120, -90]` and `[650, -200, 140]` — far enough
  out that the Halo formation visibly isolates them
- Daily note: `[120, 300, 0]` — near the top, slightly offset from
  the ring

All positions written to frontmatter's `position:` field. The layout
engine respects pinned positions (see `sim/layout.js`
`applyPinnedOverrides`); nothing else changes.

---

## 8. First-minute experience

What the user actually does in the first 60 seconds, if things work:

1. They see a glowing central star labelled "Start here" surrounded
   by ~9 smaller stars in a loose ring, with a couple of distant
   dimmer points outside the ring. The camera is framed on the whole
   thing.
2. They hover a ring star. A title appears. They see — the universe
   is legible.
3. They click "Reading." The panel slides in. They read two
   sentences. They close it.
4. Coachmark fires for the first real hover ("Hover a star" → opens
   the "Hover labels" star or the user navigates there).
5. They try a few more ring stars. Each is a lesson they internalise
   without noticing.
6. At some point they press `Shift+F`. The formations rail opens.
   Halo lights up the two distant notes. Protostars lights up
   today's daily note.
7. They press `?`. The hotkey overlay fires. They scan it.
8. By minute five, they've pressed most of the core hotkeys at least
   once, and the vault still looks like a vault.

The experience we're avoiding: the user opens the app, sees points
and lines, has no idea what any of it is, and closes the tab. That's
the bar.

---

## 9. Guardrails — what we do NOT do

- **No hypothetical personas.** Tutorial stars aren't characters
  having pretend opinions. They're flat instructional content in a
  cosmological wrapper.
- **No tutorial mode.** There's no app state that says "the user is
  in the welcome vault." The welcome vault is just _a vault_ that
  happens to be pedagogical. Every feature works normally.
- **No progress tracking.** We don't mark stars as "completed." The
  user closes when they're ready.
- **No popups.** The existing coachmark system handles its own
  per-gesture teaching; the welcome vault doesn't need to reinvent
  that, it just gives the coachmarks something concrete to land on.
- **No rewriting the welcome vault mid-session.** The installer
  writes it once (or on Reset demo); it's a normal set of files
  after that. If the user breaks it by deleting every note, Reset
  demo restores it.
- **No ~~please rate this experience~~ affordance.** The silence after
  the user closes the welcome vault is the signal. If they don't
  come back, the app wasn't right for them. Acknowledge that with
  dignity, not with a modal.

---

## 10. How it fits the demo chooser

The welcome card in the first-run picker currently offers two demo
themes. This adds a third:

```
  ○ Welcome — a short tour of the universe (recommended)
  ○ Astronomer's notebook — an amateur stargazer's working notes
  ○ Project planner — developer notes planning an app
```

Default selection: **Welcome** for first-time users
(`!localStorage.getItem("boltzsidian.welcome.seen")`). After the user
has opened Welcome once, the default shifts to Astronomer's notebook
(the prettier lived-in view). The "seen" flag is set the first time
the Welcome vault loads, whether or not the user actually reads
anything.

Power users who already know the app can pick the other themes from
day one by just clicking the radio.

---

## 11. What this means for DEMO_THEMES

The existing registry in `vault/opfs.js`:

```js
export const DEMO_THEMES = [
  { id: "astronomer", label: "Astronomer's notebook", blurb: "…" },
  { id: "project", label: "Project planner", blurb: "…" },
];
```

Becomes:

```js
export const DEMO_THEMES = [
  {
    id: "welcome",
    label: "Welcome",
    blurb: "A short tour of the universe. Start here.",
    firstRunDefault: true,
  },
  { id: "astronomer", label: "Astronomer's notebook", blurb: "…" },
  { id: "project", label: "Project planner", blurb: "…" },
];
```

Installation path: `boltzsidian/public/demo-vault/welcome/*.md`,
same pattern as the existing themes. The `project` theme's content
(which lives under `demo-vault/project/`) can teach from the same
folder structure.

Content budget: ~18 `.md` files. Pinned positions in frontmatter on
each. Daily note generated at install time.

---

## 12. Risks

- **Instructions drift from reality.** If we add a hotkey and forget
  to update the Welcome vault, a new user learns wrong gestures.
  Mitigation: put the hotkeys reference note in a spot the
  `?` overlay and the vault both point at — make the drift obvious.
- **The tutorial feels "tutorial-y."** The moment a user senses
  they're being lectured, the aesthetic breaks. Mitigation: every
  sentence is as short as possible, every star's body ends with a
  verb not an explanation, and every note is deletable.
- **Size creeps.** "Just one more concept note" is the death of
  this. Cap at 18 files forever. If something new needs teaching,
  something old comes out.
- **Coachmarks fight the Welcome vault.** If coachmarks also fire
  in Welcome, the user gets double-instructed. Mitigation: suppress
  coachmarks when `workspaceKind === "demo" && demoTheme === "welcome"`
  — the vault IS the coachmark.

---

## 13. Minimal first cut

Shippable in an afternoon:

1. New demo theme `welcome` in `DEMO_THEMES`, first-run default.
2. 12 notes total for v1 (trim from the 18 proposed above — cut the
   outer-ring concept notes except the three most load-bearing:
   "Clusters," "Dream mode," "Your privacy").
3. Hand-authored `position:` frontmatter on all 12.
4. A daily note generator that writes today's date into
   `welcome/daily/YYYY-MM-DD.md` on install.
5. Coachmark suppression when the welcome theme is active.
6. `?` overlay test: confirm the keys in the overlay match what the
   hotkeys note says.

Expansion passes:

- Add the outer-ring concept notes (once we've seen what users
  actually get confused about — don't pre-teach what's clear).
- Animated camera intro (first 1.5 s swooping from a wide zoom into
  the ring) — polish, not required.
- A "Replay tour" menu item that clears `welcome.seen` and reopens
  the vault. Low priority; users who want it can reset the demo.

---

## 14. One sentence

The first vault a new user opens should be a small pedagogical orbit
in the same app they'll be using the rest of their time here —
teaching the gestures by being the place those gestures land.

#user #phase #panel
