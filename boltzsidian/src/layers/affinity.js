// Affinity vectors — 8-float fingerprints per note.
//
// Purpose: give the salience layer a cheap, deterministic "shape of this
// thought" representation that can be compared, mixed, and scored against
// other notes. Not a real semantic embedding — we don't have the machinery
// or the user-data licence — but a stable, repeatable hash of the note's
// tags that clusters identically-tagged notes together in 8-D.
//
// Rules:
//   1. Frontmatter `affinity: [f0, f1, …, f7]` overrides everything.
//   2. Otherwise: sum each tag's hash-seeded unit vector; normalise.
//   3. Untagged notes get a zero vector. That's the correct behaviour —
//      they have no shape-in-affinity-space yet, and resonance against
//      other notes will be zero, so they won't spawn children until the
//      user tags them.
//
// Determinism is load-bearing. Two runs over the same tag set must
// produce byte-identical vectors so saved idea files point at the same
// parents across reloads.

export const AFFINITY_DIMS = 8;

export function affinityFor(note) {
  // Frontmatter override takes priority.
  const fmAff = note?.frontmatter?.affinity;
  if (isValidAffinityArray(fmAff))
    return normalise(fmAff.slice(0, AFFINITY_DIMS));

  const tags = note?.tags || [];
  if (tags.length === 0) return new Array(AFFINITY_DIMS).fill(0);

  const v = new Array(AFFINITY_DIMS).fill(0);
  for (const tag of tags) {
    const u = unitVectorForTag(tag);
    for (let i = 0; i < AFFINITY_DIMS; i++) v[i] += u[i];
  }
  return normalise(v);
}

// Mix two parent affinities into a child. Weight defaults to 0.5 each
// (clean midpoint). Passing different weights lets the caller bias toward
// one parent — used when one parent is much heavier than the other.
export function mixAffinities(a, b, weightA = 0.5, weightB = 0.5) {
  const out = new Array(AFFINITY_DIMS).fill(0);
  const wSum = weightA + weightB || 1;
  for (let i = 0; i < AFFINITY_DIMS; i++) {
    out[i] = (a[i] * weightA + b[i] * weightB) / wSum;
  }
  return normalise(out);
}

// Standard cosine-ish similarity for normalised vectors. Range [-1, 1] but
// in practice stays [0, 1] for hash-seeded tag vectors because they're
// sums of nonnegative-biased unit vectors. Callers that need a
// probability should clamp.
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) s += a[i] * b[i];
  return s;
}

// Euclidean distance for novelty scoring. Always nonnegative.
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

// Project `p` onto the line segment from `a` to `b`, return the projected
// point. Used for coherence scoring — how well a child sits on the line
// between its parents.
export function projectOntoSegment(p, a, b) {
  const ab = new Array(AFFINITY_DIMS);
  let abLen2 = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) {
    ab[i] = b[i] - a[i];
    abLen2 += ab[i] * ab[i];
  }
  if (abLen2 < 1e-9) return a.slice();
  let t = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) t += (p[i] - a[i]) * ab[i];
  t = Math.max(0, Math.min(1, t / abLen2));
  const q = new Array(AFFINITY_DIMS);
  for (let i = 0; i < AFFINITY_DIMS; i++) q[i] = a[i] + ab[i] * t;
  return q;
}

// ── Internals ──────────────────────────────────────────────
function isValidAffinityArray(a) {
  return (
    Array.isArray(a) &&
    a.length >= AFFINITY_DIMS &&
    a
      .slice(0, AFFINITY_DIMS)
      .every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

// Hash a tag name into a deterministic unit vector in 8-D. We use FNV-1a
// to seed a Mulberry32 PRNG, then draw 8 values in [-0.5, 0.5] and
// normalise. Same tag → same vector, forever.
function unitVectorForTag(tag) {
  const seed = fnv1a(String(tag).toLowerCase());
  const rng = mulberry32(seed);
  const v = new Array(AFFINITY_DIMS);
  for (let i = 0; i < AFFINITY_DIMS; i++) v[i] = rng() - 0.5;
  return normalise(v);
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Drop sign bit so mulberry32 gets an unsigned seed.
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

function normalise(v) {
  let s = 0;
  for (let i = 0; i < AFFINITY_DIMS; i++) s += v[i] * v[i];
  if (s < 1e-12) return new Array(AFFINITY_DIMS).fill(0);
  const k = 1 / Math.sqrt(s);
  const out = new Array(AFFINITY_DIMS);
  for (let i = 0; i < AFFINITY_DIMS; i++) out[i] = v[i] * k;
  return out;
}

// Assign affinity vectors to every note in the vault. Called once at
// vault-open time and again whenever a save re-parses tags.
export function assignAffinities(notes) {
  for (const n of notes) n.affinity = affinityFor(n);
}
