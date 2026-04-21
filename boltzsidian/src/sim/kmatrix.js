// K — an NxN matrix (N = NUM_KINDS) recording which kinds of notes tend to
// be linked together. Each entry is a scalar that starts at 1.0 (neutral)
// and drifts under Hebbian updates:
//
//   link created (A ↔ B):   K[A][B] *= (1 + η)
//   link deleted (A ↔ B):   K[A][B] *= (1 - η/2)
//
// The update is symmetric, decays slowly toward 1.0 each step (homeostasis),
// and is clamped to a sane range so a single-tagged vault can't explode.
//
// Phase 3 only *records* K. Phase 6+ will use it to weight meaning-filter
// scoring; the scene's K_PRESETS can also be seeded from it later.

import { NUM_KINDS } from "../vault/kind.js";

const NUDGE_CREATE = 0.05;
const NUDGE_DELETE = 0.03;
const CLAMP_LOW = 0.2;
const CLAMP_HIGH = 3.5;
const HOMEOSTASIS = 0.0008; // per homeostasis() call, pulls each entry toward 1.0

export function createKMatrix(initial) {
  const size = NUM_KINDS * NUM_KINDS;
  const k = new Float32Array(size);
  if (initial && initial.length === size) {
    k.set(initial);
  } else {
    k.fill(1.0);
  }

  function idx(a, b) {
    return a * NUM_KINDS + b;
  }

  function nudge(a, b, scale) {
    if (a < 0 || b < 0 || a >= NUM_KINDS || b >= NUM_KINDS) return;
    const i = idx(a, b);
    const j = idx(b, a);
    k[i] = clamp(k[i] * scale);
    if (i !== j) k[j] = clamp(k[j] * scale);
  }

  function onLink(a, b) {
    nudge(a, b, 1 + NUDGE_CREATE);
  }
  function onUnlink(a, b) {
    nudge(a, b, 1 - NUDGE_DELETE);
  }

  function homeostasis() {
    for (let i = 0; i < size; i++) {
      const v = k[i];
      k[i] = v + (1.0 - v) * HOMEOSTASIS;
    }
  }

  function serialize() {
    return Array.from(k);
  }

  function snapshot() {
    // Return a plain 2-d array for debug display.
    const m = new Array(NUM_KINDS);
    for (let a = 0; a < NUM_KINDS; a++) {
      m[a] = new Array(NUM_KINDS);
      for (let b = 0; b < NUM_KINDS; b++) m[a][b] = k[idx(a, b)];
    }
    return m;
  }

  function clamp(v) {
    if (v < CLAMP_LOW) return CLAMP_LOW;
    if (v > CLAMP_HIGH) return CLAMP_HIGH;
    return v;
  }

  return { onLink, onUnlink, homeostasis, serialize, snapshot, raw: k };
}
