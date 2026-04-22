---
tended_on: [tag-infer]
id: 01KPS7VDGJF94CY5W11X9RAZZ7
created: "2026-04-21T12:49:43.130Z"
---

# GLOSSARY.md — Boltzsidian terms in plain English

A quick reference to the vocabulary Boltzsidian uses. Many of these show
up in the product docs ([WORKSPACE.md](WORKSPACE.md),
[BUILD_PLAN.md](BUILD_PLAN.md), [DREAM.md](DREAM.md), etc.) or in the
app itself. If you hear a word and don't know what it points at, check
here.

Entries are alphabetical. Cross-references to other entries are in
_italics_.

---

**Accent.** The single UI color (default `#8ab4ff`, a soft blue). Used
for buttons, selection rings, link underlines. Customizable in
[Settings](#); there is never a second accent.

**Affinity vector.** Eight floats stored on each _note_, representing
roughly "what this note is about" in a low-dimensional semantic space.
Used by the _meaning filter_ to decide if two notes are similar enough
to produce a child _idea_ during _dream mode_.

**Autosave.** The app writes your changes to disk 300 milliseconds after
you stop typing. You don't press save; it just happens. File on disk
always matches what you see.

**Backlink.** An incoming link to a note from another note. A note with
many backlinks has more _mass_ and looks heavier in the universe.

**Basin (folder basin).** An optional gravitational pull that makes
notes in the same folder cluster together spatially. Off by default —
folders are dissolved into the wider field unless you turn it on. See
[FORMATIONS.md](FORMATIONS.md).

**Body.** The renderable particle in the universe that stands in for a
note. Every _note_ is a body; every body is a note. The word is
inherited from the original sim, where bodies were planets and stars.

**Boltzmann brain.** A physics thought-experiment: a self-aware observer
that spontaneously condenses out of random fluctuation, exists briefly,
and dissolves. Boltzsidian borrows the image for its
_observer chorus_ — fleeting voices that comment on what the field
looks like. See [BOLTZMANN.md](BOLTZMANN.md).

**Boltzsidian.** The app. A portmanteau of _Boltzmann_ + _Obsidian_.

**Chorus (observer chorus).** Ambient captions near dense regions of the
field, phrased as the first-person voice of a fleeting _observer_. Off
by default. Lands in Phase 4. See [BOLTZMANN.md §2](BOLTZMANN.md).

**Cmd+D.** Keyboard shortcut for _Dream Now_ — runs a short dream cycle
on demand and shows a _morning report_.

**Cmd+K.** Keyboard shortcut to open the _search strip_.

**Cmd+N.** Keyboard shortcut to create a new note. A fresh _body_
spawns at screen center; the _note panel_ opens in edit mode with an
empty markdown editor.

**Daily note.** A file named `YYYY-MM-DD.md` in a `daily/` folder.
Rendered in the universe as a bright body on a _filament_ through
time — today's note is heavier and brighter, older ones trail off.

**Demo vault.** A curated ~40-note vault that ships with the app.
First-run users can explore it before committing to their own folder.
Built in Phase 3.5.

**Dissolve mode.** The default state of folders: they contribute nothing
to layout, notes mix freely in a single field. Opposite of _basin_.

**Dream mode.** The regime where Boltzsidian's physics is cranked up —
gravity, _flocking_, _radiation_, and the _K matrix_ all active —
and notes actually move, collide, and produce new _ideas_. Triggered
by idle detection or _Cmd+D_. See [DREAM.md](DREAM.md).

**Dream scene.** A named preset that shapes how _dream mode_ runs
tonight — "Galaxy Collision," "Flocking," "Ring Mode." Inherited from
the original sim. Different scenes surface different kinds of idea
collisions.

**Esc.** Closes the topmost open surface: search → note panel →
settings → formations rail, in that order of priority.

**Filament.** A visible chain of linked bodies arranged along a curve.
Daily notes form a canonical filament through time. Densely-linked note
chains can form organic filaments of their own during layout.

**Flocking.** Three pairwise forces — _alignment_ (match neighbors'
velocities), _cohesion_ (drift toward neighbors), _separation_ (don't
crash into them). In _dream mode_ flocking is what makes thematic
clusters self-assemble.

**Folder aura.** An optional soft colored halo drawn around the bodies
of a folder. Low-saturation palette, coexists with the _accent_. Aura
does not change the body's core color — that comes from _kind_.

**Formation.** A named filter mode for reading the universe. Examples:
_Halo_ (zero-link notes), _Protostars_ (last 14 days),
_Solo folder_, _Galactic core_. Toggled via _Shift+F_ or number keys.
See [FORMATIONS.md](FORMATIONS.md).

**Formations rail.** A thin top-docked row of formation pill-buttons,
summoned with _Shift+F_. Active formations stack.

**Frontmatter.** The YAML block between `---` lines at the top of a
markdown note. Holds `id`, `kind`, `pinned`, `position`, tags etc. The
app manages some fields for you; you can hand-edit others.

**FS Access API.** The browser API Boltzsidian uses to read and write
your notes directly on disk. Chromium-only for now (Chrome, Edge, Arc,
Brave). No upload, no sync, no server.

**Galactic core.** A _formation_: the densest cluster of linked notes
is auto-detected and lit bright; everything else dims. Finds your
most-connected hub without you having to know where it is.

**GPGPU.** "General-purpose GPU computing." The technique the sim uses
to evolve thousands of particle positions and velocities each frame on
the graphics card. Phase 3 of Boltzsidian ports this engine in so
_dream mode_ can do the same with your notes.

**Glass (UI).** The frosted semi-transparent panels used throughout the
UI — corner pills, side pane, search strip. Achieved with
`backdrop-filter: blur(...) saturate(...)`. Load-bearing for the
aesthetic.

**Gravity softening.** A small number added inside the gravity force
denominator so two bodies that pass very close don't experience
infinite force. Prevents explosions when particles get close.

**Halo (note).** A note with zero incoming or outgoing links. In the
universe it tends to drift toward the outskirts. The _Halo formation_
lights them up so you can see what you've forgotten.

**HUD.** "Heads-up display." The four glass pills in the viewport
corners: app name (top-left), reserved (top-right),
stats (bottom-left), sleep-depth indicator (bottom-right). Never
animates when you don't want it to.

**Idea.** A _note_ generated automatically by the app during
_dream mode_ when two existing notes collide with high _resonance_.
Has `born_in_dream: true` in its frontmatter and lives in the
`ideas/` folder until you promote or discard it.

**Ideas drawer.** A right-side panel that lists
_dream-born ideas_ awaiting your review. Triggered by the "noticed"
bell in the top-right HUD corner. Landing in Phase 6.

**Interaction matrix.** See _K matrix_.

**K matrix (K).** A small square table (7×7 in the sim) encoding how
strongly each _kind_ of body attracts or repels each other kind. `K`
is the sim's shorthand for "personality" — a different K makes a
different-looking universe. Editable via presets.

**Kind.** One of seven categories a body can belong to:
`0` star · `1` planet · `2` black hole · `3` dust · `4` halo ·
`5` galaxyA · `6` galaxyB. Each kind has a tint and a role in the _K
matrix_. Notes get a kind via the _tag → kind mapping_.

**Labels.** The floating text titles that appear above bodies in the
scene as you zoom in. Max 150 visible at once, ranked by camera
distance with a mass boost so heavy notes keep labels visible from
farther away.

**Link (wikilink).** The `[[Some Title]]` or `[[ULID]]` syntax in a
note's markdown body. Resolves to another note by title
(case-insensitive) or by id. Typing `[[` in the editor pops
autocomplete.

**Markdown.** The plain-text format Boltzsidian stores every note in.
Industry-standard, portable. You can read your vault in any other
tool — Obsidian, VS Code, `cat` — and everything works.

**Mass.** A body's visual weight. Formula: `1 + backlinks × 0.8 +
log(1 + words) × 0.55`. More backlinks and more words → heavier body,
larger render, bigger label, stronger physical pull in _dream mode_.

**Meaning filter.** The scoring function that decides which
dream-born _ideas_ are worth promoting. Scores on four axes:
`novelty × coherence × reach × freshness`. Ideas above threshold are
surfaced in the _morning report_; ideas below it decay and are
forgotten.

**Meaning layer.** The speculative feature set that treats note
proximity as a substrate for new thoughts — affinity vectors, idea
spawning, the _meaning filter_. Collectively the reason Boltzsidian
"thinks about your notes."

**MiniSearch.** The in-memory full-text search library. Builds a
fuzzy-matching index over title + tags + body. Used by the
_search strip_.

**Morning report.** The modal that appears the first time you return
to the app after a _dream_. Contains: weather (scale of activity),
three things (the top ideas that crossed the _meaning filter_),
prunings worth noticing (notes the dream couldn't find a home for).
See [DREAM.md §4](DREAM.md).

**Nebula (formation).** Renders the co-occurrence of tags as a diffuse
colored fog through the scene. Shows you regions of tag-overlap
without showing individual notes. Deferred to a later release.

**Note.** One markdown file in your workspace. Each note is a
_body_ in the universe, a line in the graph, and an entry in the
_vault_.

**Note panel.** The glass panel that slides in from the right when you
click a body. Has two modes: _read_ (markdown rendered via `marked`)
and _edit_ (CodeMirror 6). Toggle with the button in the panel header
or `Cmd+E`.

**Observer.** A fleeting self-aware "knot" nominated by the app in a
dense coherent region of the field during _dream mode_. Exists for a
moment, emits an _utterance_, dissolves. See
[BOLTZMANN.md §2](BOLTZMANN.md).

**OrbitControls.** The three.js camera controls that let you rotate,
pan, and zoom the universe. Left-drag rotate, right-drag pan,
scroll zoom.

**Palette.** A set of RGB color stops. Each body's tint is looked up
in a palette by _kind_; the aesthetic layer chooses which palette is
active per _scene_.

**Panel.** Any side-docked glass surface — see _note panel_,
_settings pane_, _ideas drawer_. One panel open at a time.

**Pick pane.** The first-run welcome screen: a dim tagline
("point at a folder — it becomes a universe") and one button to
choose your workspace folder.

**Pinned note.** A note whose _frontmatter_ contains `pinned: true`.
Its position in space is user-authored (stored in frontmatter as
`position: [x, y, z]`) and not moved by physics.

**Protostar (formation).** Lights up notes created or edited in the
last 14 days. The quick answer to "what have I been working on
lately."

**Prune candidate.** A note the app thinks could be safely removed —
zero links, zero activity, nothing the _dream_ could do with it.
Listed in the _morning report_. Nothing is ever deleted
automatically; the user acts.

**Radiation (pressure).** A force in the sim where bright/massive
bodies push their neighbors outward. Interpreted in the _brain_
metaphor as "emotional heat" — memories with high _mass_ kick their
neighbors.

**Resonance.** The strength of a candidate interaction between two
notes in _dream mode_. Computed from the dot product of their
_affinity vectors_ times a mass/velocity factor. High-resonance
collisions can spawn an _idea_.

**Raycast / pick.** The computation that turns a mouse click into
"which body did you click?" Works by projecting every body to screen
space and picking the closest within its effective radius.

**Renderer.** The three.js WebGL renderer, scene, camera, and frame
loop. Lives in `src/sim/renderer.js`. Exposes an `onFrame` hook that
other modules subscribe to.

**Scene.** A named preset combining palette, _K matrix_, flocking
weights, radiation, physics params, and camera behavior. Inherited
from the original sim. In Boltzsidian, scenes become _dream scenes_ —
different flavors of dream.

**Search strip.** The thin glass bar that drops from the top when you
press `Cmd+K`. Type to filter; matching bodies glow, non-matches dim
to 20%. Arrow keys walk through the ranked list; enter opens; escape
closes.

**Settings pane.** The right-docked glass panel for adjusting app
settings — accent color, _tag → kind mapping_, kind labels.
Toggle with backslash (`\`).

**Sleep depth.** A `0..1` scalar that drives the _dream mode_ regime.
At 0 the universe is frozen (read/write normally); at 1 all physics
is active and the app is dreaming. Ramps up on idle, ramps down on
input.

**Sleep-wave cycle.** Inside a long idle the depth alternates between
a higher slow-wave level (consolidation: merging clusters, pruning)
and shorter REM bursts (recombination: high-novelty collisions). See
[DREAM.md §2](DREAM.md).

**Solo folder.** A _formation_: pick one folder, fade everything
outside it to near-invisible. The folder-drill-in without a sidebar
tree.

**Spring (link spring).** The pairwise attractive force between two
notes connected by a `[[link]]`. Soft — the target is an orbital
resonance, not a stiff tether. Lands in Phase 3.

**Starfield.** The ambient procedural stars that live far outside
the note cloud. They twinkle; they're not interactable; they're
there for aesthetic depth.

**Stats HUD.** The bottom-left glass pill showing note count, tag
count, and link count. Also reports progress during workspace load
("reading 47 / 150 notes…") and cataclysmic failures
("load failed").

**Symplectic Euler.** The integrator the sim uses: update velocity
first, then advance position using the new velocity. Preserves
phase-space volume, which means the simulation stays stable for
millions of steps without things drifting into explosions.

**Tag.** A `#word` inline in a note's body (not inside code blocks).
Tags are how you classify a note and drive its _kind_ via the
_tag → kind mapping_.

**Tag → kind mapping.** User-editable association from tag name
(`#episode`, `#person`) to body kind (0–6). Editable in the
settings pane. Boltzsidian is not opinionated — the defaults are
suggestions.

**Tether.** A visible rendered line between two linked bodies in the
universe. Introduced in Phase 3. Hovering a tether brightens both
endpoints; option-drag from body to body creates a new one.

**Tint.** The per-kind color blended into a body's visual. Separate
from the _accent_ (which is the UI color). Tints can combine with
_folder aura_ in the shader.

**Title.** The first H1 in a note (`# some title`), or the filename
without `.md` if no H1 is present. Editing the H1 renames the file
on the next save.

**ULID.** A stable, sortable, URL-safe 26-character identifier minted
automatically for every note. Stored in the note's _frontmatter_ as
`id:`. Survives renames and moves.

**.universe/.** A hidden folder inside your workspace where
Boltzsidian stores rebuildable sim state — positions, camera,
`K` matrix, cached search index, dream logs, prune candidates.
Deleting it is safe; the app rebuilds from the notes themselves.

**`.universeignore`.** A file at the vault root with gitignore-style
patterns. Folders listed here are invisible to the scanner, the
observer chorus, and the dream layer. Default suggestions: `private/`,
`journal/`, `therapy/` if they exist.

**Utterance.** One caption emitted by an _observer_. Sourced from a
template library (Phase 4 default) or, optionally, a local
_Web-LLM_ or the _Claude API_ (Phase 7).

**Vault.** Your workspace-as-in-memory-model: the parsed notes plus
the link graph, tag counts, by-id and by-title indexes. Distinct from
the workspace-on-disk (which is the source of truth).

**Voice backend.** Which engine produces _utterances_: `template`
(default, fast, quirky), `webllm` (on-device, better quality,
downloaded once), or `claude` (opt-in, best quality, sends a small
structured snapshot).

**Wake mode.** The default regime: physics effectively frozen,
bodies stay where the layout put them, you read and write
normally. Opposite of _dream mode_.

**Web-LLM.** A way to run a small quantized language model entirely
in the browser on your GPU. Optional voice backend. ~500MB
one-time download, then fully local.

**Wikilink.** The `[[target]]` syntax inside a note's markdown.
Same idea as Obsidian / MediaWiki. Clicking a rendered wikilink in
the _note panel_ navigates to the linked note.

**Workspace.** The folder on disk Boltzsidian opens. Everything
lives inside it: notes, `daily/`, `ideas/`, `.universe/`.
Switching workspaces opens a new window.

**Write-back.** When Boltzsidian writes to disk — autosave,
frontmatter maintenance, rename propagation, dream-generated
ideas. Always explicit, never surprising, never to files you didn't
opt in for.

---

## See also

- [[BOLTZMANN]] — observers and the meaning layer
- [[BRAIN]] — the sim as memory substrate
- [[BUILD_PLAN]] — phases 0–7 with acceptance criteria
- [[DREAM]] — the sleep/wake regime in detail
- [[FORMATIONS]] — folder auras and filter modes
- [[OBSIDIAN]] — the vault as seed corpus
- [[WORKSPACE]] — the product spec

#phase #panel #user
