// Salience layer — the scoring engine for child ideas.
//
// A "child" is a candidate idea produced by a proximity interaction between
// two existing notes during dream mode. Every child gets a score in four
// axes; their product determines whether the child is kept, shown, or
// dissolved.
//
//   S(child) = novelty × coherence × reach × (1 − age_penalty)
//
// All four axes are in [0, 1]; S is in [0, 1]. A weight vector lets the
// caller dial the mix — novelty-heavy for "surprise me," reach-heavy for
// "span domains," etc. Defaults are calibrated against the demo vault to
// hit the BUILD_PLAN §Phase 6 acceptance bar (3–5 promotions across 10
// Dream Now runs).
//
// Pure function. No side effects. Fed a child record plus the current
// vault / existing-candidates snapshot.

import {
  AFFINITY_DIMS,
  dot,
  distance,
  projectOntoSegment,
} from "./affinity.js";

// Default weights + thresholds. Tuned later via Shift+S debug palette.
export const DEFAULT_PARAMS = {
  w_novelty: 1.0,
  w_coherence: 0.8,
  w_reach: 1.2,
  w_age: 1.0,
  age_halflife_ms: 24 * 60 * 60 * 1000, // 1 day
  novelty_radius: 0.6, // affinity distance below which a candidate is "similar"
  reach_neighbour_count: 6,
  // Promotion / surface thresholds. `θ_spawn` is the resonance gate
  // applied before a candidate is even scored; `θ_surface` is the score
  // above which a candidate surfaces into the user's drawer.
  theta_spawn: 0.25,
  theta_surface: 0.35,
};

// Score one child. Returns an object with the four axes + final salience,
// so the debug palette can show the breakdown.
export function scoreChild(child, context, params = DEFAULT_PARAMS) {
  const {
    vault,
    existingIdeas = [],
    neighbourKinds = [],
    now = Date.now(),
  } = context;

  const novelty = scoreNovelty(child, existingIdeas, params);
  const coherence = scoreCoherence(child);
  const reach = scoreReach(neighbourKinds, params);
  const age_penalty = scoreAgePenalty(child, params, now);

  // Weighted geometric mean so a single weak axis drags the product down
  // more predictably than a raw product would.
  const w =
    params.w_novelty + params.w_coherence + params.w_reach + params.w_age;
  const salience =
    Math.pow(Math.max(1e-6, novelty), params.w_novelty / w) *
    Math.pow(Math.max(1e-6, coherence), params.w_coherence / w) *
    Math.pow(Math.max(1e-6, reach), params.w_reach / w) *
    Math.pow(Math.max(1e-6, 1 - age_penalty), params.w_age / w);

  return {
    novelty,
    coherence,
    reach,
    age_penalty,
    salience,
  };
}

// Novelty — distance from the nearest existing idea in affinity space,
// normalised so 1.0 means "unlike anything already kept" and 0 means
// "identical to something we already have."
function scoreNovelty(child, existingIdeas, params) {
  if (existingIdeas.length === 0) return 1.0;
  let minD = Infinity;
  for (const idea of existingIdeas) {
    if (!idea.affinity) continue;
    const d = distance(child.affinity, idea.affinity);
    if (d < minD) minD = d;
  }
  if (!Number.isFinite(minD)) return 1.0;
  // Smooth curve: d=0 → 0, d=novelty_radius → ~0.63, d>>radius → ~1.
  return 1 - Math.exp(-minD / Math.max(0.05, params.novelty_radius));
}

// Coherence — how close the child's affinity sits to the line segment
// between its two parents. A child drifting far from both parents reads
// as noise; a child sitting too close to either parent is redundant.
// The sweet spot is *on* the line, *between* the parents.
function scoreCoherence(child) {
  if (!child.parentA?.affinity || !child.parentB?.affinity) return 0.5;
  const proj = projectOntoSegment(
    child.affinity,
    child.parentA.affinity,
    child.parentB.affinity,
  );
  const offLine = distance(child.affinity, proj);
  // Convert distance-to-line into a [0, 1] score. Cap at 1 so a child
  // far from the segment doesn't produce something silly.
  return Math.max(0, 1 - offLine * 1.4);
}

// Reach — kind diversity among the child's nearest neighbours in the
// scene. BOLTZMANN §5.3: "an idea that couples episodes to dust to halos
// scores high; single-kind huddles score low." K matrix would refine
// this; v1 just counts distinct kinds up to the configured neighbourhood
// size and normalises against the theoretical max (NUM_KINDS).
function scoreReach(neighbourKinds, params) {
  if (!neighbourKinds || neighbourKinds.length === 0) return 0;
  const n = Math.min(neighbourKinds.length, params.reach_neighbour_count);
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(neighbourKinds[i]);
  // 1 kind → minimum reach; 4+ kinds → full reach.
  return Math.min(1, (seen.size - 1) / 3);
}

// Age penalty — ideas that don't get reinforced fade. Reinforcement =
// the `lastTouchedAt` timestamp being updated (by a later dream-time
// interaction mentioning the same pair, or by the user opening a parent).
// `child.lastTouchedAt` defaults to `child.spawnedAt` at birth.
function scoreAgePenalty(child, params, now) {
  const touched = child.lastTouchedAt ?? child.spawnedAt ?? now;
  const age = Math.max(0, now - touched);
  // Exponential decay: half-life of 1 day by default.
  return 1 - Math.pow(0.5, age / params.age_halflife_ms);
}

// Resonance — the gate BEFORE scoring. A pair only spawns a candidate
// child if their resonance clears θ_spawn. Cheap to compute; runs over
// many pairs per dream tick.
export function resonanceBetween(a, b) {
  if (!a.affinity || !b.affinity) return 0;
  const similarity = dot(a.affinity, b.affinity);
  const mA = Math.max(0.5, a.mass || 1);
  const mB = Math.max(0.5, b.mass || 1);
  return similarity * Math.log(1 + mA * mB);
}

// Convenience: given a pair of parents, blend their affinities weighted
// by log-mass. Heavier parent pulls the child's affinity slightly toward
// its own — matches the "anchor notes dominate" intuition.
export function blendParentsForChild(parentA, parentB) {
  const mA = Math.log(2 + (parentA.mass || 1));
  const mB = Math.log(2 + (parentB.mass || 1));
  const v = new Array(AFFINITY_DIMS).fill(0);
  const wSum = mA + mB || 1;
  for (let i = 0; i < AFFINITY_DIMS; i++) {
    v[i] = (parentA.affinity[i] * mA + parentB.affinity[i] * mB) / wSum;
  }
  // Renormalise so the child lives on the unit sphere like its parents.
  let s = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) s += v[i] * v[i];
  if (s < 1e-12) return v;
  const k = 1 / Math.sqrt(s);
  for (let i = 0; i < AFFINITY_DIMS; i++) v[i] *= k;
  return v;
}
