---
tended_on: [tag-infer]
id: 01KPS7VDXRSCFZ9VABKEH1ZGG0
created: "2026-04-21T05:09:27.813Z"
---

# WORKSPACE.md — The Universe as a Note-Taking Environment

The keystone doc. [BRAIN](BRAIN.md), [BOLTZMANN](BOLTZMANN.md),
[OBSIDIAN](OBSIDIAN.md), and [DREAM](DREAM.md) are layers. This is the
thing they're layered on.

---

## 0. Premise, one paragraph

We are building a local, single-user, desktop note-taking application
whose workspace is a real-time GPU-accelerated particle universe. Every
note is a star. Reading, writing, linking, searching, and navigating are
spatial operations over a living field. The universe runs whether the user
is looking or not; when they come back, it has something to say. This is
not a visualization of a note-taking app. It is the app.

---

## 1. The thesis

Obsidian is the right file format and the wrong experience. Markdown files
in a local folder with `[[wikilinks]]` is the correct substrate — portable,
future-proof, uncommitted to any vendor. But the UI around it is a file
tree. A file tree is what you build when you don't know what else to do.

The universe sim knows what else to do.

There is one differentiator worth betting the product on: **the tool does
work while the user isn't looking, and has something useful to show them in
the morning.** Every other note-taking app is inert between sessions. This
one isn't. The workspace exists to make that loop productive — without
writing, reading, and linking happening inside the sim, the dream layer
([[DREAM]]) has no substrate to replay and the meaning filter
([[BOLTZMANN]] §5) has no content to score.

So: we are not building a prettier graph view. We are building the minimum
surface that lets a universe think about someone's notes usefully while
they sleep.

---

## 2. The five core interactions

These are the whole product at the interaction level. Anything not on this
list is either a consequence of these, or out of scope.

### 2.1 Write

A star _is_ a note. It is not a visualization of one.

- `Cmd+N` or click empty space → a particle spawns near screen center with
  a soft pulse. A glass panel slides in from the right with an empty
  markdown editor, title field focused.
- Type. Auto-save on pause (300ms of no keystrokes). The body in the world
  settles in place — low velocity, no kind yet, default kind until tagged.
- `Esc` closes the panel. Body stays put. Physics resumes.
- Frontmatter determines everything about the body's appearance and
  behavior (see §5). Writing `kind: episode` or adding `#episode` changes
  the body's color in the world, _live_, as you type the tag.

**Writing a long piece:** the panel can maximize to full-width, backgrounding
the sim (dimmed, slow). The body in the world grows in mass as word count
climbs, visible at the screen edge. When you exit the panel, the heavier
body is now a felt presence in the field. This is the single best feature
no other note app can copy: _you can feel your writing weigh something_.

### 2.2 Read

- Click a star → panel slides in with the markdown rendered.
- The body becomes the camera's focus. Auto-orbit kicks in at low speed.
  Its neighbors in the field are visible around the panel edges — this is
  its _associative context_.
- Links from the note appear as dim tethers to their target bodies. Hover
  a tether → both endpoints brighten.
- `Esc` closes. Camera drifts back to previous orbit over ~1.5s.

The act of reading a note is inseparable from seeing its neighborhood. This
is not a feature — it's a consequence of putting notes in space.

### 2.3 Link

Two paths, both required:

**In-editor:** type `[[` → a thin dropdown of fuzzy-matched titles. The
matching bodies in-scene dim briefly. Selecting one inserts the link and
fires the physical binding event.

**In-world:** option-drag from one body. A tether follows the cursor. Drop
on another body. Link created. Both notes' frontmatter updates. Both
bodies receive a brief attractive impulse toward each other, then settle
into a spring-pulled orbital resonance over the next ~5 seconds. The K
matrix Hebbian-updates slightly between their kinds ([[OBSIDIAN]] §3.2).

Deleting a link (right-click the tether, or remove the `[[...]]` in the
text) → tether fades over 500ms, spring releases, bodies drift back to
their free dynamics.

**This is the single most important interaction in the product.** Every
other note app treats `[[links]]` as punctuation. Here they are physical
constraints on how notes move in space. You will feel them.

### 2.4 Find

- `Cmd+K` opens search. A thin glass strip at the top of the viewport —
  _not_ a modal, the sim stays visible and running.
- Type. Matching bodies glow; non-matches fade to ~20% brightness. Ranking
  runs over title (fuzzy), tags, and body text.
- The top result is automatically focused: camera arcs to it, label becomes
  readable. Arrow keys walk through other results.
- `Enter` opens its panel. `Esc` returns camera to previous orbit, all
  bodies restore brightness.

Crucially: there is no list of results. There are five brightened stars in
a three-dimensional field, spatially arranged. The ranking is conveyed by
glow, not by position-in-a-list. If this feels wrong in practice, a fallback
list panel appears as a secondary surface — but try without it first.

### 2.5 Browse

- `OrbitControls` for camera. Pan, rotate, zoom.
- At a middle zoom level, visible bodies render floating DOM labels with
  their titles.
- Zoom close to a body → its label expands, and at a threshold the panel
  auto-opens in read mode (a kind of "tap into detail"). This replaces
  clicking for natural-feeling navigation.
- At zoomed-out scale, clusters visible as nebulae tinted by dominant tag.
  This is the galactic overview — your whole second brain as a landscape.

Filaments (chains) form naturally along high-coupling sequences — the
most visible being daily notes, which the sim treats as a time-bright
filament across the scene (see §5.3).

---

## 3. Information architecture

The viewport is the universe. Every UI element floats over it and has to
earn its real estate.

### 3.1 Permanent HUD (always visible, corners)

- **Top-left:** app name + current workspace folder name, tiny. Click →
  workspace switcher.
- **Top-right:** a small "noticed" bell. Dot appears when the dream layer
  or meaning filter has produced something the user hasn't seen. Click →
  morning report / ideas drawer.
- **Bottom-left:** stats line (notes count, links count, current kind
  filter). Mirrors the existing sim stats but semantic.
- **Bottom-right:** sleep-depth indicator — a thin crescent that fills as
  depth rises.

That's it. No sidebar. No always-visible panels. The universe is the UI.

### 3.2 Transient surfaces (slide in on demand)

- **Note panel** (right side, 480px default, resizable). Opens on star
  click, Cmd+N, or search-Enter. Markdown editor or rendered view,
  toggleable. Closes on Esc.
- **Search strip** (top, 60px tall). Cmd+K. Dismisses on Esc.
- **Morning report / ideas drawer** (right side, full height, slides over
  any open note panel). Bell-triggered.
- **Command palette** (Cmd+Shift+P). Actions, scene switches, settings.
- **Hotkey overlay** (`?`). Already exists in the sim.

### 3.3 What's deliberately missing

- **No file tree.** The universe is the tree. If you genuinely need to see
  all notes, command palette → "list all" opens a compact table view as a
  transient surface. Then you close it and go back to the universe.
- **No nested folders as a primary concept.** Notes live flat in the
  workspace folder. Tags are the organizing principle. (See §7.)
- **No multi-pane split view.** One note panel at a time. Reading two
  notes side-by-side is done by leaving both bodies visible and the panel
  open on one — the other is _right there_ in space.
- **No settings tree.** One settings pane, under ~20 options.

---

## 4. The home view

The first 200ms of the product are load-bearing. Three options:

### 4.1 Last-focused cluster (default for returning users)

Remember the camera state at session end. Restore it. If a note was open,
close it but leave its body visibly highlighted for 2 seconds, then fade.
The user picks up where they left off, spatially.

### 4.2 Today's daily note (alternative default)

Camera centers on today's daily-note body (spawning it if it doesn't exist
yet). This body is bright, heavy, fresh — the "now" of the scene. The
user is invited to start there by the sim's gravity itself.

### 4.3 Full overview (first-run only)

Zoomed all the way out, every note visible, clusters colored by tag.
Slow cinematic rotation for ~3 seconds, then transitions to §4.2.

Default: §4.1 for returning users, §4.3 for first launch, with a
command-palette entry to jump between any.

---

## 5. The star ↔ note correspondence

Exact mapping. This is the data model.

### 5.1 File on disk

```yaml
---
id: 01J8N3KT3F4A7XZQ   # ULID, stable across renames
kind: episode           # → body kind (0..6)
affinity: [0.1, ...]    # 8 floats; defaults computed from tags if absent
pinned: false           # if true, position in the sim doesn't drift
created: 2026-04-21T14:02
---

# The note title

Body in markdown.  Links like [[other-note-id]] or [[Other Note Title]].
Tags inline: #music #grief.
```

Filename is `{slug-of-title}.md`. Links use the title if unambiguous, else
ULID. Renaming a note rewrites filename _and_ updates incoming links in
other notes' bodies atomically — a standard Obsidian-style refactor.

### 5.2 Derived per-frame from file state

```
mass        = base + w_b * backlinks_count + w_w * log(word_count)
position    = sim state (initialized from force-layout, then physics)
velocity    = sim state
kind        = frontmatter `kind:` or mapped from first tag
ageNorm     = 1 - decay(now - last_edited)
tint        = palette channel per kind, tag-hue override if configured
pinned      = frontmatter `pinned:` (sim leaves it at its position)
```

### 5.3 Special kinds

- **Daily notes.** Detected by filename pattern `YYYY-MM-DD.md` in a
  configurable `daily/` folder. Rendered as a filament of bright bodies
  ordered by date along a soft curve in scene-space. Today's daily is
  heaviest and slightly brighter. Ages visibly as you scroll back.
- **Idea notes (dream-born).** Generated under `ideas/` ([[DREAM]] §3.2,
  [[BOLTZMANN]] §5.3). Marked with `born_in_dream: true` frontmatter. Rendered
  with a subtle halo so the user can tell what came from the universe vs.
  what they wrote. Can be promoted (strip the halo, move to a normal
  folder) or discarded from the drawer.
- **Pinned notes.** Frontmatter `pinned: true`. Position is user-authored
  (stored in `.universe/positions.json`), physics doesn't move them. Useful
  for reference anchors the user wants at a known spatial address.

### 5.4 Workspace state on disk

```
workspace/
├── *.md                         # the notes (authoritative)
├── daily/YYYY-MM-DD.md          # daily notes
├── ideas/*.md                   # dream-born candidates
└── .universe/
    ├── state.json               # sim state: positions, velocities, K, camera
    ├── positions.json           # pinned positions
    ├── prune-candidates.json    # dream-suggested removals (not auto-deleted)
    ├── dreams/YYYY-MM-DD.md     # full dream logs (DREAM §4)
    └── search-index.bin         # rebuildable
```

The `.universe/` subfolder is discardable. Delete it and the workspace
rebuilds from the notes on next launch. Notes are the truth; sim state is
ephemera.

---

## 6. How the four speculative docs fit

These stop being features and become the actual product's layers. Reframe
each:

- **[[BRAIN]]** is the _tuning model_. It tells us what a healthy K matrix
  looks like, what radiation does, why separation matters. When we choose
  defaults for a new workspace, we're choosing from the palette BRAIN.md
  describes. An "artist" default preset is a real setting.

- **[[OBSIDIAN]]** is the _data ingestion spec_. The mapping from note
  metadata to body parameters (§5 here) is the concrete form of what
  OBSIDIAN.md §3 sketched. The "vault as seed corpus" is the actual
  workspace.

- **[[BOLTZMANN]]** is the _ambient voice layer_. Observer chorus is an
  ambient feature, off by default, toggled from the settings pane. It
  provides peripheral narration. The meaning filter (BOLTZMANN.md §5) is
  the idea-promotion pipeline that produces the dream-born notes in
  `ideas/`.

- **[[DREAM]]** is the _engine of the differentiator_. Sleep Depth, idle
  triggers, morning reports, pruning suggestions. This is the loop that
  justifies the rest of the product's existence.

None of these four is a standalone feature any user should see. The user
sees: writing, reading, linking, finding, browsing. The four layers make
those interactions feel like they're happening inside something alive.

---

## 7. What we deliberately don't build

Negative space is part of the design. Resist adding any of these without a
strong reason:

- **Plugin ecosystem.** The aesthetic is the product. Plugins mean theming,
  theming means UI divergence, divergence means the app looks like Obsidian
  within six months. One opinion, held consistently.
- **Real-time sync / collaboration / cloud.** Single-user, single-machine.
  The trust story is "your notes never leave your disk." This is a feature,
  not a limitation.
- **Mobile.** A 3D workspace on a phone is a toy. Desktop-only.
- **Nested folder trees as primary navigation.** Flat workspace + tags +
  `ideas/` + `daily/` + `.universe/` is the entire folder structure.
- **Multi-workspace within one instance.** One workspace per window. Users
  who want multiple keep multiple windows.
- **An AI chat box.** No "talk to your notes" interface. The AI here, if
  present at all, is the ambient chorus and the dream utterances — voices
  that surface, not servants that answer queries.
- **Settings for the physics.** The sim's physics parameters are tuned to
  defaults and not user-exposed in the workspace mode. A separate "scene
  studio" can exist for Michael to tune presets; for end users, the
  parameters are invisible.

---

## 8. The hard bits

Enumerated so the scope is visible and no one is surprised.

### 8.1 Text over WebGL

A markdown editor embedded over a live three.js canvas. Two choices:

- **CodeMirror 6** for editing. ~500KB minified, modular, used by Obsidian
  itself, excellent markdown mode. Right answer for anything past the
  prototype.
- **`marked` or `markdown-it`** for rendering. ~30KB. Straightforward.

Break the single-file invariant if needed (the CLAUDE.md says don't split
unless asked — this is asking). Probably move to a two-file shape:
`index.html` + `workspace.js` once the editor goes in, with a build step
that concatenates for distribution if we care about preserving the
single-file-open story.

### 8.2 In-scene labels

Project body positions to screen space each frame, render DOM labels at
those coordinates. Only render labels for bodies within a visibility
threshold (distance, size, or "N nearest to camera" — whichever feels best).
CSS2DRenderer from three.js examples works; a manual implementation with
`Vector3.project()` is simpler.

Budget: ~200 visible labels is tractable. More than that gets noisy both
visually and in the DOM.

### 8.3 Body count as workspace

A sim-scale workspace is 200–5000 notes. Not 4096 arbitrary particles.
Implications:

- Not all notes need to be GPU bodies at all times. Consider splitting:
  "active" notes (last-touched, nearby, linked to focus) run full physics;
  "distant" notes render as a single pixel or a background density field.
- Search index has to be live and cheap. `minisearch` or an in-house
  inverted index over ~2000 notes is ~50ms to build, <5ms per query.
- Force-directed initial layout runs once per workspace open (seed from
  `.universe/state.json` if it exists, else compute and cache).

### 8.4 File persistence

File System Access API (Chromium-family only). User picks the workspace
folder at first launch; we hold a persistent handle via IndexedDB.
Read/write markdown files on save. Fallback for Firefox/Safari: download /
upload roundtrip (clunky), or "local-only mode" where notes live in
IndexedDB and can be exported as a zip. Realistically this is a Chrome /
Edge product for the first year.

### 8.5 The morning report and background execution

Browsers throttle background tabs aggressively. A dream in a backgrounded
tab may run at 1 Hz. This might be _fine_ — slow dreams are still dreams —
but measure before committing. If unacceptable, a tiny Electron shell
solves it without touching the web build.

### 8.6 Renaming, link integrity, undo

Renaming a note updates every incoming link in every other note. This is
standard Obsidian behavior and users will expect it. Needs a transactional
layer over the FS handle: collect changes, write all at once, hold an undo
record. Non-trivial but well-trodden.

---

## 9. Phase plan

Seven phases. The product exists at phase 3. Phases 4–7 are what
distinguishes it from a 3D graph-view app.

### Phase 1 — Read the vault

- FS Access API: pick a folder, scan `*.md`.
- Parse frontmatter, links, tags, word count per note.
- Force-layout the link graph into 3D, seed bodies at those positions.
- Click-to-open a read-only panel. `Esc` to close.
- Search via Cmd+K, dim non-matches, arc camera to top match.

Output: a real vault, visualized and readable, in the sim's aesthetic. Not
yet a note-taking app. One week.

### Phase 2 — Write the vault

- Markdown editor in the panel (CodeMirror 6 or textarea+`marked`).
- Save on pause. File writes via FS handle.
- `Cmd+N` spawns a body + creates a file.
- `[[autocomplete]]` in editor.
- Tag changes → live kind reassignment in-scene.
- Frontmatter refresh on save.

Output: usable as an Obsidian replacement, minus the magic. One week.

### Phase 3 — Physical linking

- Option-drag tether creation between bodies.
- Spring-pulled resonance on link creation (2–5 second settle).
- Tether visualization for all links at appropriate zoom.
- Mass from backlink count + word count; labels sized accordingly.
- Daily-note filament.

Output: the product. This is what ships as 1.0. Two weeks.

### Phase 4 — Observer chorus

- [[BOLTZMANN]] §2 nominator: 2–4 observers max, templates only.
- Floating DOM captions, short lifetime, fade-out.
- Settings toggle: off by default. Users opt in.

Output: ambient aliveness. Three days. (Gate on feeling right — kill if
the templates read as noise.)

### Phase 5 — Dream mode

- Sleep Depth slider + idle detection.
- Parameter regime swap per [[DREAM]] §1.
- Morning report modal: weather, three things, prunings.
- Write `dreams/YYYY-MM-DD.md` full log.
- Never auto-delete files; prunings go to `prune-candidates.json`.

Output: the differentiator, finally real. One week.

### Phase 6 — Meaning filter

- Star-memory interaction detection (proximity + resonance).
- Child idea spawning during dream mode (and rarely during wake mode).
- Scoring function (novelty × coherence × reach × freshness).
- Promoted ideas → `ideas/*.md` with `born_in_dream: true`.
- Drawer UI for browsing, promoting, or discarding candidates.

Output: the universe writes notes at the user. One week. The hardest to
get right — tuning will dominate.

### Phase 7 — Voice upgrade

- Pluggable utterance backend: templates (default), Web-LLM (local), or
  Claude API (with a user-supplied key).
- Same interface across all three.
- Never default-on for API — always user-chosen with a clear pricing
  warning.

Output: optional depth. Three days to wire; indefinite to tune.

**Stop at phase 3 if 4 doesn't feel right in prototype. Stop at 5 if 6
doesn't feel right. Each gate is real.**

---

## 10. Open questions for Michael

Things the doc can't decide alone:

1. **Is this the same codebase as the sim, or a fork?** The sim is a
   tuned artist tool; the workspace is a product. Sharing the core makes
   both better, but the sim's "scene switcher" and "physics studio" UX
   don't belong in a note app's settings pane. I'd fork a new directory
   (`workspace/`) that imports shared modules (shaders, K presets,
   palettes) from the sim directory. Decide before phase 1.

2. **How opinionated about tags?** The sim needs a tag → kind mapping.
   Options: (a) hard-coded defaults (`#episode` → star, `#person` → galaxy,
   etc.) — opinionated but predictable; (b) user-configured per workspace;
   (c) learned from cluster patterns. I lean (a) with (b) as override.

3. **What's the name?** "Universe Simulator" and "Orrery" belong to the
   sim. A workspace product with [[BRAIN]]/BOLTZMANN/DREAM underneath probably
   wants a different handle. Not my call.

4. **Monetization? Distribution?** Electron app on itch.io? Web-only via
   `app.yourdomain.com`? One-time purchase / donation / free? Changes
   nothing architecturally but shapes Phase 0 entirely.

5. **Single-player forever, or is there a multi-user future?** The whole
   trust story depends on single-player. If there's ever a "share a
   universe with a friend" feature, it's a separate product line. Commit
   to single-player for the 1.0.

6. **What's the first dream the user should ever see?** The first-run
   experience has to include a small curated "demo vault" so the user can
   press "Dream Now" on day one and see what the system does — otherwise
   they won't build a real vault in this tool until they understand why.
   This is a content problem, not a code problem, and it'll be the single
   most important hour of craft in the whole project.

---

## 11. What this is, said one more time

A local, single-user markdown note-taking application whose workspace is a
GPU-accelerated particle universe. Notes are stars. Links are physical
tethers. Reading is orbital. Finding is a camera arc. And — the reason it
exists — the universe thinks about your notes while you sleep, and hands
you three things in the morning.

Every other note-taking app is a filing cabinet that stops when you close
the laptop. This one is a small, local, private machine that keeps
thinking. That's the whole pitch. Everything in this doc is in service of
that one sentence.

#user #panel #phase

[[TEND_BULK_RESET.md — Why does "Accept all" reset the page after ~150?]]
