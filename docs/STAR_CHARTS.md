---
tended_on:
  [
    "obvious-link:01KPTQPV2W05R3QM2S8XQQ7Q52",
    "obvious-link:01KPS3Z7FX1VFKTS2AYJADQK6Q",
    "obvious-link:01KPSFM3SAAJAW84927SYMYBJK",
    "obvious-link:01KPTK09H91KJ4D1VXBER9F4G9",
    "obvious-link:01KPTK09HC9NWWB9TY59A8X814",
    "obvious-link:01KPTK09SRHPGZ8JWMBTVWPNBR",
    "obvious-link:01KPTK09KK9K555NJE435W6SQ6",
    "obvious-link:01KPS7VD7K6WKG085QCSXDVHJS",
    "obvious-link:01KPTK09QDS1G5QGAQPSTH4GH2",
    "obvious-link:01KPTK09S93XM0YTD0KX2PV1VQ",
    "obvious-link:01KPTB0T8WVWHZKNFZAYG2CBV9",
  ]
id: 01KPTQPTV1DSCW031V27DQ0SWX
created: "2026-04-22T13:35:05.871Z"
---

# STAR_CHARTS.md — Projects as constellations with distinct shapes

Sibling to [CONSTELLATIONS.md](CONSTELLATIONS.md) (cluster labels),
[FORMATIONS.md](FORMATIONS.md) (filter lenses), and [REGIONS.md](REGIONS.md)
(spatial-region semantics). Where those ask "which notes belong together,"
this doc asks the harder question: **what should a project _look like_?**

## The admission

We already know the trap. The obvious move is "let the user drag a node
and have the graph follow." It's a month of work, half a dozen subtle
physics bugs, and the result is never satisfying — the user's
arrangement decays within seconds, force equilibrium wins, and the
feature ships with a "pin" toggle that everyone uses once and then
forgets.

We don't need to control positions. We need to control **figures.**

Hand-drawn celestial atlases from Bayer and Hevelius didn't locate the
stars — the stars were where they were. The atlases gave every
constellation a _figure_, a posture, a silhouette. A lion, an archer, a
swan. Orion's three stars would still be in a line if no one had drawn
the hunter; the gift of the figure was to say _these three belong to
this story and not to the swan over there_.

That's the move. Stop chasing layout. Give each project a figure.

## The idea in one sentence

Every project (folder) gets a shape it tries to hold — a ring, a spine,
a disc, a tree — and a zone of its own on the map, so the universe
reads as a handful of distinct silhouettes instead of a single cloud.

## The pieces

### 1. A project is a folder with a master

A project is declared, not inferred. The user designates a folder as a
project. Its `index.md` (or `README.md`, or a file the user picks)
becomes the **master** — the brightest star at the center of the
figure. Every other note in that folder has an implicit weak link to
the master. Folders without a project declaration stay as before: loose
stars that fall wherever the force field puts them.

Implicit links are not written into the markdown. They're a physics
fact: a spring between each child and its master, at low strength, so
the master is a heavy object the children can't easily leave.

### 2. Each project chooses a shape

A small vocabulary — six, maybe eight forms — plus a randomly-seeded
variant per project so two projects with the same shape don't look
identical. First draft of the vocabulary:

| Shape       | Figure                                 | Reads as                  |
| ----------- | -------------------------------------- | ------------------------- |
| **Ring**    | Evenly-spaced circle around the master | A round table, a council  |
| **Disc**    | Spiral galaxy: master at center, arms  | A project with momentum   |
| **Spine**   | Backbone with side-nodes               | A process, a pipeline     |
| **Tree**    | Rooted branching from master outward   | A taxonomy                |
| **Fan**     | Arc of children facing one direction   | A catalogue, a survey     |
| **Cluster** | Tight globular knot around master      | A team, a band            |
| **Halo**    | Diffuse sphere at distance             | A reference library       |
| **Axis**    | Two poles with a line between          | A dialectic, a comparison |

The user picks one per project, or the system picks a default based on
the project's link shape (high branching factor → tree; ring of notes
that all link to each other → ring; degree-skewed → disc).

### 3. The shape is a target, not a cage

We do NOT snap nodes to exact positions on the figure. That looks CAD,
not celestial. Instead, we add a gentle **shape force**: for each node,
compute its _ideal position_ on the figure given its link-count and
ordinal, and pull it toward that position at low stiffness.

The existing physics (spring between linked notes, repulsion,
folder-basin gravity, dream wander) still runs. The shape force is
another term in the same integrator, weighted so it's visible as a
silhouette but loses to individual relationships.

A note that's heavily linked to two siblings doesn't sit on the ring
where its ordinal says — it sits between those siblings, a little
off-pattern. _That's the point._ The figure is the voice; the local
relationships are the accent.

### 4. Projects live in their own neighborhoods

The single worst failure mode is three projects overlapping into one
undifferentiated knot. To prevent it: each project gets a **seat** in
the sim world — a centroid position assigned on project creation,
roughly equidistant from other project seats, and the project's master
is pulled gently toward its seat. Children orbit the master; the master
orbits the seat.

Think of it as "every village gets its own hill." Not enforced with
walls — a village can drift down into the valley and meet the next
village over. But left alone, the villages stay on their own hills.

Seats can be:

- Auto-placed via a spherical-code scatter on project creation
  (roughly-equal angular spacing on a sphere around origin)
- Manually dragged by the user (this is the ONE drag we support — the
  user moves a _whole project_, not individual nodes)

### 5. Shared nodes are bridges

The honest cases: a note in folder `/research/` that also appears in
`/dissertation/` via link. Or a shared tag like `#python` that runs
across four projects. You can't cleanly assign it to one shape.

Treatment: shared nodes are **not assigned** to any single project's
shape force. They float freely, pulled by their links to members of
both. They naturally land in the space between — a bridge star, in the
gap.

If the user cares, they tag the note with `@project:dissertation` (or
drag it into a project in the UI) and the conflict resolves. Default
behavior: the note stays a bridge, and that's fine. Bridges are how the
map says "these two projects are connected."

### 6. Imperfection is mandatory

We are not drawing a geometric diagram. We're drawing a hand-sketched
atlas. Baked-in sources of wobble:

- **Low stiffness** on the shape force. Notes always drift a little.
- **Random per-project rotation** of the figure (0–360°). No two rings
  are oriented the same.
- **Random per-project aspect** (ring becomes slight ellipse, disc
  becomes slight oval). Hand-drawn, not compass-perfect.
- **Dream mode perturbs everything.** When the user sleeps, the Dream
  Attractor (see [DREAM_GRAVITY.md](DREAM_GRAVITY.md)) passes through
  and deforms the figures temporarily. In the morning, they're back
  but a little different — as if the page was turned.

The goal is that the user should never look at the screen and think
"computer-drawn grid." They should think "someone drew this."

## The poetic part

A good map of a mind doesn't place every thought equidistantly. It
says: here is the project I am putting three months into — it has a
shape, a direction, a center. And here over there is a different
project, a ring of things that call to each other, quiet. And in the
space between, a handful of stars that don't belong to either but keep
them in conversation.

When a user opens Boltzsidian and the universe has recognizable
silhouettes — "that's the dissertation disc, that's the reading ring,
that's the life-admin spine across the bottom" — the app has stopped
being a note-taking tool and started being a _picture_ of what the
person has been thinking about.

That's what we're after. Not layout. Figure.

## What to build

### Phase 1 — Project declaration

1. New frontmatter key on the index doc: `project: true` (or a
   folder-level `.project.yaml` / similar; pick the less-intrusive one —
   probably frontmatter on index.md).
2. Vault indexes which notes are masters. A folder with a master is a
   project. Everything else keeps current behavior.
3. Implicit weak links from every child to its master, applied in the
   physics step only (not written to the files).

### Phase 2 — Shape vocabulary + seats

1. Implement the six core shapes as functions:
   `idealPositionFor(shape, nodeIndex, nodeCount, masterPos, seatPos, rot, aspect) → [x, y, z]`
2. Auto-pick a default shape based on the project's link topology
   (branching factor, degree distribution, edge density).
3. Assign seat positions for every project via spherical-code scatter,
   or persist from localStorage if user has moved one.
4. Add a shape-force term to physics: `F = k * (ideal - current)` with
   k tuned so a note's ideal position is ~80% achieved when isolated
   but ~40% when the note has competing strong links.

### Phase 3 — UI

1. A panel in settings (or a right-click on the master note) to:
   - Toggle project on/off
   - Pick shape from the vocabulary
   - Rotate/reseed the figure
2. A "grab the seat" drag — one interaction, the user drags the
   project's centroid by grabbing near the master. The whole project
   migrates with it, children and all. This is the one drag we ship.
3. Visual pips: when a project is hovered/selected in settings, its
   notes get a subtle aura that matches its folder tint. Scope reads
   at a glance.

### Phase 4 — Atlas view

Optional but gorgeous: a 2D "star chart" render mode where the camera
locks to top-down, bloom softens, and each project's figure is traced
with a _constellation line_ — thin accent-tinted lines connecting the
nodes in the order the shape defines. Look of a hand-drawn atlas.

The existing [CONSTELLATIONS.md §8](CONSTELLATIONS.md) already
implements cluster labels. This extends it: when Atlas view is on, the
figure gets its title hand-lettered across its center, and the user
can click the title to focus the whole project.

## What stays the same

- Label-propagation clustering ([sim/clusters.js](../boltzsidian/src/sim/clusters.js))
  still runs — it's how shared bodies and non-project regions get
  grouped for the existing constellation-labeling layer. We're adding
  a _second_ layer (project figures), not replacing the first.
- Folder tints, formations, dream mode, tethers — untouched.
- The physics integrator stays symplectic. The shape force is a
  conservative central-potential term; adding it preserves stability.
- Non-project folders keep current behavior: they're loose stars that
  fall where the force field puts them. Projects are an opt-in.

## First cut (one afternoon)

Ship the smallest thing that proves the silhouette lands:

1. Add `project: true` to one index.md in the demo vault.
2. Implement only ONE shape (Ring — the simplest).
3. Give all ring members the same seat position (hardcoded to origin)
   for now — no spherical scatter.
4. Apply a weak ring-force to each child. See if the user can read it.

If the user can stand ten feet from the screen and see a circle, ship
it and build out the vocabulary. If they can't, the stiffness is wrong
or the masking/opacity is fighting the shape — fix that before adding
more shapes.

## Kill condition

If after a week of use the user reports: "I keep zooming in to figure
out which project a note is in" — the silhouettes failed to read at
distance. Either the shape force needs more stiffness, or the seat
scatter needs more spacing.

If the user reports: "The shapes are distracting — I preferred when it
was a single cloud" — then this idea is wrong for their mind and we
should ship it as an opt-in setting, not a default.

The feature is load-bearing when: the user opens the app in the
morning, looks at the map of last night's work, and says _there it is_
— pointing at a silhouette without needing to read a single title.

#constellations #projects #formations #physics #emergence

[[Notes]]

[[new]]

[[Orion]]

[[Dream mode]]

[[Formations]]

[[Boltzsidian]]

[[Two projects]]

[[Clusters]]

[[Reading]]
