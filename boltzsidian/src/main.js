// Boltzsidian entry.
// Phase 0: boot the renderer + starfield, wire FS Access pick flow, show the
// workspace name top-left, settings pane via '\'. No notes, no bodies yet.

import { createRenderer } from "./sim/renderer.js";
import { initSettings } from "./ui/settings.js";
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

// ── Renderer ────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
createRenderer(canvas);

// ── HUD elements ────────────────────────────────────────────
const workspaceNameEl = document.getElementById("workspace-name");
const pickPane = document.getElementById("pick-pane");
const pickButton = document.getElementById("pick-button");
const statsHud = document.getElementById("stats-hud");

// ── Settings pane ───────────────────────────────────────────
const settingsUI = initSettings({ getSettings: () => settings });

// ── FS Access boot ──────────────────────────────────────────
if (!isSupported()) {
  pickButton.disabled = true;
  pickButton.textContent = "Chromium browser required";
  toast(
    "File System Access API is unavailable. Use Chrome, Edge, Arc, or Brave.",
    {
      duration: 8000,
    },
  );
}

pickButton.addEventListener("click", async () => {
  try {
    const handle = await pickWorkspace();
    setWorkspace(handle);
  } catch (err) {
    if (err && err.name === "AbortError") return; // user cancelled
    console.error(err);
    toast(err.message ?? "Could not open folder.");
  }
});

(async function tryRestore() {
  try {
    const restored = await restoreWorkspace();
    if (!restored) return;
    if (restored.needsPermission) {
      // We know a handle exists but need user consent. Repurpose the pick
      // button into a "reconnect" affordance.
      pickButton.textContent = `Reconnect to "${restored.handle.name}"`;
      pickButton.addEventListener(
        "click",
        async (e) => {
          e.stopImmediatePropagation();
          const ok = await ensurePermission(restored.handle);
          if (ok) setWorkspace(restored.handle);
          else toast("Permission denied.");
        },
        { once: true, capture: true },
      );
      return;
    }
    setWorkspace(restored);
  } catch (err) {
    console.error("restore workspace failed", err);
  }
})();

// ── Transitions ─────────────────────────────────────────────
function setWorkspace(handle) {
  workspaceHandle = handle;
  workspaceNameEl.textContent = handle.name;
  pickPane.classList.add("hidden");
  statsHud.textContent = "workspace connected · 0 notes";
  settingsUI.refresh?.();
}

function applyAccent(hex) {
  document.documentElement.style.setProperty("--accent", hex);
}

// Keep settings synced (no-op in Phase 0 — no editable fields yet).
window.addEventListener("beforeunload", () => saveSettings(settings));

// Dev-only: expose a tiny handle on window for poking in the console.
if (import.meta.env && import.meta.env.DEV) {
  window.__boltzsidian = {
    settings,
    get handle() {
      return workspaceHandle;
    },
  };
}
