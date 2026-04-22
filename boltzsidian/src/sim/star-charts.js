// STAR_CHARTS.md first cut — assign a project hub a shape and pull
// its satellites toward ideal positions on that shape. First shape
// is "ring" (evenly spaced around the hub).
//
// A note is a project hub when its frontmatter has `project: true`.
// Shape defaults to "ring"; override with `shape: "ring"` in the
// same frontmatter block.
//
// The physics step applies a weak shape-force per satellite toward
// its ideal ring position. Stiffness is low so local relationships
// (spring forces, existing tethers) still wobble the arrangement —
// that's the "hand-drawn atlas" aesthetic, not CAD.

const RING_RADIUS_BASE = 180; // world units
const RING_RADIUS_PER = 4; // extra radius per satellite beyond ~8

/**
 * @typedef {object} ProjectShape
 * @property {string} hubId       note id of the project hub
 * @property {string} shape       "ring" (only shape in first cut)
 * @property {string[]} satIds    ordered satellite note ids
 * @property {number} rotation    per-project rotation offset (radians)
 * @property {number} radius      ring radius in world units
 */

/**
 * Scan the vault for notes marked as project hubs. Returns one shape
 * record per hub. Pure — no side effects, safe to call every frame
 * (though physics caches and only refreshes on vault reload).
 *
 * @param {object} vault
 * @returns {ProjectShape[]}
 */
export function collectProjectShapes(vault) {
  const out = [];
  if (!vault?.notes) return out;
  for (const n of vault.notes) {
    if (n?.frontmatter?.project !== true) continue;
    const shape = String(n.frontmatter?.shape || "ring").toLowerCase();
    if (shape !== "ring") continue; // only supported shape in first cut

    // Collect satellites — one-hop neighborhood, same-root scope by
    // default to keep cross-project noise out of the figure.
    const satSet = new Set();
    for (const x of vault.forward?.get(n.id) || []) satSet.add(x);
    for (const x of vault.backward?.get(n.id) || []) satSet.add(x);
    satSet.delete(n.id);

    const satIds = [];
    for (const sid of satSet) {
      const s = vault.byId?.get(sid);
      if (!s) continue;
      if (n.rootId && s.rootId && s.rootId !== n.rootId) continue;
      satIds.push(sid);
    }
    // Stable order — alphabetical by title so the ring doesn't
    // reshuffle every frame and the layout is reproducible across
    // reloads.
    satIds.sort((a, b) => {
      const ta = (vault.byId?.get(a)?.title || "").toLowerCase();
      const tb = (vault.byId?.get(b)?.title || "").toLowerCase();
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    if (satIds.length === 0) continue;

    // Hash the hub id into a per-project rotation so multiple projects
    // don't all start at the same angle.
    const rotation = hashToAngle(n.id);
    const radius =
      RING_RADIUS_BASE + Math.max(0, satIds.length - 8) * RING_RADIUS_PER;

    out.push({ hubId: n.id, shape: "ring", satIds, rotation, radius });
  }
  return out;
}

/**
 * Compute the ideal world-space position for a satellite on its
 * project's ring. Returns [x, y, z]. Ring lies in the XZ plane
 * centered on `hubPos` with a slight Y-scatter so the figure has a
 * whiff of thickness instead of reading as a perfect disc.
 */
export function idealRingPosition(hubPos, shape, index) {
  const n = shape.satIds.length;
  const theta = shape.rotation + (index / n) * Math.PI * 2;
  const r = shape.radius;
  // Deterministic tiny Y-scatter (±8 world units) based on index so
  // the ring reads as a hand-drawn circle, not a compass-perfect one.
  const jitter = Math.sin(index * 2.7 + shape.rotation * 3.1) * 8;
  return [
    hubPos[0] + Math.cos(theta) * r,
    hubPos[1] + jitter,
    hubPos[2] + Math.sin(theta) * r,
  ];
}

function hashToAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return ((h & 0xffff) * (Math.PI * 2)) / 0xffff;
}
