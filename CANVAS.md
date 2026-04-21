# CANVAS.md — Should we speak Canvas?

A speculative design doc. OBSIDIAN.md established that the vault is the
seed corpus. This doc takes the next obvious question: Obsidian Canvas is
the _other_ big artifact users produce alongside their markdown. Should
Boltzsidian read and write it? And if so, how without betraying what the
app is?

Nothing here is a plan. It's a honest look at one feature request.

---

## 0. What Canvas actually is

For future-Claude or anyone who hasn't used it:

**Canvas** is Obsidian's built-in whiteboard format, shipped in 2022. A
`.canvas` file is a JSON document describing a 2D infinite plane holding:

- **Cards**, which are one of:
  - A _note card_: a pointer to a `.md` file in the vault, rendered inline
    with its content visible.
  - A _text card_: freeform markdown authored directly on the canvas,
    no backing file.
  - A _file card_: an image, PDF, video, or audio file from the vault.
  - A _link card_: an embedded webpage.
- **Edges**, which are directed or undirected arrows connecting cards,
  optionally labeled with text and optionally colored.
- **Groups**, which are rectangles you draw around a set of cards. They
  have a label, a color, and — this is the important part — _contain_
  whatever they visually enclose. They're not a semantic group in the
  graph sense; they're a _region_ you've lassoed.

The file format is plain JSON, roughly:

```json
{
  "nodes": [
    { "id": "…", "type": "file", "file": "path/to/note.md",
      "x": 120, "y": -400, "width": 300, "height": 240, "color": "4" },
    { "id": "…", "type": "text", "text": "…",
      "x": …, "y": …, "width": …, "height": … },
    { "id": "…", "type": "group", "label": "Chapter 2",
      "x": …, "y": …, "width": …, "height": …, "color": "1" }
  ],
  "edges": [
    { "id": "…", "fromNode": "<id>", "fromSide": "right",
      "toNode": "<id>",   "toSide": "left", "label": "causes" }
  ]
}
```

That's the whole data model. No hidden server. The coordinates are in
pixels on an infinite grid, positive-y is down (screen convention, not
math convention).

The feature is popular because it's _prescribed spatial layout_: users
place cards where they _want_, draw arrows where they _mean_, and the
drawing is the artifact. Mind maps, chapter plans, affinity diagrams,
kanban, moodboards — all of it lives in Canvas.

This is the opposite metaphor from Boltzsidian, where layout is
_emergent_ from physics. That tension is what the rest of this doc is
about.

---

## 1. The natural mapping

Assume for a moment we decide to import. The mapping falls out:

| Canvas                | Boltzsidian                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| Node (file card)      | One body, backed by the same `.md` note as in the vault                  |
| Node (text card)      | One body with the text as its `seed_text`, no backing file               |
| Node (file card, img) | A body of kind `dust` with an image sprite (Phase 4+)                    |
| Node (link card)      | A body of kind `halo` labeled with the domain                            |
| Edge                  | A **tether** (strong spring) between the two bodies                      |
| Edge label            | The tether's display label, visible on hover                             |
| Edge color            | Tether tint (uses the folder-aura palette from FORMATIONS §1.1)          |
| Group                 | A named basin — like a folder (FORMATIONS §1.2), but scoped to the scene |
| Group color           | Basin's aura tint                                                        |
| Card x,y (px)         | Seeded body position (scaled into sim units)                             |
| Card width,height     | Seeded body mass (`m ∝ log(w·h)`) — bigger card = heavier                |

None of this is hard. The importer is a 150-line JSON walker.

The hard question isn't _how_. It's _whether_ and _what layout rules the
sim follows once the canvas is loaded_.

---

## 2. Three import modes

The crux: how literally do we obey the canvas's spatial layout?

### 2.1 Frozen — pin mode

Every card's `x,y` is a hard pin. Bodies sit exactly where the user drew
them. Physics is disabled for canvas bodies; they only glow, tint, pulse.
Arrows render as static lines.

This is _Canvas-in-the-sim_. It looks like the sim is displaying a canvas
with our renderer. It's honest to the user's drawing but it's also the
mode that most dilutes the app — at this point we're a Canvas viewer
with bloom.

Useful for: presentations, stream overlays where the author wants their
actual canvas layout visible with the sim's aesthetic on top.

### 2.2 Seeded — settle mode

Canvas positions are the **initial state**, not a pin. The physics is
on. Tethers pull toward their natural spring length; non-tethered
nearby bodies may drift. After a settle pass, the layout _resembles_ the
canvas but isn't identical — it's what the canvas would look like if it
obeyed physics.

This is the interesting one. The author's intent is preserved as a bias;
the universe negotiates the rest. A well-balanced canvas barely moves.
A canvas with crossed arrows or impossible groupings visibly _fixes
itself_, which is either delightful or insulting depending on the user.

Useful for: loading a canvas you made in 10 minutes and seeing where the
links actually want it to be.

### 2.3 Dissolved — seed-only mode

Canvas positions are discarded. Only the nodes, edges, and groups
survive. Bodies are laid out by the normal Boltzsidian link-force
algorithm, with canvas groups contributing a soft basin pull (per
FORMATIONS §1.2). Tethers come from the canvas edges.

This is _"use your canvas as a graph"_. The drawing gave us nodes and
edges we wouldn't otherwise have (text cards, link-card connections,
drawn arrows that aren't `[[wikilinks]]`). The spatial intent is thrown
away.

Useful for: canvases where the user drew arrows faster than they would
have typed `[[links]]`, and now wants the universe's take on it.

### 2.4 Which of these is the default

**Seeded (§2.2).** It respects the author without surrendering to the
author. It's the mode that makes the most distinctive artifact — a thing
no other tool produces.

Frozen and Dissolved are available but hidden under a per-canvas setting.
Frozen isn't the default because it turns the app into a viewer.
Dissolved isn't the default because it throws away the part of the
canvas the user spent real time on.

---

## 3. Should we export back?

Reading is safe. Writing is different.

Canvas export would mean: take the current universe (positions, active
tethers, visible bodies) and emit a `.canvas` file you can open in
Obsidian.

There's a legitimate use: **dream-output as canvas**. Overnight dream
produces a new arrangement. That arrangement is emitted as a canvas in
`universe/canvases/YYYY-MM-DD-<slug>.canvas` the user can open in
Obsidian tomorrow morning and edit there.

Arguments for:

- It closes the loop. The universe did work; the work lands in a format
  the user's existing tools already understand.
- Canvases are static JSON, so once exported they're portable and
  non-destructive — you can ignore, delete, or curate them.
- The morning report (OBSIDIAN.md §4.2) being a canvas instead of a daily
  note quote block is richer: arrows, colors, groupings, not just prose.

Arguments against:

- Canvases the sim generates will be physics-pretty but semantically
  weaker than hand-drawn ones. Obsidian users might judge the feature
  on canvas quality alone.
- It's another write-back surface. Every write-back is a trust cost.
- The export is 200 lines of code that isn't on the critical path.

**Verdict: defer.** Ship import first. If users ask for export more than
once, add it, but gate it behind the same per-folder opt-in as the
ideas-write-back (OBSIDIAN.md §5).

---

## 4. The dilution question

This is the real question. Restating: Canvas is _prescribed_ layout.
Boltzsidian is _emergent_ layout. Making Canvas a first-class view risks
making Boltzsidian look like "an Obsidian Canvas viewer with physics on
top." That would be selling the app short and would confuse positioning.

Three framings, weighted honestly.

### 4.1 The "dilutes it" case

- The emergence story is load-bearing. The whole pitch — your vault as
  a universe, physics surfacing ideas — depends on the user trusting
  that the _arrangement_ is doing work. If canvases load as static
  drawings (frozen mode), the whole theater breaks.
- Canvas users are not necessarily Boltzsidian users. A Canvas user
  _wants_ the drawing to be stable. A Boltzsidian user wants the
  drawing to surprise them. Serving both may mean serving neither well.
- Feature creep has an aesthetic cost. Every toggle, every "load as
  frozen vs seeded" choice is a sentence the onboarding has to contain.
  Sentences kill the vibe.

### 4.2 The "it's a free win" case

- Canvases are already in the user's vault. Ignoring them means ignoring
  a rich source of edges and groupings that the markdown graph doesn't
  have. Text cards with no backing file are thoughts the user wrote
  _into_ Canvas specifically because they didn't have a note yet — those
  are prime protostars (FORMATIONS §4.1).
- Seeded mode (§2.2) doesn't dilute emergence; it _demonstrates_ it. The
  author drew what they thought the layout was; physics shows them what
  it actually is. That's the app's thesis, more vivid than any demo.
- Compatibility is a pre-trust lever. A user won't let Boltzsidian crawl
  their whole vault on day one. But loading one canvas is a low-stakes
  try. Canvas could be the _most effective onboarding path_ we have.

### 4.3 The resolution

Both framings are partially right. The synthesis:

- **Import yes. Export later.**
- **Seeded mode is the default; frozen mode is hidden behind a
  per-canvas toggle.** We never advertise frozen. It exists because
  sometimes users need it, not because it's what we stand for.
- **Canvas is not a top-level concept in the UI.** No "Canvas" button
  in the left rail. It's accessed via "Open…" → pick a `.canvas` file,
  exactly the same affordance as picking a vault folder. A canvas is
  just _a scene seed_.
- **The onboarding story never leads with Canvas.** The story is always
  "point at your vault, get a universe." Canvas is a thing power-users
  discover when they've already fallen for the basic loop.

Under these constraints, importing doesn't dilute. It _extends_ the
input surface without moving the app's center of gravity.

---

## 5. Edge cases worth pre-deciding

A few things the importer will have to resolve:

- **Text cards with no backing file.** Default to creating an in-memory
  body with no corresponding `.md`. An opt-in "materialize text cards"
  setting writes them as new notes in `universe/canvas-texts/`. Off by
  default.
- **File cards for images.** Later phase. For now, skip non-markdown
  file cards silently; log a count in the loader toast.
- **Edges with labels.** Labels ride with the tether; hover shows them
  per UI/LABELS.md. Edges _without_ labels still produce an unlabeled
  tether — they're structurally the same.
- **Self-edges and multi-edges.** Self-edges (a card linked to itself)
  are dropped. Multi-edges collapse to one tether with concatenated
  labels.
- **Groups containing no cards.** Dropped. A basin with no members is a
  UI artifact, not a structure.
- **Unknown node types.** Obsidian may add types. Unknown types become
  `halo` kind bodies with the node's `id` as label. Never crash.
- **Cards referencing deleted files.** The node survives as an
  unresolved body (halo kind, dashed label). Reading the file into the
  sim is a later read op; the canvas scene can load before the file
  exists.

---

## 6. The import pipeline, concretely

A sketch so whoever implements it doesn't have to redesign from scratch:

1. File System Access API picks a `.canvas` file.
2. JSON parse.
3. For each `node`: resolve file path → existing body (if already loaded
   from the vault) or create new body. Assign kind per existing tag
   rules (OBSIDIAN §3.1) when there's a file; assign kind `star` for
   text cards.
4. For each `edge`: create a tether (see `boltzsidian/src/sim/tethers.js`
   — tethers already exist, this is reusing, not building).
5. For each `group`: register a scene-local basin. Basin centroid is the
   group's (x+w/2, y+h/2). Basin tint from group color.
6. Settle pass: run the physics for ~60 frames with canvas positions as
   initial state and normal link/spring forces enabled.
7. Hand the settled positions to the renderer, flag the scene as
   "canvas-derived" for the HUD.

Reuses: `src/vault/parser.js`, `src/sim/tethers.js`, whatever folder-aura
code FORMATIONS produces. Net new: probably 200 lines.

---

## 7. What this is in one sentence

Canvas import is welcome as a scene seed, defaults to letting physics
renegotiate the layout, and is never promoted to a top-level feature —
because the app's job is to show you what your vault means, not to be a
nicer viewer for what you've already drawn.
