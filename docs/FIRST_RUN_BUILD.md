---
id: first-run-build-2026-04-25
created: "2026-04-25"
---

# FIRST_RUN_BUILD.md — Phased plan for the first-run flow

Operational doc for implementing
[FIRST_RUN_FLOW.md](FIRST_RUN_FLOW.md) without regressions. Same shape
as [BUILD_PLAN.md](BUILD_PLAN.md): phases with deliverables, exact
files, and exit gates. Each phase is shippable on its own and leaves
the app in a working state.

**Sequencing rule.** Phases run in order. FR0 (foundation) must land
before any of FR1–FR6 because every later phase reads from the same
state module. FR7 (hardening) is gate-only — no new behaviour.

**Branch.** All phases land on `boltzsidian`. No long-lived feature
branch — each phase is a small PR.

---

## Pre-flight — what already exists, what's missing

Before writing code, confirm the inventory below by reading the linked
files. If any link is wrong, fix it here first; do not work around it.

**Already in place:**

- Welcome card with theme picker:
  [index.html:4727+](../boltzsidian/index.html#L4727)
- `WELCOME_SEEN_KEY` flips first-run default after one welcome run:
  [main.js:1019](../boltzsidian/src/main.js#L1019)
- Coachmark library + suppression hook:
  [coachmarks.js](../boltzsidian/src/ui/coachmarks.js)
- `alt-drag` coachmark fires on first star click:
  [main.js:2453](../boltzsidian/src/main.js#L2453)
- Link create path with affinity bump + physics kick:
  [main.js:2587-2610](../boltzsidian/src/main.js#L2587-L2610)
- Welcome theme suppresses regular coachmarks:
  [main.js:228](../boltzsidian/src/main.js#L228)
- `setWorkspace` is the single seam for first-paint:
  [main.js:1722](../boltzsidian/src/main.js#L1722)
- Toast helper supports actions and durations:
  used at [main.js:2580](../boltzsidian/src/main.js#L2580) and
  [main.js:2629](../boltzsidian/src/main.js#L2629)

**Missing:**

- A session-state module for `firstRunStage` / `actSeen`. The only file
  in [src/state/](../boltzsidian/src/state/) today is `settings.js`.
- A graduation coachmark (`graduate-to-own`).
- A first-paint arrival hook in `setWorkspace`.
- A constellation-label click handler (the labels render but no rename
  affordance exists — see [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md)
  for the storage shape, which is independent of the click UI).
- "Bent gravity" toast and proximity flash on first user-link.

---

## Phase FR0 — Foundation: first-run state module (1 day)

**Goal.** One module owns all first-run state. Nothing in the rest of
the app reads `localStorage.boltzsidian.firstRun.*` directly.

### Deliverables

- **FR0.1** — New file
  [boltzsidian/src/state/first-run.js](../boltzsidian/src/state/first-run.js).
  Exports:

  ```js
  // Read
  getActSeen(); // 1..5
  isStage(n); // bool helper
  // Mutate
  markActReached(n); // monotonic, never regresses
  // Session counters (live in memory, not localStorage)
  recordWelcomeStarOpened(id); // returns size after add
  getWelcomeStarsOpenedCount();
  recordUserLinkCreated();
  getUserLinkCount();
  // Reset (for the testing button in Settings)
  resetFirstRun();
  ```

- **FR0.2** — Constants block at top of the module:

  ```js
  const ACT_KEY = "boltzsidian.firstRun.actSeen.v1";
  const GRADUATE_THRESHOLD = 5; // welcome stars opened
  const RETURNING_LINK_THRESHOLD = 50; // skip act 4 if vault already linked
  ```

  Tunable in one place. Don't sprinkle these numbers across files.

- **FR0.3** — Storage hardened: every read/write wrapped in try/catch
  (Safari private mode, quota errors). `getActSeen()` returns `1` on any
  error.

- **FR0.4** — Reset button added to the Settings pane "danger zone"
  with label `Replay first-run tour`. Calls `resetFirstRun()` and
  `coachmarks.resetAll()` together. Toast confirms.

### Files touched

- New: [src/state/first-run.js](../boltzsidian/src/state/first-run.js)
- Edit: [src/ui/settings.js](../boltzsidian/src/ui/settings.js) — add
  reset button.

### Gate

- Open DevTools, run `import("./state/first-run.js")` and confirm every
  exported symbol works manually.
- Set act to 5, reload, confirm `getActSeen() === 5`.
- Reset, confirm act drops to 1 and the welcome card's first-run
  default is **welcome** again (this depends on FR1's wiring; if FR1
  isn't shipped yet, just confirm `getActSeen() === 1`).

### Don't

- Don't put act detection logic _inside_ this module beyond reading
  storage. Derivation (`isStage`) is fine; reactive logic
  ("schedule a coachmark when act changes") lives in [main.js](../boltzsidian/src/main.js).

---

## Phase FR1 — Welcome card polish (½ day)

**Goal.** Act 1 reads cleanly. No paralysis, no "skip" affordance.

### Deliverables

- **FR1.1** — Add micro-copy line under the blurb:

  > _Pick the tour if you've never been here. Pick your folder if you
  > already know what you want._

- **FR1.2** — Verify starfield twinkle is running on the welcome card
  route. If the welcome card mounts before the starfield boot, fix the
  ordering — the card should never paint against a black canvas.

- **FR1.3** — Audit and remove any "skip" / "later" / "X" affordances
  on the card. (None should exist; this is a sweep.)

### Files touched

- Edit: [boltzsidian/index.html](../boltzsidian/index.html) — copy + CSS.
- Edit: [src/main.js](../boltzsidian/src/main.js) — confirm starfield
  init order.

### Gate

- Hard-reload with empty localStorage. Welcome card paints against a
  twinkling starfield within 500 ms.
- Card has exactly two buttons (Open my folder / Try the demo) and
  three radios. No other CTA.

### Don't

- Don't replace the radio group with a dropdown. Three options visible
  at once is the point.

---

## Phase FR2 — Welcome demo refresh (1 day)

**Goal.** Every note in the welcome theme passes a brand-new-user test.

### Deliverables

- **FR2.1** — Re-read each file in
  [src/demo-vault/welcome/](../boltzsidian/src/demo-vault/welcome/) as
  a brand-new user. Cuts:
  - Bodies > 4 sentences lose a sentence.
  - Hotkey references replaced with `[[hotkeys]]` links — the hotkeys
    note is the single source of truth.
  - Each note ends in a verb-leading **Try it** that _currently works_
    (run through every gesture).

- **FR2.2** — Stable IDs: every welcome note's frontmatter `id` is
  `01J_welcome_<slug>` (not auto-ULID). Pinned positions and tags
  survive reinstalls.

- **FR2.3** — `welcome/index.md` (if it exists) or a top-level
  `welcome/README.md` is **deleted**. The vault doesn't need a README;
  start-here is the README.

### Files touched

- Edit: each file in
  [src/demo-vault/welcome/](../boltzsidian/src/demo-vault/welcome/).

### Gate

- Reset demo to welcome. Open every star in the ring once. Each
  ends in a Try-it that the current build supports. Zero broken
  hotkey references.

### Don't

- Don't add new welcome notes in this phase. Cap is 11 today; expansion
  belongs in [ONBOARDING.md](ONBOARDING.md) §13's "expansion passes."

---

## Phase FR3 — Graduate nudge (1 day)

**Goal.** When a welcome user opens their fifth unique star, the
graduation coachmark fires. Clicking it opens the FS picker.

### Deliverables

- **FR3.1** — Add to LIBRARY in
  [coachmarks.js:16](../boltzsidian/src/ui/coachmarks.js#L16):

  ```js
  "graduate-to-own": {
    text: "You've got the hang of this. Ready to see your own notes as a sky?",
    actionLabel: "Open my folder",
    bypassWelcomeSuppression: true,
  },
  ```

- **FR3.2** — Extend the coachmarks `show()` function: if the entry
  has `actionLabel`, render the dismiss button with that label, and
  fire `options.onAction` when clicked instead of the default
  ✓-dismiss. Default dismiss (Esc, auto-timeout) still records as
  seen.

- **FR3.3** — Extend the suppression check: a coachmark with
  `bypassWelcomeSuppression: true` ignores `isSuppressed`. This is the
  one exception. Comment why.

- **FR3.4** — In [main.js](../boltzsidian/src/main.js), the existing
  star-click handler (around line 2312) calls
  `coachmarks.schedule("click-to-open")`. Add a parallel branch:

  ```js
  if (workspaceKind === "demo" && getDemoTheme() === "welcome") {
    const count = recordWelcomeStarOpened(noteId);
    if (count >= GRADUATE_THRESHOLD && getActSeen() < 3) {
      coachmarks.schedule("graduate-to-own", {
        onAction: () => pickUserWorkspace().then(setWorkspace),
        duration: 20000, // longer than default — this one matters
      });
    }
  }
  ```

  `recordWelcomeStarOpened` and `GRADUATE_THRESHOLD` come from FR0.

- **FR3.5** — When `pickUserWorkspace()` resolves successfully from
  this path, call `markActReached(3)` before `setWorkspace`.

### Files touched

- Edit: [src/ui/coachmarks.js](../boltzsidian/src/ui/coachmarks.js)
- Edit: [src/main.js](../boltzsidian/src/main.js) — star-click handler
  - import from `state/first-run.js`.

### Gate

- Reset all (FR0.4 button). Pick welcome demo. Open 4 stars — no
  coachmark. Open the 5th — coachmark appears with "Open my folder"
  button. Click it — FS picker opens.
- Pick a folder — own vault loads, `getActSeen() === 3`.
- Reload — coachmark does not re-fire.

### Don't

- Don't fire on hover. Click-to-open is the engagement signal.
- Don't count the same note twice (the Set in FR0 prevents this — confirm).

---

## Phase FR4 — Arrival moment (1 day)

**Goal.** First time a user opens their own folder, the camera does a
slow pull-back and a one-line "N notes · M links" facts banner fades
in then out. Wow #2.

### Deliverables

- **FR4.1** — In [setWorkspace](../boltzsidian/src/main.js#L1722),
  immediately after the first paint resolves (post-`bodies` creation
  and first physics tick), check:

  ```js
  if (workspaceKind === "user" && getActSeen() < 3) {
    runArrivalMoment(vault.notes.length, vault.linkCount);
    markActReached(3);
  }
  ```

  Edge case: if `vault.linkCount > RETURNING_LINK_THRESHOLD`, skip
  ahead — `markActReached(4)` and don't show the arrival line (this
  user is not new, they're returning to a linked vault).

- **FR4.2** — `runArrivalMoment(noteCount, linkCount)`:
  - Fires a 1.5 s eased camera pull-back from current `camera.position`
    to `camera.position * 1.4`. Reuses the scene-transition easing
    helper that already exists. No physics changes.
  - Inserts a one-line banner at top-center:
    > _N notes · M existing links. This is your sky._
  - Banner fades in over 600 ms, holds 3 s, fades out over 600 ms,
    DOM-removed.

- **FR4.3** — `vault.linkCount` is computed during vault open in
  [vault.js](../boltzsidian/src/vault/vault.js). If the field doesn't
  exist, add it: `Σ forward.get(id).size for all ids`.

- **FR4.4** — Zero-markdown edge case: if `vault.notes.length === 0`,
  show the existing "no markdown" toast (already in
  [setWorkspace](../boltzsidian/src/main.js#L1722) error path?
  verify — if not, add it). Do **not** fall back to the demo silently.
  Do **not** mark act 3 reached (the user has no vault yet).

### Files touched

- Edit: [src/main.js](../boltzsidian/src/main.js) — `setWorkspace`,
  new `runArrivalMoment` helper.
- Possibly edit:
  [src/vault/vault.js](../boltzsidian/src/vault/vault.js) — add
  `linkCount` if missing.
- Possibly new: a tiny `arrival-banner.js` in
  [src/ui/](../boltzsidian/src/ui/) for the DOM piece. (Inline in
  main.js is fine if < 30 LOC.)

### Gate

- Reset all. Skip welcome (use Open my folder directly with a folder
  containing 2–3 .md files). Camera pull-back fires. Banner reads
  "2 notes · 0 existing links" or similar.
- Reset all. Pick a folder containing 60+ already-linked markdown
  files. Camera pull-back **still** fires (the wow), banner reads
  honest counts, but `getActSeen() === 4` afterwards (act 4 is
  pre-credited because the user is past weave).
- Reset all. Pick an empty folder. Toast appears, no banner, no
  pull-back, `getActSeen() === 1` still.

### Don't

- Don't gate the camera pull-back on linkCount. Every first-paint
  earns the camera move; only the _banner copy_ and _act
  pre-crediting_ depend on counts.
- Don't show the banner on workspace re-mount after a reload.
  `getActSeen() < 3` already guards this — verify.

---

## Phase FR5 — Weave wow (1 day)

**Goal.** First time a user creates a link in their own vault, two
stars flash, a toast acknowledges the moment, act 4 is reached.

### Deliverables

- **FR5.1** — Re-anchor the existing `alt-drag` coachmark text for the
  act-3 case. In
  [coachmarks.js:23](../boltzsidian/src/ui/coachmarks.js#L23) the text
  is generic. Either:
  - (a) Add a second variant text triggered when scheduled with
    `{ variant: "first-link" }`, or
  - (b) Keep one text but ensure it reads correctly for both new and
    returning users:
    > _Hold **Alt** and drag from a star to another. They'll pull
    > together._

  Pick (b) for simplicity — single text covers both scenarios.

- **FR5.2** — Schedule the coachmark on the **first star click after
  arrival** when `getActSeen() === 3` and 8 s have elapsed since
  arrival. Use the existing handler at
  [main.js:2312](../boltzsidian/src/main.js#L2312).

- **FR5.3** — On successful link create
  ([main.js:2587-2610](../boltzsidian/src/main.js#L2587-L2610)), after
  the existing `coachmarks.markSeen("alt-drag")`:

  ```js
  recordUserLinkCreated();
  if (getActSeen() < 4) {
    runWeaveFlash(src.id, dst.id);
    markActReached(4);
  }
  ```

- **FR5.4** — `runWeaveFlash(srcId, dstId)`:
  - Triggers a one-shot proximity glow on both bodies. Reuse the
    radiation-burst path used by supernovae but tuned smaller —
    duration ~1.2 s, half-strength.
  - Fires a toast (no actions):
    > _You just bent gravity. Make a few more — once two stars share a
    > tag or a folder, they'll start to clump on their own._
  - Toast duration 6 s.

### Files touched

- Edit: [src/ui/coachmarks.js](../boltzsidian/src/ui/coachmarks.js)
- Edit: [src/main.js](../boltzsidian/src/main.js) — link-create path
  - `runWeaveFlash` helper.
- Maybe edit:
  [src/sim/bodies.js or radiation hook] (../boltzsidian/src/sim/) — only
  if the existing burst can't be triggered programmatically; usually
  it can.

### Gate

- Fresh user, fresh vault, drew first link. Stars flash. Toast appears.
  `getActSeen() === 4`.
- Drew second link. Nothing extra fires. Toast does not repeat.
- Pre-credited returning user (FR4.1 path). Drew first link of session.
  Nothing extra fires (`getActSeen` was already 4 before they linked).

### Don't

- Don't fire the flash on **inferred** links from
  [keyword-link.js](../boltzsidian/src/layers/keyword-link.js). The
  moment is about the user's gesture.
- Don't fire if the link create resolves but the file write fails —
  the existing try/catch in
  [main.js:2587](../boltzsidian/src/main.js#L2587) ensures we only run
  the flash on success. Verify the order: flash AFTER the saver
  resolves.

---

## Phase FR6 — Conduct wow (1.5 days)

**Goal.** User can click a constellation label, type a name, see it
persist, and feel ownership.

### Deliverables

- **FR6.1** — Constellation labels are clickable. The DOM elements are
  rendered by [constellations.js](../boltzsidian/src/ui/constellations.js).
  Add `cursor: pointer` and a click handler that swaps the label with
  an inline `<input>` pre-filled with the current name.

- **FR6.2** — Inline edit:
  - Enter / blur commits.
  - Esc cancels (no change).
  - Empty string commits → reverts to auto-generated name.

- **FR6.3** — Persist via
  [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md)'s storage
  contract. If that doc is not yet implemented, write the bare minimum
  storage now: a `boltzsidian.constellation_names.v1` localStorage map
  keyed by stable cluster id. Document the temporary shape in a
  `// FR6 placeholder` comment so a future
  [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) implementation
  knows what to migrate.

- **FR6.4** — Coachmark `name-a-region`:

  ```js
  "name-a-region": {
    text: "This region of your sky is yours to name. Click the label.",
  },
  ```

  Schedule it when:
  - `getActSeen() === 4`, **and**
  - `getUserLinkCount() >= 3` since arrival, **and**
  - At least 2 visually distinct clusters have a label visible on
    screen (read from constellations layer state).

- **FR6.5** — On first commit of a non-empty name:
  - Cross-dissolve from auto-name to user name (1 s).
  - Banner top-center for 3 s:
    > _**{name}** is now part of your universe. The app remembers._
  - `markActReached(5)`.

### Files touched

- Edit:
  [src/ui/constellations.js](../boltzsidian/src/ui/constellations.js)
- Edit: [src/ui/coachmarks.js](../boltzsidian/src/ui/coachmarks.js)
- Edit: [src/main.js](../boltzsidian/src/main.js) — schedule logic +
  banner.
- Possibly new: tiny persistence helper if
  [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) is not yet
  implemented.

### Gate

- Reset all. Run through acts 1–4. Draw a 4th link. Wait until
  zoomed-out cluster labels are visible. Coachmark fires.
- Click a label. Inline input appears with current name selected.
  Type a name, press Enter. Cross-dissolve plays. Banner fires.
  `getActSeen() === 5`.
- Reload. Constellation still has the name.
- Click another label later. Edits inline as expected. No coachmark,
  no banner — act 5 was already reached.

### Don't

- Don't surface a "suggest a name" button. The blank input is the UX.
- Don't unlock anything new on rename. The reward is the rename itself.

---

## Phase FR7 — Hardening + manual test matrix (½ day)

**Goal.** Walk every path in the journey, from each entry point, on
fresh state. Catch every off-by-one before declaring done.

### Test matrix

Run each row from a hard-reset state (FR0.4 button + clear
localStorage to be safe).

| #   | Path                                                                                                            | Expected acts           | Expected nudges                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Pick welcome demo → open 5 stars → graduate → pick folder → look around → draw link → draw 3 more → name region | 1→2→3→4→5               | graduate-to-own, alt-drag (re-anchored), weave flash, name-a-region, name banner           |
| 2   | Skip demo → Open my folder (small unlinked vault)                                                               | 1→3→4→5                 | (no demo nudges), alt-drag, weave flash, name-a-region, name banner                        |
| 3   | Skip demo → Open my folder (large already-linked vault, > 50 links)                                             | 1→4→5                   | (no demo nudges, no weave flash — pre-credited), name-a-region, name banner                |
| 4   | Open empty folder                                                                                               | 1 (stays)               | "no markdown" toast                                                                        |
| 5   | Welcome demo → open 4 stars → close tab → reopen → open 1 more star                                             | 1→2 (no graduate yet)   | none yet (counter is session-only — confirm; if persistent counter is desired, change FR0) |
| 6   | Welcome demo → graduate → cancel folder picker                                                                  | 1→2 (act 3 NOT reached) | graduate coachmark fires once, dismissed; folder pick aborted; demo continues              |
| 7   | Returning user (act 5 already reached) opens any folder                                                         | 5 (stays)               | none                                                                                       |
| 8   | Reset first-run from settings → behaviour matches row 1                                                         | 1→2→…                   | All nudges fire again                                                                      |

### Deliverables

- **FR7.1** — Run every row above manually. File a tiny issue per row
  that fails. Fix or revisit the relevant phase. **Do not declare
  done until rows 1, 2, 3 all pass cleanly.**
- **FR7.2** — Decide row 5 explicitly: do welcome-stars-opened persist
  across reloads, or reset per session? Spec says "session" — confirm
  in FR0. If it's reload-persistent, document that and update this
  row's expected behaviour.
- **FR7.3** — Add a one-paragraph note to
  [boltzsidian/CLAUDE.md](../boltzsidian/CLAUDE.md) under "Common
  tasks" pointing future sessions at this doc + FIRST_RUN_FLOW.md
  whenever they touch the welcome card, coachmarks, or
  `setWorkspace`.

### Gate

- Every row in the table behaves as expected.
- Hard reload during act transitions (e.g., after coachmark schedules
  but before user clicks) does not corrupt act state — `actSeen`
  remains valid (1..5) and never regresses.
- Browser console shows no errors during any row.

---

## Risk register

| Risk                                                                                                        | Mitigation                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Acts feel forced; user notices the choreography                                                             | Every nudge dismissable, every act skippable. Watch FR7 row 2 closely — that's the user who skipped the demo, and they should still feel natural.                                                                                                            |
| Returning user with linked vault gets weave flash anyway                                                    | FR4.1 pre-credits act 4 by linkCount. FR5.3 guards on `getActSeen() < 4`.                                                                                                                                                                                    |
| Welcome demo nudge fires for users who reset only the demo                                                  | `getActSeen()` is independent of demo install state. FR0 reset clears both together.                                                                                                                                                                         |
| Constellation rename collides with future [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) implementation | FR6.3 marks placeholder. When the canonical implementation lands, migrate the localStorage key.                                                                                                                                                              |
| Camera pull-back nauseates                                                                                  | 1.5 s ease, 40% zoom-out — keep it gentle. If user lands on a tiny vault (3 stars) the framing might feel wrong. Consider clamping the multiplier on small vaults: `multiplier = vault.notes.length < 10 ? 1.15 : 1.4`. Add to FR4.2 if a tester reports it. |
| `markActReached` race during async setWorkspace                                                             | `markActReached` is monotonic. Worst case it's called twice; second call is a no-op. Verify this is true in FR0.1.                                                                                                                                           |
| Coachmark `onAction` callback throws                                                                        | Wrap in try/catch in `coachmarks.js`. The dismiss must complete even if the action fails.                                                                                                                                                                    |

---

## Ship order, summarised

```
FR0 (foundation) → FR1 (card polish) → FR2 (welcome refresh)
        ↓
       FR3 (graduate nudge)
        ↓
       FR4 (arrival moment)
        ↓
       FR5 (weave wow) → FR6 (conduct wow)
        ↓
       FR7 (hardening, test matrix)
```

Aggregate: ~6.5 dev days end-to-end. Each phase is independently
shippable; if a phase falls out of scope, the prior phases still leave
the app strictly better than today.

---

## What is explicitly out of scope for this build

- Telemetry on which acts users reach. No.
- Replay tour menu item beyond the settings reset. (Easy follow-up;
  not blocking.)
- Animated camera intro on the welcome card. (Polish, separate.)
- Auto-naming constellations. (Anti-feature for act 5.)
- Tracking welcome-stars-opened across reloads — session only.
- Any "undo first-link" affordance. The link itself is undoable from
  the existing right-click flow.

---

## One sentence

Build the foundation first, ship each act independently, gate every
phase on a manual walk-through, and never let a nudge fire when the
user is already past the act it teaches.

#phase #user #feature
