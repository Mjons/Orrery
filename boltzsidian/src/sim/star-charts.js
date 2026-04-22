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

export const SHAPES = ["ring", "disc", "spine", "fan"];

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

  // 1. One-hop link graph (same-root only — link-graph neighbourhoods
  // are usually polluted with cross-project tending-agent noise, so
  // we trust the graph only when both ends agree on root).
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

  // 2. Title-prefix fallback. When the project's notes share a
  // naming convention (e.g. "Delphica — X", "Delphica Landing
  // Page") but haven't been cross-linked yet. No same-root filter
  // here — if the user picked a project hub and eight notes share
  // its first title-token, they're almost certainly one project
  // even if they live in different roots.
  if (linkSats.length < MIN_LINK_SATS) {
    const prefix = firstToken(hub.title).toLowerCase();
    if (prefix.length >= 3) {
      const prefixSats = [];
      for (const s of vault.notes) {
        if (s.id === hub.id) continue;
        const firstTok = firstToken(s.title).toLowerCase();
        if (firstTok === prefix) prefixSats.push(s.id);
      }
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

  // Shared 3D noise — small deterministic wobble on every axis so
  // nothing ever sits on a compass-perfect point. Amplitude scales
  // with radius so big figures breathe more than tight ones.
  const wobble = shape.radius * 0.04;
  const jx = Math.sin(index * 2.7 + shape.rotation * 3.1) * wobble;
  const jy = Math.sin(index * 4.1 + shape.rotation * 5.3) * wobble;
  const jz = Math.sin(index * 3.5 + shape.rotation * 1.9) * wobble;

  if (shape.shape === "disc") {
    // Galactic disc with real thickness. Inner core at ~58% radius,
    // outer arm at full radius. Vertical thickness scales with
    // radius so the disc tapers toward the edge — feels like a
    // galaxy you could rotate around.
    const half = Math.ceil(n / 2);
    const isInner = index < half;
    const within = isInner ? index : index - half;
    const count = isInner ? half : n - half;
    const r = shape.radius * (isInner ? 0.58 : 1.0);
    const offset = isInner ? 0 : Math.PI / half; // stagger between rings
    const theta = shape.rotation + offset + (within / count) * Math.PI * 2;
    // Disc-thickness: ±30% of radius, weighted so the core has more
    // vertical spread than the outer edge.
    const thickness = shape.radius * (isInner ? 0.35 : 0.18);
    const y = Math.sin(theta * 2 + index * 1.3) * thickness;
    return [
      hubPos[0] + Math.cos(theta) * r + jx,
      hubPos[1] + y + jy,
      hubPos[2] + Math.sin(theta) * r + jz,
    ];
  }

  if (shape.shape === "spine") {
    // Helix along the rotation axis — a timeline that spirals.
    // Each satellite advances along the axis AND rotates around
    // it, so every one gets a different Y height. Reads as a
    // strand of DNA more than a ruler.
    const spacing = Math.max(70, (shape.radius * 2) / Math.max(1, n - 1));
    const offset = (index - (n - 1) / 2) * spacing;
    const cosR = Math.cos(shape.rotation);
    const sinR = Math.sin(shape.rotation);
    // Helix radius ~35% of full shape radius; two full turns over
    // the length so neighbors stay visually distinct.
    const helixR = shape.radius * 0.35;
    const turns = 2;
    const phase = (index / Math.max(1, n - 1)) * turns * Math.PI * 2;
    const hx = Math.cos(phase) * helixR;
    const hy = Math.sin(phase) * helixR;
    return [
      hubPos[0] + offset * cosR + -sinR * hx + jx,
      hubPos[1] + hy + jy,
      hubPos[2] + offset * sinR + cosR * hx + jz,
    ];
  }

  if (shape.shape === "fan") {
    // Wedge fanning out in one direction — spread across BOTH
    // azimuth (horizontal arc) and elevation (vertical arc). Reads
    // as a spray of options, not a flat row.
    const azArc = (110 / 180) * Math.PI; // horizontal spread
    const elArc = (55 / 180) * Math.PI; // vertical spread
    // Deterministic 2D scatter — low-discrepancy so the wedge
    // fills evenly even for small N.
    const phi = 1.61803398875; // golden ratio for spread
    const u = (index + 0.5) / n - 0.5; // [-0.5, 0.5]
    const v = ((index * phi) % 1) - 0.5; // [-0.5, 0.5]
    const az = shape.rotation + u * azArc;
    const el = v * elArc;
    const r = shape.radius * (0.85 + (index % 3) * 0.075); // mild depth variation
    return [
      hubPos[0] + Math.cos(az) * Math.cos(el) * r + jx,
      hubPos[1] + Math.sin(el) * r + jy,
      hubPos[2] + Math.sin(az) * Math.cos(el) * r + jz,
    ];
  }

  // Default: ring — 3D crown. Satellites on a circle whose Y
  // coordinate waves up and down around the ring, so it reads as
  // a crown from most viewing angles instead of a flat halo.
  const theta = shape.rotation + (index / n) * Math.PI * 2;
  const r = shape.radius;
  // Crown wave: three peaks around the ring, amplitude ~40% of r.
  const crownAmp = r * 0.4;
  const crownY = Math.sin(theta * 3 + shape.rotation * 2) * crownAmp;
  return [
    hubPos[0] + Math.cos(theta) * r + jx,
    hubPos[1] + crownY + jy,
    hubPos[2] + Math.sin(theta) * r + jz,
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
