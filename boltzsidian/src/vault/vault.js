// Vault orchestrator. Scans a workspace folder into an in-memory model:
// notes + by-id index + by-title index + forward/backward link graph + stats.
//
// Mutations (create, save, rename) live in ./mutations.js.

import { walkMarkdown } from "./walker.js";
import { readNote } from "./parser.js";
import { assignKinds } from "./kind.js";
import { detectCommunities } from "../sim/clusters.js";

export async function openVault(rootHandle, { onProgress, settings } = {}) {
  const t0 = performance.now();
  const entries = await walkMarkdown(rootHandle);
  const notes = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      notes.push(await readNote(entries[i]));
    } catch (err) {
      console.warn("[bz] failed to read", entries[i].path, err);
    }
    if (onProgress && i % 25 === 0)
      onProgress({ read: i + 1, total: entries.length });
  }

  const byId = new Map();
  const byTitle = new Map();
  for (const n of notes) {
    byId.set(n.id, n);
    // case-insensitive title index; last one wins on collision (fine for v1)
    byTitle.set(n.title.toLowerCase(), n);
  }

  // Resolve links. A link target can be:
  //  - a ULID (direct id match)
  //  - a title (case-insensitive)
  //  - a filename without .md (fall back)
  const forward = new Map(); // id -> Set<id>
  const backward = new Map(); // id -> Set<id>
  for (const n of notes) forward.set(n.id, new Set());
  for (const n of notes) backward.set(n.id, new Set());

  for (const n of notes) {
    for (const rawTarget of n.links) {
      const target = resolveLink(rawTarget, byId, byTitle);
      if (!target || target.id === n.id) continue;
      forward.get(n.id).add(target.id);
      backward.get(target.id).add(n.id);
    }
  }

  const tagCounts = new Map();
  for (const n of notes)
    for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);

  const linkCount = [...forward.values()].reduce((s, set) => s + set.size, 0);

  if (settings) assignKinds(notes, settings);

  // Community detection on the link graph. Produces stable cluster ids
  // per note; centroids + extents get filled in once positions exist
  // (see computeLocalDensity in sim/clusters.js).
  const clusters = detectCommunities({ notes, forward });
  for (const n of notes) {
    n.cluster = clusters.byNote.get(n.id) ?? null;
  }

  const elapsed = Math.round(performance.now() - t0);
  return {
    root: rootHandle,
    notes,
    byId,
    byTitle,
    forward,
    backward,
    clusters,
    // Populated by sim/clusters.computeLocalDensity after layout lands.
    densityById: new Map(),
    stats: {
      notes: notes.length,
      tags: tagCounts.size,
      links: linkCount,
      clusters: clusters.byId.size,
      elapsedMs: elapsed,
    },
    tagCounts,
  };
}

function resolveLink(target, byId, byTitle) {
  const raw = target.trim();
  if (!raw) return null;
  if (byId.has(raw)) return byId.get(raw);
  const lower = raw.toLowerCase();
  if (byTitle.has(lower)) return byTitle.get(lower);
  // fallback: strip .md extension
  const stripped = lower.replace(/\.md$/i, "");
  if (byTitle.has(stripped)) return byTitle.get(stripped);
  return null;
}
