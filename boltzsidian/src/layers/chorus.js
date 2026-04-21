// Observer chorus — the Boltzmann-brain layer of the note universe.
//
// A 5 Hz tick scans a random sample of notes, scores each by degree +
// freshness + cluster density + jitter, and occasionally promotes one to
// a live "observer." Each observer carries a template-generated utterance
// grounded strictly in the current vault (no invention), lives for 9–16 s,
// and holds a screen-space anchor via its underlying note body.
//
// Budgets (acceptance criteria):
//   - At most 3 concurrent observers.
//   - At most one new observer per density-interval (5 / 10 / 20 s).
//   - When disabled, active set is cleared so captions fade within ~2 s.
//   - Rolling buffer of the last 50 emitted utterances for the morning report.

import { TEMPLATES, relativeAge } from "./chorus-templates.js";
import { topLevelFolder } from "../vault/folders.js";

const TICK_HZ = 5;
const MAX_ACTIVE = 3;
const CANDIDATES_PER_TICK = 32;
const LIFETIME_MS_MIN = 9000;
const LIFETIME_MS_MAX = 16000;
const NEIGHBOR_RADIUS = 200;
const BUFFER_SIZE = 50;

const DENSITY_INTERVAL_MS = {
  low: 20000,
  med: 10000,
  high: 5000,
};

export function createChorus({
  getVault,
  getBodies,
  getSettings,
  getDreamDepth,
  onCaption,
  utterance, // Phase 7 router — required. Falls back to template on any backend error.
}) {
  if (!utterance) {
    throw new Error("createChorus: `utterance` router is required (Phase 7)");
  }
  const active = []; // [{ id, noteId, text, bornAt, lifetime, templateId }]
  const buffer = []; // rolling last 50 captions
  const recentTemplates = []; // guard against consecutive repeats

  // Wake-mode toggle. During dream, captions still emit even if this is off —
  // dreaming is what *produces* a morning report, so the user's ambient
  // toggle only governs wake-time chatter.
  let enabled = false;
  let lastEmitAt = 0;
  let tickHandle = 0;
  let lastShouldEmit = false;
  // Phase 7: one in-flight utterance at a time. A Claude or WebLLM call
  // may take ~700 ms; without this guard, a second tick could fire a
  // parallel request before the first lands.
  let generating = false;
  const rng = seededRng(Date.now() & 0xffffffff);

  // Tick is always on; it cheaply no-ops when there's no reason to emit.
  function start() {
    if (tickHandle) return;
    tickHandle = window.setInterval(tick, 1000 / TICK_HZ);
  }
  start();

  function setEnabled(on) {
    if (enabled === on) return;
    enabled = on;
    // If turning off and not dreaming, fade any live observers immediately.
    if (!on && !isDreaming()) active.length = 0;
  }

  function dreamDepth() {
    return getDreamDepth ? Math.max(0, Math.min(1, getDreamDepth())) : 0;
  }
  function isDreaming() {
    return dreamDepth() > 0.1;
  }

  function tick() {
    const vault = getVault();
    const bodies = getBodies();
    if (!vault || !bodies) return;
    const settings = getSettings();
    const d = dreamDepth();
    const shouldEmit = enabled || d > 0.1;

    // If we just stopped being eligible to emit (e.g. waking up from a
    // dream while the user's toggle is off), clear active so the DOM
    // captions fade on their own.
    if (lastShouldEmit && !shouldEmit) active.length = 0;
    lastShouldEmit = shouldEmit;
    if (!shouldEmit) return;

    // Interval stretches during dream so fewer observers speak, each longer.
    const baseInterval =
      DENSITY_INTERVAL_MS[settings.chorus_density || "med"] || 10000;
    const intervalMult = 1 + d * 1.5;
    const interval = baseInterval * intervalMult;

    // Dream caps active voices low (per DREAM.md §1: observer budget 2).
    const maxActive = d > 0.3 ? 2 : MAX_ACTIVE;

    const now = Date.now();
    // Prune expired observers.
    for (let i = active.length - 1; i >= 0; i--) {
      if (now - active[i].bornAt > active[i].lifetime) active.splice(i, 1);
    }

    // Rate limit + active cap.
    if (now - lastEmitAt < interval) return;
    if (active.length >= maxActive) return;
    if (generating) return;

    const candidate = pickCandidate(vault, bodies);
    if (!candidate) return;

    generating = true;
    emit(candidate, d).finally(() => {
      generating = false;
    });
  }

  async function emit(candidate, d) {
    const snapshot = snapshotForCandidate(candidate);
    // Job kind shifts with dream depth. The threshold (0.3) mirrors
    // DREAM.md §1's "observer budget drops at depth > 0.3" so the
    // voice changes at the same point the chorus volume does. Wake-
    // state gets the snarky "chorus-line" voice; deep dream gets the
    // drifting "dream-caption" voice.
    const jobKind = d > 0.3 ? "dream-caption" : "chorus-line";
    let result;
    try {
      result = await utterance.generate(jobKind, snapshot);
    } catch (err) {
      console.warn("[bz] chorus: utterance router threw", err);
      return;
    }
    if (!result || !result.text) return;
    // Avoid echoing the same template sentence twice in a row. Only
    // relevant on the template path — LLM backends return null templateId.
    if (
      result.templateId &&
      recentTemplates.slice(-2).includes(result.templateId)
    ) {
      return;
    }

    const now = Date.now();
    const observer = {
      id: `obs-${now.toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`,
      noteId: candidate.note.id,
      text: result.text,
      templateId: result.templateId || null,
      backend: result.backend || "template",
      bornAt: now,
      lifetime:
        (LIFETIME_MS_MIN + rng() * (LIFETIME_MS_MAX - LIFETIME_MS_MIN)) *
        (1 + d * 2),
    };
    active.push(observer);
    lastEmitAt = now;
    if (result.templateId) {
      recentTemplates.push(result.templateId);
      if (recentTemplates.length > 6) recentTemplates.shift();
    }

    buffer.push({
      text: observer.text,
      noteId: observer.noteId,
      backend: observer.backend,
      at: now,
    });
    if (buffer.length > BUFFER_SIZE) buffer.shift();

    if (onCaption) onCaption(observer);
  }

  function pickCandidate(vault, bodies) {
    const notes = vault.notes;
    if (notes.length === 0) return null;
    const n = Math.min(CANDIDATES_PER_TICK, notes.length);
    const now = Date.now();
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const note = notes[Math.floor(rng() * notes.length)];
      const pos = bodies.positionOf(note.id);
      if (!pos) continue;
      // Skip anything that was observed very recently.
      if (active.some((o) => o.noteId === note.id)) continue;
      const fwd = vault.forward.get(note.id)?.size || 0;
      const bwd = vault.backward.get(note.id)?.size || 0;
      const degree = fwd + bwd;
      const age = Math.max(1, now - (note.mtime || now));
      const freshness = 1 / Math.log(2 + age / (60 * 60 * 1000));
      const score = degree * 1.1 + freshness * 6 + rng() * 2.5;
      if (score > bestScore) {
        bestScore = score;
        best = { note, pos, degree, freshness };
      }
    }
    if (!best) return null;
    best.neighbors = findNeighbors(best, vault, bodies);
    return best;
  }

  function findNeighbors(cand, vault, bodies) {
    const [x, y, z] = cand.pos;
    const radius2 = NEIGHBOR_RADIUS * NEIGHBOR_RADIUS;
    const out = [];
    for (const n of vault.notes) {
      if (n.id === cand.note.id) continue;
      const p = bodies.positionOf(n.id);
      if (!p) continue;
      const dx = p[0] - x;
      const dy = p[1] - y;
      const dz = p[2] - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius2) continue;
      out.push({ note: n, distance: Math.sqrt(d2) });
    }
    out.sort((a, b) => a.distance - b.distance);
    return out.slice(0, 6);
  }

  // Build the plain-object snapshot every utterance backend consumes.
  // Keys match the slot vocabulary chorus-templates.js declares, so the
  // template path sees the exact same shape as pre-Phase-7.
  function snapshotForCandidate(cand) {
    const note = cand.note;
    const neighbor = cand.neighbors[0]?.note || null;
    return {
      title: note.title,
      tag: note.tags[0] || null,
      folder: topLevelFolder(note) || null,
      age: relativeAge(note.mtime),
      count: cand.neighbors.length > 2 ? cand.neighbors.length : null,
      neighbor: neighbor?.title || null,
    };
  }

  function forceEmit() {
    // Debug / dev helper — bypass rate limit but respect cap.
    lastEmitAt = 0;
    tick();
  }

  return {
    setEnabled,
    isEnabled: () => enabled,
    getActive: () => active,
    getBuffer: () => buffer.slice(),
    forceEmit,
    templateCount: TEMPLATES.length,
  };
}

function seededRng(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
