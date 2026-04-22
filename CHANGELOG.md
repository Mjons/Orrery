---
tended_on: [tag-infer]
id: 01KPS7VDXYB2RFMMS2FR4ZTW5M
created: "2026-04-21T20:45:42.293Z"
---

# CHANGELOG

Notable changes to this repository. Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
The repo hosts two parallel products: the **sim** (the artist tool on `main`)
and **Boltzsidian** (the note-taking app on branch `boltzsidian`). This
log is branch-agnostic — the product each entry applies to is tagged.

## [Unreleased]

Huge catch-up commit covering months of uncommitted work on the
`boltzsidian` branch. Individual phases were scoped and shipped; the
version control just never caught up. Grouped by phase / layer below.

### Added — Boltzsidian product

**Phase 2 — Write the vault**

- CodeMirror 6 editor in the note panel with markdown mode, `[[` wikilink
  autocomplete, `#` tag autocomplete, `Cmd+Enter` save-and-close.
- 300 ms idle auto-save writing directly to markdown files via the FS
  Access API.
- `N` keybind to spawn a new note at screen center with a fresh body in
  the universe.
- Vault mutations pipeline: `mutations.js`, `save.js`, `writer.js`,
  `links.js` — title-driven renames propagate through incoming
  `[[wikilinks]]` transactionally.
- `titleToStem` / `uniquePath` helpers for conflict-free filenames.

**Phase 3 — Physical linking**

- GPGPU-backed physics engine (`sim/physics.js`) with velocity +
  position textures, softened gravity, flocking, K-matrix attractive /
  repulsive coupling.
- Alt-drag link gesture (`ui/link-drag.js`) — drag from body to body,
  drop to commit a new `[[link]]` plus a spring-pulled orbital
  resonance.
- Visible tether shader (`sim/tethers.js`) — rendered lines between
  linked bodies, hoverable, right-click unlink with a confirmation
  guard (see `confirm_unlink` setting).
- `sim/kmatrix.js` — 7×7 interaction matrix with persisted state in
  `.universe/state.json`.
- `sim/sparks.js` — short-lived "bump" flashes at pair midpoints when
  the salience layer produces a candidate; visible proof of the
  mechanic.

**Phase 3.5 — First-run + demo vault**

- Welcome card with "Try the demo" / "Open my folder" / theme picker.
- Two curated demo vaults installed into OPFS:
  - `astronomer` — amateur stargazer's notebook
  - `project` — the developer notes that became this project
- `DEMO_THEMES` registry with a per-theme switch button in settings.
- Tag-coverage discovery prompt — fires after load when the mapping
  covers < 80 % of notes.
- Coachmark system (`ui/coachmarks.js`) that teaches one gesture at a
  time as the user performs each for the first time.
- About pane with privacy statement + donation link (`ui/about.js`).

**Phase 3.7 — Formations + folder auras**

- Folder tint system (`vault/folders.js`) with an 8-tone curated palette
  that coexists with the accent. Auto-assign on first vault open;
  user can override per folder.
- Folder influence slider — 0 to 1 — drives a per-folder gravitational
  basin in the physics layer.
- Formations rail (`Shift+F`) with filter modes: All, Halo, Protostars,
  Solo folder, Galactic core.

**Phase 4 — Observer chorus**

- `layers/chorus.js` + `layers/chorus-templates.js` — ambient voice that
  picks notes + emits a sentence observing something about the vault.
- Floating caption renderer (`ui/captions.js`) with per-caption lifetime
  and fade-out.
- Settings: chorus on/off, density (low / med / high), font-size.
- Model face (`ui/model-face.js`) — visual persona of the active
  backend, eight expressions, backend-tinted glow.

**Phase 5 — Dream mode**

- `layers/dream.js` — Sleep Depth state machine (dormant → falling →
  dreaming → waking) with REM / slow-wave oscillation.
- `Cmd+D` morning report modal — weather, three things, prunings
  worth noticing.
- Shift+D "Dream now" — ramps to 1.0 for 60 s.
- Dream banner (`ui/dream-banner.js`) — ambient indicator at top of
  screen while dreaming.
- Dream log writer (`layers/dream-log.js`) — full per-night log
  written to `.universe/dreams/YYYY-MM-DD.md`.
- Prune candidates (`layers/prune.js`) surfaced in the morning report;
  never auto-deleted.

**Phase 6 — Salience / meaning filter**

- `layers/salience.js` + `layers/salience-layer.js` + `layers/salience-templates.js`
  — proximity-triggered pair interactions during dream mode; resonance
  scoring on novelty × coherence × reach × freshness.
- `layers/affinity.js` — 8-float affinity vectors per note, seeded
  from tag hashes, drift during dreams.
- `layers/promote.js` — promoting / discarding / ignoring ideas with
  writes to `ideas/` folder carrying `born_in_dream: true`.
- Ideas drawer (`ui/ideas-drawer.js`) — right-side panel listing
  surfaced candidates with parent references, per-idea actions.
- Salience debug palette (`Shift+S`, `ui/salience-debug.js`) — live-
  tune the 8 scoring params + cap, watch every candidate with its
  four-axis breakdown. Inline tooltips with viewport-aware positioning.

**Phase 7 — Voice backends**

- Pluggable utterance router (`layers/utterance/`) with the four
  backends behind one interface:
  - `template-backend.js` — synchronous floor, never fails.
  - `local-backend.js` — LAN rig via OpenAI-compat `/v1/chat/completions`
    or Ollama's native `/api/chat`. Detects Gemma (no system role),
    Qwen3 (`/no_think` prefix), reasoning-model token budgets.
  - `webllm-backend.js` — on-device WebGPU via `@mlc-ai/web-llm`.
  - `claude-backend.js` — Anthropic API with per-shape payload
    approval (`ui/payload-preview.js`) on first send.
- Connection test flow in settings — one-shot request with full
  response dump to devtools.
- Per-job-kind prompts: `chorus-line` (dry snarky observer),
  `dream-caption` (drifting half-sleep), `idea-seed` (hallucinator).

**Tend / librarian foundation**

- `layers/tend.js` + `layers/tend-apply.js` — heuristic curation
  passes: tag-infer, obvious-link, title-collision, fm-normalise,
  stub. Produces proposals; never writes without user accept.
- Tend drawer (`ui/tend-drawer.js`) — per-card accept / reject flow.
- Weed drawer (`ui/weed-drawer.js`) + `layers/weed.js` — prune-
  candidate review with archive / delete / keep actions.

**Ambience + cluster rendering**

- `sim/ambience.js` — five named presets (Default / Galactic / Clinical /
  Dream / Vintage) with linear interpolation between them.
- `sim/post.js` — EffectComposer pipeline with UnrealBloomPass + a
  single vignette / temperature / grain ShaderPass.
- `sim/clusters.js` — label-propagation community detection over the
  link graph + per-note local-density computation; feeds the bodies
  shader so clustered notes render brighter (bloom pools the glow).
- `sim/hover-orbit.js` — tiny orange planet ring around the hovered
  body, planet count = backlinks + forward links.
- Live-tunable ambience intensity slider in settings.

**Picking + interaction polish**

- `sim/bodies.js` — exported `cssPixelRadius()` single-source-of-truth
  for sprite size (matches the shader exactly, preventing the picker
  from drifting from what's drawn).
- Pick-debug overlay (`ui/pick-debug.js`) — orange radius rings per
  body + cursor crosshair + live-tunable console overrides
  (`__boltzsidian.debug.pick.{radiusScale, offsetX, offsetY, extraTolerance}`).
- Canvas-rect-aware projection — `updateScreen()` reads
  `renderer.domElement.getBoundingClientRect()` so sidebars /
  devtools / any viewport offset stop breaking hit-testing.

**Labels**

- Three-state label visibility (`L` cycles Always / On hover / Never).
- Cursor-lens in Always mode — labels within 240 px of the pointer
  stay solid, ambient fades with distance.
- Proximity-driven reveal in On hover mode — nearest visible sprite's
  title appears, with the full hover experience (2× size, orange
  flare, orbit ring) firing from proximity, not DOM mouseenter.
- Modifier pass-through — holding Alt or Shift flips all labels to
  `pointer-events: none` so link-drag / tether-right-click gestures
  reach the canvas cleanly.

**Inline suggestions (in-editor)**

- `ui/suggestions.js` — pure heuristic engine: tag co-occurrence ×
  folder kinship × global frequency for tags; title-mention scan for
  links.
- Dedicated suggestions slot in the note panel (sibling of panel-body,
  not inside the editor — so the markdown area never shrinks).
- Click a tag chip → appends to a trailing tag-only line (cursor
  preserved). Click a link chip → inserts `[[Title]]` at cursor.
- `×` to dismiss per-note per-session.

### Planning docs added (speculative layer)

- `AMBIENCE.md` — cluster glow + post-processing presets.
- `BOLTZMANN.md` — fleeting observers + meaning layer.
- `BRAIN.md` — sim as memory substrate.
- `CANVAS.md` — Obsidian Canvas import as a scene seed.
- `CONSTELLATIONS.md` — cluster-level labels at wide zoom.
- `DREAM.md` — sleep / wake / REM cycle.
- `DREAM_ENGINE.md` — warp / magnify / wander / bump / spawn mechanic.
- `FORMATIONS.md` — folder auras, basins, filter modes.
- `GLOSSARY.md` — plain-English vocabulary reference.
- `LABELS.md` — three-state label design.
- `LIBRARIAN.md` — AI-assisted curation (propose-never-write).
- `MODEL_SURFACES.md` — where model output shows up in the UI.
- `OBSIDIAN.md` — the vault as seed corpus.
- `PICKING.md` — hit-testing diagnosis + fix.
- `RITUALS.md` — times-of-day anchors (honest fit analysis included).
- `SALIENCE.md` — scoring function and params.
- `STATES.md` — tend passes + weed drawer.
- `SUGGESTIONS.md` — inline tag / link suggestions design.
- `TENDING.md` — the heuristic curation pipeline.
- `WORKSPACE.md` — the keystone product spec.
- `BUILD_PLAN.md` — operational phase plan with exit gates.
- `GLOSSARY.md` — vocabulary reference.

### Fixed

- Picker now uses the canvas's actual bounding rect, not the window —
  viewport offsets from devtools / sidebars no longer misalign the
  hit zones (reported as "158 × 95 offset").
- Salience-debug tooltips styled with CSS `:hover` instead of the
  native `title` attribute that lagged 500 ms and looked unstyled.
  Viewport-aware positioning so they never clip at window edges.
- Label-hover in On hover mode no longer requires pointer-perfect
  landing on a sub-pixel sprite — proximity within a mass-scaled
  radius reveals the label.
- Editor + panel-body now have visible accent-tinted scrollbars
  (default browser bars were invisible on dark glass).
- Tag-chip click no longer shifts prose mid-paragraph — appends to
  a trailing tag-only line or starts one at EOF, cursor preserved.

### Security

- `.env` added to `boltzsidian/.gitignore` — ensures local API-key
  scratch files never land in version control. `.env.example` is
  explicitly allowed for safe template commits.

### Changed

- Dream-engine prompt rewritten to reference warped attributes; idea-
  seed output now leans toward fragments and claims over questions,
  with a banned-essay-word list (`recurring`, `suggests that`,
  `manifestation`, etc.).
- `buildPairSnap` accepts `{ pairSeed, dayKey }` — each pair + day
  gets a deterministic warp; next day re-rolls.

### Still on the shelf (not committed as features)

- Librarian (AI-assisted curation) — doc only, no code.
- Rituals — doc only, recommended not to ship until after 1.0.
- Constellations — doc only, clean implementation path described.
- Suggestions Phase 3 (post-save toast, LLM-assisted) — heuristic tier
  ships now, AI tier waits.

---

## Previously committed (on `main` / pre-branch)

- `5f5a0a7` — FORMATIONS.md + Phase 3.7 in BUILD_PLAN.
- `30c4dfa` — Phase 1: read the vault (bodies, click-to-read, search,
  labels).
- `d8e402f` — Phase 0 scaffold (Vite + three.js + FS Access).
- `360d6d8` — Boltzsidian planning stack: WORKSPACE + BUILD_PLAN +
  BOLTZMANN + OBSIDIAN + DREAM.
- `08d3635` — Sim: rename tracks, `orrery` rename in STREAM_SETUP.
- `2a80f39` — Sim: soundtrack MP3s.
- `0d195b3` — Sim: seeded PRNG, share links, ring-mode trail,
  Milky Way scene, BH slingshot, `?objects=` URL param.
- `814d585` — Initial commit: Orrery sim.

#phase #panel #reference
