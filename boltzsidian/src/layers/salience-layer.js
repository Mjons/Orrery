// Salience layer orchestrator.
//
// When dream depth is nonzero, pairs of nearby bodies occasionally
// "interact." Each interaction rolls a resonance; if high enough, a
// candidate child idea is produced, scored on the four salience axes,
// and promoted to a surfaced-in-memory list if the score clears the
// surface threshold.
//
// v1 keeps EVERYTHING in memory. Promoted ideas never touch disk until
// the user explicitly clicks Promote in the drawer (handled by the
// caller, not this module). Reload = surfaced-but-unpromoted ideas
// dissolve.
//
// Work budget per tick is bounded: we sample a handful of random seed
// bodies and scan their nearest neighbours, rather than doing an O(n²)
// pair enumeration. At 2 Hz with K=6 seeds × M=4 neighbours that's 24
// pair checks / 500 ms, which is fine up to thousands of notes.

import { topLevelFolder } from "../vault/folders.js";
import {
  blendParentsForChild,
  resonanceBetween,
  scoreChild,
  DEFAULT_PARAMS,
} from "./salience.js";
import {
  pickTemplate,
  renderTemplate,
  buildPairSnap,
} from "./salience-templates.js";

const TICK_HZ = 2;
const PAIRS_PER_TICK = 6;
const NEIGHBOURS_PER_SEED = 4;
const PROXIMITY_RADIUS = 220; // world units

// Max history of raw candidates retained this session (for the debug
// palette). Surfaced ideas have no cap here — the UI drawer enforces
// its own.
const CANDIDATE_LOG_CAP = 500;

// ── Serial harvester tunables ───────────────────────────────
// DREAM_ENGINE.md §11.2 — the dream is a passive overnight process.
// Proximity events queue up; a single harvester drains them one model
// call at a time. Never more than one call in flight, never any
// firehose-pileup. Adjusts naturally to model latency: fast model =
// many harvested per phase, slow model = fewer but every one honoured.
const QUEUE_MAX = 30;
const HARVESTER_SETTLE_MS = 350; // breath between pairs so sparks feel distinct
const HARVESTER_POLL_MS = 700; // retry cadence while the queue is empty

export function createSalienceLayer({
  getVault,
  getBodies,
  getDreamDepth,
  onSurface, // fired once per NEW surfaced idea
  onChange, // fired on any surfaced-list mutation (promote/discard)
  onPairSpawn, // optional — fires once per NEW candidate with the pair
  // midpoint. Used by the Phase 2 spark renderer in DREAM_ENGINE.md §11.9
  // to make bumps visible. Fires BEFORE the model call lands — the spark
  // is the "bump," not the resulting idea.
  getParams, // returns the live params object (for dev palette tuning)
  // DREAM_THEMES.md Phase D — when a theme is set, the seed always
  // comes from the theme set, and 60% of pairs keep both sides in
  // theme while 40% force a mixed (one-theme / one-outside) pair
  // for cross-pollination. Null = random (current behaviour).
  getThemeSet, // () => Set<noteId> | null
  // Short-circuit the scanner tick while external work dominates the
  // main thread — e.g., a tend bulk-accept writing 1000+ files.
  // Returns true to pause; false/unset runs normally.
  getPaused,
  utterance, // optional Phase 7 router — when present, salience routes
  // seed-text generation through `idea-seed` for the chance at model-
  // generated hallucinations. Template stays the synchronous floor so
  // a candidate always has text the instant it spawns.
}) {
  const surfaced = []; // currently surfaced, not yet promoted/discarded
  const allCandidates = []; // every candidate spawned this session (debug)
  const pairIndex = new Map(); // stable-pair-id → existing candidate
  // Pool = candidates generated during the current cycle that haven't
  // been judged yet. DREAM_ENGINE.md §11.3. Set to a live array when a
  // cycle begins (via beginCycle), null at all other times. When null,
  // the layer falls back to pre-cycle behaviour: candidates clearing
  // theta_surface go straight to the surfaced list. When non-null,
  // every candidate is pushed to the pool instead, and the surfaced
  // list stays frozen until finalizeCycle runs.
  let pool = null;

  // Serial harvester state. `pendingQueue` holds proximity-detected
  // pair jobs waiting to be handed to the model one-at-a-time.
  // `harvesterBusy` is true for the duration of a single model call.
  // `harvesterTimer` holds the schedule handle for the next tick.
  // `acceptingNew` gates whether new proximity events can queue — true
  // during warming/generating, false during playing/discerning/wake so
  // the reword pass has the pool to itself.
  const pendingQueue = [];
  let harvesterBusy = false;
  let harvesterTimer = 0;
  let acceptingNew = false;

  let tickHandle = 0;
  const rng = mulberry32(Date.now() & 0xffffffff);

  function start() {
    if (tickHandle) return;
    tickHandle = window.setInterval(tick, 1000 / TICK_HZ);
  }
  function stop() {
    if (!tickHandle) return;
    clearInterval(tickHandle);
    tickHandle = 0;
  }
  start();

  function tick() {
    if (getPaused && getPaused()) return;
    const depth = getDreamDepth ? getDreamDepth() : 0;
    if (depth < 0.1) return; // only run while dreaming
    // Only produce candidates while the cycle is actively collecting
    // them. Without this guard, the `falling` state (depth ramping
    // from 0 → 0.45 over ~8s) would push candidates directly onto
    // the surfaced list via attemptPair's `else { surfaced.push }`
    // branch — bypassing the pool entirely and leaving residue that
    // later cycles' finalize wouldn't clear.
    if (!pool) return;

    const vault = getVault();
    const bodies = getBodies();
    if (!vault || !bodies) return;
    const notes = vault.notes;
    if (notes.length < 4) return; // too small to find interesting pairs

    const params = getParams ? getParams() : DEFAULT_PARAMS;

    // DREAM_THEMES.md Phase D — cache theme set for this tick so we
    // don't re-spread it on every seed draw. Null OR empty = random.
    const themeSet = getThemeSet ? getThemeSet() : null;
    const themeActive = themeSet && themeSet.size > 0;
    const themeArr = themeActive ? [...themeSet] : null;

    // Sample K seeds. With a theme, every seed comes from the theme
    // set; 60% of pairs stay inside the theme, 40% force a mixed
    // neighbour from outside for cross-pollination.
    for (let i = 0; i < PAIRS_PER_TICK; i++) {
      let seed;
      if (themeActive) {
        const id = themeArr[Math.floor(rng() * themeArr.length)];
        seed = vault.byId?.get(id);
        if (!seed) continue;
      } else {
        seed = notes[Math.floor(rng() * notes.length)];
      }
      if (!seed.affinity) continue;
      const seedPos = bodies.positionOf(seed.id);
      if (!seedPos) continue;

      // Find M nearest neighbours within PROXIMITY_RADIUS. Cheap O(n) scan.
      let neighbours = findNearest(seed, seedPos, notes, bodies);

      if (themeActive) {
        const mixed = rng() < 0.4;
        if (mixed) {
          // Force the OTHER side of the pair to be outside the theme
          // — that's where fresh angles come from (DREAM_THEMES.md §2.1).
          const outside = neighbours.filter((n) => !themeSet.has(n.id));
          if (outside.length > 0) neighbours = outside;
          // else: no non-theme neighbours nearby this tick — let the
          // inside-theme pair go through rather than skipping, so the
          // tick isn't wasted.
        } else {
          const inside = neighbours.filter((n) => themeSet.has(n.id));
          if (inside.length > 0) neighbours = inside;
          // else: no theme neighbours near this seed — take what's
          // available. Happens when the attractor hasn't yet pulled
          // members together; avoids starving the pool.
        }
      }

      for (const neighbour of neighbours) {
        attemptPair(seed, neighbour, bodies, vault, params, depth);
      }
    }
  }

  function findNearest(seed, seedPos, notes, bodies) {
    const r2 = PROXIMITY_RADIUS * PROXIMITY_RADIUS;
    const out = [];
    for (const n of notes) {
      if (n.id === seed.id) continue;
      const p = bodies.positionOf(n.id);
      if (!p) continue;
      const dx = p[0] - seedPos[0];
      const dy = p[1] - seedPos[1];
      const dz = p[2] - seedPos[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      out.push({ note: n, d2 });
    }
    out.sort((a, b) => a.d2 - b.d2);
    return out.slice(0, NEIGHBOURS_PER_SEED).map((x) => x.note);
  }

  // Proximity handler. Does the cheap resonance check, then EITHER
  // reinforces an already-seen pair OR enqueues a fresh job for the
  // harvester. No scoring, no snap build, no model call happens here
  // — all of that is deferred to the harvester so model throughput
  // paces the cycle, not physics proximity rate.
  function attemptPair(a, b, bodies, vault, params, depth) {
    const aRef = {
      ...a,
      mass: bodies.massOf?.(a.id) ?? 1,
      kind: a.kind || 0,
    };
    const bRef = {
      ...b,
      mass: bodies.massOf?.(b.id) ?? 1,
      kind: b.kind || 0,
    };

    const resonance = resonanceBetween(aRef, bRef);
    if (resonance < params.theta_spawn) return;

    const key = pairKey(a.id, b.id);
    const existing = pairIndex.get(key);
    if (existing) {
      existing.lastTouchedAt = Date.now();
      if (existing.surfaced && onChange) onChange();
      return;
    }

    // Only accept new pairs while the cycle has its mouth open
    // (warming/generating). Playing and discerning close the intake.
    if (!acceptingNew) return;

    // Dedup against in-flight queue so the same pair doesn't double-
    // queue across ticks.
    for (const job of pendingQueue) {
      if (pairKey(job.a.id, job.b.id) === key) return;
    }

    const posA = bodies.positionOf(a.id);
    const posB = bodies.positionOf(b.id);
    const midpoint =
      posA && posB
        ? [
            (posA[0] + posB[0]) / 2,
            (posA[1] + posB[1]) / 2,
            (posA[2] + posB[2]) / 2,
          ]
        : null;

    // Score-gated queue: if full, eject lowest-resonance OR drop new.
    // Keeps the queue a self-ranking top-K.
    if (pendingQueue.length >= QUEUE_MAX) {
      let minIdx = 0;
      for (let i = 1; i < pendingQueue.length; i++) {
        if (pendingQueue[i].resonance < pendingQueue[minIdx].resonance)
          minIdx = i;
      }
      if (resonance <= pendingQueue[minIdx].resonance) return;
      pendingQueue.splice(minIdx, 1);
    }

    pendingQueue.push({ a, b, aRef, bRef, resonance, midpoint });

    // Connection spark — small, responsive. Fires at the physics
    // moment, NOT the model moment. Second spark (bigger) fires in
    // the harvester when the model returns with an idea.
    if (onPairSpawn && midpoint) {
      onPairSpawn({ midpoint, kind: "connection" });
    }

    kickHarvester();
  }

  // Single-place "start or continue" for the harvester. Idempotent —
  // safe to call from attemptPair on every queue push.
  function kickHarvester() {
    if (harvesterBusy) return;
    if (harvesterTimer) return;
    harvesterTimer = window.setTimeout(() => {
      harvesterTimer = 0;
      processNextQueued();
    }, 0);
  }

  // Drain one queue entry. Builds the candidate, awaits the model,
  // scores and admits to pool. Schedules the next call after a settle
  // delay. If no cycle is active or acceptingNew was turned off while
  // we were awaiting, drops the result on the floor.
  async function processNextQueued() {
    if (harvesterBusy) return;
    if (!pool) return; // no active cycle
    if (pendingQueue.length === 0) {
      // Nothing to do; poll again soon in case acceptPair queues more.
      if (acceptingNew) {
        harvesterTimer = window.setTimeout(() => {
          harvesterTimer = 0;
          processNextQueued();
        }, HARVESTER_POLL_MS);
      }
      return;
    }

    harvesterBusy = true;
    const vault = getVault();
    const bodies = getBodies();
    const params = getParams ? getParams() : DEFAULT_PARAMS;

    try {
      const job = pendingQueue.shift();
      const { a, b, aRef, bRef, resonance, midpoint } = job;

      // Notes could have been removed mid-queue. Skip gracefully.
      if (!vault?.byId?.get(a.id) || !vault?.byId?.get(b.id)) return;
      if (!pool) return;

      const key = pairKey(a.id, b.id);
      if (pairIndex.has(key)) return;

      const affinity = blendParentsForChild(aRef, bRef);
      const seed = hashPair(a.id, b.id);
      const snap = buildPairSnap(a, b, {
        topLevelFolder,
        pairSeed: seed,
        dayKey: localDayKey(),
      });
      const template = pickTemplate(snap, seed);
      const seedTextTemplate = renderTemplate(template, snap);

      const candidate = {
        id: key,
        parentA: a,
        parentB: b,
        affinity,
        midpoint,
        resonance,
        seedText: seedTextTemplate,
        seedBackend: "template",
        // Phase B structured fields. Template-only candidates have
        // claim === seedText, no evidence, no next. Model-produced
        // candidates fill these in via parseIdeaSeedJson + verification.
        claim: seedTextTemplate,
        evidenceA: null,
        evidenceB: null,
        nextAction: null,
        snap,
        playState: "untouched",
        playedAt: 0,
        originalSeedText: seedTextTemplate,
        spawnedAt: Date.now(),
        lastTouchedAt: Date.now(),
        promoted: false,
        surfaced: false,
      };

      // Signal: harvester has started work on this pair. Used by
      // future visual glue (parent-body pulse). The hook is always
      // fired whether or not a listener is attached.
      if (playListener) {
        try {
          playListener({ candidate, kind: "seeding" });
        } catch (err) {
          console.warn("[bz] salience: seeding listener threw", err);
        }
      }

      // Serial model call — this is the whole point of the harvester.
      // Parse JSON + verify evidence quotes against actual note bodies.
      // If the model invented a quote, DROP the candidate entirely per
      // the plan — defensible output is the point.
      let dropped = false;
      if (utterance) {
        try {
          const result = await utterance.generate("idea-seed", snap);
          if (result && result.text && result.backend !== "template") {
            const parsed = parseIdeaSeedJson(result.text);
            if (parsed) {
              const verified = verifyEvidence(parsed, a, b);
              if (verified.ok) {
                candidate.claim = verified.claim;
                candidate.evidenceA = verified.evidence_a;
                candidate.evidenceB = verified.evidence_b;
                candidate.nextAction = verified.next;
                candidate.seedText = verified.claim; // compat for old consumers
                candidate.seedBackend = result.backend;
                candidate.originalSeedText = verified.claim;
              } else {
                // Invented quote — drop the candidate rather than
                // ship something whose evidence doesn't exist.
                console.warn(
                  "[bz] salience: idea-seed dropped — unverified evidence",
                  { pair: key, reason: verified.reason },
                );
                dropped = true;
              }
            }
            // Unparseable JSON = just stay on the template seed. No drop.
          }
        } catch (err) {
          console.warn("[bz] salience: idea-seed serial fail", err);
        }
      }

      // Re-check cycle state after the await — the cycle may have
      // ended while this call was in flight.
      if (!pool) return;
      if (dropped) return; // never reaches the pool

      const neighbourKinds = findNeighbourKinds(midpoint, bodies, vault);
      const breakdown = scoreChild(
        { ...candidate },
        {
          vault,
          existingIdeas: pool,
          neighbourKinds,
          now: Date.now(),
        },
        params,
      );
      Object.assign(candidate, breakdown);

      pairIndex.set(key, candidate);
      allCandidates.push(candidate);
      if (allCandidates.length > CANDIDATE_LOG_CAP) allCandidates.shift();

      if (candidate.salience >= params.theta_surface) {
        candidate.surfaced = true;
        pool.push(candidate);
      }

      // Idea spark — the bright one. Fires at model completion, so
      // the user sees "model has spoken" as a distinct visual beat
      // from the earlier connection spark at queue time.
      if (onPairSpawn && midpoint) {
        onPairSpawn({ midpoint, candidate, kind: "idea" });
      }

      if (onChange) onChange();
    } finally {
      harvesterBusy = false;
      // Breath, then pick the next one. acceptingNew being false
      // stops the loop — we don't consume stale queue items after
      // playing begins.
      if (pool && acceptingNew) {
        harvesterTimer = window.setTimeout(() => {
          harvesterTimer = 0;
          processNextQueued();
        }, HARVESTER_SETTLE_MS);
      }
    }
  }

  function stopHarvester() {
    if (harvesterTimer) {
      clearTimeout(harvesterTimer);
      harvesterTimer = 0;
    }
    // Don't touch harvesterBusy — if a model call is mid-flight, let
    // the await resolve and the finally handler will see pool === null
    // / acceptingNew === false and not reschedule.
  }

  // Called by main.js on dream phase-change when warming begins.
  // Switches the layer into pool-routing mode. The drawer is cleared
  // first so the previous cycle's surfaced ideas aren't mixed with
  // this one's pool readings.
  function beginCycle() {
    pool = [];
    pairIndex.clear();
    // Clear any survivors from the previous cycle. The drawer should
    // read "dreaming · N forming…" during warming/generating/playing,
    // not show stale winners from last night. New survivors land at
    // end-of-discerning.
    surfaced.length = 0;
    lastJudgeReasoning = "";
    lastJudgeAt = 0;
    lastThemeFilterStats = { themed: false, before: 0, after: 0 };
    // Fresh harvester state. Cycle starts with an empty queue and
    // an open-for-business gate.
    pendingQueue.length = 0;
    harvesterBusy = false;
    if (harvesterTimer) {
      clearTimeout(harvesterTimer);
      harvesterTimer = 0;
    }
    acceptingNew = true;
    if (onChange) onChange();
  }

  // Called when discerning begins. Picks the top K candidates from the
  // pool by salience score with a diversity guard (no more than 2 from
  // any single parent). Survivors become surfaced; non-survivors are
  // discarded (not logged to disk, not added to allCandidates — the
  // forgetting is the point). Returns the surfaced list.
  // Phase 4 discernment — picks survivors from the pool.
  //
  // Two-stage flow:
  //   1. Sync: pick salience top-K with diversity guard and populate
  //      `surfaced` immediately. The drawer never sees "empty pending"
  //      during the 20-second discerning phase.
  //   2. Async: if the utterance router is available, run the pool
  //      through `idea-judge` and, when it returns, REPLACE the
  //      surfaced list with the judge's picks plus its reasoning.
  //
  // If the judge fails or times out, the salience picks stand. The
  // reasoning is stored on `lastJudgeReasoning` for the dream log.
  function finalizeCycle({ topK = 5 } = {}) {
    stopPlaying();
    // Close the harvester fully at this point — discerning is a pure
    // judge pass, no new candidates should arrive.
    acceptingNew = false;
    stopHarvester();
    pendingQueue.length = 0;
    if (!pool) return surfaced.slice();
    let finalPool = pool.slice();
    const poolSizeBeforeFilter = finalPool.length;
    pool = null;

    // DREAM_THEMES.md Phase E — theme surfacing filter. A candidate
    // survives only if at least one parent is in the theme set. Pairs
    // where both parents drifted outside the theme are silently
    // discarded (not added to surfaced, not sent to the judge). The
    // morning report reads `lastThemeFilterStats` to tell the user
    // how fertile the theme was.
    const themeSet = getThemeSet ? getThemeSet() : null;
    if (themeSet && themeSet.size > 0) {
      finalPool = finalPool.filter(
        (c) =>
          (c.parentA && themeSet.has(c.parentA.id)) ||
          (c.parentB && themeSet.has(c.parentB.id)),
      );
    }
    lastThemeFilterStats = {
      themed: !!(themeSet && themeSet.size > 0),
      before: poolSizeBeforeFilter,
      after: finalPool.length,
    };

    applySalienceWinners(finalPool, topK);
    // Kick off the judge in the background if we have a router AND
    // there's enough material to be worth judging (fewer than 3
    // candidates and the pool is already small enough that salience
    // top-K is the right answer).
    if (utterance && finalPool.length >= 3) {
      runJudge(finalPool, topK).catch((err) => {
        console.warn("[bz] salience: judge failed", err);
      });
    }
    if (onChange) onChange();
    return surfaced.slice();
  }

  // Pick salience top-K with diversity guard (no more than 2 from
  // any single parent). Writes into `surfaced`. Used as the sync
  // floor in finalizeCycle and as the fallback if the judge fails.
  function applySalienceWinners(finalPool, topK) {
    const contenders = finalPool
      .slice()
      .sort((a, b) => (b.salience || 0) - (a.salience || 0));
    const winners = [];
    const parentCount = new Map();
    for (const c of contenders) {
      if (winners.length >= topK) break;
      const pa = c.parentA?.id;
      const pb = c.parentB?.id;
      const countA = parentCount.get(pa) || 0;
      const countB = parentCount.get(pb) || 0;
      if (countA >= 2 || countB >= 2) continue;
      winners.push(c);
      if (pa) parentCount.set(pa, countA + 1);
      if (pb) parentCount.set(pb, countB + 1);
    }
    surfaced.length = 0;
    for (const w of winners) {
      surfaced.push(w);
      if (onSurface) onSurface(w);
    }
  }

  // Ask the model to rank the pool. Replaces `surfaced` with the
  // judge's picks if the parse succeeds; silent no-op if it doesn't.
  async function runJudge(finalPool, topK) {
    const candidates = finalPool.map((c, i) => ({
      index: i + 1,
      text: c.seedText,
      pair: [c.parentA?.title, c.parentB?.title].filter(Boolean).join(" · "),
    }));
    const result = await utterance.generate("idea-judge", {
      candidates,
      topK,
    });
    if (!result || !result.text) return;
    if (result.backend === "template") return;
    const parsed = parseJudgeOutput(result.text);
    if (!parsed) return;

    const picked = parsed.picks.map((i) => finalPool[i - 1]).filter(Boolean);
    if (picked.length === 0) return;

    // Apply with the same diversity guard as salience path. Judge
    // almost always respects it anyway but belt-and-suspenders.
    const winners = [];
    const parentCount = new Map();
    for (const c of picked) {
      if (winners.length >= topK) break;
      const pa = c.parentA?.id;
      const pb = c.parentB?.id;
      const countA = parentCount.get(pa) || 0;
      const countB = parentCount.get(pb) || 0;
      if (countA >= 2 || countB >= 2) continue;
      winners.push(c);
      if (pa) parentCount.set(pa, countA + 1);
      if (pb) parentCount.set(pb, countB + 1);
    }
    if (winners.length === 0) return;

    surfaced.length = 0;
    for (const w of winners) {
      surfaced.push(w);
      if (onSurface) onSurface(w);
    }
    lastJudgeReasoning = String(parsed.reasoning || "").trim();
    lastJudgeAt = Date.now();
    if (onChange) onChange();

    // Phase C — adversary pass. Every survivor gets one attack call.
    // If the adversary produces a sharper counter, replace in-place.
    // If it "survives," stamp survivedCritique for the frontmatter.
    // Fires after surfaced is populated so the user sees something
    // immediately; adversary replacements come in async.
    for (const w of winners) {
      runAdversary(w).catch((err) => {
        console.warn("[bz] salience: adversary failed", err);
      });
    }
  }

  // Hit the model with one adversarial pass against a surfaced idea.
  // Mutates in place + fires onChange so the drawer re-renders.
  async function runAdversary(candidate) {
    if (!utterance || !candidate) return;
    const snap = {
      claim: candidate.claim || candidate.seedText || "",
      evidenceA: candidate.evidenceA || "",
      evidenceB: candidate.evidenceB || "",
      nextAction: candidate.nextAction || "",
      a_title: candidate.parentA?.title || "",
      b_title: candidate.parentB?.title || "",
    };
    const result = await utterance.generate("idea-adversary", snap);
    if (!result || !result.text || result.backend === "template") return;
    const parsed = parseAdversaryOutput(result.text);
    if (!parsed) return;

    if (parsed.verdict === "survives") {
      candidate.survivedCritique = true;
      candidate.adversaryReason = parsed.reason || "";
      candidate.adversaryBackend = result.backend;
    } else if (parsed.verdict === "replaced" && parsed.counter_claim) {
      // Counter becomes the new claim. Evidence carries over (same
      // passages, sharper reading). "next" can be replaced too if the
      // counter provided one.
      candidate.originalSeedText = candidate.claim || candidate.seedText;
      candidate.claim = parsed.counter_claim;
      candidate.seedText = parsed.counter_claim;
      if (parsed.counter_next) candidate.nextAction = parsed.counter_next;
      candidate.survivedCritique = false; // wasn't the survivor; is the counter
      candidate.adversaryReason = parsed.reason || "";
      candidate.adversaryBackend = result.backend;
      candidate.seedBackend = result.backend;
    } else {
      return;
    }
    if (onChange) onChange();
  }

  // Forgiving JSON parser for the adversary's output. Matches the
  // judge / idea-seed parsers in shape.
  function parseAdversaryOutput(text) {
    const stripped = String(text || "").trim();
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      const obj = JSON.parse(m[0]);
      const verdict = String(obj.verdict || "")
        .toLowerCase()
        .trim();
      if (verdict !== "survives" && verdict !== "replaced") return null;
      return {
        verdict,
        reason: String(obj.reason || "").trim(),
        counter_claim: String(obj.counter_claim || "").trim(),
        counter_next: String(obj.counter_next || "").trim(),
      };
    } catch {
      return null;
    }
  }

  // Forgiving parser for the judge's JSON output. Handles:
  //   - Clean raw JSON
  //   - JSON wrapped in a code fence (```json ... ```)
  //   - JSON with preamble/trailing text
  //   - Fallback: a bare comma-separated list of indices
  function parseJudgeOutput(text) {
    const stripped = String(text).trim();
    // 1. Try the greediest JSON object match.
    const jsonMatch = stripped.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        if (Array.isArray(obj.picks)) {
          const picks = obj.picks
            .map((n) => Number(n))
            .filter((n) => Number.isInteger(n) && n > 0);
          if (picks.length > 0) {
            return { picks, reasoning: obj.reasoning || "" };
          }
        }
      } catch {
        // fall through to index-only parse
      }
    }
    // 2. Last resort — any run of digits is a candidate index.
    const indexMatches = stripped.match(/\b\d+\b/g);
    if (indexMatches) {
      const picks = [
        ...new Set(
          indexMatches.map(Number).filter((n) => Number.isInteger(n) && n > 0),
        ),
      ];
      if (picks.length > 0) return { picks, reasoning: "" };
    }
    return null;
  }

  // Accessors for main.js to include the judge's reasoning in the
  // dream log / morning report artifacts.
  let lastJudgeReasoning = "";
  let lastJudgeAt = 0;
  function getLastJudgeReasoning() {
    return lastJudgeReasoning;
  }
  function getLastJudgeAt() {
    return lastJudgeAt;
  }

  // DREAM_THEMES.md Phase E — how much of the pool landed in the
  // theme after filtering. Consumed by the morning report so the
  // user can see "8 of 23 survived on [[Theme]]." Reset at the start
  // of each cycle.
  let lastThemeFilterStats = { themed: false, before: 0, after: 0 };
  function getLastThemeFilterStats() {
    return { ...lastThemeFilterStats };
  }

  // Abort a cycle without running discernment (e.g., user woke the dream
  // mid-phase). Pool is discarded entirely — no winners, drawer stays
  // empty. This matches DREAM_ENGINE.md §11.6: non-survivors are
  // forgotten, including the ones that would've won if the cycle had
  // completed.
  // ── Phase 3: play operations ──────────────────────────
  // DREAM_ENGINE.md §11.4 — while the dream is in its "playing" phase,
  // the engine revisits top-scoring pool candidates and asks the model
  // for alternative phrasings. Today we implement only Reword (the
  // simplest of the three play patterns). Reword replaces the
  // candidate's seedText in-place; originalSeedText is preserved on
  // the candidate in case Phase 4 judgment wants to compare both.
  //
  // Rate: one play op per PLAY_INTERVAL_MS while the phase is active,
  // independent of the salience scanner's 2 Hz tick. Keeps model-call
  // volume well under a single reasoning-model's throughput.
  const PLAY_INTERVAL_MS = 6000;
  let playTimer = 0;
  // Fires on every play-op with { candidate, kind } so the canvas can
  // visually indicate which pair is being played with (future Phase 3
  // visual work — parent bodies pulsing together). Currently used only
  // by diagnostic hooks.
  let playListener = null;

  function startPlaying() {
    if (playTimer) return;
    // Close the idea-seed harvester's intake. Drain whatever's in
    // the queue (just drop it — the pool already has material to
    // play with). The harvester's current await, if any, will see
    // acceptingNew=false in its finally handler and not reschedule.
    acceptingNew = false;
    stopHarvester();
    pendingQueue.length = 0;
    // Run one immediately so the phase feels instant rather than
    // waiting 6 s for the first play op.
    runPlayOp().catch(() => {});
    playTimer = window.setInterval(() => {
      runPlayOp().catch(() => {});
    }, PLAY_INTERVAL_MS);
  }

  function stopPlaying() {
    if (!playTimer) return;
    clearInterval(playTimer);
    playTimer = 0;
  }

  async function runPlayOp() {
    if (!pool || pool.length === 0) return;
    if (!utterance) return;
    // Pick the highest-salience candidate that hasn't been played yet.
    // If every candidate in the pool has been played, skip this tick —
    // there's no benefit to rewording the same idea twice in one cycle.
    const target = pool
      .filter((c) => c.playState === "untouched")
      .sort((a, b) => (b.salience || 0) - (a.salience || 0))[0];
    if (!target) return;

    target.playState = "rewording";
    target.playedAt = Date.now();
    if (playListener) {
      try {
        playListener({ candidate: target, kind: "reword" });
      } catch (err) {
        console.warn("[bz] salience: play listener threw", err);
      }
    }
    if (onChange) onChange();

    try {
      const rewordSnap = {
        ...(target.snap || {}),
        original_text: target.seedText,
      };
      const result = await utterance.generate("idea-reword", rewordSnap);
      if (
        result &&
        result.text &&
        result.backend !== "template" &&
        !isSameText(result.text, target.seedText)
      ) {
        // Replace claim + seedText in place; evidence carries over
        // since reword is a phrasing change, not a content change.
        target.seedText = result.text;
        target.claim = result.text;
        target.seedBackend = result.backend;
        target.playState = "played";
      } else {
        target.playState = "skipped";
      }
    } catch (err) {
      console.warn("[bz] salience: idea-reword failed", err);
      target.playState = "skipped";
    }
    if (onChange) onChange();
  }

  function setPlayListener(fn) {
    playListener = typeof fn === "function" ? fn : null;
  }

  function abortCycle() {
    stopPlaying();
    acceptingNew = false;
    stopHarvester();
    pendingQueue.length = 0;
    if (!pool) return;
    pool = null;
    if (onChange) onChange();
  }

  // Strict-enough text equality for reword dedupe. Case-insensitive,
  // whitespace-collapsed. If the model returns something that differs
  // only in punctuation or capitalisation from the original, we don't
  // count it as a real variant — playState becomes "skipped" and the
  // pool entry stays unchanged.
  function isSameText(a, b) {
    if (!a || !b) return false;
    const normA = String(a).toLowerCase().replace(/\s+/g, " ").trim();
    const normB = String(b).toLowerCase().replace(/\s+/g, " ").trim();
    return normA === normB;
  }

  function getPoolSize() {
    return pool ? pool.length : 0;
  }
  function getQueueSize() {
    return pendingQueue.length;
  }
  function isCycleActive() {
    return pool !== null;
  }

  function findNeighbourKinds(midpoint, bodies, vault) {
    if (!midpoint) return [];
    const r2 = (PROXIMITY_RADIUS * 1.5) ** 2;
    const kinds = [];
    for (const n of vault.notes) {
      const p = bodies.positionOf(n.id);
      if (!p) continue;
      const dx = p[0] - midpoint[0];
      const dy = p[1] - midpoint[1];
      const dz = p[2] - midpoint[2];
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      kinds.push(n.kind || 0);
    }
    return kinds;
  }

  // ── Public API ───────────────────────────────────────────
  function getSurfaced() {
    return surfaced.filter((c) => !c.promoted);
  }

  function getAllCandidates() {
    return allCandidates;
  }

  function removeSurfaced(id) {
    const i = surfaced.findIndex((c) => c.id === id);
    if (i === -1) return null;
    const [c] = surfaced.splice(i, 1);
    if (onChange) onChange();
    return c;
  }

  function markPromoted(id) {
    const c = surfaced.find((c) => c.id === id);
    if (!c) return null;
    c.promoted = true;
    if (onChange) onChange();
    return c;
  }

  function clear() {
    surfaced.length = 0;
    allCandidates.length = 0;
    pairIndex.clear();
    if (onChange) onChange();
  }

  // Called by the parent-engagement nudge in main.js when the user opens
  // a parent note. Bumps lastTouchedAt on any surfaced candidate whose
  // parent they touched — Age penalty recalculates fresh.
  function touchParent(noteId) {
    const now = Date.now();
    for (const c of surfaced) {
      if (c.parentA.id === noteId || c.parentB.id === noteId) {
        c.lastTouchedAt = now;
      }
    }
    if (onChange) onChange();
  }

  return {
    getSurfaced,
    getAllCandidates,
    removeSurfaced,
    markPromoted,
    touchParent,
    clear,
    beginCycle,
    finalizeCycle,
    abortCycle,
    getPoolSize,
    getQueueSize,
    isCycleActive,
    startPlaying,
    stopPlaying,
    setPlayListener,
    getLastJudgeReasoning,
    getLastJudgeAt,
    getLastThemeFilterStats,
    dispose: () => {
      stopPlaying();
      stop();
    },
  };
}

// Stable key for a pair regardless of order.
function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

// ── Phase B helpers ─────────────────────────────────────────
// The idea-seed model returns strict JSON; parseIdeaSeedJson handles
// the common "preamble + fence + trailing noise" cases and returns
// either a normalised object or null.
function parseIdeaSeedJson(text) {
  const stripped = String(text || "").trim();
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const claim = String(obj.claim || "").trim();
    if (!claim) return null;
    return {
      claim,
      evidence_a: String(obj.evidence_a || "").trim(),
      evidence_b: String(obj.evidence_b || "").trim(),
      next: String(obj.next || "").trim(),
    };
  } catch {
    return null;
  }
}

// Verify each evidence quote is a literal substring of its source
// note's body. Case-insensitive, whitespace-normalised — the model is
// allowed minor whitespace drift since it's copying from an already-
// collapsed excerpt, but not paraphrasing. Returns { ok, claim,
// evidence_a, evidence_b, next, reason } where ok is false if the
// parsed object failed verification.
//
// Both evidence fields are OPTIONAL — the prompt allows "" when the
// model can't find a grounding phrase. Empty evidence is acceptable;
// FALSIFIED evidence (non-empty but not a substring) is grounds for
// dropping the whole candidate.
function verifyEvidence(parsed, noteA, noteB) {
  const bodyA = normaliseBody(noteA?.body || "");
  const bodyB = normaliseBody(noteB?.body || "");
  if (parsed.evidence_a) {
    const norm = normaliseBody(parsed.evidence_a);
    if (!bodyA.includes(norm)) {
      return {
        ok: false,
        reason: `evidence_a not in A body: "${parsed.evidence_a.slice(0, 40)}…"`,
      };
    }
  }
  if (parsed.evidence_b) {
    const norm = normaliseBody(parsed.evidence_b);
    if (!bodyB.includes(norm)) {
      return {
        ok: false,
        reason: `evidence_b not in B body: "${parsed.evidence_b.slice(0, 40)}…"`,
      };
    }
  }
  return {
    ok: true,
    claim: parsed.claim,
    evidence_a: parsed.evidence_a || null,
    evidence_b: parsed.evidence_b || null,
    next: parsed.next || null,
  };
}

function normaliseBody(s) {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Today's local-date key as `YYYY-MM-DD`. Used by buildPairSnap's warp
// logic so the same encounter on the same day produces a stable warp,
// but tomorrow the same pair re-rolls under a different amplified slot.
function localDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Cheap hash for seeding the template picker RNG. Identical pairs
// produce identical seed text.
function hashPair(idA, idB) {
  const s = pairKey(idA, idB);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
