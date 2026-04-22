// Vault orchestrator. Scans ONE OR MORE root directories into a merged
// in-memory model: notes + by-id index + by-title index + forward /
// backward link graph + stats.
//
// Mutations (create, save, rename) live in ./mutations.js.
//
// MULTI_PROJECT_PLAN.md Phase 2:
//   - Every root in the manifest walks in parallel.
//   - Notes carry `rootId`.
//   - `byTitle` is Map<titleLower, Note[]> because titles can collide
//     across roots.
//   - Link resolution applies a prefer-same-root policy: if note A in
//     root X contains `[[Foo]]`, and Foo exists in both X and Y, the
//     link resolves to X's Foo.
//   - `vault.resolveTitle(title, sourceNote?)` is the API replacement
//     for the old `byTitle.get(title)` — returns a single Note or null,
//     with the prefer-same-root tie-breaker applied.
//
// Single-root users still hit the same code paths but with a one-
// element roots array. No behaviour change for them.

import { walkMarkdown } from "./walker.js";
import { readNote } from "./parser.js";
import { assignKinds } from "./kind.js";
import { detectCommunities } from "../sim/clusters.js";
import { synthesizeSingleRootManifest } from "./manifest.js";

// Accept three input shapes (see Phase-1 comment in the prior version).
export async function openVault(arg, { onProgress, settings } = {}) {
  const manifest = normaliseManifestArg(arg);

  // Walk each root in parallel. Each returns { rootId, notes }.
  const t0 = performance.now();
  const perRoot = await Promise.all(
    manifest.roots.map((root) => walkRoot(root, { onProgress })),
  );

  return mergeRoots(manifest, perRoot, { settings, t0 });
}

function normaliseManifestArg(arg) {
  if (arg && typeof arg === "object" && "manifest" in arg) {
    return arg.manifest;
  }
  if (arg && typeof arg === "object" && "handle" in arg && "kind" in arg) {
    return synthesizeSingleRootManifest(arg.handle, { kind: arg.kind });
  }
  if (arg && typeof arg.getDirectoryHandle === "function") {
    return synthesizeSingleRootManifest(arg, { kind: "user" });
  }
  throw new Error(
    "openVault: expected a directory handle, { handle, kind }, or { manifest }",
  );
}

// Walk one root's markdown files. Returns every note with `rootId`
// stamped. Per-file read failures are warned but don't abort the
// walk; a broken note in project A shouldn't prevent project B from
// loading.
async function walkRoot(root, { onProgress }) {
  if (!root.handle) {
    throw new Error(
      `walkRoot: root "${root.id}" has no runtime handle — attach one before calling`,
    );
  }
  const entries = await walkMarkdown(root.handle);
  // TODO(Phase 6): apply root.include / root.exclude globs to filter
  // `entries` here. Phase 2 keeps the walker un-filtered so we see
  // the full set; excludes land later.
  const notes = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      const note = await readNote(entries[i]);
      note.rootId = root.id;
      notes.push(note);
    } catch (err) {
      console.warn(`[bz] failed to read ${root.id}:${entries[i].path}`, err);
    }
    if (onProgress && i % 25 === 0) {
      onProgress({ rootId: root.id, read: i + 1, total: entries.length });
    }
  }
  return { rootId: root.id, notes };
}

function mergeRoots(manifest, perRoot, { settings, t0 }) {
  // Flatten all notes. Per-root order is preserved within blocks, and
  // block order matches the manifest's roots order — which means tie-
  // breaking by first-root-wins follows the manifest's ordering.
  const notes = [];
  for (const { notes: rootNotes } of perRoot) {
    for (const n of rootNotes) notes.push(n);
  }

  // byId — note ids are ULIDs, unique across the session.
  const byId = new Map();
  for (const n of notes) byId.set(n.id, n);

  // byTitle — Map<titleLower, Note[]>. Multiple notes CAN share a
  // title (across roots, even within one root if users duplicate).
  // Callers that want "the" note for a title should use
  // vault.resolveTitle; callers iterating all candidates (tend,
  // suggestions, search) read the arrays directly.
  const byTitle = new Map();
  for (const n of notes) {
    const key = String(n.title || "")
      .toLowerCase()
      .trim();
    if (!key) continue;
    let bucket = byTitle.get(key);
    if (!bucket) {
      bucket = [];
      byTitle.set(key, bucket);
    }
    bucket.push(n);
  }

  // Link graph. Each note's links resolve against the merged indices
  // with prefer-same-root — so `[[Foo]]` written in root A's note
  // prefers Foo-in-A even if Foo also exists in B.
  const forward = new Map();
  const backward = new Map();
  for (const n of notes) {
    forward.set(n.id, new Set());
    backward.set(n.id, new Set());
  }
  for (const n of notes) {
    for (const rawTarget of n.links || []) {
      const target = resolveLinkInternal(
        rawTarget,
        { byId, byTitle },
        manifest,
        n,
      );
      if (!target || target.id === n.id) continue;
      forward.get(n.id).add(target.id);
      backward.get(target.id).add(n.id);
    }
  }

  const tagCounts = new Map();
  for (const n of notes) {
    for (const t of n.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const linkCount = [...forward.values()].reduce((s, set) => s + set.size, 0);

  if (settings) assignKinds(notes, settings);

  const clusters = detectCommunities({ notes, forward });
  for (const n of notes) {
    n.cluster = clusters.byNote.get(n.id) ?? null;
  }

  const elapsed = Math.round(performance.now() - t0);

  // Legacy-alias rootHandle points at the writeRoot's handle so any
  // code still reaching for `vault.root` lands writes in the right
  // place by default. Phase 3 migrates every writer to resolve via
  // rootId; once that lands, `vault.root` is removable.
  const writeRoot = manifest.roots.find((r) => r.id === manifest.writeRootId);
  const writeHandle = writeRoot?.handle || manifest.roots[0]?.handle || null;

  const vault = {
    root: writeHandle,
    notes,
    byId,
    byTitle,
    forward,
    backward,
    clusters,
    densityById: new Map(),
    stats: {
      notes: notes.length,
      tags: tagCounts.size,
      links: linkCount,
      clusters: clusters.byId.size,
      elapsedMs: elapsed,
      roots: manifest.roots.length,
    },
    tagCounts,
    manifest,
    roots: manifest.roots,
    writeRootId: manifest.writeRootId,
  };

  // Accessors — stable API for root-aware code in Phases 3+.
  vault.getRootHandle = (rootId) => {
    const r = manifest.roots.find((x) => x.id === rootId);
    return r ? r.handle : null;
  };
  vault.getWriteRoot = () =>
    manifest.roots.find((x) => x.id === manifest.writeRootId) || null;
  vault.getRootForNote = (noteId) => {
    const n = byId.get(noteId);
    if (!n) return null;
    return manifest.roots.find((x) => x.id === n.rootId) || null;
  };

  // Title resolution with prefer-same-root. Single-note return — drop-
  // in replacement for every `byTitle.get(x)` call site.
  vault.resolveTitle = (title, sourceNote = null) =>
    resolveTitle(vault, title, sourceNote);

  // Returns the raw candidate array for a title (possibly empty).
  // Used by tend/suggestions/search paths that want to consider
  // every candidate across roots.
  vault.allNotesByTitle = (title) => {
    const key = String(title || "")
      .toLowerCase()
      .trim();
    if (!key) return [];
    const direct = byTitle.get(key);
    if (direct) return direct;
    const stripped = key.replace(/\.md$/i, "");
    return byTitle.get(stripped) || [];
  };

  return vault;
}

// ── Link resolution ─────────────────────────────────────────

// Exported for callers that want the same policy (mutations.js,
// suggestions.js, note-panel.js). Lightweight — single vault field
// access per call.
export function resolveTitle(vault, title, sourceNote = null) {
  if (!vault || !title) return null;
  const raw = String(title).trim();
  if (!raw) return null;
  // Direct id match — ULIDs never collide with natural titles.
  if (vault.byId.has(raw)) return vault.byId.get(raw);
  const lower = raw.toLowerCase();
  const stripped = lower.replace(/\.md$/i, "");
  const candidates = vault.byTitle.get(lower) || vault.byTitle.get(stripped);
  return pickCandidate(candidates, sourceNote, vault);
}

// Internal flavour used during the initial vault walk — takes raw
// indices rather than the assembled vault object because the vault
// hasn't been constructed yet. Same policy.
function resolveLinkInternal(rawTarget, indices, manifest, sourceNote) {
  const raw = String(rawTarget || "").trim();
  if (!raw) return null;
  if (indices.byId.has(raw)) return indices.byId.get(raw);
  const lower = raw.toLowerCase();
  const stripped = lower.replace(/\.md$/i, "");
  const candidates =
    indices.byTitle.get(lower) || indices.byTitle.get(stripped);
  return pickCandidate(candidates, sourceNote, {
    writeRootId: manifest.writeRootId,
    roots: manifest.roots,
  });
}

// Session-scoped dedup for collision diagnostics. Key is
// `title|pickedRootId` — we want one log per distinct resolution
// outcome, not one per call site. Grep for "wikilink collision" in
// the console during dream runs to find which links are ambiguous.
const _collisionSeen = new Set();

function pickCandidate(candidates, sourceNote, vaultLike) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Prefer-same-root: if the source note lives in a root, and one of
  // the candidates is in that same root, return it.
  const sourceRoot = sourceNote?.rootId;
  let picked = null;
  let reason = "";
  if (sourceRoot) {
    const same = candidates.find((c) => c.rootId === sourceRoot);
    if (same) {
      picked = same;
      reason = "same-root";
    }
  }

  // Fall back to writeRoot's match — the user's "primary" root is
  // the second-best default when the source note can't tie-break.
  if (!picked && vaultLike?.writeRootId) {
    const primary = candidates.find((c) => c.rootId === vaultLike.writeRootId);
    if (primary) {
      picked = primary;
      reason = "writeRoot";
    }
  }

  // Final fallback: first in manifest-root order. Array is already
  // flattened root-by-root so candidates[0] respects ordering.
  if (!picked) {
    picked = candidates[0];
    reason = "manifest-order";
  }

  logCollision(picked, candidates, reason);
  return picked;
}

function logCollision(picked, candidates, reason) {
  const title = picked.title || "(untitled)";
  const key = `${title.toLowerCase()}|${picked.rootId || ""}|${reason}`;
  if (_collisionSeen.has(key)) return;
  _collisionSeen.add(key);
  const roots = candidates.map((c) => c.rootId || "?").join(", ");
  console.info(
    `[bz] wikilink collision: "${title}" in [${roots}] → picked ${picked.rootId || "?"} (${reason})`,
  );
}
