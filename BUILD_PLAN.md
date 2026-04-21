# BUILD_PLAN.md — Boltzsidian

Operational build plan. [WORKSPACE.md](WORKSPACE.md) is the product spec;
this doc is how we ship it.

---

## 0. Decisions locked in

From Michael, 2026-04-21:

1. **Fork strategy**: new branch `boltzsidian` on this repo. The sim stays
   as-is on `main`. The branch will diverge; if/when divergence is large
   enough, split to its own repo — not before.
2. **Tag → kind mapping**: user-configured, not hard-coded. App ships with
   suggested defaults the user can edit freely. "Not opinionated" means
   the app doesn't presume to know what `#person` or `#idea` should look
   like in your universe.
3. **Name**: **Boltzsidian** (Boltzmann + Obsidian).
4. **Distribution**: free, donation-supported. Open source (MIT). Hosted
   web app at a domain TBD + GitHub source for self-hosters.
5. **Multi-user**: single-player for 1.0. No collaboration hooks in the
   data model — add later as a separate product line if ever.
6. **First-run demo vault**: a curated ~40-note vault ships with the app.
   Critical craft surface. Addressed in Phase 3.5.

---

## 1. Divergence from the sim's CLAUDE.md

CLAUDE.md on main holds for the sim. Boltzsidian breaks three invariants
deliberately. Flag this so future Claude sessions on the branch don't
undo it:

| Sim invariant (CLAUDE.md)    | Boltzsidian                                        |
| ---------------------------- | -------------------------------------------------- |
| Single-file HTML, no bundler | Vite + npm. CodeMirror 6 requires it.              |
| No npm                       | Full `package.json`, dependencies versioned.       |
| Plain JS only                | Plain JS only — no TypeScript. Stays.              |
| Never open externally        | Deployed as a hosted web app + self-host download. |
| WebGL2 only                  | Stays. Same GPU floor.                             |

A `boltzsidian/CLAUDE.md` will be added in Phase 0 documenting the new
invariants for the branch.

---

## 2. Repository layout

Branch: `boltzsidian`.

```
Universe_sim_4_7/                    # repo root
├── index.html                       # the sim, untouched on branch
├── SPEC.md, ROADMAP.md, ...         # existing sim docs
├── BRAIN.md, BOLTZMANN.md, ...      # speculative docs
├── WORKSPACE.md, BUILD_PLAN.md      # product docs
└── boltzsidian/                     # NEW — the product
    ├── package.json
    ├── vite.config.js
    ├── index.html                   # app shell
    ├── CLAUDE.md                    # branch-specific invariants
    ├── public/
    │   └── demo-vault/              # ships with the app
    ├── src/
    │   ├── main.js                  # entry
    │   ├── vault/                   # FS Access, parsing, index
    │   ├── sim/                     # three.js, shaders, physics
    │   ├── editor/                  # CodeMirror 6 integration
    │   ├── ui/                      # panels, HUD, search strip
    │   ├── layers/                  # chorus, dream, meaning
    │   └── state/                   # persistence, settings
    └── shared -> ../                # symlink to sim shaders/palettes (read-only)
```

Shared code (shaders, K presets, palette arrays) stays at repo root and is
imported by the app via relative path. When the sim evolves on `main`,
merge `main` into `boltzsidian` to pick up improvements.

---

## 3. Tech stack

| Concern        | Choice                         | Why                                         |
| -------------- | ------------------------------ | ------------------------------------------- |
| Bundler / dev  | **Vite**                       | Zero-config, HMR, ES modules, fastest DX    |
| 3D             | **three.js r160**              | Shared with sim                             |
| Editor         | **CodeMirror 6**               | Markdown mode, `[[autocomplete]]`, keyboard |
| MD rendering   | **marked** (~30KB)             | Rendering only, not editing                 |
| MD frontmatter | **gray-matter** (~10KB)        | Parses YAML frontmatter reliably            |
| Search         | **minisearch**                 | ~20KB, fast, in-memory inverted index       |
| Storage        | **File System Access API**     | Chromium only; fallback = export zip        |
| Handle persist | **IndexedDB**                  | Persists FS handle across sessions          |
| IDs            | **ULID**                       | Stable, sortable, URL-safe                  |
| Icons          | **Lucide** (inline SVG)        | Small, clean, one-color-friendly            |
| Date           | native `Intl`                  | No date lib                                 |
| LLM (Phase 7)  | **Web-LLM** and **Claude API** | Both behind the same interface              |
| Deploy         | **Netlify** (or Vercel)        | Static host, instant deploy, free tier      |
| License        | **MIT**                        | Standard permissive; matches donation model |
| Node           | **20 LTS**                     | Vite 5 floor                                |

Browser floor: **Chromium 122+** (FS Access + WebGL2 + OffscreenCanvas).
Firefox/Safari get a degraded "export / import zip" mode. Document clearly;
don't apologize for the focus.

---

## 4. Cross-cutting architecture

### 4.1 Settings schema

One settings pane, stored at `.universe/settings.json` per workspace. A
user-level `~/.boltzsidian/settings.json` for defaults that seed new
workspaces.

```json
{
  "accent": "#8ab4ff",
  "home_view": "last_focused", // or "daily" or "overview"
  "idle_minutes_to_dream": 10,
  "sleep_depth_cap": 0.85,
  "observer_chorus": false,
  "utterance_backend": "template", // "template" | "webllm" | "claude"
  "claude_api_key_ref": null, // opaque ref; key itself in OS keychain
  "tag_to_kind": {
    "episode": 0,
    "fact": 1,
    "anchor": 2,
    "mood": 3,
    "context": 4,
    "self": 5,
    "person": 6
  },
  "kind_labels": {
    "0": "Episode",
    "1": "Fact",
    "2": "Anchor",
    "3": "Mood",
    "4": "Context",
    "5": "Self",
    "6": "Person"
  }
}
```

The defaults above are **suggested, not prescribed**. First-run asks the
user to confirm or edit the mapping against a preview of their vault's
top 10 tags.

### 4.2 Keyboard shortcuts (designed up front)

| Key                | Action                            |
| ------------------ | --------------------------------- |
| `Cmd/Ctrl+N`       | New note at screen center         |
| `Cmd/Ctrl+K`       | Search                            |
| `Cmd/Ctrl+Shift+P` | Command palette                   |
| `Cmd/Ctrl+Enter`   | Save and close panel              |
| `Esc`              | Close panel / search / dialog     |
| `Cmd/Ctrl+D`       | Dream Now                         |
| `Space`            | Pause / resume physics            |
| `[` / `]`          | Cycle focused star (by proximity) |
| `F`                | Focus camera on selected star     |
| `L`                | Start link-drag from focused star |
| `?`                | Hotkey overlay (reuse sim's)      |
| `\`                | Toggle left / settings rail       |

Single binding table in `src/ui/shortcuts.js`. Do not scatter key handlers.

### 4.3 Error handling

- FS errors surface as toast + "retry" button, never silent.
- Save failures queue writes in memory and retry on next user action.
- Never auto-delete anything. Prunings are _suggestions_ written to
  `prune-candidates.json`; the user pulls the trigger.
- Every error path logs to `.universe/errors.log` (workspace-local).

### 4.4 Privacy

- No analytics. No telemetry. No phone-home. Document explicitly in README
  and About pane.
- Claude API path (Phase 7) is opt-in, off by default. When on, an
  indicator is always visible. The payload schema is visible in Settings.
- `.universeignore` file in the workspace root (gitignore syntax) excludes
  folders from any processing — observer chorus and dream layer respect it.

### 4.5 State persistence layers

| Layer            | Where                                   | Authoritative?    |
| ---------------- | --------------------------------------- | ----------------- |
| Note content     | `*.md` files                            | Yes               |
| Frontmatter      | `*.md` files                            | Yes               |
| Link graph       | Derived from `[[links]]` in note bodies | Derived           |
| Body positions   | `.universe/state.json`                  | No (rebuildable)  |
| Camera + zoom    | `.universe/state.json`                  | No                |
| K matrix         | `.universe/state.json`                  | No                |
| Prune candidates | `.universe/prune-candidates.json`       | Yes (until acted) |
| Dream logs       | `.universe/dreams/YYYY-MM-DD.md`        | Yes               |
| Settings         | `.universe/settings.json`               | Yes               |
| Search index     | `.universe/search-index.bin`            | No (rebuildable)  |

Delete `.universe/` → app rebuilds on next launch from notes alone. This
invariant has to hold at every phase.

### 4.6 Accent color

`--accent: #8ab4ff` from the sim stays as the default. Settings can
override. One color used consistently across all UI — no second accent.
This is load-bearing for the aesthetic.

### 4.7 Performance budgets

| Operation                    | Budget               |
| ---------------------------- | -------------------- |
| App cold boot (no vault)     | < 1.5s               |
| Vault open (1000 notes)      | < 3s                 |
| Search keystroke → UI update | < 16ms               |
| Save file on edit pause      | < 100ms              |
| Frame time at idle           | < 8ms (120fps-ready) |
| Frame time during dream      | best-effort          |
| Memory at 1000 notes         | < 400MB              |

Measure in Phase 3 polish. Re-measure at every phase gate.

---

## 5. Phases

Eight phases plus scaffolding and beta. Each phase has a goal, concrete
deliverables (Dn), testable acceptance criteria, and an exit gate — the
condition under which we stop before proceeding.

---

### Phase 0 — Scaffolding (3–5 days)

**Goal.** A Boltzsidian app that boots, shows an empty universe, and can
open a workspace folder — but does nothing else.

**Deliverables.**

- D0.1 — Create branch `boltzsidian` from the current HEAD on `main`.
- D0.2 — `boltzsidian/` folder with Vite + `package.json` + MIT `LICENSE`.
- D0.3 — App shell: `boltzsidian/index.html` with a full-viewport canvas,
  top-left app-name label, a "Choose workspace folder" button.
- D0.4 — three.js renderer booted, single starfield background (port from
  sim), no bodies yet.
- D0.5 — FS Access API handshake: click button → pick folder → persist
  handle to IndexedDB → show folder name in top-left.
- D0.6 — Settings pane accessible via `\`. Renders current settings JSON
  in a read-only preview for now.
- D0.7 — `boltzsidian/CLAUDE.md` documenting branch invariants.
- D0.8 — README with quickstart, browser requirements, and the privacy
  statement.
- D0.9 — CI: GitHub Actions runs `vite build` on PR. Netlify auto-deploys
  the branch to a preview URL.

**Acceptance.**

- Open the dev server: black screen with a starfield, button visible.
- Click button, pick a folder: folder name shows top-left. Reload page:
  folder name still shows (handle persisted).
- `vite build` produces a dist with no warnings.

**Exit gate.** The shell looks and feels like the sim's aesthetic — same
glass, same accent, same bloom. If it looks like a generic Vite starter,
we haven't spent enough time on aesthetic parity. Do not proceed without
this.

---

### Phase 1 — Read the vault (1 week)

**Goal.** Point at a real folder full of markdown, see those notes as a
navigable universe, open any of them for read-only.

**Deliverables.**

- D1.1 — Vault scanner: walk the folder, parse `*.md`, extract frontmatter
  (gray-matter), title (first H1 or filename), tags (inline `#tag`), and
  links (`[[...]]` in body).
- D1.2 — ULID auto-assigned if `id:` frontmatter missing. Written back on
  next save (deferred — read-only in Phase 1, write-back in Phase 2).
- D1.3 — Force-directed layout: 2D force-layout of the link graph, then
  distribute along Z by `(word_count + created_time)` → 3D spread.
  One-shot cache to `.universe/state.json`.
- D1.4 — Bodies rendered for every note. All same kind in Phase 1 (kind
  assignment comes in Phase 2). Mass from `1 + backlinks + log(words)`.
- D1.5 — DOM label projection: bodies within a zoom threshold get a
  floating title label.
- D1.6 — Click a body → note panel slides in from the right. `marked`
  renders the body markdown read-only. Frontmatter hidden.
- D1.7 — `Esc` closes panel. Camera drifts back to prior orbit.
- D1.8 — Search (`Cmd+K`): minisearch index over title + tags + body.
  Top hit glows and camera arcs to it. Non-matches dim to 20%.
- D1.9 — Stats HUD bottom-left: note count, tag count, link count.

**Acceptance.**

- Point at a 50-note test vault. App loads in < 2s.
- Every note is visible. Link-rich clusters are visibly denser.
- Click any note → read its body in the panel.
- Cmd+K + typing → camera smoothly arcs to match. Hitting Enter opens it.
- Reload: positions restored from `state.json` (no re-layout flash).

**Exit gate.** If reading a real vault this way doesn't _already_ feel
better than Obsidian's graph view — ask why. If it's layout quality, fix.
If it's something structural, pause and rethink before adding write.

---

### Phase 2 — Write the vault (1 week)

**Goal.** Create, edit, and save notes without leaving the app.

**Deliverables.**

- D2.1 — CodeMirror 6 editor in the note panel. Markdown syntax mode.
  Edit toggle switches between rendered (`marked`) and edit (`CM6`).
- D2.2 — Auto-save on 300ms idle. Write atomic (temp file + rename when
  possible via FS API; fallback = direct write).
- D2.3 — Title is first H1 in the body. Rename file on title change
  (debounced; one rename per minute max). Update incoming links in other
  notes transactionally.
- D2.4 — `Cmd+N` spawns a body at screen center with a random small mass
  and opens an empty editor.
- D2.5 — `[[` trigger opens inline autocomplete (fuzzy over titles +
  ULIDs). Selecting inserts the link with `[[Title]]` syntax.
- D2.6 — Live tag → kind: typing `#person` while the body is visible
  re-tints the body to the configured kind. Implemented via save-side
  diffing, not keystroke-level (keeps editor fast).
- D2.7 — Tag → kind settings UI: edit the mapping in Settings. Preview
  shows top 10 tags and current mapping.
- D2.8 — Frontmatter auto-maintained: `id`, `created`, `kind`, `affinity`
  are managed by the app. Users don't hand-edit them (but may).
- D2.9 — Undo/redo: last 50 ops. One undo = revert last save + its
  side-effects (renames, link rewrites).

**Acceptance.**

- Open app, Cmd+N, type a 200-word note, add 2 tags and 1 link, close.
  Reopen: all present, in-world body reflects tags and mass.
- Rename a note. Check another note that linked to it: link still works.
- Crash the app mid-edit (kill tab). Reopen: last ~300ms of edits may be
  lost, nothing else.

**Exit gate.** If the editor feels bad — laggy, fighting the keyboard,
annoying with autocomplete — stop and fix. The editing feel is 60% of the
product's dailyusability. Hard gate.

---

### Phase 3 — Physical linking (2 weeks)

**Goal.** Links are visible, physical, draggable; the universe starts
feeling alive.

**Deliverables.**

- D3.1 — Link tethers: for every link between two in-view bodies, render a
  thin line between them. Shader-based; uses a trails-style pass so tethers
  can fade in / out smoothly.
- D3.2 — Spring force on linked pairs: soft spring, natural length
  proportional to log(body_masses_product). Softening is dream-sensitive
  (deeper sleep = softer).
- D3.3 — Option-drag link creation: hold option, mouse-down on body A,
  drag to body B, release. Raycast hit-test. Valid drop shows a pre-tether
  preview. On drop: link written to both notes' bodies, tether appears,
  transient attractive impulse animates resonance settling.
- D3.4 — Right-click tether → delete link. Tether fades over 500ms, spring
  releases.
- D3.5 — Daily-note filament: detect files in `daily/` matching
  `YYYY-MM-DD.md`. Arrange them on a smooth curve, parameterized by date,
  bright + higher kind saturation.
- D3.6 — Mass → body size → label size. A note with 30 backlinks should
  feel heavy.
- D3.7 — K matrix Hebbian update: each confirmed in-scene interaction
  (link creation, co-orbit below a distance threshold) nudges K slightly.
  Save K to `state.json`.
- D3.8 — Pinned notes: `pinned: true` frontmatter freezes position.
  Editable in settings pane for a selected note.
- D3.9 — Home view implementation: §4 of WORKSPACE.md. Settings toggle
  between the three modes; default is `last_focused`.

**Acceptance.**

- Two notes on screen, option-drag from one to the other: link is
  persisted to both files' bodies, tether appears, they settle into
  visible orbital resonance.
- Delete the link via right-click: tether fades, they drift apart.
- Open a workspace with a `daily/` folder: see the filament. Scroll time
  and the filament is navigable.
- K matrix inspectable via the command palette → "Show K" (debug only).

**Exit gate.** If in-world linking doesn't feel like the best way to link
notes — better than typing `[[x]]` — we've got the feel wrong. The
`[[` flow is the safety net; this is the magic. Hard gate.

---

### Phase 3.5 — First-run + demo vault (1 week)

**Goal.** A new user's first five minutes are crafted and right. The app
_teaches itself_.

**Deliverables.**

- D3.5.1 — Curated demo vault shipped in `public/demo-vault/`. ~40 notes.
  Theme TBD; candidates: "a composer's year," "a gardener's journal,"
  "an amateur astronomer's notes." Something with inherent tag variety.
- D3.5.2 — First-run flow: on launch with no prior workspace:
  - Welcome card, one paragraph, one button: "Try the demo" or
    "Open my folder."
  - Demo path: copies `public/demo-vault/` into a sandboxed workspace
    (IndexedDB-only), boots straight into overview view.
  - User path: FS Access picker.
- D3.5.3 — Tag → kind confirmation: after a vault loads, if the
  configured mapping doesn't cover ≥ 80% of the vault's notes, show a
  prompt: "Three tags we don't know: [list]. Map them?" with a quick UI.
- D3.5.4 — Onboarding coachmarks: tiny, one-per-interaction. Fire once
  per user globally. "Try Cmd+N." "Try option-dragging between these
  two stars." Store dismissal in user-level settings.
- D3.5.5 — "Dream Now" is available even on the demo vault. First
  successful dream produces a real morning report (Phase 5 dep —
  this gate waits for Phase 5 or uses a canned-template report).
- D3.5.6 — About pane: what the app is, privacy statement, donation
  link, version, GitHub link.

**Acceptance.**

- Fresh install, no prior state: launch → welcome → demo vault loads in
  < 3s → first coachmark fires. Within 60s an average user has created a
  note and drag-linked two things.
- Tag prompt fires exactly when needed, not otherwise.

**Exit gate.** Test with 3 people (not Michael). If any of them is
confused about what the app does in the first two minutes, the welcome +
demo are wrong. Iterate before moving on.

---

### Phase 3.7 — Formations (1 week)

**Goal.** Folders become visible as regions without becoming the
navigation model; named filter modes (formations) let the user look at
the universe through one question at a time. Full design in
[FORMATIONS.md](FORMATIONS.md).

**Deliverables.**

- D3.7.1 — Folder-aura palette: 8-tone low-saturation band, curated to
  coexist with the accent. Stored in settings; user-reassignable per
  folder.
- D3.7.2 — Per-body `uFolderTint` uniform in the bodies shader rendering
  a soft outer halo. Core body color (from kind) untouched.
- D3.7.3 — Top-level folder flattening: nested folders inherit their
  top-level ancestor's tint. No visual hierarchy.
- D3.7.4 — **Folder influence** slider (0–1) in settings, driving
  gravitational basin strength in the GPGPU engine. Default 0 (dissolve).
  Lives as a real force in dream mode once Phase 3 is in place.
- D3.7.5 — Formations rail: `Shift+F` summons a top-docked pill rail of
  labeled filters. Keyboard shortcuts `1`–`9`. `Esc` or `1` clears.
- D3.7.6 — Five load-bearing formations shipped:
  `All`, `Halo` (zero-link notes), `Protostars` (last 14 days),
  `Solo folder` (pick one, fade the rest), `Galactic core` (densest
  cluster auto-detected).
- D3.7.7 — Formations are orthogonal — active pills stack. Composes with
  search: search filters by text, formations filter by structure, they
  intersect rather than fight.

**Deferred (for later phases or cut):**

- Nebula formation — requires a separate tag-overlap fog pass.
- Supernovae / Main sequence / Binaries / Globular — flavor formations;
  ship two, see if they earn their keep, cut the rest.
- Folder pulse (synchronized twinkle) — very subtle, probably cut from 1.0.
- Saved formation presets — add once users have lived with the defaults.

**Acceptance.**

- Open a vault with 3+ top-level folders. Aura palette auto-assigns and
  each folder reads distinctly under bloom without the UI drifting off
  the accent palette.
- Slide Folder influence from 0 to 1: wake mode re-settles into a
  basin-dominated layout; dream mode shows basins as live forces with
  links stretching across them as bridges.
- `Shift+F` → `2`: only bodies touched in the last 14 days glow.
  `Shift+F` → `5`: halo notes glow. Both active simultaneously: the
  intersection lights up (often empty — which is the insight).
- A new "Solo folder" formation is applicable even when the folder-aura
  setting is off. Folders exist structurally either way.

**Exit gate.** Live with it for a week on Michael's real vault. If you
never press `Shift+F`, cut formations. If you leave Folder influence at
0 permanently and never set tints, remove the setting from the pane. The
defaults-off posture has to feel right — formations are a power-user
affordance, not the main interaction surface. Don't let them become a
secondary sidebar by stealth.

---

### Phase 4 — Observer chorus (3–5 days)

**Goal.** The universe has ambient voice. Off by default.

**Deliverables.**

- D4.1 — Observer nominator (BOLTZMANN §2): 5Hz CPU scan of the
  texturePosition readback. Score regions, pick up to 4, promote.
- D4.2 — Template utterance library: 30–50 templates with slot patterns.
  Slots filled from local field (dominant kind, palette, nearest
  neighbors, age). Seeded RNG so repeated captures are reproducible.
- D4.3 — DOM caption render: floating labels near observer centroid, CSS
  fade-in/out. Max one new caption per 10 seconds, max 3 visible at once.
- D4.4 — Settings: toggle on/off, density slider (low/med/high), font-size.
- D4.5 — Captions collected into a rolling buffer (last 50) for the
  morning report.

**Acceptance.**

- Turn on. Within a minute, at least one caption appears. Within five
  minutes, at least three different captions have appeared.
- Turn off: all current captions fade within 2 seconds, no further ones.
- Captions _never_ reference anything the user didn't put in the vault.

**Exit gate.** Live with it for a week. If you reflexively turn it off
after a day, the templates are wrong. Do not proceed to Phase 7 voice
upgrade if Phase 4 templates aren't already enjoyable — LLMs will not
fix a tonally wrong system.

---

### Phase 5 — Dream mode (1 week)

**Goal.** The differentiator. The app produces a morning report.

**Deliverables.**

- D5.1 — Sleep Depth slider (0..1) in settings. Manual control.
- D5.2 — `applyDreamParams(depth)` interpolates physics + filter
  parameters per DREAM.md §1 table. One function, tested in isolation.
- D5.3 — Idle detector: no pointer / keyboard / focus events for N
  minutes. Sleep Depth ramps to configured cap over 30 seconds.
- D5.4 — REM / slow-wave cycle: depth oscillates gently between cap and
  cap×0.6 on ~90-second cycles with short REM bursts (~15s) at cap.
- D5.5 — Wake detection: any input → Sleep Depth ramps to 0 over 2s.
  If a dream produced artifacts, morning report modal shows.
- D5.6 — Morning report modal:
  - Header: date range, depth reached.
  - Weather: notes in/out, candidates produced, prunings suggested.
  - Three things: top-3 observer captions by score.
  - Prunings worth noticing: up to 3 notes with no activity this cycle.
  - Actions: "Load full dream" (opens the day's dream log note),
    "Discard", "Export to Obsidian" (write to workspace root).
- D5.7 — Dream log: full markdown-format log at
  `.universe/dreams/YYYY-MM-DD.md`. Contains all captions, scores,
  parameter trajectory, and events.
- D5.8 — `Cmd+D` = "Dream Now" (temporary manual trigger). Ramps to 1.0
  for 60 seconds, then reports.
- D5.9 — Prune candidates written to `prune-candidates.json`, surfaced
  in morning report. **Never auto-deleted.**

**Acceptance.**

- Idle for 10 minutes in the demo vault: depth rises, physics visibly
  softens (gravity looser, bloom cranked, camera drifts). Move the
  mouse: morning report appears within 3 seconds.
- `Cmd+D` produces a report every time within 60–90 seconds, even on a
  small vault.
- Prune candidates never reference a note edited in the last 48 hours.

**Exit gate.** Read three morning reports. If none of them made you
notice anything you hadn't noticed, tune scoring. If all of them read as
mystical / purple, tune voice. Both are fixable; neither is skippable.

---

### Phase 6 — Salience layer (1–2 weeks)

**Goal.** The universe writes notes at you.

(Renamed from "Meaning filter" — see SALIENCE.md for the layer metaphor
and the rationale. v1 ships as a flat filter; the volumetric sheath is a
deferred v2 if the scoring tunes cleanly.)

**Deliverables.**

- D6.1 — Per-note affinity vectors: 8 floats per note. Initialized from a
  stable hash of the note's tags; frontmatter `affinity: [...]` overrides.
  Notes with no tags get zeros. Attached at vault-open time in memory;
  no sidecar file.
- D6.2 — Proximity-triggered interactions: during dream mode, any two
  non-pinned bodies within a distance threshold roll against resonance.
  Resonance = `dot(affinity_a, affinity_b) * log(mass_a * mass_b)`.
- D6.3 — Child-idea spawning (in-memory): resonance above θ_spawn spawns
  a candidate child record at interaction midpoint. Affinity = weighted
  mix of parents. Seed text from the paired-fact template bank with a
  raw `A ↔ B` fallback. **No file is written at spawn.**
- D6.4 — Salience score: `novelty × coherence × reach × (1 - age_penalty)`
  as described in BOLTZMANN §5.3. Reach is raw kind-diversity of nearest
  neighbours — K matrix stays out of v1. Parameters tunable from a debug
  palette on `Shift+S`.
- D6.5 — **Promotion writes to disk** (not spawning). Promoted ideas →
  `ideas/YYYY-MM-DD-HHMM-<slug>.md` with `id`, `created`, `born_in_dream: true`,
  `parents: [path-a, path-b]`, `resonance`, `salience`, `affinity`.
- D6.6 — Ideas drawer on the **left** side, `I` keyboard shortcut. Shows
  surfaced candidates (unread highlighted). Per idea: seed text, parent
  titles (click → camera arcs + opens parent note), Promote / Discard /
  Ignore. Surfaced-but-unpromoted candidates dissolve on reload — only
  promoted ones persist.
- D6.7 — Unread count pill in the top-right HUD during wake when new
  candidates surface. Clicking opens the drawer.

**Acceptance.**

- Run Dream Now on the demo vault 10 times. Expect ~3–5 promoted ideas
  across those runs (tune thresholds to hit this).
- Every promoted idea points to real parent notes.
- Discarding an idea actually deletes its file.

**Exit gate.** After one real week of use on Michael's own notes: if
zero promoted ideas surprised him, the filter is mis-tuned. If every
promoted idea was junk, the filter is too permissive. Iterate on
thresholds before Phase 6.5.

---

### Phase 6.5 — Tend, manual (1 week)

**Goal.** The janitorial counterpart to dream. Takes a messy (freshly
imported, under-tagged, under-linked) vault and proposes the _obvious_
structural fixes a human would spot in thirty seconds — but never
writes without confirmation.

Full design in [STATES.md](STATES.md) §2.

**Deliverables.**

- D6.5.1 — `src/layers/tend.js` scanner with five passes, any subset
  enable-able via settings:
  - tag inference (proposes existing tags when body text overlaps
    other notes' tag vocabulary — never invents new tags)
  - obvious-link detection (title-mention + shared-tag + affinity
    similarity + folder proximity; above a _high_ threshold, not a
    clever one)
  - title-collision resolution (≥90% title similarity flagged as
    likely duplicate, never auto-merged)
  - frontmatter normalisation (missing `id` / `created`, conflicting
    `id`s, surfaced for review)
  - stub detection (body < 30 words + generic title)
- D6.5.2 — Proposals drawer: same left-side slide-in pattern as the
  ideas drawer, but rows show concrete diffs (add tags, add link,
  delete duplicate). Per-row Accept / Reject / Skip. Bulk
  "Accept all" action only after individual review of a handful.
- D6.5.3 — Manual trigger: Settings → Workspace → "Run Tend now." One
  scan, proposals drawer opens when complete. No automatic background
  passes in this phase (that's 7.5).
- D6.5.4 — Accepted diffs go through the existing saver so they pick
  up the atomic-write + link-rewrite behaviours from Phase 2.
- D6.5.5 — A "tended-on" frontmatter stamp on any note touched by an
  accepted tend proposal, so future runs don't re-suggest the same
  thing.

**Acceptance.**

- Run on the demo vault fresh: produces roughly 3–10 suggestions per
  50 notes (tune until this).
- No suggestion ever invents a tag the user's vault doesn't already
  use.
- Accepted diffs persist across reload; rejected ones are forgotten.

**Exit gate.** Run it once on Michael's real vault. If he rejects
every suggestion, the thresholds or pass selection is wrong. If he
accepts them all without hesitation, they're probably too safe and
the tool isn't earning its keep. Aim for ~70% acceptance.

---

### Phase 6.6 — Weed (3 days)

**Goal.** Close the loop on Phase 5's prune candidates. The user
actually sees the orphan list and acts on it. Hoarding risk
(DREAM.md §7) gets a real countermeasure.

Full design in [STATES.md](STATES.md) §3.

**Deliverables.**

- D6.6.1 — Weed drawer: deliberately-utilitarian list view (no glass,
  no animation). Reads `.universe/prune-candidates.json` from the
  dream cycle. Per row: title, path, reason (already computed by
  Phase 5's `computePruneCandidates`), last-edited timestamp.
- D6.6.2 — Per-row actions: **Keep** (writes the note id to a
  "keep-permanent" list so it never re-appears as a candidate),
  **Archive** (moves the file to `.universe/archive/YYYY/` — the
  vault walker already skips hidden dirs), **Delete** (calls FS
  Access `removeEntry`; confirmation per file).
- D6.6.3 — Bulk-action bar: "Keep all remaining" and
  "Archive all remaining." No bulk delete — that's explicitly
  per-file.
- D6.6.4 — Weekly soft-toast: if the prune list has grown by more
  than N entries since the last time the user opened Weed, show a
  dismissable toast suggesting a weed pass.
- D6.6.5 — Settings: Weed can be disabled entirely; keep list is
  editable.

**Acceptance.**

- Archived files show up in `.universe/archive/YYYY/` and the body
  count in the vault drops accordingly.
- Kept items never re-appear on subsequent prune passes.
- Deleted items generate a toast with no undo path — the file is
  gone. (Matches the uncomfortable-by-design spirit.)

**Exit gate.** A week of dreams must produce at least one item
Michael is willing to archive. If Weed never has anything he'd
remove, either his vault is unusually tidy or the prune computation
is too strict.

---

### Phase 6.7 — Brief (3 days)

**Goal.** The 90-second "show me where I am" panel for sessions that
don't have a dream to replay. Lightest of the new states — more a
copy + layout exercise than engineering.

Full design in [STATES.md](STATES.md) §4.

**Deliverables.**

- D6.7.1 — Brief panel: small glass card, centred, shown on workspace
  open when `settings.brief_on_open !== false`.
- D6.7.2 — Content (derived, not generated):
  - 3 heaviest notes (top-`massOf`) — "your anchors."
  - 3 protostars (most-recent mtime) — "what you've been writing."
  - 1 halo note (long-quiet, zero-link) — "what you might have
    forgotten." Picked deterministically by date so the same day
    always surfaces the same orphan.
  - 1 obvious-bridge pair from Phase 6.5's detector — "two notes
    that probably should know each other." Only shown when the
    detector has material; otherwise skipped cleanly.
- D6.7.3 — One-key dismiss (`Esc` or any navigation key). Never
  modal.
- D6.7.4 — Settings toggle to disable Brief for returning users
  who've already oriented themselves and just want the universe.

**Acceptance.**

- Brief appears within ~300 ms of workspace load; never blocks the
  canvas render.
- Dismissable with a single keystroke.
- The "forgotten" pick is stable across the same-day reloads.

**Exit gate.** Brief must not feel like theatre. If it reads as
filler content — generic "here are some notes" — the selection rules
are too loose. Every bullet should name a _specific_ note with an
observable reason.

---

### Phase 7 — Voice upgrade (3 days wire, indefinite tune)

**Goal.** Optional depth for utterance quality.

Scope is deliberately narrow: voice surfaces only (chorus, dream
reports). Extending model output to other surfaces — structural
enhancement, content assistance, semantic search — is the subject of
[MODEL_SURFACES.md](MODEL_SURFACES.md) and is explicitly post-Phase-7
work. Read that doc before widening scope.

**Deliverables.**

- D7.1 — `UtteranceBackend` interface: `generate({snapshot, templateHint}) → {text, confidence}`.
- D7.2 — `TemplateBackend` (default, from Phase 4).
- D7.3 — `WebLLMBackend`: bundles a quantized ~1B-param model via Web-LLM.
  First-load cost flagged to user (~500MB download, ~5min warm-up). Local
  after that. No internet needed after initial download.
- D7.4 — `ClaudeBackend`: user-supplied API key stored in OS keychain via
  the Credential Management API if available, else IndexedDB-encrypted
  against a workspace passphrase. Clear Payload Preview showing exactly
  what gets sent. Rate limits enforced client-side.
- D7.5 — Settings: backend chooser, with latency and cost expectations
  for each.
- D7.6 — Fallback: any backend error falls back to templates transparently.

**Acceptance.**

- Switch between all three backends without app restart. Observer chorus
  and dream reports both respect the active backend.
- Claude backend shows exactly what will be sent before the first request
  of a session; user must approve once.

**Exit gate.** Ship as optional, clearly labeled. Default stays templates.

---

### Phase 7.5 — Tend-in-dream (1 week)

**Goal.** Fold the Phase 6.5 tend passes into the dream loop so
obvious structural work happens overnight alongside the salience
layer's creative work. Depends on both feeling polished — if tend is
still producing junk suggestions manually, running it unattended will
multiply that.

Full design in [STATES.md](STATES.md) §2.2 (the "during dream" mode).

**Deliverables.**

- D7.5.1 — Dream-time tend pass: during a cycle at `depth > 0.3`,
  the tend scanner runs at a low cadence (~once per REM burst) and
  pushes any obvious proposals into the dream's artefact bundle
  rather than acting.
- D7.5.2 — Morning report gets a new section: **Housekeeping** —
  separate from "Three things." Lists the tend proposals the dream
  produced, styled differently from salience candidates so the user
  can tell which is which at a glance (a tend suggestion is
  "obvious" — a salience candidate is "interesting").
- D7.5.3 — Per-proposal actions in the morning report: same Accept /
  Reject / Skip as the manual Tend drawer. Accept writes through the
  saver.
- D7.5.4 — Settings toggle: `tend_during_dream: false` by default.
  This is opt-in. The always-tending antipattern (STATES.md §7.4)
  gets avoided by keeping the user in charge of whether the
  housekeeping runs.

**Acceptance.**

- A dream cycle with `tend_during_dream: true` on a freshly-imported
  folder produces roughly 3–6 housekeeping proposals alongside 0–2
  salience candidates.
- No housekeeping proposal appears if the vault is already tidy.
- The morning report visually separates the two sections.

**Exit gate.** Michael runs this for a week on his real vault. If
housekeeping section feels more useful than Three things, salience is
underperforming and needs tuning. If housekeeping feels redundant with
what he'd catch manually, the threshold is too loose. Both axes
should feel earned.

---

## 6. Public beta (after Phase 5)

**Goal.** Real users, honest feedback, before 1.0.

**Deliverables.**

- B1 — Deploy `boltzsidian.com` (domain TBD) to Netlify from the branch's
  latest main-like stable tag.
- B2 — Donation link live via GitHub Sponsors or Ko-fi. "Support this
  project" in the About pane.
- B3 — Issue tracker open. GitHub Discussions enabled.
- B4 — Short landing page: one sentence, one screenshot, one 30-second
  video of Dream Now producing a morning report. "Open app."
- B5 — Privacy statement page: exact bullet list of what's local, what's
  optional, and what the Claude backend sends if enabled.
- B6 — Collect feedback via GitHub and one email form. No analytics.

**Acceptance.**

- 10 users who aren't Michael have used the app for a week and sent
  feedback. At least 3 have dreamed their own vaults and kept a promoted
  idea.

---

## 7. 1.0 release (after Phase 6.7 at minimum, ideally through 7)

**Goal.** A product that is legitimately recommendable.

Release checklist (tick all):

- [ ] Phase 0–6.7 complete and stable. (Phase 7 and 7.5 are optional
      for 1.0 — Voice upgrade is polish; Tend-in-dream is an advanced
      composition that can land in a post-1.0 point release.)
- [ ] Performance budgets met at 1000-note vault scale.
- [ ] Documentation: README, privacy, architecture, contributing.
- [ ] Demo vault curated and shipping.
- [ ] Donation + support channels live.
- [ ] Three real users who would be disappointed if the app went away.
- [ ] Known-bug list short enough to fit on one screen.
- [ ] Self-host instructions work for someone who isn't Michael.

---

## 8. Post-launch

Not committed, but anticipated:

- **Electron wrapper.** For users who want it as a desktop app and to
  enable unattended background dreaming uncapped by tab throttling.
- **A "dream review" view.** Browse all past morning reports. See your
  own evolution reflected.
- **Canvas-file compatibility.** Import/export Obsidian Canvas as scenes.
- **Multi-vault.** One window, multiple workspace folders switchable via
  the top-left selector. Not collaboration — just switching.
- **Echo state.** Animated replay of a wake or dream session in the
  universe — the "prove the dream didn't silently change anything"
  affordance. See [STATES.md](STATES.md) §5. Deferred because it's
  visual polish over a load-bearing trust feature, and the simpler
  states (Tend / Weed / Brief) deliver more value first.

Explicitly not post-launch:

- Plugins. Sync. Mobile. Collaboration.

---

## 9. Risks

Ranked by likelihood × impact.

| Risk                                                                  | Mitigation                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| Observer chorus reads as slop                                         | Phase 4 gate is hard. Don't ship if you turn it off.     |
| Salience layer promotes junk 90% of the time                          | Phase 6 gate on Michael's real vault. Tune or cut.       |
| Tend proposes obvious junk or non-obvious weirdness                   | Phase 6.5 gate: ~70% acceptance on the real vault.       |
| Tend-in-dream drowns salience section of morning report               | Phase 7.5 kept opt-in; housekeeping visually separated.  |
| CodeMirror integration bloats bundle past patience                    | Budget 600KB JS gzipped total. Audit at every phase.     |
| FS Access API instability / permissions UX                            | Fallback to zip-import mode from day one.                |
| 3D nav is too hard for non-technical users                            | Demo vault + coachmarks. Measure Phase 3.5 with 3 users. |
| Browser tab throttling kills real overnight dreams                    | Accept for web; plan Electron post-1.0.                  |
| Single-file-html culture clash with bundler                           | Document in branch CLAUDE.md; don't undo it.             |
| Scope creep from the speculative docs (BRAIN / DREAM / STATES / etc.) | Phase gates. Each one has a kill condition.              |
| Aesthetic drifts toward generic "tech app" over time                  | One person (Michael) owns accent / bloom / spacing.      |
| Michael loses interest before Phase 5                                 | Phase 3 ships as a usable standalone app. Stop-points.   |

---

## 10. Monday plan

Concrete first-week tasks in order:

1. Create branch `boltzsidian` from current HEAD.
2. Commit this doc + a placeholder `boltzsidian/README.md`.
3. `cd boltzsidian && npm create vite@latest . -- --template vanilla`.
   Clear the default Vite content.
4. Install deps: `three marked gray-matter minisearch ulid @codemirror/*`.
5. Build the app shell (D0.3, D0.4, D0.6) — just aesthetic parity with
   the sim. Starfield + glass corner labels + accent.
6. Wire FS Access (D0.5) with a trivial "picked: [name]" display.
7. Push, open PR against `boltzsidian` branch self (marker PR for CI).
8. Deploy preview URL from Netlify. Confirm the app boots.

After that, start Phase 1.

---

## 11. A single sentence to hang above the monitor

> We are building Boltzsidian so that every morning, before coffee, the
> universe has three things to tell you about your own notes.

If a decision doesn't serve that sentence, it's out of scope.
