// STAR_CHARTS.md first cut — assign a project hub a shape and pull
// its satellites toward ideal positions on that shape.
//
// A note is a project hub when its frontmatter has `project: true`.
// Shape is "ring" by default; set `shape: "disc"` for a two-ring
// galactic-disc arrangement. Shapes can be extended in
// idealShapePosition.
//
// Satellite neighborhood, resolved in order:
//   1. One-hop link graph (forward + backward), same-root only.
//   2. If fewer than MIN_LINK_SATS found, fall back to title-prefix
//      scope: every note whose title starts with the hub's first
//      token (case-insensitive), same-root filter still applied.
//      This lets a project cohere by naming convention even when
//      the notes aren't cross-linked yet.
//
// The physics step applies a weak shape-force per satellite toward
// its ideal position. Stiffness is low so spring forces still
// wobble the arrangement — "hand-drawn atlas", not CAD.

export const SHAPES = ["ring", "disc"];

const RING_RADIUS_BASE = 180; // world units
const RING_RADIUS_PER = 4; // extra radius per satellite beyond ~8
const MIN_LINK_SATS = 2; // link-graph sats below this → use title scope

/**
 * @typedef {object} ProjectShape
 * @property {string} hubId       note id of the project hub
 * @property {string} shape       "ring" | "disc"
 * @property {string[]} satIds    ordered satellite note ids
 * @property {number} rotation    per-project rotation offset (radians)
 * @property {number} radius      outer radius in world units
 */

export function collectProjectShapes(vault) {
  const out = [];
  if (!vault?.notes) return out;
  for (const n of vault.notes) {
    if (n?.frontmatter?.project !== true) continue;
    const shape = normalizeShape(n.frontmatter?.shape);
    if (!shape) continue;

    const satIds = resolveSatellites(vault, n);
    if (satIds.length === 0) continue;

    // Hash the hub id into a per-project rotation so multiple
    // projects don't all start at the same angle.
    const rotation = hashToAngle(n.id);
    const radius =
      RING_RADIUS_BASE + Math.max(0, satIds.length - 8) * RING_RADIUS_PER;

    out.push({ hubId: n.id, shape, satIds, rotation, radius });
  }
  return out;
}

function normalizeShape(raw) {
  const s = String(raw || "ring").toLowerCase();
  return SHAPES.includes(s) ? s : "ring";
}

function resolveSatellites(vault, hub) {
  const sameRoot = (s) => !hub.rootId || !s.rootId || s.rootId === hub.rootId;

  // 1. One-hop link graph.
  const linkSet = new Set();
  for (const x of vault.forward?.get(hub.id) || []) linkSet.add(x);
  for (const x of vault.backward?.get(hub.id) || []) linkSet.add(x);
  linkSet.delete(hub.id);
  const linkSats = [];
  for (const sid of linkSet) {
    const s = vault.byId?.get(sid);
    if (s && sameRoot(s)) linkSats.push(sid);
  }

  let satIds = linkSats;

  // 2. Title-prefix fallback. Useful when the project's notes share
  // a naming convention (e.g. "Delphica — X", "Delphica Landing
  // Page") but haven't been cross-linked yet. The first "token"
  // of the hub's title is the prefix — "Delphica Landing Page —
  // Plan" → "Delphica".
  if (linkSats.length < MIN_LINK_SATS) {
    const prefix = firstToken(hub.title).toLowerCase();
    if (prefix.length >= 3) {
      const prefixSats = [];
      const linkSeen = new Set(linkSats);
      for (const s of vault.notes) {
        if (s.id === hub.id) continue;
        if (!sameRoot(s)) continue;
        const firstTok = firstToken(s.title).toLowerCase();
        if (firstTok === prefix) prefixSats.push(s.id);
      }
      // Merge with link sats so existing links aren't dropped.
      if (prefixSats.length > 0) {
        const merged = new Set([...linkSats, ...prefixSats]);
        satIds = [...merged];
      }
    }
  }

  // Stable alphabetical order so the layout is reproducible across
  // reloads.
  satIds.sort((a, b) => {
    const ta = (vault.byId?.get(a)?.title || "").toLowerCase();
    const tb = (vault.byId?.get(b)?.title || "").toLowerCase();
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  return satIds;
}

// First whitespace-delimited token of a title. "Delphica — Plan" →
// "Delphica". "foo_bar" → "foo_bar" (no whitespace). Returns "" for
// falsy input.
function firstToken(title) {
  const s = String(title || "").trim();
  if (!s) return "";
  const m = s.match(/^\S+/);
  return m ? m[0] : s;
}

/**
 * Compute the ideal world-space position for a satellite of a
 * project, given its index in shape.satIds. Returns [x, y, z]
 * relative to `hubPos`.
 */
export function idealShapePosition(hubPos, shape, index) {
  const n = shape.satIds.length;
  if (n === 0) return [hubPos[0], hubPos[1], hubPos[2]];

  if (shape.shape === "disc") {
    // Two-ring galactic disc. Inner half at 60% of outer radius,
    // outer half at full radius. Angular offset between the two
    // rings so notes don't stack radially.
    const half = Math.ceil(n / 2);
    const isInner = index < half;
    const within = isInner ? index : index - half;
    const count = isInner ? half : n - half;
    const r = shape.radius * (isInner ? 0.58 : 1.0);
    const offset = isInner ? 0 : Math.PI / half; // stagger between rings
    const theta = shape.rotation + offset + (within / count) * Math.PI * 2;
    const jitter = Math.sin(index * 2.7 + shape.rotation * 3.1) * 10;
    return [
      hubPos[0] + Math.cos(theta) * r,
      hubPos[1] + jitter,
      hubPos[2] + Math.sin(theta) * r,
    ];
  }

  // Default: ring.
  const theta = shape.rotation + (index / n) * Math.PI * 2;
  const r = shape.radius;
  const jitter = Math.sin(index * 2.7 + shape.rotation * 3.1) * 8;
  return [
    hubPos[0] + Math.cos(theta) * r,
    hubPos[1] + jitter,
    hubPos[2] + Math.sin(theta) * r,
  ];
}

// Back-compat alias in case anything still imports the old name.
export const idealRingPosition = idealShapePosition;

function hashToAngle(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return ((h & 0xffff) * (Math.PI * 2)) / 0xffff;
}
