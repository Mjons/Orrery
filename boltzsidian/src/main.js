// Boltzsidian entry.
// Phase 1: scan the workspace, lay out a universe of notes, render bodies,
// click a body to read it. No writing yet (Phase 2).

import * as THREE from "three";
import { createRenderer } from "./sim/renderer.js";
import { createBodies } from "./sim/bodies.js";
import { layoutNotes } from "./sim/layout.js";
import { createLabels } from "./ui/labels.js";
import { createSearch } from "./ui/search.js";
import { openVault } from "./vault/vault.js";
import { loadState, saveState } from "./vault/state-store.js";
import { initSettings } from "./ui/settings.js";
import { createNotePanel } from "./ui/note-panel.js";
import { toast } from "./ui/toast.js";
import { loadSettings, saveSettings } from "./state/settings.js";
import {
  isSupported,
  pickWorkspace,
  restoreWorkspace,
  ensurePermission,
} from "./vault/fs.js";

// ── State ────────────────────────────────────────────────────
const settings = loadSettings();
applyAccent(settings.accent);

let workspaceHandle = null;
let vault = null;
let bodies = null;
let labels = null;
let unsubscribeLabels = null;

// ── Renderer ────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const { scene, camera, controls, renderer, onFrame } = createRenderer(canvas);

// ── HUD elements ────────────────────────────────────────────
const workspaceNameEl = document.getElementById("workspace-name");
const pickPane = document.getElementById("pick-pane");
const pickButton = document.getElementById("pick-button");
const statsHud = document.getElementById("stats-hud");

// ── Settings pane ───────────────────────────────────────────
const settingsUI = initSettings({ getSettings: () => settings });

// ── Note panel ──────────────────────────────────────────────
const notePanel = createNotePanel({
  getVault: () => vault,
  onClose: () => {
    if (bodies) bodies.setSelected(null);
    returnCamera();
  },
  onNavigate: (noteId) => focusNote(noteId),
});

// ── Search ──────────────────────────────────────────────────
const search = createSearch({
  getVault: () => vault,
  getBodies: () => bodies,
  onArc: (worldPos) => focusCamera(worldPos),
  onOpen: (noteId) => openNote(noteId),
});

// ── FS Access boot ──────────────────────────────────────────
if (!isSupported()) {
  pickButton.disabled = true;
  pickButton.textContent = "Chromium browser required";
  toast(
    "File System Access API is unavailable. Use Chrome, Edge, Arc, or Brave.",
    { duration: 8000 },
  );
}

pickButton.addEventListener("click", async () => {
  try {
    const handle = await pickWorkspace();
    await setWorkspace(handle);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.error("[bz] pick flow error:", err);
    toast(err.message ?? "Could not open folder.");
  }
});

(async function tryRestore() {
  try {
    const restored = await restoreWorkspace();
    if (!restored) return;
    if (restored.needsPermission) {
      pickButton.textContent = `Reconnect to "${restored.handle.name}"`;
      pickButton.addEventListener(
        "click",
        async (e) => {
          e.stopImmediatePropagation();
          const ok = await ensurePermission(restored.handle);
          if (ok) await setWorkspace(restored.handle);
          else toast("Permission denied.");
        },
        { once: true, capture: true },
      );
      return;
    }
    await setWorkspace(restored);
  } catch (err) {
    console.error("[bz] restore workspace failed", err);
  }
})();

// ── Canvas click → body selection ───────────────────────────
let pointerDownAt = null;
canvas.addEventListener("pointerdown", (e) => {
  pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener("pointerup", (e) => {
  if (!bodies || !pointerDownAt) return;
  const dx = e.clientX - pointerDownAt.x;
  const dy = e.clientY - pointerDownAt.y;
  const dt = performance.now() - pointerDownAt.t;
  pointerDownAt = null;
  // Treat as click only if negligible movement — OrbitControls owns the rest.
  if (dx * dx + dy * dy > 16 || dt > 500) return;
  const hit = bodies.pickAt(e.clientX, e.clientY);
  if (hit) openNote(hit);
});

// ── Workspace loading ───────────────────────────────────────
async function setWorkspace(handle) {
  workspaceHandle = handle;
  workspaceNameEl.textContent = handle.name;
  pickPane.classList.add("hidden");
  statsHud.textContent = "scanning workspace…";

  try {
    const t0 = performance.now();
    vault = await openVault(handle, {
      onProgress: ({ read, total }) => {
        statsHud.textContent = `reading ${read} / ${total} notes…`;
      },
    });
    console.log(
      `[bz] vault loaded: ${vault.notes.length} notes in ${vault.stats.elapsedMs}ms`,
    );

    // Try cached layout first.
    const cached = await loadState(handle);
    let positions =
      cached?.positions && coversVault(cached.positions, vault)
        ? cached.positions
        : null;

    if (!positions) {
      statsHud.textContent = `laying out ${vault.notes.length} notes…`;
      await nextFrame();
      positions = layoutNotes(vault);
      await saveState(handle, { positions, savedAt: Date.now() });
    }

    bodies = createBodies({ scene, camera, vault, positions, renderer });

    if (unsubscribeLabels) unsubscribeLabels();
    labels = createLabels({ vault, bodies, camera });
    unsubscribeLabels = onFrame(() => labels.update());

    // Frame camera on the layout extent
    frameOnContents();

    updateStatsHud();
    console.log(`[bz] ready in ${Math.round(performance.now() - t0)}ms`);
  } catch (err) {
    console.error("[bz] workspace load failed:", err);
    toast(err.message ?? "Could not read workspace.");
    statsHud.textContent = "load failed";
  }
}

function updateStatsHud() {
  if (!vault) return;
  const s = vault.stats;
  statsHud.textContent = `${s.notes} notes · ${s.tags} tags · ${s.links} links`;
}

function coversVault(positions, vault) {
  for (const n of vault.notes) if (!positions[n.id]) return false;
  return true;
}

function frameOnContents() {
  if (!bodies || !vault) return;
  // Quick bounds — read positions from bodies' buffer via layout.
  let r2 = 0;
  for (const note of vault.notes) {
    const p = bodies.positionOf(note.id);
    if (!p) continue;
    const d2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    if (d2 > r2) r2 = d2;
  }
  const r = Math.max(400, Math.sqrt(r2));
  camera.position.set(0, 0, r * 1.65);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ── Note open / navigate ────────────────────────────────────
function openNote(noteId) {
  const note = vault?.byId.get(noteId);
  if (!note) return;
  bodies.setSelected(noteId);
  focusCamera(bodies.positionOf(noteId));
  notePanel.open(note);
}

function focusNote(noteId) {
  // Called from in-body [[wikilink]] clicks. Opens without re-snapshotting
  // camera (caller holds the original snapshot for return).
  openNote(noteId);
}

// ── Camera tween ────────────────────────────────────────────
// Smooth in/out between a saved snapshot and a focused body.
let camSnapshot = null;
let camTween = null;
const TMP_OFFSET = new THREE.Vector3();

function focusCamera(worldPos) {
  if (!worldPos) return;
  const target = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
  // Camera moves to keep its current direction, at a reasonable distance.
  TMP_OFFSET.subVectors(camera.position, controls.target);
  const dist = Math.max(60, Math.min(220, TMP_OFFSET.length() * 0.35));
  TMP_OFFSET.normalize().multiplyScalar(dist);
  const toPos = target.clone().add(TMP_OFFSET);
  if (!camSnapshot) {
    camSnapshot = {
      pos: camera.position.clone(),
      target: controls.target.clone(),
    };
  }
  startTween(toPos, target, 0.75);
}

function returnCamera() {
  if (!camSnapshot) return;
  const { pos, target } = camSnapshot;
  camSnapshot = null;
  startTween(pos.clone(), target.clone(), 1.05);
}

function startTween(toPos, toTarget, duration) {
  controls.enabled = false;
  camTween = {
    t: 0,
    duration,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos,
    toTarget,
  };
}

onFrame((dt) => {
  if (!camTween) return;
  camTween.t += dt;
  const k = Math.min(1, camTween.t / camTween.duration);
  const e = 1 - Math.pow(1 - k, 3);
  camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
  controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
  if (k >= 1) {
    camTween = null;
    controls.enabled = true;
  }
});

// If the user manually moves the camera while no panel is open, forget any
// stale snapshot — Esc should just close, not warp backward.
controls.addEventListener("change", () => {
  if (!notePanel.isOpen() && !camTween) camSnapshot = null;
});

// ── Settings / accent ───────────────────────────────────────
function applyAccent(hex) {
  document.documentElement.style.setProperty("--accent", hex);
}

window.addEventListener("beforeunload", () => saveSettings(settings));

// ── Helpers ─────────────────────────────────────────────────
function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

// ── Dev hook ────────────────────────────────────────────────
if (import.meta.env && import.meta.env.DEV) {
  window.__boltzsidian = {
    settings,
    get handle() {
      return workspaceHandle;
    },
    get vault() {
      return vault;
    },
    get bodies() {
      return bodies;
    },
    camera,
    controls,
    scene,
    notePanel,
  };
}
