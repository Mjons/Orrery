// Cluster detection + local density.
//
// Two passes, both optional:
//
//   detectCommunities(vault)
//     Label propagation over the undirected link graph. Produces a
//     cluster id per note (stable across sessions for a given graph
//     shape). No position data needed. Cost: O(n + edges * iters).
//
//   computeLocalDensity(vault, positions, { R })
//     For each note, counts other notes whose position is within a
//     world-space radius R. Normalizes to [0,1]. Used by the bodies
//     shader to brighten dense regions. Cost: O(n²).
//
// Both safe on empty vaults.

const LP_ITERATIONS = 10;

export function detectCommunities(vault) {
  const notes = vault.notes;
  const n = notes.length;
  if (n === 0) return { byNote: new Map(), byId: new Map() };

  const idx = new Map();
  for (let i = 0; i < n; i++) idx.set(notes[i].id, i);

  // Undirected neighbor list.
  const nbrs = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const fw = vault.forward.get(notes[i].id);
    if (!fw) continue;
    for (const targetId of fw) {
      const j = idx.get(targetId);
      if (j == null || j === i) continue;
      nbrs[i].push(j);
      nbrs[j].push(i);
    }
  }

  // Start each node in its own community.
  const label = new Array(n);
  for (let i = 0; i < n; i++) label[i] = i;

  const order = new Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  for (let iter = 0; iter < LP_ITERATIONS; iter++) {
    shuffle(order);
    let changed = 0;
    for (const i of order) {
      if (nbrs[i].length === 0) continue;
      const counts = new Map();
      for (const j of nbrs[i]) {
        const l = label[j];
        counts.set(l, (counts.get(l) || 0) + 1);
      }
      let best = label[i];
      let bestCount = counts.get(best) || 0;
      for (const [l, c] of counts) {
        if (c > bestCount || (c === bestCount && l < best)) {
          best = l;
          bestCount = c;
        }
      }
      if (best !== label[i]) {
        label[i] = best;
        changed++;
      }
    }
    if (changed === 0) break;
  }

  // Renumber raw labels to a dense [0..K) range.
  const rawToId = new Map();
  const byNote = new Map();
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    let cid = rawToId.get(label[i]);
    if (cid == null) {
      cid = nextId++;
      rawToId.set(label[i], cid);
    }
    byNote.set(notes[i].id, cid);
  }

  const byId = new Map();
  for (let i = 0; i < n; i++) {
    const cid = byNote.get(notes[i].id);
    let cluster = byId.get(cid);
    if (!cluster) {
      cluster = { id: cid, noteIds: [] };
      byId.set(cid, cluster);
    }
    cluster.noteIds.push(notes[i].id);
  }

  return { byNote, byId };
}

// Compute per-note local density and attach cluster centroids + extents.
// Returns a Map<noteId, number> in [0, 1].
export function computeLocalDensity(
  vault,
  positions,
  { radius = 200, clusters } = {},
) {
  const notes = vault.notes;
  const n = notes.length;
  const byNote = new Map();
  if (n === 0) return byNote;

  const R2 = radius * radius;

  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const has = new Uint8Array(n);
  const idToIndex = new Map();
  for (let i = 0; i < n; i++) {
    idToIndex.set(notes[i].id, i);
    const p = positions[notes[i].id];
    if (!p) continue;
    px[i] = p[0];
    py[i] = p[1];
    pz[i] = p[2];
    has[i] = 1;
  }

  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!has[i]) continue;
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (i === j || !has[j]) continue;
      const dx = px[i] - px[j];
      const dy = py[i] - py[j];
      const dz = pz[i] - pz[j];
      if (dx * dx + dy * dy + dz * dz < R2) count++;
    }
    raw[i] = count;
  }

  // Normalize to [0,1] using a soft cap at the 90th percentile so a
  // single outlier doesn't flatten everyone else's density to ~0.
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const cap = Math.max(1, sorted[Math.floor(sorted.length * 0.9)] || 1);
  for (let i = 0; i < n; i++) {
    byNote.set(notes[i].id, Math.min(1, raw[i] / cap));
  }

  // Attach cluster centroids + extent if clusters provided.
  if (clusters && clusters.byId) {
    for (const cluster of clusters.byId.values()) {
      let cx = 0,
        cy = 0,
        cz = 0,
        count = 0;
      let totalDensity = 0;
      for (const id of cluster.noteIds) {
        const i = idToIndex.get(id);
        if (i == null) continue;
        if (!has[i]) continue;
        cx += px[i];
        cy += py[i];
        cz += pz[i];
        count++;
        totalDensity += byNote.get(id) || 0;
      }
      if (count === 0) continue;
      cx /= count;
      cy /= count;
      cz /= count;
      let maxD2 = 0;
      for (const id of cluster.noteIds) {
        const i = idToIndex.get(id);
        if (i == null) continue;
        if (!has[i]) continue;
        const dx = px[i] - cx;
        const dy = py[i] - cy;
        const dz = pz[i] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > maxD2) maxD2 = d2;
      }
      cluster.centroid = [cx, cy, cz];
      cluster.extent = Math.sqrt(maxD2);
      cluster.density = totalDensity / count;
    }
  }

  return byNote;
}

// Refresh cluster.centroid + cluster.extent from the current live
// body positions. Physics drifts bodies around continuously; the
// initial values computed by computeLocalDensity go stale within a
// few seconds of play. Cheap: O(notes) using positionOf().
//
// Does NOT recompute cluster MEMBERSHIP — just the geometric center
// and bounding radius of the existing member set. Cluster membership
// changes only happen on vault reload.
export function recomputeCentroidsLive(vault, bodies) {
  if (!vault?.clusters?.byId || !bodies?.positionOf) return;
  for (const cluster of vault.clusters.byId.values()) {
    const ids = cluster.noteIds;
    if (!ids || ids.length === 0) continue;
    let cx = 0,
      cy = 0,
      cz = 0,
      count = 0;
    for (const id of ids) {
      const p = bodies.positionOf(id);
      if (!p) continue;
      cx += p[0];
      cy += p[1];
      cz += p[2];
      count++;
    }
    if (count === 0) continue;
    cx /= count;
    cy /= count;
    cz /= count;
    let maxD2 = 0;
    for (const id of ids) {
      const p = bodies.positionOf(id);
      if (!p) continue;
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const dz = p[2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxD2) maxD2 = d2;
    }
    cluster.centroid = [cx, cy, cz];
    cluster.extent = Math.sqrt(maxD2);
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}
