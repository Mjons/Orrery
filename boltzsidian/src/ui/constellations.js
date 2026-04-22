// Cluster-level labels — constellations.
//
// CONSTELLATIONS.md §8 first cut: at wide zoom, every cluster gets
// one soft, centered label with a radial haze behind it. When you
// zoom in close enough to read individual star titles, the
// constellation fades away so it doesn't fight the labels layer.
//
// Parallel to createLabels in design: pooled DOM elements projected
// from a world point each frame. Reads vault.clusters.byId (built
// by sim/clusters.js detectCommunities + density pass).
//
// Zoom ratio = cameraDistance(toCentroid) / clusterExtent. Higher
// ratio = further away relative to the cluster's own size = time
// to name it.

import * as THREE from "three";
import { topLevelFolder, AURA_PALETTE } from "../vault/folders.js";

const MAX_CONSTELLATIONS = 20;
const UPDATE_EVERY_N_FRAMES = 3;

// CONSTELLATIONS.md §1: ratio ≤ 2 hide, 2→5 cross-fade, ≥ 5 full.
// The first-cut in §8 picks a single hard threshold; we keep a
// narrow fade window around it so the reveal isn't a pop.
const RATIO_VISIBLE_AT = 3.5;
const RATIO_FADE_SPAN = 0.8;

// §8.1: dream-mode interaction — constellations fade out as sleep
// depth rises. The dreaming universe has no names.
const DREAM_DEPTH_HIDE = 0.3;

// Folder-dominance threshold — at least this share of a cluster's
// notes must share a top-level folder for the folder name to win.
const FOLDER_DOMINANCE = 0.6;

// Haze size envelope (pixels). Tuned so a 3-note cluster reads as
// a small glow and a 30-note cluster reads as a region.
const HAZE_MIN_PX = 180;
const HAZE_MAX_PX = 520;

const TMP = new THREE.Vector3();

export function createConstellations({
  vault,
  bodies,
  camera,
  onConstellationClick,
  onClusterRename, // (cluster, newName | null) => void — persist user name
  onBatchLinkRequest, // (cluster) => void — open batch-link picker for cluster
  getMode, // () => boolean — show_constellations setting
  getDreamDepth, // () => number in [0, 1]
  getSettings, // () => settings — for folder tint lookup
}) {
  const container = document.createElement("div");
  container.id = "constellations";
  Object.assign(container.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "5", // below labels (z=6) — star titles win when both active
  });
  document.body.appendChild(container);

  const pool = [];
  const clusterIdBySlot = new Array(MAX_CONSTELLATIONS).fill(null);
  for (let i = 0; i < MAX_CONSTELLATIONS; i++) {
    const el = document.createElement("div");
    el.className = "constellation";
    Object.assign(el.style, {
      position: "absolute",
      transform: "translate(-50%, -50%)",
      opacity: "0",
      transition: "opacity 220ms ease",
      willChange: "transform, opacity",
      // Outer haze bounding box must NEVER capture pointer events —
      // that square would block OrbitControls pan/zoom across a huge
      // chunk of the viewport. Only the text span itself (small, in
      // the middle) is interactive.
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      borderRadius: "50%",
    });
    const text = document.createElement("span");
    text.className = "constellation-text";
    Object.assign(text.style, {
      position: "relative",
      color: "rgba(232, 234, 240, 0.9)",
      fontWeight: "300",
      letterSpacing: "0.08em",
      textShadow: "0 0 16px rgba(0, 0, 0, 0.85)",
      pointerEvents: "auto",
      cursor: "pointer",
      padding: "6px 10px",
      whiteSpace: "nowrap",
      borderRadius: "4px",
    });
    el.appendChild(text);

    // Edit state per slot. `editing` suppresses navigation clicks
    // and single-click focus while the user is typing.
    let editing = false;

    // All interactive listeners live on the TEXT span — the outer el
    // is visual-only (haze + positioning). Keeps the bulk of the
    // constellation footprint click-through for OrbitControls.
    text.addEventListener("click", (e) => {
      if (editing) {
        e.stopPropagation();
        return;
      }
      const cid = clusterIdBySlot[i];
      if (cid == null) return;
      e.stopPropagation();
      if (onConstellationClick) onConstellationClick(cid);
    });
    // Double-click = rename (inline edit). Shift+right-click is a
    // second path to the same rename in case double-click is
    // finicky on trackpads.
    text.addEventListener("dblclick", (e) => {
      const cid = clusterIdBySlot[i];
      if (cid == null) return;
      e.preventDefault();
      e.stopPropagation();
      beginEdit(i);
    });
    // Right-click = batch-link the whole cluster. Shift held =
    // rename instead. Separating gestures keeps both predictable:
    // plain right-click is "act on the whole region," modified
    // right-click is "edit this one label."
    text.addEventListener("contextmenu", (e) => {
      const cid = clusterIdBySlot[i];
      if (cid == null) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        beginEdit(i);
        return;
      }
      const cluster = vault?.clusters?.byId?.get(cid);
      if (!cluster) return;
      if (onBatchLinkRequest) onBatchLinkRequest(cluster);
    });
    text.addEventListener("mouseenter", () => {
      if (!editing) text.style.color = "rgba(255, 255, 255, 1)";
    });
    text.addEventListener("mouseleave", () => {
      if (!editing) text.style.color = "rgba(232, 234, 240, 0.9)";
    });

    // Inline rename. Contenteditable on the inner span so the haze
    // gradient on the outer el stays uninterrupted. Enter commits,
    // Escape reverts. Empty commit clears the user override and
    // falls back to the heuristic name.
    text.addEventListener("keydown", (e) => {
      if (!editing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commitEdit(i, text.textContent || "");
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelEdit(i);
      } else {
        // All other keys: let the input reach the contenteditable as
        // normal, but stop propagation so global hotkey handlers
        // (new-note, tend, weed, etc.) don't steal the keystroke.
        e.stopPropagation();
      }
    });
    text.addEventListener("blur", () => {
      if (!editing) return;
      commitEdit(i, text.textContent || "");
    });
    // While editing, clicks inside the text shouldn't bubble up and
    // trigger the outer el's click handler (which would arc the
    // camera away from what the user is looking at).
    text.addEventListener("click", (e) => {
      if (editing) e.stopPropagation();
    });

    // Helper closures bound to this slot so updates can toggle the
    // local `editing` flag without hoisting state.
    pool.push({
      el,
      text,
      beginEdit: () => {
        editing = true;
        text.style.outline = "1px dashed rgba(138, 180, 255, 0.5)";
        text.style.outlineOffset = "4px";
        text.style.color = "rgba(255, 255, 255, 1)";
        text.contentEditable = "true";
        text.focus();
        // Select all text so the user can type to replace.
        const range = document.createRange();
        range.selectNodeContents(text);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },
      endEdit: () => {
        editing = false;
        text.contentEditable = "false";
        text.style.outline = "none";
        text.style.color = "rgba(232, 234, 240, 0.9)";
      },
      isEditing: () => editing,
    });
    container.appendChild(el);
  }

  function beginEdit(i) {
    pool[i].beginEdit();
  }
  function cancelEdit(i) {
    pool[i].endEdit();
    // Repaint the original name on next frame.
    const cid = clusterIdBySlot[i];
    if (cid != null && nameCache.has(cid)) {
      pool[i].text.textContent = nameCache.get(cid);
    }
  }
  function commitEdit(i, raw) {
    const cid = clusterIdBySlot[i];
    if (cid == null) {
      pool[i].endEdit();
      return;
    }
    const cluster = vault?.clusters?.byId?.get(cid);
    if (!cluster) {
      pool[i].endEdit();
      return;
    }
    const next = String(raw).trim();
    if (onClusterRename) {
      // Empty commit = clear the override. Otherwise save the name
      // tied to the cluster's current member set so Jaccard lookup
      // can retrieve it on later sessions.
      onClusterRename(cluster, next || null);
    }
    // Flush cache so the new/cleared name takes effect immediately.
    nameCache.delete(cid);
    pool[i].endEdit();
    // Paint best-effort immediately; next frame will replace with
    // the fully-resolved name.
    pool[i].text.textContent = next || deriveClusterName(cluster, vault);
  }

  // Name cache — cluster ids are integer slots produced by label
  // propagation; they're stable across a session. Recompute only when
  // the vault size changes (cheap signal that clusters were rebuilt).
  let nameCache = new Map(); // clusterId → string
  let cachedVaultNotes = -1;

  let frame = 0;
  const screenBuf = new Array(MAX_CONSTELLATIONS);

  function update() {
    frame++;
    if (frame % UPDATE_EVERY_N_FRAMES !== 0) return;

    const on = getMode ? getMode() : true;
    if (!on) {
      hideAll();
      return;
    }

    const clusters = vault?.clusters;
    if (!clusters || !clusters.byId || clusters.byId.size === 0) {
      hideAll();
      return;
    }

    // Dream-depth dim — CONSTELLATIONS.md §4. At deep sleep we kill
    // the layer entirely; during shallow dream we taper.
    const dreamDepth = getDreamDepth ? getDreamDepth() : 0;
    let dreamFade = 1;
    if (dreamDepth >= DREAM_DEPTH_HIDE) dreamFade = 0;
    else dreamFade = 1 - dreamDepth / DREAM_DEPTH_HIDE;
    if (dreamFade <= 0.01) {
      hideAll();
      return;
    }

    maybeRefreshNames(clusters);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const settings = getSettings ? getSettings() : {};

    // Rank clusters by density * member count so that if we have more
    // eligible clusters than slots, the meatier ones win.
    const ranked = [];
    for (const cluster of clusters.byId.values()) {
      if (!cluster.centroid || !cluster.extent) continue;
      if (!cluster.noteIds || cluster.noteIds.length < 2) continue; // skip singletons
      TMP.set(cluster.centroid[0], cluster.centroid[1], cluster.centroid[2]);
      const dist = TMP.distanceTo(camera.position);
      const ratio = dist / Math.max(1e-3, cluster.extent);
      const fadeIn = visibilityFor(ratio);
      if (fadeIn <= 0.01) continue;
      TMP.project(camera);
      if (TMP.z >= 1) continue;
      const sx = (TMP.x * 0.5 + 0.5) * w;
      const sy = (1 - (TMP.y * 0.5 + 0.5)) * h;
      // Screen-space extent — an approximation of how large the
      // cluster appears in pixels. Derived from world extent / dist
      // so that as you zoom out, the haze shrinks (bodies do too).
      const screenExtent = Math.max(
        HAZE_MIN_PX,
        Math.min(HAZE_MAX_PX, (cluster.extent / Math.max(1, dist)) * w * 0.8),
      );
      ranked.push({
        cluster,
        x: sx,
        y: sy,
        opacity: fadeIn * dreamFade,
        screenExtent,
        noteCount: cluster.noteIds.length,
      });
    }
    ranked.sort((a, b) => b.noteCount - a.noteCount);

    const limit = Math.min(ranked.length, MAX_CONSTELLATIONS);
    for (let i = 0; i < MAX_CONSTELLATIONS; i++) {
      const slot = pool[i];
      if (i >= limit) {
        if (slot.el.style.opacity !== "0") slot.el.style.opacity = "0";
        // Text was interactive while the slot was in use — shut that
        // off for hidden slots so invisible label text can't swallow
        // clicks aimed at the canvas behind it.
        slot.text.style.pointerEvents = "none";
        clusterIdBySlot[i] = null;
        continue;
      }
      const r = ranked[i];
      const cid = r.cluster.id;
      clusterIdBySlot[i] = cid;
      const name = nameCache.get(cid) || `Region ${cid}`;
      // Don't overwrite text while the user is typing in this slot —
      // the update loop ticks every 3 frames and would stamp the
      // cached name over the user's in-progress edit, making the
      // rename feel impossible.
      if (!slot.isEditing() && slot.text.textContent !== name) {
        slot.text.textContent = name;
      }

      // Tint — folder dominance wins if present, else fall back to
      // the accent (warm-shifted in CSS for slight separation from
      // UI chrome). `tintHexFor` returns a hex string.
      const tintHex = tintHexFor(r.cluster, vault, settings);
      const rgb = hexToTriplet(tintHex);
      slot.el.style.background = `radial-gradient(circle at 50% 50%, rgba(${rgb}, 0.24) 0%, rgba(${rgb}, 0.09) 42%, transparent 72%)`;
      slot.el.style.filter = "blur(0.5px)";

      // Font size scales with cluster size — bigger clusters speak
      // louder. Bounds from CONSTELLATIONS.md §3.3.
      const fontSize = fontSizeFor(r.cluster);
      slot.text.style.fontSize = `${fontSize.toFixed(1)}px`;

      slot.el.style.left = `${r.x.toFixed(1)}px`;
      slot.el.style.top = `${r.y.toFixed(1)}px`;
      slot.el.style.width = `${r.screenExtent.toFixed(0)}px`;
      slot.el.style.height = `${r.screenExtent.toFixed(0)}px`;
      slot.el.style.opacity = r.opacity.toFixed(2);
      // Text is the ONLY interactive surface — outer el stays
      // pointer-events:none so the haze is click-through.
      slot.text.style.pointerEvents = "auto";
      screenBuf[i] = r;
    }
  }

  function visibilityFor(ratio) {
    // Hard cut at the threshold, with a narrow linear fade above so the
    // reveal doesn't pop. First-cut from CONSTELLATIONS.md §8 point 2.
    if (ratio <= RATIO_VISIBLE_AT) return 0;
    if (ratio >= RATIO_VISIBLE_AT + RATIO_FADE_SPAN) return 1;
    return (ratio - RATIO_VISIBLE_AT) / RATIO_FADE_SPAN;
  }

  function hideAll() {
    for (let i = 0; i < MAX_CONSTELLATIONS; i++) {
      const slot = pool[i];
      if (slot.el.style.opacity !== "0") slot.el.style.opacity = "0";
      slot.text.style.pointerEvents = "none";
      clusterIdBySlot[i] = null;
    }
  }

  function resolveName(cluster) {
    const settings = getSettings ? getSettings() : null;
    // User override wins — Jaccard against stored member snapshots.
    const userName = lookupUserName(cluster, settings);
    if (userName) return userName;
    return deriveClusterName(cluster, vault);
  }

  function maybeRefreshNames(clusters) {
    const nNotes = vault?.notes?.length ?? 0;
    // Recompute when note count changes OR when a cluster we've never
    // seen shows up. Cheap either way — O(clusters * avg member count).
    if (nNotes === cachedVaultNotes) {
      for (const cluster of clusters.byId.values()) {
        if (!nameCache.has(cluster.id)) {
          nameCache.set(cluster.id, resolveName(cluster));
        }
      }
      return;
    }
    cachedVaultNotes = nNotes;
    const next = new Map();
    for (const cluster of clusters.byId.values()) {
      next.set(cluster.id, resolveName(cluster));
    }
    nameCache = next;
  }

  function dispose() {
    container.remove();
  }

  return { update, dispose };
}

// Naming priority: project root → top-level folder → heaviest node →
// ordinal fallback. In multi-root vaults the ROOT is the folder the
// user thinks of — a cluster that lives mostly in one root should be
// named after that root, not whatever subfolder happens to dominate.
// User overrides and tag-consensus ship in later cuts
// (CONSTELLATIONS.md §2 items 1, 3).
export function deriveClusterName(cluster, vault) {
  const ids = cluster.noteIds || [];
  if (ids.length === 0) return `Region ${cluster.id}`;

  // Priority 1: root dominance. Multi-root vaults stamp every note
  // with rootId; single-root vaults assign a synthesised id like
  // "my-notes" to all of them (so this path no-ops there and we fall
  // through to folder-within-root logic below).
  const rootCounts = new Map();
  for (const id of ids) {
    const n = vault.byId?.get(id);
    if (!n?.rootId) continue;
    rootCounts.set(n.rootId, (rootCounts.get(n.rootId) || 0) + 1);
  }
  const rootsOnVault = vault.roots?.length || 0;
  if (rootCounts.size > 0 && rootsOnVault > 1) {
    let topRoot = null;
    let topRootCount = 0;
    for (const [rid, c] of rootCounts) {
      if (c > topRootCount) {
        topRoot = rid;
        topRootCount = c;
      }
    }
    if (topRoot && topRootCount / ids.length >= FOLDER_DOMINANCE) {
      // Prefer the root's display name from the manifest if present.
      const rootSpec = vault.roots.find((r) => r.id === topRoot);
      const label = rootSpec?.name || topRoot;
      return humanizeFolderName(label);
    }
  }

  // Priority 2: top-level folder dominance (path-relative to the
  // note's own root, which is the original behaviour).
  const folderCounts = new Map();
  let folderTotal = 0;
  for (const id of ids) {
    const n = vault.byId?.get(id);
    if (!n) continue;
    const f = topLevelFolder(n);
    if (!f) continue;
    folderCounts.set(f, (folderCounts.get(f) || 0) + 1);
    folderTotal++;
  }
  if (folderTotal > 0) {
    let topFolder = "";
    let topCount = 0;
    for (const [f, c] of folderCounts) {
      if (c > topCount) {
        topFolder = f;
        topCount = c;
      }
    }
    if (topCount / ids.length >= FOLDER_DOMINANCE) {
      return humanizeFolderName(topFolder);
    }
  }

  // Heaviest node — most-linked member's title. Uses forward+backward
  // as a cheap degree proxy (no centrality math).
  let bestId = null;
  let bestDeg = -1;
  for (const id of ids) {
    const f = vault.forward?.get(id)?.size || 0;
    const b = vault.backward?.get(id)?.size || 0;
    const deg = f + b;
    if (deg > bestDeg) {
      bestDeg = deg;
      bestId = id;
    }
  }
  if (bestId) {
    const n = vault.byId?.get(bestId);
    if (n?.title) return n.title;
  }

  return `Region ${cluster.id}`;
}

// ── User renames ───────────────────────────────────────────
// CONSTELLATIONS.md §2 item 1: "User-named." Stored in
// settings.cluster_names keyed by slot id, each entry carrying the
// member-id snapshot from when the rename happened. Resolution uses
// Jaccard similarity ≥ 0.6 so names survive minor cluster shifts —
// adding a note or losing one doesn't detach the label.

const JACCARD_MATCH = 0.6;

export function lookupUserName(cluster, settings) {
  if (!settings?.cluster_names) return null;
  const ids = cluster?.noteIds;
  if (!ids || ids.length === 0) return null;
  const current = new Set(ids);
  let bestName = null;
  let bestJaccard = 0;
  for (const entry of Object.values(settings.cluster_names)) {
    if (!entry?.name || !Array.isArray(entry.memberIds)) continue;
    const stored = new Set(entry.memberIds);
    let inter = 0;
    for (const id of current) if (stored.has(id)) inter++;
    const union = current.size + stored.size - inter;
    if (union === 0) continue;
    const j = inter / union;
    if (j >= JACCARD_MATCH && j > bestJaccard) {
      bestJaccard = j;
      bestName = entry.name;
    }
  }
  return bestName;
}

// Save a user name for the given cluster. `name === null` clears any
// stored entry that matches the current member set (Jaccard ≥ 0.6).
// Saving a new name also replaces any matching entry so we don't
// accumulate stale siblings of the same region.
export function saveClusterName(cluster, name, settings) {
  if (!cluster || !settings) return;
  if (!settings.cluster_names) settings.cluster_names = {};
  const ids = cluster.noteIds || [];
  const current = new Set(ids);
  // Remove any matching entry (by Jaccard) — we're superseding it.
  for (const [slotId, entry] of Object.entries(settings.cluster_names)) {
    if (!entry?.memberIds) continue;
    const stored = new Set(entry.memberIds);
    let inter = 0;
    for (const id of current) if (stored.has(id)) inter++;
    const union = current.size + stored.size - inter;
    if (union === 0) continue;
    if (inter / union >= JACCARD_MATCH) {
      delete settings.cluster_names[slotId];
    }
  }
  if (name && name.trim()) {
    const slotId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    settings.cluster_names[slotId] = {
      name: name.trim(),
      memberIds: ids.slice(),
    };
  }
}

// "research-notes" → "Research notes", "work" → "Work".
function humanizeFolderName(name) {
  const s = String(name).replace(/[-_]+/g, " ").trim();
  if (!s) return name;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fontSizeFor(cluster) {
  // §3.3: base 24, up to ~36 for the densest/largest, down to ~18.
  const n = cluster.noteIds?.length || 0;
  if (n <= 3) return 18;
  if (n >= 40) return 36;
  // Log-ish ramp between the endpoints.
  const t = Math.min(1, Math.log(1 + n) / Math.log(41));
  return 18 + t * 18;
}

// Look up a cluster's tint — folder consensus first, accent fallback.
function tintHexFor(cluster, vault, settings) {
  const folder = dominantFolder(cluster, vault);
  if (folder) {
    const key = settings?.folder_tints?.[folder];
    const tone = AURA_PALETTE.find((t) => t.key === key);
    if (tone) return tone.hex;
  }
  // Accent fallback — warm-shifted a touch so it separates from the
  // base UI accent without breaking the palette (§3.2).
  return settings?.accent || "#8ab4ff";
}

function dominantFolder(cluster, vault) {
  const ids = cluster.noteIds || [];
  if (ids.length === 0) return null;
  const counts = new Map();
  for (const id of ids) {
    const n = vault.byId?.get(id);
    if (!n) continue;
    const f = topLevelFolder(n);
    if (!f) continue;
    counts.set(f, (counts.get(f) || 0) + 1);
  }
  let top = null;
  let topCount = 0;
  for (const [f, c] of counts) {
    if (c > topCount) {
      top = f;
      topCount = c;
    }
  }
  if (topCount / ids.length >= FOLDER_DOMINANCE) return top;
  return null;
}

function hexToTriplet(hex) {
  const s = String(hex).replace("#", "");
  const n = s.length === 3 ? s.replace(/(.)/g, "$1$1") : s;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
