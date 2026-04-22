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
      pointerEvents: "auto",
      cursor: "pointer",
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
      pointerEvents: "none",
      whiteSpace: "nowrap",
    });
    el.appendChild(text);
    el.addEventListener("click", (e) => {
      const cid = clusterIdBySlot[i];
      if (cid == null) return;
      e.stopPropagation();
      if (onConstellationClick) onConstellationClick(cid);
    });
    // Hover response — slightly brighten text, nudge haze scale. No
    // transition on transform here (the breathing animation reserves
    // transform for itself in v2); just text color pops.
    el.addEventListener("mouseenter", () => {
      text.style.color = "rgba(255, 255, 255, 1)";
    });
    el.addEventListener("mouseleave", () => {
      text.style.color = "rgba(232, 234, 240, 0.9)";
    });
    container.appendChild(el);
    pool.push({ el, text });
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
        slot.el.style.pointerEvents = "none";
        clusterIdBySlot[i] = null;
        continue;
      }
      const r = ranked[i];
      const cid = r.cluster.id;
      clusterIdBySlot[i] = cid;
      const name = nameCache.get(cid) || `Region ${cid}`;
      if (slot.text.textContent !== name) slot.text.textContent = name;

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
      slot.el.style.pointerEvents = "auto";
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
      slot.el.style.pointerEvents = "none";
      clusterIdBySlot[i] = null;
    }
  }

  function maybeRefreshNames(clusters) {
    const nNotes = vault?.notes?.length ?? 0;
    // Recompute when note count changes OR when a cluster we've never
    // seen shows up. Cheap either way — O(clusters * avg member count).
    if (nNotes === cachedVaultNotes) {
      for (const cluster of clusters.byId.values()) {
        if (!nameCache.has(cluster.id)) {
          nameCache.set(cluster.id, deriveClusterName(cluster, vault));
        }
      }
      return;
    }
    cachedVaultNotes = nNotes;
    const next = new Map();
    for (const cluster of clusters.byId.values()) {
      next.set(cluster.id, deriveClusterName(cluster, vault));
    }
    nameCache = next;
  }

  function dispose() {
    container.remove();
  }

  return { update, dispose };
}

// §8.1 first cut: folder consensus → heaviest node → ordinal fallback.
// Tag-consensus and user overrides ship in later cuts (§2 items 1, 3).
export function deriveClusterName(cluster, vault) {
  const ids = cluster.noteIds || [];
  if (ids.length === 0) return `Region ${cluster.id}`;

  // Folder dominance.
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
