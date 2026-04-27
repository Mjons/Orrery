---
id: 01KPVJZ_INDEX
created: "2026-04-25"
---

# docs/ — index

This folder mixes two products: **Boltzsidian** (the note-taking app on
branch `boltzsidian`, the current product line) and the **sim** (the
artist tool on `main`). Subfolders separate them; the root holds the
active Boltzsidian backlog and operational docs.

Read [BACKLOG.md](BACKLOG.md) first — it ranks the open work and links
out to every spec.

## Operational + reference (root)

- [BACKLOG.md](BACKLOG.md) — what's specced but not shipped, ranked
- [BUILD_PLAN.md](BUILD_PLAN.md) — Boltzsidian phase plan with exit gates
- [FIRST_RUN_BUILD.md](FIRST_RUN_BUILD.md) — phased plan for the first-run flow rebuild
- [WORKSPACE.md](WORKSPACE.md) — Boltzsidian product spec
- [GLOSSARY.md](GLOSSARY.md) — plain-English vocabulary
- [DOCS_AGENT.md](DOCS_AGENT.md) — external agent prompt for tending
  markdown folders (not a feature; reference)

## Active Boltzsidian backlog (root)

Grouped by area. See BACKLOG for ranked priority.

**Clusters / constellations / regions**

- [REGIONS.md](REGIONS.md) — constellations as draggable first-class nodes
- [LIVE_CLUSTERS.md](LIVE_CLUSTERS.md) — re-partition on graph edits
- [CONSTELLATIONS.md](CONSTELLATIONS.md) — v1 shipped; follow-ups here
- [CONSTELLATION_ANCHORS.md](CONSTELLATION_ANCHORS.md)
- [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md)

**Linking / batch ops**

- [BATCH_LINK.md](BATCH_LINK.md) — v1 shipped; v2 selectors + apply queue
- [BATCH_UNDO.md](BATCH_UNDO.md)
- [TETHER_DIRECTION.md](TETHER_DIRECTION.md)

**Dream / salience**

- [DREAM_ENGINE.md](DREAM_ENGINE.md) — warp/magnify/wander/bump/spawn
- [DREAM_GRAVITY.md](DREAM_GRAVITY.md)
- [SALIENCE.md](SALIENCE.md) — v1 shipped; v2 volumetric sheath
- [STATES.md](STATES.md) — Tend/Weed/Brief shipped; §5 Echo open
- [TENDING.md](TENDING.md) — feedback loop over Phase 6.5 signal

**Avatar / model face**

- [MODEL_FACE_OBSERVER.md](MODEL_FACE_OBSERVER.md)
- [FACE_EXPRESSIONS.md](FACE_EXPRESSIONS.md)
- [AVATAR_HINTS.md](AVATAR_HINTS.md)
- [AVATAR_QUALITY.md](AVATAR_QUALITY.md)

**Search / command surfaces**

- [COMMAND_BAR.md](COMMAND_BAR.md)
- [SLASH_COMMANDS.md](SLASH_COMMANDS.md)
- [VISIBILITY_FILTER.md](VISIBILITY_FILTER.md)
- [SUGGESTIONS.md](SUGGESTIONS.md) — `#` autocomplete + passive surfacing
- [PULL_INTO_ORBIT.md](PULL_INTO_ORBIT.md)

**Multi-project**

- [MULTI_PROJECT_PLAN.md](MULTI_PROJECT_PLAN.md) — Phase 6+ open

**Onboarding / formations / model surfaces**

- [ONBOARDING.md](ONBOARDING.md) — anchored welcome layout
- [FORMATIONS.md](FORMATIONS.md) — five load-bearing shipped; flavour open
- [LIBRARIAN.md](LIBRARIAN.md) — AI-assisted curation surface
- [MODEL_SURFACES.md](MODEL_SURFACES.md) — post-Phase-7 model output map
- [CANVAS.md](CANVAS.md) — `.canvas` interop, undecided
- [RITUALS.md](RITUALS.md) — time-of-day nudges, kill/keep undecided
- [USEFUL.md](USEFUL.md) — product positioning thinking
- [CHAT_BOT.md](CHAT_BOT.md) — Twitch chat bridge (sim-side)

## archive/

- [shipped/](archive/shipped/) — features fully implemented; design history
  for AMBIENCE, LABELS, PICKING, KEYWORD_LINK, WEAVE, CONNECT_QUERY,
  DREAM_THEMES, FIRST_RUN_FLOW, RENDER_QUALITY, SEARCH, TENDING_FIX_PLAN.
- [postmortems/](archive/postmortems/) — debugging reports for fixed bugs:
  MORNING*REPORT_QUALITY, TENDING_AGENT_MISFIRE_AUDIT,
  TENDING_BUGS_ROOT_CAUSE, TEND_BULK*\*, TEND_STAMP_MISMATCH.

## sim/

Sim-branch features (the artist tool on `main`). Out of scope for the
Boltzsidian product. Includes ROADMAP, SPEC, FOLLOW_CAM, CINEMATIC,
STAR_CHARTS, SOLAR_SYSTEMS, and the cinema/scene/stream pack.

## speculative/

The metaphor stack absorbed into BUILD_PLAN ([BRAIN](speculative/BRAIN.md),
[BOLTZMANN](speculative/BOLTZMANN.md), [OBSIDIAN](speculative/OBSIDIAN.md),
[DREAM](speculative/DREAM.md)) plus the multi-project reference docs that
weren't the chosen path
([MULTI_PROJECT.md](speculative/MULTI_PROJECT.md),
[MULTI_PROJECT_AUDIT.md](speculative/MULTI_PROJECT_AUDIT.md)).

#phase #panel #reference
