---
id: 01KPTARC95BW9HZZTD85A0NYGP
created: 2026-04-22
---

# BACKLOG.md — what's specced but not shipped

## Snapshot

Boltzsidian is through Phase 0–3 of [[BUILD_PLAN]] and well into the
6.x tending/weeding/brief trio. Multi-project roots (Phases 0–5 of
[[MULTI_PROJECT_PLAN]]) landed this session alongside constellations
v1, cluster rename, batch-link v1, a link-drag gesture, ambience
auras, sparks/hover-orbit, and a Phase 7 utterance stack (template +
Claude + WebLLM). The speculative stack ([[BRAIN]], [[BOLTZMANN]],
[[OBSIDIAN]], [[DREAM]]) has graduated to implementation docs — the
remaining speculative layer ([[SALIENCE]] sheath, [[DREAM_ENGINE]]
warp/magnify/wander/bump/spawn) is where the product still has real
discovery to do. What's waiting is mostly connective tissue around
what just shipped: live re-clustering, region nodes, better salience,
onboarding polish, and the visible structural-tidy loop.

## Shipped or mostly shipped

- [[BUILD_PLAN]] Phase 0–3 → Vite app, vault read/write, editor, links, tethers, filament, K, pinning.
- [[BUILD_PLAN]] Phase 3.5 → first-run flow, welcome/astronomer/panel-haus demo vaults, tag prompt, coachmarks, about pane (`src/ui/coachmarks.js`, `tag-prompt.js`, `about.js`).
- [[BUILD_PLAN]] Phase 3.7 (formations) → formations rail, folder auras, per-body folder tint (`src/ui/formations*.js`).
- [[BUILD_PLAN]] Phase 4 (chorus) → `src/layers/chorus.js` + `captions.js`.
- [[BUILD_PLAN]] Phase 5 (dream) → `src/layers/dream.js`, `dream-log.js`, `prune.js`, `morning-report.js`.
- [[BUILD_PLAN]] Phase 6 (salience v1) → `src/layers/salience*.js`, promote, ideas drawer.
- [[BUILD_PLAN]] Phase 6.5 (tend) → `src/layers/tend*.js`, `tend-drawer.js`, `suggestions.js`.
- [[BUILD_PLAN]] Phase 6.6 (weed) → `src/layers/weed.js`, `weed-drawer.js`.
- [[BUILD_PLAN]] Phase 6.7 (brief) → `src/ui/brief.js`.
- [[BUILD_PLAN]] Phase 7 (voice upgrade) → `src/layers/utterance/{template,claude,webllm,local}-backend.js`, `payload-preview.js`, model-face UI.
- [[CONSTELLATIONS]] v1 → zoom-ratio cross-fade, rename, centroid labels (`src/ui/constellations.js`, `src/sim/clusters.js`).
- [[BATCH_LINK]] v1 (constellation-scoped) → right-click a constellation → link members (`src/ui/batch-link-picker.js`).
- [[AMBIENCE]] → cluster auras and post stack (`src/sim/ambience.js`, `post.js`, `sparks.js`).
- [[LABELS]] / [[PICKING]] → label toggle, hover, pick-debug, hover-orbit (`src/ui/labels.js`, `hover.js`, `pick-debug.js`, `sim/hover-orbit.js`).
- [[KEYWORD_LINK]] / [[WEAVE]] / [[CONNECT_QUERY]] → keyword-driven link suggestion + connect-query layer (`src/layers/{keyword-link,weave,connect-query}.js` + matching pickers in `src/ui/`).
- [[DREAM_THEMES]] → per-night theme picker (`src/layers/dream-theme.js`).
- [[RENDER_QUALITY]] / [[SEARCH]] / [[FIRST_RUN_FLOW]] → quality monitor + HUD, full-text search, welcome flow (all live in `src/sim/render-quality.js`, `src/ui/search.js`, `coachmarks.js`, `tag-prompt.js`).
- [[TENDING_FIX_PLAN]] → tended_on stamp + atomic write fixes from the post-Phase-6.5 audit (`src/layers/tend-apply.js`).
- [[DOCS_AGENT]] → external agent spec; used to prep demo vaults, no app code needed.
- All of the above now live under [[archive/shipped]]; the original wikilinks still resolve.
- [[SPEC]] / [[ROADMAP]] / [[STREAM_SETUP]] / [[LAUNCH]] / [[WEB_DEMO]] / [[BODY_COUNT]] / sim docs → **out of scope for Boltzsidian**; they belong to the `main`-branch sim. Now under [[sim/]].

## Partial — specced in layers, some shipped

- [[BUILD_PLAN]] Phase 7.5 (tend-in-dream) → **not shipped.** Phase 6.5 manual scan and Phase 5 dream both shipped independently; the fold-into-dream wiring and housekeeping section of the morning report are open.
- [[MULTI_PROJECT_PLAN]] → Phases 0–5 shipped (manifest, multi-root walker, root-aware writers, wikilink collision, first-load UX). **Phases 6 (default excludes + per-root filters), 7 (Settings UI for roots), and 8 (cross-project dream tuning) are open.**
- [[CONSTELLATIONS]] → v1 shipped. **Not shipped:** the "drag a constellation / create a phantom region" follow-up lives in [[REGIONS]].
- [[BATCH_LINK]] → v1 (constellation selector) shipped. **Not shipped:** the other five selectors (lasso, tag-scoped, search-scoped, formation-scoped, drag-to-hub) and the v2 apply queue with progress/undo.
- [[SALIENCE]] → flat filter shipped per [[BUILD_PLAN]] Phase 6 as planned. **Not shipped:** the volumetric sheath v2 (layer membrane, rise/sink visuals, surface tension UI). This is the doc's explicit "if scoring tunes cleanly" branch.
- [[STATES]] → Tend / Weed / Brief shipped (§2, §3, §4). **Not shipped:** §5 Echo (replay of a wake/dream session) — explicitly post-launch in [[BUILD_PLAN]] §8.
- [[ONBOARDING]] → the welcome/tutorial demo-vault concept is shipped (see `src/demo-vault/welcome/`). **Not shipped:** the anchored "Start here" star at origin + ring-and-halo shape + one-shot onboarding layout described in §0–§2.
- [[FORMATIONS]] → load-bearing five shipped. **Not shipped:** the deferred flavour formations (Supernovae, Main sequence, Binaries, Globular, Nebula fog pass, folder pulse, saved formation presets).

## Not shipped

- [[REGIONS]] — constellations as draggable first-class nodes of kind `region`, with phantom creation in empty sky. Biggest unknown: whether a region note should also be a markdown file (new kind / frontmatter `kind: region`) or a synthetic non-file entity that lives only in `.universe/state.json`. The §1 "region note (recommended)" answer picks the former but both costs need a gut-check before code.
- [[LIVE_CLUSTERS]] — re-partition on graph edits with stable cluster ids (Phases A–E specced). Biggest unknown: whether warm-start label propagation + id stability actually _looks_ stable with bloom + DOM labels, or whether sub-second re-layouts still read as jitter.
- [[DREAM_ENGINE]] — the five-phase warp/magnify/wander/bump/spawn mechanic that replaces today's "summaries" dream output. Biggest unknown: whether any of the four utterance backends (template, webllm 1B, Claude haiku, local) can actually produce a non-mystical bump-spawn line at a cost Michael is willing to pay per dream. Template and Claude both viable; webllm is the wild card.
- [[MODEL_SURFACES]] — map of where model output is allowed to live beyond voice (structural enhancement, content assistance, semantic search). Biggest unknown: which surface earns its keep first without eroding the "the app doesn't autowrite your notes" posture. Explicitly post-Phase-7.
- [[LIBRARIAN]] — the "Claude plugged in will organise your brain" surface. Biggest unknown: overlaps heavily with [[TENDING]] + [[SUGGESTIONS]] + [[MODEL_SURFACES]]; needs a decision on whether it's one feature or three.
- [[SUGGESTIONS]] — `#` tag autocomplete + passive candidate surfacing while writing. Biggest unknown: how much passive surfacing is "helpful" before it turns into the underline-everything AI-wrapper posture the product is trying not to be.
- [[TENDING]] — the "how the janitor gets better" feedback loop over Phase 6.5 accept/reject signal. Biggest unknown: whether one user generates enough labelled signal in a month to move thresholds at all, or if this waits for the 10-user beta.
- [[CANVAS]] — should Boltzsidian read/write `.canvas`? Biggest unknown: the feature request exists; the authorial answer hasn't been decided. Doc is deliberately a map, not a plan.
- [[RITUALS]] — time-of-day nudges for routines. Biggest unknown: the doc itself questions whether this belongs in Boltzsidian at all. Needs a kill/keep decision from Michael before any code.
- [[SOLAR_SYSTEMS]] — a procedural system around each star on follow. Biggest unknown: this is a **sim-branch** feature; doesn't belong to Boltzsidian at all. Parked.
- [[MULTI_PROJECT]] §1.1 / §1.3 / §1.4 — the alternative approaches to the §1.5 plan that shipped. These are reference material, not backlog work.
- [[MULTI_PROJECT_AUDIT]] — Phase 0 output of [[MULTI_PROJECT_PLAN]]. Reference, not backlog.

## Priority stack (ranked)

1. **[[LIVE_CLUSTERS]] — re-partition in session** (Phases A–E, scope: explicit in doc, ~1h + ~0.5d + ~1d + ~1d + ~0.5d). High: unlocks [[REGIONS]] (moving notes around needs live membership to feel honest), rescues the just-shipped [[CONSTELLATIONS]] from the Rescan-button smell, and every other selection feature (tag-scoped, formation-scoped batch link) gets cheaper once cluster membership is authoritative live. No dependencies.
2. **[[REGIONS]] — constellations as draggable first-class nodes** (§1.2 region-note path, scope: ~1–2 weeks implicit). High: currently the user's constellation rename is the only way to act on a region, and it's a soft edit. Gives the universe a verb that's been missing. Depends on **(1)** for membership stability while dragging.
3. **[[BATCH_LINK]] v2 — additional selectors + apply queue** (§1 selectors 1.1/1.3/1.4/1.5/1.6 + §2 apply loop, scope: each selector ~1–2d). High: v1 ships the hard part (apply loop); each additional selector is cheap. Tag-scoped and formation-scoped are the ones Michael will actually reach for. Depends on v1 (shipped).
4. **[[MULTI_PROJECT_PLAN]] Phase 6 — default excludes + per-root filters** (scope: explicit in doc, ~2–3d). High: already-shipped Phase 5 opens the door to L:/projects_claudecode/\* projects that contain `.env`, vendored docs, and machine-generated logs. Without excludes a multi-root vault gets ugly fast. Low-risk, user-visible. No blockers.
5. **[[DREAM_ENGINE]] — warp/magnify/wander/bump/spawn** (§0–§5, scope: ~1–2 weeks). High: this is the doc's own answer to "the first pass dream output landed as summaries." Existing dream reports already exist — without this, Phase 5 asymptotes at grounded-but-uninteresting. Depends on Phase 5 + Phase 7 (both shipped).
6. **[[BUILD_PLAN]] Phase 7.5 — tend-in-dream** (scope: ~1 week). High-ish: closes a loop; tend-at-cadence during REM is what turns the morning report into the single artefact the product is built around. Depends on Phase 6.5 stabilising, which it has.
7. **[[SUGGESTIONS]] — `#` tag autocomplete while writing** (scope: small — stub file `src/ui/suggestions.js` already exists). Medium: low-risk, user-visible-every-session, and `[[` autocomplete is already wired so the pattern is known. Skip the passive-surfacing half unless the trigger-character half earns it.
8. **[[ONBOARDING]] — anchored "Start here" welcome structure** (scope: ~3–5d, mostly content + one-shot anchoring). Medium: the welcome/\* vault exists but lacks the pedagogy shape (central anchored star, ring-and-halo). Phase 3.5 gate explicitly says "test with 3 people" — this is the lever that improves that outcome. No dependencies.
9. **[[MULTI_PROJECT_PLAN]] Phase 7 — minimal Settings UI for roots** (scope: explicit in doc, ~2d). Medium: Phase 5 landed root-loading UX, but management is still manifest-editing by hand. Low-glamour, high-daily-use if Michael keeps adding project roots. Depends on Phase 6.
10. **[[TENDING]] — Phase 6.5 feedback loop** (scope: deliberately small v1). Medium: only worth doing once there's a month of Phase 6.5 accept/reject data. Parking until that data exists is correct; flagged here so it doesn't fall off the radar.
11. **[[SALIENCE]] v2 sheath** (scope: ~2 weeks). Low-for-now: explicitly deferred in [[BUILD_PLAN]] Phase 6 ("if scoring tunes cleanly"). Do _not_ ship until Phase 6 v1 thresholds stabilise on Michael's real vault. Dependencies: several weeks of real use.
12. **[[CANVAS]] — read/write `.canvas`** (scope: unresolved). Low-for-now: blocked on an authorial decision (should we speak Canvas?). Worth a 30-minute Michael conversation, not any code yet.

## Deliberately parked

- [[SOLAR_SYSTEMS]] — sim-branch feature; unrelated to Boltzsidian product. Also parked on `main` as of last audit.
- [[FOLLOW_CAM]], [[FOLLOW_VIEWS]], [[STAR_TRAIL]], [[TRAILS]], [[CINEMA]], [[CINEMATIC]], [[CINEMATIC_MODES.md-—-Director-Flavours]], [[MOVIE.md-—-Film-Mode]], [[SCENES_CLUSTERS.md-—-Famous-Cluster-Scene-Pack]], [[CENTER_VANISH]], [[INFINITE_DRAG]], [[FIDENZA_FILTER]], [[FILAMENT]], [[SHARE]], [[STREAM_SETUP]], [[LAUNCH]], [[WEB_DEMO]], [[BODY_COUNT]], [[SPEC]], [[ROADMAP]] — all sim-branch docs. They share the `docs/` folder but describe the standalone universe simulator, not Boltzsidian. Do not treat as Boltzsidian backlog.
- [[RITUALS]] — the doc itself asks whether it fits; answer leaning no. Park until Michael wants to revive it.
- [[MODEL_SURFACES]] — explicitly post-Phase-7, explicitly a map not a plan. Revisit after a real month of Phase 7 use.
- [[STATES]] §5 Echo — replay of a dream/wake session. [[BUILD_PLAN]] §8 lists as post-launch. Keep parked.
- [[MULTI_PROJECT]] (non-§1.5 approaches) and [[MULTI_PROJECT_AUDIT]] — historical/reference. Not backlog.
- [[BRAIN]], [[BOLTZMANN]], [[OBSIDIAN]], [[DREAM]] — the speculative layer stack. Fully absorbed into [[BUILD_PLAN]] phases and implementation docs. Kept as source-of-truth metaphor references, no standalone work.

## Notes

- **Folder layout.** As of 2026-04-25 `docs/` is split: shipped feature docs live in [[archive/shipped]], debugging postmortems in [[archive/postmortems]], sim-branch docs in `sim/`, and the metaphor stack in `speculative/`. The root holds active backlog + operational. See [[README]] for the index.
- **[[SALIENCE]] vs [[BUILD_PLAN]] Phase 6.** Phase 6 was renamed from "Meaning filter" to "Salience layer" and explicitly ships as a flat filter with the sheath as deferred v2. The speculative [[SALIENCE]] doc still reads as though the sheath is the default. Not wrong, just worth a note at the top that v1 is a filter.
- **[[STATES]] §4 Brief and [[BUILD_PLAN]] Phase 6.7** use slightly different "forgotten" pick rules. Both probably fine in practice but cross-check before the first Brief-on-open user reports.
- **[[MULTI_PROJECT]] §1.1–§1.4** document approaches that were explicitly not chosen. Safe to either fold into [[MULTI_PROJECT_PLAN]] as an appendix or trim; today they're a live grep-trap for anyone searching multi-project design decisions.
- **[[ONBOARDING]] vs `src/demo-vault/welcome/`.** The welcome folder exists with start-here, hotkeys, linking, reading, etc., but the _anchoring + ring-and-halo shape_ from the doc isn't implemented — notes in `welcome/` will cluster like any other folder. Either implement the anchoring, or update the doc to say "welcome vault ships as an ordinary folder."
- **[[DOCS_AGENT]]** is not a Boltzsidian feature — it's an agent prompt for markdown folders. Lives in `docs/` but isn't backlog.

#phase #user #panel
