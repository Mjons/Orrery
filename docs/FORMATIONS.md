# FORMATIONS.md — Folder auras, cluster modes, and viewing filters

A speculative design doc. WORKSPACE.md treats tags as the primary organizing
axis and deliberately de-emphasizes folders. This doc asks: given that some
vaults _are_ heavily foldered, how does Boltzsidian honor that without
betraying the flat-universe ideal? And what kinds of _viewing filters_
does the universe naturally support once folders can be seen?

Two ideas, one doc:

1. **Folders as a secondary axis** — visual differentiation + optional
   spatial clustering, with a dissolve-mode default for users who don't
   care.
2. **Formations** — named filter modes for reading the universe. "Show
   me the protostars." "Show me what's been forgotten." Star-formation
   metaphors, but honestly earned.

---

## 0. The two axes, reconciled

In Boltzsidian, a note has two pieces of structural information beyond
its content:

| Axis       | What it drives         | Example                         |
| ---------- | ---------------------- | ------------------------------- |
| **Tag**    | _Kind_ (appearance)    | `#episode` → bright star        |
| **Folder** | _Region_ and/or _aura_ | `/work/` → blue-green aura band |

Tags control the body itself — color, size, pulse pattern — because a tag
_is_ what kind of thought this is. Folders don't say what kind of thought
it is; they say what area of your life it belongs to. That asymmetry
should read in the visuals: tags touch the body, folders touch the space
around it.

---

## 1. What folders _can_ do

Three independent things. Any combination allowed. All off by default —
opt in via settings.

### 1.1 Folder tint (aura)

Each folder gets a soft outer glow — a low-saturation halo around every
body in that folder. The body's core color (from kind) is untouched. You
can tell a `/work/` star from an `/art/` star by the _color of its edge_,
not by its center.

Constraint: the aura palette is drawn from a curated 8-tone band that
coexists with the accent. Low saturation, perceptually distinguishable
under bloom. No rainbow. The app stays visually coherent.

```
Default folder-aura palette (editable):
  cobalt · teal · sage · amber · ochre · rose · violet · slate
```

A vault with ≤8 top-level folders gets automatic assignment on first
load; ≥9 folders share tones (confirmed in a settings prompt). Users can
re-assign or blank any folder's tint.

### 1.2 Folder basin (spatial clustering)

Optional gravitational pull toward a folder's centroid. Three strengths:

- **Dissolve** (default): folder membership contributes nothing to layout.
  Pure link-graph positioning. Everything all over.
- **Soft** (recommended for most foldered vaults): a weak pull toward
  each folder's computed centroid during the initial force-layout. Same-
  folder notes settle _near_ each other but link-based attraction still
  dominates. You can tell the regions exist without them looking
  sectioned.
- **Strong**: basin pull is dominant. Folders carve visible islands in the
  field. Link-graph pulls still stretch between islands but don't override
  regional identity. This is the view for users who _want_ folders to be
  the primary spatial metaphor — e.g., many career-journal vaults.

The basin is a real gravity-like force in the sim engine (once Phase 3
lands). In wake mode it's a one-shot settlement; in dream mode it's a
live force — and that's where the interesting thing happens: **dream
scenes with strong basins look like a galaxy with clearly-visible arms;
dream scenes with dissolve look like a nebula.** Both are correct
depending on what you want to see.

### 1.3 Folder pulse

Optional: folders get a slow, low-amplitude synchronized twinkle. All
`/daily/` notes pulse gently on one phase, all `/work/` on another. This
is a _very_ subtle effect — so subtle the user may never consciously
notice it, but it gives folder regions an ambient "pulse" that helps the
eye recognize them peripheral-vision.

Default: off. Probably won't ship in 1.0. Left here as a hook.

---

## 2. What folders _don't_ do

The exclusions are load-bearing. Even with everything above enabled:

- **Folders are not a navigation primitive.** Cmd+K still searches the
  whole universe. No sidebar tree. If you want to "see only `/work/`,"
  that's a formation (§4), not a folder drill-in.
- **Folders don't change a note's kind.** Kind is a property of the
  thought; folders describe location in your life. A `#person` note
  about your brother stays a galaxyB body whether it lives in `/people/`,
  `/family/`, or the root.
- **Nested folders flatten for aura purposes.** `/work/clients/acme/` uses
  the tint of `/work/`, not three stacked tints. The visual system
  doesn't do hierarchy.
- **Folder assignment is not learned.** You put the file where you put
  it; we don't infer. (The meaning filter in Phase 6 can _suggest_
  folder moves — but never act on its own.)

---

## 3. How folder basin interacts with links

Link springs and folder basins are both forces on the same bodies.
Three regimes:

- **Soft basin + normal link springs** (default when folders enabled):
  folders gently group, links locally distort. A link between two
  folders pulls their members across the basin boundary — you see
  bridges form. This is the natural state of a working vault.
- **Strong basin + strong link springs**: basins keep folders apart,
  links _stretch_ visibly between them. Cross-folder links become
  dramatic tethers.
- **No basin + link springs only**: folders invisible structurally,
  everything by semantic proximity. This is the Boltzsidian-default
  view and probably the most cosmologically honest one.

None of these is wrong. Settings → "Folder influence" slider, 0 to 1.
One number, three vibes.

---

## 4. Formations — named filter modes

A formation is a named, transient _way of looking at the universe_. It
never changes a file; it only changes what's visible and how. You step
into one with a keystroke, step out with `Esc`.

Think: a curated lens on an otherwise-overwhelming field. The metaphor
is astronomy, but only where the metaphor earns its keep.

### 4.1 Proposed formations

| Keys | Formation         | What it does                                                   |
| ---- | ----------------- | -------------------------------------------------------------- |
| `1`  | **All**           | Reset. Everything lit at normal brightness.                    |
| `2`  | **Protostars**    | Bodies created in the last 14 days glow; others dim to 20%.    |
| `3`  | **Main sequence** | Stable notes (≥3 links, not edited in 14d, not dust) glow.     |
| `4`  | **Supernovae**    | Notes edited ≥5 times in the last 48h glow — recent churn.     |
| `5`  | **Halo**          | Notes with zero links glow; healthy clusters dim. Forgottens.  |
| `6`  | **Binaries**      | Pairs of bodies whose _only_ link is to each other glow.       |
| `7`  | **Galactic core** | The densest cluster in the link graph gets full brightness.    |
| `8`  | **Globular**      | Old (≥1yr) + densely-linked (≥5 links) — long-consolidated.    |
| `9`  | **Nebula**        | Tag-overlap regions render as soft colored fog. Ethereal.      |
| `0`  | **Solo folder**   | Pick a folder; only its notes visible. Outside dims to near-0. |

Formations are orthogonal — you can combine them (e.g. Solo `/work/` +
Protostars = what have I been doing in work this fortnight). The rail
shows active formations as small pills; click a pill to pop it.

### 4.2 Which ones are load-bearing, honestly

Five that would earn their keep on day one:

- **Halo** — answers "what have I forgotten" better than any sidebar tree.
- **Protostars** — makes "what am I working on lately" spatially obvious.
- **Solo folder** — the folder-drill-in without a folder tree.
- **Galactic core** — finds your most-connected hub automatically.
- **Nebula** — the only formation that reveals _tag co-occurrence_ as a
  shape. This is uniquely Boltzsidian; no other tool shows it.

The others (Main sequence, Supernovae, Binaries, Globular) are speculative
flavor — ship two or three and see which ones people actually keep
pressing. Cut the rest.

### 4.3 UI

A thin **formations rail** docked to the top (separate from the search
strip). Summoned by `Shift+F`. Shows 10 labeled pill buttons in a row,
keyboard shortcuts visible. Active formation pills stay lit at the top
until dismissed. Rail auto-hides when a formation is active and the
user hasn't moved the mouse for 3 seconds — stay out of the way.

Escape from a formation = `Esc` or `1` (All).

### 4.4 Formations can be saved

A user can capture the current filter state (selected formations + solo
folder + any live search) as a named preset. Presets show up at the end
of the rail as custom pills with the user's chosen name. Stored in
settings, not in the vault — they're a viewing habit, not a vault
artifact.

Example saved formations:

- _"Morning"_ = Solo `/daily/` + last 7 days
- _"Archaeology"_ = Halo + Globular — old + forgotten
- _"Active art"_ = Solo `/art/` + Protostars

---

## 5. How this composes with dream mode

Formations are _wake-mode lenses_ on a static universe. Dream scenes
(DREAM.md §1, Phase 5) are _physics regimes_ on a dynamic universe.
Different layers, complementary:

- A formation filters _what you see_. It never moves bodies.
- A dream scene changes _how bodies move_ (and sleep-depth decides when).
  It never filters what you see.

In practice:

- A **dream** can run with any formation active (though the filter effect
  on non-matching bodies fades out smoothly during dream mode — dream
  should see the whole field).
- A **formation** applied after a dream shows you what just moved — "Solo
  `/ideas/` + Protostars" after a morning is literally "what the universe
  wrote overnight."

And there's one nice unification with the sim's scene concept: a dream
scene can optionally come packaged with a recommended formation for the
morning report. A "Galaxy Collision" dream scene auto-opens to the
"Galactic core" formation the next morning — you wake up looking at the
new densest cluster. The scene finished the thought; the formation
points at what was produced.

---

## 6. Minimal first cut (after Phase 3 physics lands)

Shippable as part of Phase 3.5 or as a standalone follow-up:

1. **Settings → Folder influence**: single slider 0–1, default 0 (dissolve).
2. **Settings → Folder tint palette**: 8 tones, user-reassignable per folder.
3. **Top-level folders → aura uniform**: per-body `uFolderTint` in the
   bodies shader, set once at load.
4. **Formations rail**: `Shift+F` summons, `1–5` quick-toggle the five
   load-bearing formations from §4.2.
5. **Nebula formation** deferred — needs a separate rendering pass for
   the tag-overlap fog. Worth the work, but not day one.
6. **Saved formations (presets)** deferred — ship after users have lived
   with the default rail for a month.

That's a week of work. Folder-clustering as a live force in dream mode
is automatic once Phase 3's GPGPU engine lands — no new code required,
just exposed parameters.

---

## 7. What this is in one sentence

Folders tint the space around your notes without dictating their
meaning, and formations let you look at the whole universe through one
question at a time.

Both are off by default. Both are always escapable. Neither writes to
your files. The vault stays flat and portable; only the _view_ becomes
multi-dimensional.
