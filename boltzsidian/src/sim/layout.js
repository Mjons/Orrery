// 2D force-directed layout (Fruchterman-Reingold style) in X/Y; Z distributed
// by log(words) + recency so word-count and age read as depth. Output is an
// object keyed by note id: { [id]: [x, y, z] }.
//
// O(N²) per iteration. Adequate up to ~2000 notes in a few seconds. For larger
// vaults, a Barnes-Hut variant is a straight swap later.

const DEFAULT_OPTS = {
  iterations: 180,
  width: 900,
  height: 900,
  depth: 600,
  seed: 1,
};

export function layoutNotes(vault, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const notes = vault.notes;
  const n = notes.length;
  if (n === 0) return {};

  const rng = mulberry32(o.seed);
  const W = o.width;
  const H = o.height;

  // Positions, arrays indexed by note order.
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const dx = new Float32Array(n);
  const dy = new Float32Array(n);

  const idx = new Map();
  for (let i = 0; i < n; i++) {
    idx.set(notes[i].id, i);
    // initial random position around origin
    x[i] = (rng() - 0.5) * W * 0.6;
    y[i] = (rng() - 0.5) * H * 0.6;
  }

  // Build bidirectional edge list (resolved link graph is directional — for
  // layout, treat as undirected so two-way links act like one spring).
  const edges = [];
  const seen = new Set();
  for (const src of notes) {
    const targets = vault.forward.get(src.id);
    if (!targets) continue;
    for (const dst of targets) {
      const key = src.id < dst ? `${src.id}|${dst}` : `${dst}|${src.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = idx.get(src.id);
      const b = idx.get(dst);
      if (a != null && b != null) edges.push([a, b]);
    }
  }

  const area = W * H;
  const k = Math.sqrt(area / Math.max(n, 1));
  const k2 = k * k;
  let t = W / 8; // temperature — cap on max displacement per step

  for (let iter = 0; iter < o.iterations; iter++) {
    // Reset forces
    for (let i = 0; i < n; i++) {
      dx[i] = 0;
      dy[i] = 0;
    }
    // Repulsive O(n²)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let rx = x[i] - x[j];
        let ry = y[i] - y[j];
        let d2 = rx * rx + ry * ry;
        if (d2 < 0.01) {
          rx = (rng() - 0.5) * 0.1;
          ry = (rng() - 0.5) * 0.1;
          d2 = rx * rx + ry * ry + 0.01;
        }
        const d = Math.sqrt(d2);
        const force = k2 / d;
        const fx = (rx / d) * force;
        const fy = (ry / d) * force;
        dx[i] += fx;
        dy[i] += fy;
        dx[j] -= fx;
        dy[j] -= fy;
      }
    }
    // Attractive along edges
    for (const [a, b] of edges) {
      const rx = x[a] - x[b];
      const ry = y[a] - y[b];
      const d = Math.sqrt(rx * rx + ry * ry) + 0.01;
      const force = (d * d) / k;
      const fx = (rx / d) * force;
      const fy = (ry / d) * force;
      dx[a] -= fx;
      dy[a] -= fy;
      dx[b] += fx;
      dy[b] += fy;
    }
    // Apply, clipped by temperature
    for (let i = 0; i < n; i++) {
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) + 0.001;
      const step = Math.min(d, t);
      x[i] += (dx[i] / d) * step;
      y[i] += (dy[i] / d) * step;
      // soft bounds — don't let nodes fly off
      x[i] = Math.max(-W, Math.min(W, x[i]));
      y[i] = Math.max(-H, Math.min(H, y[i]));
    }
    t *= 0.965; // cool down
  }

  // Center the layout on origin
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += x[i];
    cy += y[i];
  }
  cx /= n;
  cy /= n;
  for (let i = 0; i < n; i++) {
    x[i] -= cx;
    y[i] -= cy;
  }

  // Z axis: blend of log(words) (older, longer notes sit further) and
  // recency (recent notes float toward camera).
  const now = Date.now();
  const oldest = notes.reduce((m, x) => Math.min(m, x.mtime || now), now);
  const newest = notes.reduce((m, x) => Math.max(m, x.mtime || now), 0);
  const ageRange = Math.max(newest - oldest, 1);
  const positions = {};
  for (let i = 0; i < n; i++) {
    const note = notes[i];
    const wLog = Math.log(1 + (note.words || 0));
    const recency = ((note.mtime || now) - oldest) / ageRange; // 0 old → 1 new
    const z =
      (Math.min(wLog, 8) / 8 - 0.5) * (o.depth * 0.5) +
      (recency - 0.5) * o.depth * 0.45;
    positions[note.id] = [x[i], y[i], z];
  }

  applyDailyFilament(positions, vault, o);
  applyPinnedOverrides(positions, vault);

  return positions;
}

// Dailies are arranged on a sine-wave helix sorted by date. The curve is
// big enough to clear the main cluster so the filament reads as a distinct
// thread through the universe — not just a dense clump on one side.
export function applyDailyFilament(positions, vault, opts = {}) {
  const dailies = vault.notes.filter((n) => n.isDaily && n.dailyDate != null);
  if (dailies.length < 2) {
    if (dailies.length === 1) {
      positions[dailies[0].id] = [0, 0, 0];
    }
    return positions;
  }
  dailies.sort((a, b) => a.dailyDate - b.dailyDate);

  const W = opts.width || 900;
  const H = opts.height || 900;
  const D = opts.depth || 600;
  const spread = Math.max(W * 1.8, 1400);
  const ampY = Math.min(H * 0.42, 320);
  const ampZ = Math.min(D * 0.55, 280);
  const k = Math.PI * 2 * Math.max(1, Math.log2(dailies.length));

  const minDate = dailies[0].dailyDate;
  const maxDate = dailies[dailies.length - 1].dailyDate;
  const range = Math.max(maxDate - minDate, 1);

  for (let i = 0; i < dailies.length; i++) {
    const n = dailies[i];
    const t = (n.dailyDate - minDate) / range; // 0..1
    const x = (t - 0.5) * spread;
    const phase = t * k;
    const y = Math.sin(phase) * ampY;
    const z = Math.cos(phase * 0.5) * ampZ;
    positions[n.id] = [x, y, z];
  }
  return positions;
}

function applyPinnedOverrides(positions, vault) {
  for (const n of vault.notes) {
    const fm = n.frontmatter || {};
    const pos = fm.position;
    if (
      Array.isArray(pos) &&
      pos.length === 3 &&
      pos.every((v) => typeof v === "number")
    ) {
      positions[n.id] = [pos[0], pos[1], pos[2]];
    }
  }
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
