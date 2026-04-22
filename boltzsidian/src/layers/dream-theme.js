// DREAM_THEMES.md Phases B–E — theme resolution.
//
// A theme is a { kind, value } record stored in settings.dream_theme.
// This module converts it into a Set<noteId> + positional anchor
// (centroid + extent) that the salience layer and attractor can
// consume. An empty return signals "fall back to random" — the caller
// decides what to do with that.

import { topLevelFolder } from "../vault/folders.js";

// Minimum members for a theme to be viable. Below this, callers
// should fall back to random so the attractor has room to wander and
// pair sampling has enough diversity. Matches DREAM_THEMES.md §9.
export const MIN_THEME_SIZE = 5;

export function resolveThemeSet(vault, theme) {
  if (!vault || !theme || !theme.kind || !theme.value) return new Set();
  switch (theme.kind) {
    case "constellation":
      return resolveConstellation(vault, theme.value);
    case "folder":
      return resolveFolder(vault, theme.value);
    case "tag":
      return resolveTag(vault, theme.value);
    case "root":
      return resolveRoot(vault, theme.value);
    default:
      return new Set();
  }
}

function resolveConstellation(vault, clusterId) {
  const id = Number(clusterId);
  if (!Number.isFinite(id)) return new Set();
  const cluster = vault.clusters?.byId?.get(id);
  if (!cluster?.noteIds) return new Set();
  return new Set(cluster.noteIds);
}

function resolveFolder(vault, folder) {
  const out = new Set();
  for (const n of vault.notes) {
    if (topLevelFolder(n) === folder) out.add(n.id);
  }
  return out;
}

function resolveTag(vault, tag) {
  const needle = String(tag).toLowerCase();
  const out = new Set();
  for (const n of vault.notes) {
    if (!n.tags) continue;
    for (const t of n.tags) {
      if (String(t).toLowerCase() === needle) {
        out.add(n.id);
        break;
      }
    }
  }
  return out;
}

function resolveRoot(vault, rootId) {
  const out = new Set();
  for (const n of vault.notes) {
    if (n.rootId === rootId) out.add(n.id);
  }
  return out;
}

// Compute centroid + extent over a Set<noteId> using live body
// positions. Returns null if nothing resolves. Used by the attractor
// to anchor on a theme.
//
// Two passes over the members: first for the mean, then for the max
// squared distance to it. Cheap (O(theme.size)) — at a typical
// theme of 30 notes, each call is a few microseconds.
export function themeCentroid(ids, bodies) {
  if (!ids || ids.size === 0 || !bodies?.positionOf) return null;
  let cx = 0,
    cy = 0,
    cz = 0,
    n = 0;
  for (const id of ids) {
    const p = bodies.positionOf(id);
    if (!p) continue;
    cx += p[0];
    cy += p[1];
    cz += p[2];
    n++;
  }
  if (n === 0) return null;
  cx /= n;
  cy /= n;
  cz /= n;
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
  return {
    centroid: [cx, cy, cz],
    extent: Math.sqrt(maxD2),
    size: n,
  };
}
