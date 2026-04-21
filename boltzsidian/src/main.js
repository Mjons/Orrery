// Boltzsidian entry.
//
// Phase 3.5: the first run is crafted. A welcome card offers "Try the demo"
// (installs a curated amateur-astronomer vault into OPFS) or "Open my
// folder" (File System Access). Coachmarks teach gestures one at a time as
// the user performs each for the first time. A tag→kind discovery prompt
// fires after load if the current mapping covers less than 80% of notes.
// Cmd+D opens a canned-template morning report as a preview of Phase 5.

import * as THREE from "three";
import { createRenderer } from "./sim/renderer.js";
import { createBodies } from "./sim/bodies.js";
import { layoutNotes } from "./sim/layout.js";
import { computeLocalDensity } from "./sim/clusters.js";
import {
  AMBIENCE_PRESETS,
  getPreset as getAmbiencePreset,
  mixPresets as mixAmbience,
} from "./sim/ambience.js";
import { createPhysics } from "./sim/physics.js";
import { createTethers } from "./sim/tethers.js";
import { createSparks, SIZE_CONNECTION, SIZE_IDEA } from "./sim/sparks.js";
import { createKMatrix } from "./sim/kmatrix.js";
import { createHoverOrbit } from "./sim/hover-orbit.js";
import { createLabels } from "./ui/labels.js";
import { createPickDebug } from "./ui/pick-debug.js";
import { createSearch } from "./ui/search.js";
import { createLinkDrag } from "./ui/link-drag.js";
import { openVault } from "./vault/vault.js";
import { loadState, saveState } from "./vault/state-store.js";
import {
  addNoteToVault,
  makeEmptyNote,
  recomputeAllKinds,
  removeNoteFromVault,
} from "./vault/mutations.js";
import { createSaver } from "./vault/save.js";
import { titleToStem, uniquePath } from "./vault/writer.js";
import { planLinkCreate, planLinkDelete } from "./vault/links.js";
import { stringifyFrontmatter } from "./vault/frontmatter.js";
import { initSettings } from "./ui/settings.js";
import { createNotePanel } from "./ui/note-panel.js";
import { toast } from "./ui/toast.js";
import { loadSettings, saveSettings } from "./state/settings.js";
import { ensurePermission } from "./vault/fs.js";
import {
  restoreWorkspace,
  pickUserWorkspace,
  startDemoWorkspace,
  resetDemoWorkspace,
  userWorkspaceSupported,
  demoSupported,
  getDemoTheme,
} from "./vault/workspace.js";
import { createCoachmarks } from "./ui/coachmarks.js";
import { showTagPrompt, computeTagCoverage } from "./ui/tag-prompt.js";
import { showAbout } from "./ui/about.js";
import { showMorningReport } from "./ui/morning-report.js";
import { createFormations } from "./ui/formations.js";
import { createFormationsRail } from "./ui/formations-rail.js";
import { assignTints } from "./vault/folders.js";
import { createChorus } from "./layers/chorus.js";
import { createCaptions } from "./ui/captions.js";
import { createHover } from "./ui/hover.js";
import { createDream } from "./layers/dream.js";
import { assignAffinities, affinityFor } from "./layers/affinity.js";
import { createSalienceLayer } from "./layers/salience-layer.js";
import { DEFAULT_PARAMS as SALIENCE_DEFAULTS } from "./layers/salience.js";
import { promoteIdea, discardIdea, ignoreIdea } from "./layers/promote.js";
import { createIdeasDrawer } from "./ui/ideas-drawer.js";
import { createSalienceDebug } from "./ui/salience-debug.js";
import { runTendPasses, PASSES as TEND_PASSES } from "./layers/tend.js";
import { polishProposalsSerial, rankProposals } from "./layers/tend-enrich.js";
import { applyProposal, rejectProposal } from "./layers/tend-apply.js";
import { createTendDrawer } from "./ui/tend-drawer.js";
import {
  computePruneCandidates,
  writePruneCandidates,
} from "./layers/prune.js";
import {
  loadPruneCandidates,
  loadWeedKeep,
  saveWeedKeep,
  filterKept,
  growthSinceLastSeen,
  archiveNote,
  deleteNoteFile,
} from "./layers/weed.js";
import { createWeedDrawer } from "./ui/weed-drawer.js";
import { createBrief } from "./ui/brief.js";
import { writeDreamLog } from "./layers/dream-log.js";
import { createUtteranceRouter } from "./layers/utterance/index.js";
import { showPayloadPreview } from "./ui/payload-preview.js";
import { createModelFace } from "./ui/model-face.js";
import { createDreamBanner } from "./ui/dream-banner.js";

const TAG_PROMPT_KEY = "boltzsidian.tag_prompt.seen.v1";

// ── State ────────────────────────────────────────────────────
// `applyAccent` reads `bodies`, so these bindings must exist before it runs.
let workspaceHandle = null;
let workspaceKind = null;
let vault = null;
let bodies = null;
let labels = null;
let physics = null;
let tethers = null;
let sparks = null;
let linkDrag = null;
let kmatrix = null;
let formations = null;
let formationsRail = null;
let chorus = null;
let captions = null;
let hover = null;
let dream = null;
let salienceLayer = null;
let ideasDrawer = null;
// Live-tunable salience params. v1 uses the defaults; the `Shift+S`
// palette mutates this object in place, which takes effect on the next
// scoring pass.
const salienceParams = { ...SALIENCE_DEFAULTS };
let unsubscribeLabels = null;
let unsubscribePhysics = null;
let unsubscribeTethers = null;
let unsubscribeSparks = null;
let unsubscribeCaptions = null;
let saver = null;
let lastFocusedId = null;
let stateDirty = false;
let tagPromptActive = false;

const settings = loadSettings();
applyAccent(settings.accent);

const coachmarks = createCoachmarks();

// ── Utterance router (Phase 7) ──────────────────────────────
// Single shared router for every voice surface — chorus lines, dream
// captions, morning-report synthesis. Chooses backend per settings,
// transparent template fallback on any error. See MODEL_SURFACES.md
// for the scope boundary: voice surfaces only in Phase 7.
const utterance = createUtteranceRouter({ getSettings: () => settings });
utterance.backends.claude.setPreviewer(showPayloadPreview);
// Reflect the persisted backend choice into the lazy-init backends so
// available() tracks user intent from boot, not only after the user
// opens Settings.
applyUtteranceBackendSetting(settings.utterance_backend);

// Persona HUD. Expression tracks what's currently being generated;
// glow colour tracks which backend is speaking; falls to "sleeping"
// when the app is deep enough asleep. One element, global, lives for
// the full app session.
const modelFace = createModelFace();
utterance.onGenerateStart((p) => modelFace.onGenerateStart(p));
utterance.onGenerateResult((p) => modelFace.onGenerateResult(p));

// Dream banner — polls the dream controller every ~120 ms and paints
// phase name + progress + live depth at the top of the viewport. Only
// visible while the cycle is running. Diagnostic-as-UI: answers "is
// anything happening" without requiring the user to open devtools.
const dreamBanner = createDreamBanner({ getDream: () => dream });

function applyUtteranceBackendSetting(choice) {
  utterance.backends.local.setEnabled(choice === "local");
  utterance.backends.webllm.setEnabled(choice === "webllm");
  utterance.backends.claude.setEnabled(choice === "claude");
}

// ── Renderer ────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const { scene, camera, controls, renderer, onFrame, applyAmbience } =
  createRenderer(canvas);

// Pick-radius debug overlay (PICKING.md §3). Off by default. Toggle from
// the console via `__boltzsidian.debug.showPickRadii = true`.
// Live-tunable overlay knobs. Dial from the console:
//   __boltzsidian.debug.pick.radiusScale = 2
//   __boltzsidian.debug.pick.offsetX = -12
//   etc.
const pickOverrides = {
  radiusScale: 1,
  offsetX: 0,
  offsetY: 0,
  extraTolerance: 0,
};
const pickDebug = createPickDebug({
  getBodies: () => bodies,
  getOverrides: () => pickOverrides,
});
onFrame(() => pickDebug.update());

// ── HUD elements ────────────────────────────────────────────
const workspaceNameEl = document.getElementById("workspace-name");
const pickPane = document.getElementById("pick-pane");
const pickButton = document.getElementById("pick-button");
const demoButton = document.getElementById("demo-button");
const aboutLink = document.getElementById("about-link");
const progressEl = document.getElementById("welcome-progress");
const statsHud = document.getElementById("stats-hud");

// ── Settings pane ───────────────────────────────────────────
const settingsUI = initSettings({
  getSettings: () => settings,
  getVault: () => vault,
  getWorkspaceKind: () => workspaceKind,
  onChange: handleSettingsChange,
  onShowAbout: () => showAbout(),
  onReshowTagPrompt: () => maybeShowTagPrompt({ force: true }),
  onResetCoachmarks: () => {
    coachmarks.resetAll();
    toast("Coachmarks reset — they'll appear again on the next action.");
  },
  onResetDemo: async () => {
    if (workspaceKind !== "demo") return;
    try {
      const result = await resetDemoWorkspace();
      // A reinstall means a fresh vault — let the tag discovery prompt
      // fire again if coverage is low, and re-seed the folder basin so
      // clusters separate visibly after the reload.
      localStorage.removeItem(TAG_PROMPT_KEY);
      seedDemoInfluence(result.theme || getDemoTheme());
      toast("Demo vault reset. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error("[bz] demo reset failed:", err);
      toast("Could not reset demo vault.");
    }
  },
  getDemoTheme: () => getDemoTheme(),
  onSwitchDemo: async (themeId) => {
    if (workspaceKind !== "demo") return;
    try {
      const result = await resetDemoWorkspace({ theme: themeId });
      // Different theme ships with different tag vocabulary + different
      // cluster count — reset the prompt flag and re-seed the basin to
      // suit the new theme.
      localStorage.removeItem(TAG_PROMPT_KEY);
      seedDemoInfluence(result.theme || themeId);
      toast("Switching demo vault. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      console.error("[bz] demo switch failed:", err);
      toast("Could not switch demo vault.");
    }
  },
  onDreamNow: () => {
    if (!dream) {
      toast("Open a workspace first.");
      return;
    }
    dream.dreamNow();
    toast("Dreaming — move the mouse to wake up early.", { duration: 2500 });
  },
  onSetSleepDepth: (v) => {
    if (!dream) return;
    dream.setManualDepth(v);
  },
  getSleepDepth: () => (dream ? dream.getDepth() : 0),
  onOpenWeed: async () => {
    return openWeed();
  },
  getWeedKeep: () => weedKeepState,
  onWeedUnkeep: async (noteId) => {
    weedKeepState.keptIds = weedKeepState.keptIds.filter((id) => id !== noteId);
    if (workspaceHandle) await saveWeedKeep(workspaceHandle, weedKeepState);
  },
  getUtteranceStatus: () => utterance.status(),
  getClaudeApiKey: () => utterance.backends.claude.getApiKey(),
  onSetClaudeApiKey: async (key) => {
    await utterance.backends.claude.setApiKey(key);
    // Clear any stale session approvals tied to a previous key.
    utterance.backends.claude.clearApprovals();
  },
  getDreamStatus: () => {
    if (!dream) return null;
    return {
      state: dream.getState?.(),
      phase: dream.getPhase?.() || null,
      depth: dream.getDepth?.() || 0,
    };
  },
  onTestLocalBackend: async () => {
    // Force-enable for the test regardless of current dropdown state,
    // so the user can validate a URL before committing to "local" as
    // the active backend. Restore after.
    const wasEnabled = utterance.backends.local.available();
    utterance.backends.local.setEnabled(true);
    try {
      return await utterance.backends.local.testConnection();
    } finally {
      if (!wasEnabled && settings.utterance_backend !== "local") {
        utterance.backends.local.setEnabled(false);
      }
    }
  },
  onRunTend: async (enabled) => runTendAndOpen({ enabled }),
});

// Extracted so the T hotkey can also fire a fresh Tend run — the
// settings button uses `enabled` from the checkboxes; the hotkey
// derives it from settings.tend_passes. Same pipeline either way:
// run passes → rank → open drawer → polish reasons in background.
async function runTendAndOpen({ enabled } = {}) {
  if (!vault) {
    toast("Open a workspace first.");
    return 0;
  }
  // If the caller didn't supply an enabled list, derive it from the
  // current settings. All passes default to on.
  if (!enabled) {
    const state = settings.tend_passes || {};
    enabled = Object.values(TEND_PASSES).filter((id) => state[id] !== false);
  }
  if (enabled.length === 0) {
    toast("All Tend passes are disabled in Settings.");
    return 0;
  }

  const { proposals } = runTendPasses(vault, { enabled });
  if (proposals.length === 0) {
    tendDrawer.setProposals([]);
    toast("Nothing obvious to tend right now.");
    return 0;
  }

  // Rank first — usually fast (one model call over all proposals).
  // Template fallback keeps the confidence-sorted order.
  let ranked = proposals;
  if (proposals.length > 1) {
    try {
      const result = await rankProposals(proposals, utterance);
      if (result.proposals && result.backend !== "template") {
        ranked = result.proposals;
        if (result.reasoning) {
          console.info(`[bz] tend-rank reasoning: ${result.reasoning}`);
        }
      }
    } catch (err) {
      console.warn("[bz] tend-rank threw", err);
    }
  }

  tendDrawer.setProposals(ranked);
  if (ideasDrawer?.isOpen?.()) ideasDrawer.close?.();
  if (weedDrawer?.isOpen?.()) weedDrawer.close?.();
  tendDrawer.open();

  // Polish reasons in the background. Each successful polish mutates
  // the proposal and refreshes the drawer so the user sees the
  // polished reason land in real time.
  polishProposalsSerial(ranked, utterance, {
    onUpdate: () => {
      tendDrawer.refresh?.();
    },
  }).catch((err) => {
    console.warn("[bz] tend-polish harvester threw", err);
  });

  return ranked.length;
}

// ── Note panel ──────────────────────────────────────────────
const notePanel = createNotePanel({
  getVault: () => vault,
  onClose: () => {
    if (bodies) bodies.setSelected(null);
    returnCamera();
  },
  onNavigate: (noteId) => focusNote(noteId),
  onSave: handleSave,
  onTogglePin: handleTogglePin,
  // Manual note deletion from the panel header. The panel's click
  // handler fires the native confirm(); by the time we're called the
  // user has already said yes. We reuse Weed's two-stage path:
  // deleteNoteFile removes the file on disk via FS Access removeEntry,
  // then removeNoteEverywhere scrubs vault indices + body pool + physics
  // edges + tethers and closes the panel if it was showing this note.
  onDelete: async (note) => {
    if (!workspaceHandle || !note) return;
    const result = await deleteNoteFile(workspaceHandle, note.path);
    if (!result.ok) {
      toast(`Delete failed: ${note.path}`);
      return;
    }
    removeNoteEverywhere(note.id);
    toast(`Deleted ${note.path}`, { duration: 3000 });
  },
});

// ── Search ──────────────────────────────────────────────────
const search = createSearch({
  getVault: () => vault,
  getBodies: () => bodies,
  onArc: (worldPos) => focusCamera(worldPos),
  onOpen: (noteId) => openNote(noteId),
});

// ── Ideas drawer + noticed pill ─────────────────────────────
// Created once; the DOM is always present. Handlers read salienceLayer
// lazily via closures — it only becomes non-null after a workspace loads.
ideasDrawer = createIdeasDrawer({
  getSurfaced: () => (salienceLayer ? salienceLayer.getSurfaced() : []),
  getDreamState: () => {
    if (!dream) return null;
    const phase = dream.getPhase?.();
    if (!phase) return null;
    return {
      phase,
      poolSize: salienceLayer ? salienceLayer.getPoolSize?.() || 0 : 0,
      queueSize: salienceLayer ? salienceLayer.getQueueSize?.() || 0 : 0,
    };
  },
  onPromote: async (candidate) => {
    if (!vault || !saver) return;
    try {
      await promoteIdea({
        candidate,
        vault,
        bodies,
        saver,
        salienceLayer,
        physics,
        tethers,
      });
      ideasDrawer.refresh();
      updateNoticedPill();
      if (search?.invalidate) search.invalidate();
      updateStatsHud();
      toast(`Promoted → ideas/ · ${candidate.seedText}`, { duration: 3500 });
    } catch (err) {
      console.error("[bz] promote failed", err);
      toast("Could not promote this idea.");
    }
  },
  onDiscard: (candidate) => {
    discardIdea({ candidate, salienceLayer });
    updateNoticedPill();
  },
  onIgnore: (candidate) => {
    ignoreIdea({ candidate });
    updateNoticedPill();
  },
  onOpenParent: (noteId) => openNote(noteId),
});

// Tend drawer — janitorial proposals from the Tend scanner. One shared
// instance; proposals are passed in as a snapshot per Tend run.
const tendDrawer = createTendDrawer({
  onAccept: async (proposal) => {
    if (!vault || !saver) return;
    const result = await applyProposal({ proposal, vault, saver });
    // An obvious-link accept adds a wikilink to the note body — the
    // vault's forward/backward maps update via reparseNote, but the
    // physics edge list and tether geometry don't auto-sync. Rebuild
    // both so the new tether actually appears in the canvas. Cheap
    // enough to run on every accept; the other pass kinds (tag-infer,
    // fm-normalise, stub, title-collision) get a harmless no-op on
    // the rebuild side since their edge set didn't change. Kinds can
    // shift on tag-infer too (tag→kind mapping) so refresh those.
    if (result?.applied) {
      if (physics) physics.rebuildEdges();
      if (tethers) tethers.rebuild();
      if (bodies) bodies.refreshAllKinds?.();
    }
  },
  onReject: async (proposal) => {
    if (!vault || !saver) return;
    // Reject only stamps tended_on frontmatter — no body change, no
    // new links — so no rebuild needed.
    await rejectProposal({ proposal, vault, saver });
  },
  onOpenNote: (noteId) => openNote(noteId),
});

// Weed drawer — prune-candidate triage. One shared instance, opened via
// Settings → Weed or the W key (only if candidates exist).
let weedKeepState = {
  version: 1,
  keptIds: [],
  lastSeenCount: 0,
  lastSeenAt: null,
};
const weedDrawer = createWeedDrawer({
  onKeep: async (candidate) => {
    if (!workspaceHandle) return;
    if (!weedKeepState.keptIds.includes(candidate.id)) {
      weedKeepState.keptIds.push(candidate.id);
    }
    await saveWeedKeep(workspaceHandle, weedKeepState);
  },
  onArchive: async (candidate) => {
    if (!workspaceHandle || !vault) return;
    const result = await archiveNote(workspaceHandle, candidate.path);
    if (!result.ok) {
      toast(`Archive failed: ${candidate.path}`);
      throw new Error(result.reason);
    }
    removeNoteEverywhere(candidate.id);
  },
  onDelete: async (candidate) => {
    if (!workspaceHandle || !vault) return;
    const result = await deleteNoteFile(workspaceHandle, candidate.path);
    if (!result.ok) {
      toast(`Delete failed: ${candidate.path}`);
      throw new Error(result.reason);
    }
    removeNoteEverywhere(candidate.id);
    toast(`Deleted ${candidate.path}`, { duration: 3000 });
  },
  onOpenNote: (noteId) => openNote(noteId),
  onBulkKeep: async (candidates) => {
    if (!workspaceHandle) return;
    const set = new Set(weedKeepState.keptIds);
    for (const c of candidates) set.add(c.id);
    weedKeepState.keptIds = [...set];
    await saveWeedKeep(workspaceHandle, weedKeepState);
    weedDrawer.setCandidates([]);
    toast(
      `Kept ${candidates.length} note${candidates.length === 1 ? "" : "s"}.`,
    );
  },
  onBulkArchive: async (candidates) => {
    if (!workspaceHandle) return;
    let ok = 0;
    for (const c of candidates) {
      const r = await archiveNote(workspaceHandle, c.path);
      if (r.ok) {
        removeNoteEverywhere(c.id);
        ok++;
      }
    }
    weedDrawer.setCandidates([]);
    toast(`Archived ${ok} of ${candidates.length} — see .universe/archive/.`, {
      duration: 3500,
    });
  },
});

// Brief — "where you are" panel on workspace open. One-shot per load,
// dismissable on esc or any nav key.
const brief = createBrief({
  getVault: () => vault,
  getBodies: () => bodies,
  onOpenNote: (noteId) => openNote(noteId),
});

// Drop a note from vault, body pool, and visible scene. Archive and
// Delete both end here — the file is gone from disk (or moved to a
// hidden archive dir), so the universe must follow.
function removeNoteEverywhere(noteId) {
  if (!vault) return;
  if (notePanel?.isOpen?.() && notePanel.getCurrent?.()?.id === noteId) {
    notePanel.close();
  }
  removeNoteFromVault(vault, noteId);
  if (bodies?.removeBody) bodies.removeBody(noteId);
  if (physics) physics.rebuildEdges();
  if (tethers) tethers.rebuild();
  if (search?.invalidate) search.invalidate();
  updateStatsHud();
  stateDirty = true;
  persistStateSoon();
}

// Load candidates from .universe/prune-candidates.json, subtract the
// user's keep-forever list, push into the drawer, and open it. Updates
// the last-seen count so the growth toast doesn't re-fire on the same
// list.
async function openWeed() {
  if (!workspaceHandle) {
    toast("Open a workspace first.");
    return 0;
  }
  if (settings.weed_enabled === false) {
    toast("Weed is disabled in Settings.");
    return 0;
  }
  const { candidates } = await loadPruneCandidates(workspaceHandle);
  const live = filterKept(candidates, weedKeepState.keptIds);
  weedDrawer.setCandidates(live);
  // Mark the current count as seen so the soft-toast only fires when
  // the list actually grows past this baseline.
  weedKeepState.lastSeenCount = candidates.length;
  weedKeepState.lastSeenAt = new Date().toISOString();
  saveWeedKeep(workspaceHandle, weedKeepState).catch(() => {});
  if (live.length === 0) {
    toast("Nothing to weed. The dream hasn't flagged any orphans.");
    return 0;
  }
  // One drawer on the left at a time.
  if (ideasDrawer?.isOpen?.()) ideasDrawer.close?.();
  if (tendDrawer?.isOpen?.()) tendDrawer.close?.();
  weedDrawer.open();
  return live.length;
}

// On workspace load, re-check prune-candidates.json for growth since
// the user last opened Weed. If growth crosses the threshold, soft-toast.
async function checkWeedGrowth() {
  if (!workspaceHandle) return;
  if (settings.weed_enabled === false) return;
  try {
    weedKeepState = await loadWeedKeep(workspaceHandle);
    const { candidates } = await loadPruneCandidates(workspaceHandle);
    const live = filterKept(candidates, weedKeepState.keptIds);
    const growth = growthSinceLastSeen(live, weedKeepState);
    const threshold = Number(settings.weed_growth_threshold) || 5;
    if (growth >= threshold && live.length > 0) {
      toast(
        `${live.length} prune candidate${live.length === 1 ? "" : "s"} waiting. Open Weed to review.`,
        { duration: 4500 },
      );
    }
  } catch (err) {
    console.warn("[bz] weed: growth check failed", err);
  }
}

const noticedPill = document.getElementById("noticed-pill");
const noticedCountEl = noticedPill?.querySelector(".noticed-count");
const noticedLabelEl = noticedPill?.querySelector(".noticed-label");
noticedPill?.addEventListener("click", () => ideasDrawer.open());

// Debug palette for the salience layer — toggled with Shift+S. Safe to
// create before any workspace is loaded; it reads the layer lazily.
const salienceDebug = createSalienceDebug({
  getLayer: () => salienceLayer,
  getParams: () => salienceParams,
});

function updateNoticedPill() {
  if (!noticedPill || !salienceLayer) return;
  const surfaced = salienceLayer.getSurfaced();
  const unread = surfaced.filter((c) => !c.readAt);
  const count = unread.length;
  if (count === 0 || ideasDrawer.isOpen()) {
    noticedPill.hidden = true;
    return;
  }
  if (noticedCountEl) noticedCountEl.textContent = String(count);
  if (noticedLabelEl)
    noticedLabelEl.textContent =
      count === 1 ? "idea surfaced" : "ideas surfaced";
  noticedPill.hidden = false;
}

// ── Welcome wiring ──────────────────────────────────────────
if (aboutLink) {
  aboutLink.addEventListener("click", (e) => {
    e.preventDefault();
    showAbout();
  });
}

if (!userWorkspaceSupported()) {
  pickButton.disabled = true;
  pickButton.textContent = "Chromium browser required";
  toast(
    "File System Access API is unavailable. Use Chrome, Edge, Arc, or Brave.",
    { duration: 8000 },
  );
}

if (demoButton) {
  if (!demoSupported()) {
    demoButton.disabled = true;
    demoButton.title = "OPFS unavailable in this browser";
  }
  demoButton.addEventListener("click", async () => {
    if (demoButton.disabled) return;
    const theme = pickedWelcomeTheme();
    setWelcomeBusy(true);
    setProgress("installing demo vault…");
    try {
      const ws = await startDemoWorkspace({
        theme,
        onProgress: ({ done, total, file }) => {
          setProgress(`installing ${done} / ${total}…`);
        },
      });
      // Fresh install: turn folder basin on so the top-level clusters
      // visibly separate. Otherwise every demo looks like one big mind map
      // until the user opens Settings and finds the slider.
      if (ws.freshInstall) seedDemoInfluence(theme);
      setProgress("");
      await setWorkspace(ws);
    } catch (err) {
      console.error("[bz] demo start failed:", err);
      toast(err.message ?? "Could not start the demo.");
      setProgress("");
      setWelcomeBusy(false);
    }
  });
}

// Read whichever theme radio is currently selected on the welcome card.
function pickedWelcomeTheme() {
  const el = document.querySelector(
    "#welcome-theme input[name='demo-theme']:checked",
  );
  return el ? el.value : "astronomer";
}

// Seed folder basin strength for a freshly-installed demo so the
// top-level clusters pull visibly apart under physics. Different themes
// want different amounts — the project theme has two genuinely separate
// sub-projects and wants a stronger basin; the astronomer theme has
// categories inside one domain and wants a gentler pull.
function seedDemoInfluence(theme) {
  const target = theme === "project" ? 0.55 : 0.3;
  settings.folder_influence = target;
  saveSettings(settings);
}

pickButton.addEventListener("click", async () => {
  try {
    const ws = await pickUserWorkspace();
    await setWorkspace(ws);
  } catch (err) {
    if (err && err.name === "AbortError") return;
    console.error("[bz] pick flow error:", err);
    toast(err.message ?? "Could not open folder.");
  }
});

function setWelcomeBusy(busy) {
  const card = pickPane?.querySelector(".welcome");
  if (!card) return;
  card.classList.toggle("busy", busy);
}
function setProgress(text) {
  if (progressEl) progressEl.textContent = text || "";
}

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
          if (ok) await setWorkspace({ kind: "user", handle: restored.handle });
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
  // Link-drag owns Alt. Leave that gesture alone.
  if (e.altKey) return;
  // Left button only.
  if (e.button !== 0) return;
  pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
});
canvas.addEventListener("pointerup", (e) => {
  if (!bodies || !pointerDownAt) return;
  const dx = e.clientX - pointerDownAt.x;
  const dy = e.clientY - pointerDownAt.y;
  const dt = performance.now() - pointerDownAt.t;
  pointerDownAt = null;
  if (e.button !== 0) return;
  if (dx * dx + dy * dy > 16 || dt > 500) return;
  const hit = bodies.pickAt(e.clientX, e.clientY);
  if (hit) openNote(hit);
});

// ── Modifier+right-click tether → delete ────────────────────
// Right-click alone is for OrbitControls pan — it must pass through
// untouched or right-drag navigation breaks the moment the pointer
// crosses a tether. Tether-delete is spring-loaded by a held
// modifier: Alt (primary, symmetric with Alt+drag for link create)
// OR Shift (fallback for the same reasons link-drag.js accepts both).
//
// If no modifier is held, we don't touch the right-click at all —
// OrbitControls gets its pan. If the modifier is held AND the click
// lands on a tether, we intercept and delete immediately. The key is
// the spring; the click is the trigger.
window.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 2) return;
    if (e.target !== canvas) return;
    if (!e.altKey && !e.shiftKey) return; // bare right-click = let pan through
    if (!tethers || !vault || !saver) return;
    const hit = tethers.pickAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    deleteLink(hit.aId, hit.bId);
  },
  { capture: true },
);

// Cursor affordance — while Alt/Shift is held with the pointer over
// the canvas, the cursor flips so the user sees delete is armed.
// Cosmetic; the real gate is the key check in the handler above.
function updateTetherCursor(e) {
  if (!canvas) return;
  const armed = !!(e.altKey || e.shiftKey) && !!tethers;
  canvas.classList.toggle("tether-delete-armed", armed);
}
window.addEventListener("keydown", updateTetherCursor);
window.addEventListener("keyup", updateTetherCursor);
window.addEventListener("pointermove", updateTetherCursor);
// Suppress the native context menu over the canvas so a right-click that
// misses a tether doesn't open a Chromium menu mid-gesture.
window.addEventListener(
  "contextmenu",
  (e) => {
    if (e.target === canvas) e.preventDefault();
  },
  { capture: true },
);

// ── Input listeners feeding the dream controller ────────────
// Any real user input resets the idle clock and wakes a dream-in-progress.
// pointermove is noisy — throttle it to ~once a second so we don't spam.
let lastMoveNote = 0;
window.addEventListener("pointermove", (e) => {
  if (!dream) return;
  const now = performance.now();
  if (now - lastMoveNote < 800) return;
  lastMoveNote = now;
  // Passive presence — reset idle timer but don't wake a running
  // dream. If we treated pointer drift as wake, the ~5 min cycle
  // collapses to ~3 seconds as soon as the user's cursor twitches.
  dream.noteIdleReset();
});
// Deliberate interaction — click, scroll, key — wakes a running cycle.
window.addEventListener("pointerdown", () => dream && dream.noteInput());
window.addEventListener("wheel", () => dream && dream.noteInput(), {
  passive: true,
});
window.addEventListener("keydown", () => dream && dream.noteInput(), true);
// Refocusing the tab just resets idle; it shouldn't auto-wake a
// dream the user left running to watch.
window.addEventListener("focus", () => dream && dream.noteIdleReset());

// ── Workspace loading ───────────────────────────────────────
async function setWorkspace(ws) {
  workspaceHandle = ws.handle;
  workspaceKind = ws.kind;
  workspaceNameEl.textContent =
    ws.kind === "demo" ? "demo · astronomer's notebook" : ws.handle.name;
  pickPane.classList.add("hidden");
  setWelcomeBusy(false);
  statsHud.textContent = "scanning workspace…";

  try {
    const t0 = performance.now();
    vault = await openVault(ws.handle, {
      settings,
      onProgress: ({ read, total }) => {
        statsHud.textContent = `reading ${read} / ${total} notes…`;
      },
    });
    // Seed each note's affinity vector for the salience layer. Stable
    // function of tags + optional frontmatter override — cheap, O(notes).
    assignAffinities(vault.notes);
    console.log(
      `[bz] vault loaded: ${vault.notes.length} notes in ${vault.stats.elapsedMs}ms`,
    );

    saver = createSaver({
      vault,
      getSettings: () => settings,
      onNoteChanged: handleNoteChanged,
    });

    const cached = await loadState(ws.handle);
    let positions =
      cached?.positions && coversVault(cached.positions, vault)
        ? cached.positions
        : null;

    if (!positions) {
      statsHud.textContent = `laying out ${vault.notes.length} notes…`;
      await nextFrame();
      positions = layoutNotes(vault);
      stateDirty = true;
    }

    // Local density per note (once, post-layout). Feeds the bodies shader
    // so tight clusters read brighter; bloom pools them into a collective
    // glow over the cluster. See AMBIENCE.md §2.1.
    vault.densityById = computeLocalDensity(vault, positions, {
      radius: 220,
      clusters: vault.clusters,
    });

    lastFocusedId = cached?.lastFocused || null;
    kmatrix = createKMatrix(cached?.kmatrix);

    // Auto-assign folder tints for any top-level folder we haven't seen.
    // Doesn't overwrite user choices — only fills in missing ones.
    const tintResult = assignTints(vault, settings);
    if (tintResult.changed) {
      settings.folder_tints = tintResult.tints;
      saveSettings(settings);
    }

    bodies = createBodies({
      scene,
      camera,
      vault,
      positions,
      renderer,
      getSettings: () => settings,
    });

    physics = createPhysics({
      bodies,
      vault,
      getPinnedIds: null,
      getFolderInfluence: () => settings.folder_influence || 0,
      getDreamDepth: () => (dream ? dream.getDepth() : 0),
    });

    tethers = createTethers({
      scene,
      bodies,
      physics,
      camera,
      getAccent: () => settings.accent || "#8ab4ff",
      getDreamDepth: () => (dream ? dream.getDepth() : 0),
    });

    // Phase 2 spark renderer. Fires a ~900 ms glowing pulse at every
    // pair-candidate spawn during a dream cycle. Visible "bump"
    // feedback for DREAM_ENGINE.md §11.9 — the field twinkles during
    // Phase 2 proportional to how much collision activity the salience
    // layer is producing.
    if (sparks) sparks.dispose?.();
    sparks = createSparks({
      scene,
      renderer,
      getAccent: () => settings.accent || "#8ab4ff",
    });
    if (unsubscribeSparks) unsubscribeSparks();
    unsubscribeSparks = onFrame((dt) => sparks.update(dt));

    linkDrag = createLinkDrag({
      canvas,
      camera,
      controls,
      bodies,
      scene,
      getAccent: () => settings.accent || "#8ab4ff",
      onCreate: (srcId, dstId) => createLink(srcId, dstId),
    });

    // Hover controller — drives cursor, gesture hint, and the hover rings
    // on bodies + tethers. Rebuild per workspace so it sees the current
    // bodies/tethers references.
    if (hover) hover.clear();
    hover = createHover({
      canvas,
      bodies,
      tethers,
      getIsDragging: () => linkDrag?.isActive,
    });

    formations = createFormations({
      getVault: () => vault,
      getBodies: () => bodies,
      onChange: (state) => {
        if (formationsRail) formationsRail.render(state);
      },
    });
    if (!formationsRail) {
      formationsRail = createFormationsRail({
        getVault: () => vault,
        formations,
        onBeforeOpen: () => search?.close(),
      });
    }
    // Paint the initial (empty) state.
    formations.refresh();

    // Observer chorus — ambient voice. Off by default per settings.
    // Stop any previous chorus before replacing it so its tick interval
    // doesn't leak between workspace switches.
    if (chorus) chorus.setEnabled(false);
    chorus = createChorus({
      getVault: () => vault,
      getBodies: () => bodies,
      getSettings: () => settings,
      getDreamDepth: () => (dream ? dream.getDepth() : 0),
      onCaption: null,
      utterance,
    });
    if (!captions) {
      captions = createCaptions({
        getChorus: () => chorus,
        getBodies: () => bodies,
        camera,
        getSettings: () => settings,
      });
      unsubscribeCaptions = onFrame((dt, t) => captions.update(dt, t));
    }
    chorus.setEnabled(!!settings.observer_chorus);

    // Dream controller. Owns the sleep-depth state machine; physics and
    // chorus read depth via the getters above; on wake it produces a
    // morning report + writes the day's dream log + prune candidates.
    dream = createDream({
      getSettings: () => settings,
      getChorusBuffer: () => (chorus ? chorus.getBuffer() : []),
      computePruneCandidates: () =>
        vault ? computePruneCandidates(vault) : [],
      onDepthChange: (d) => updateSleepHud(d),
      // Phase lifecycle hook — drives the pool architecture in the
      // salience layer. Warming begins a cycle (pool routing starts);
      // discerning triggers finalizeCycle (survivors surface); any
      // early wake (phase → null) aborts, discarding the pool per
      // DREAM_ENGINE.md §11.6.
      onPhaseChange: ({ prev, next }) => {
        if (!salienceLayer) return;
        // Refresh the drawer on every phase transition so the
        // "dreaming · N forming" indicator updates phase label.
        ideasDrawer?.refresh?.();
        updateNoticedPill?.();
        if (next === "warming") {
          salienceLayer.beginCycle?.();
        } else if (next === "playing") {
          // Phase 3: start firing reword operations on top pool
          // candidates every ~6 s until the phase ends.
          salienceLayer.startPlaying?.();
        } else if (next === "discerning") {
          // finalizeCycle internally calls stopPlaying, but belt-and-
          // suspenders — any unhandled transition path still stops it.
          salienceLayer.stopPlaying?.();
          salienceLayer.finalizeCycle?.({ topK: 5 });
        } else if (next === null) {
          // Dream ended without discerning — user woke it, or
          // setManualDepth(0) fired mid-cycle. Discard the pool.
          salienceLayer.stopPlaying?.();
          if (salienceLayer.isCycleActive?.()) {
            salienceLayer.abortCycle?.();
          }
        }
      },
      onWake: async (artifacts) => {
        // Phase 4: fold the judge's reasoning into the dream artifacts
        // so it lands in both the morning-report modal and the dream
        // log file. Reasoning is the audit trail for why THESE
        // survivors made it past discernment and not others
        // (DREAM_ENGINE.md §11.5 layer 3). Empty string if the judge
        // didn't run or fell through to salience-only ranking.
        if (salienceLayer?.getLastJudgeReasoning) {
          const reasoning = salienceLayer.getLastJudgeReasoning();
          const at = salienceLayer.getLastJudgeAt?.() || 0;
          if (reasoning && at >= artifacts.startedAt) {
            artifacts.judgeReasoning = reasoning;
            // Prepend to events so the dream-log writer picks it up
            // alongside phase transitions.
            artifacts.events = [
              {
                at,
                label: `judge: ${reasoning}`,
                depth: artifacts.peakDepth,
              },
              ...(artifacts.events || []),
            ];
          }
        }
        try {
          if (workspaceHandle && artifacts.pruneCandidates.length)
            await writePruneCandidates(
              workspaceHandle,
              artifacts.pruneCandidates,
            );
          if (workspaceHandle) await writeDreamLog(workspaceHandle, artifacts);
        } catch (err) {
          console.warn("[bz] dream artifact write failed", err);
        }
        showMorningReport({
          vault,
          bodies,
          settings,
          chorus,
          salienceLayer,
          dreamArtifacts: artifacts,
          utterance,
          onLoadDream: (path) => openDreamLog(path),
          onDiscard: null,
          onOpenIdeas: () => ideasDrawer?.open(),
        });
      },
    });
    updateSleepHud(0);
    onFrame((dt) => dream && dream.tick(dt));

    // Salience layer — produces candidate child ideas during dream cycles.
    // Depends on bodies (for positions), vault (for affinities), and
    // dream depth (to gate when it runs).
    if (salienceLayer) salienceLayer.dispose?.();
    salienceLayer = createSalienceLayer({
      getVault: () => vault,
      getBodies: () => bodies,
      getDreamDepth: () => (dream ? dream.getDepth() : 0),
      getParams: () => salienceParams,
      utterance,
      onPairSpawn: ({ midpoint, kind }) => {
        // Two-spark model (DREAM_ENGINE.md §11.9 Q1):
        //   "connection" — small, rate-gated, fires when physics sees a
        //                  proximity pair queue for harvesting.
        //   "idea"       — bright, forced (bypasses rate gate), fires
        //                  when the model returns a real candidate for
        //                  that pair. Always visible so the user never
        //                  misses the "a thought just landed" moment.
        if (!sparks || !midpoint) return;
        if (kind === "idea") {
          sparks.emit(midpoint[0], midpoint[1], midpoint[2], {
            size: SIZE_IDEA,
            force: true,
          });
        } else {
          sparks.emit(midpoint[0], midpoint[1], midpoint[2], {
            size: SIZE_CONNECTION,
          });
        }
      },
      onSurface: (candidate) => {
        // Toast-level confirmation is too loud for an overnight dream;
        // the pill in the top-right is the wake-time indicator. Dream-time
        // surfaces reach the morning report via salienceLayer.getSurfaced().
        updateNoticedPill();
      },
      onChange: () => {
        updateNoticedPill();
        if (ideasDrawer?.isOpen()) ideasDrawer.refresh();
      },
    });

    if (unsubscribeLabels) unsubscribeLabels();
    const hoverOrbit = createHoverOrbit({ scene, bodies, vault, renderer });
    labels = createLabels({
      vault,
      bodies,
      camera,
      getMode: () => settings.label_mode || "always",
      getHoveredId: () => hover?.getHoveredId?.() || null,
      onLabelHover: (id) => {
        if (bodies) bodies.setLabelHover?.(id);
        hoverOrbit.setTarget(id);
      },
      onLabelClick: (id) => openNote(id),
    });
    unsubscribeLabels = onFrame((dt, t) => {
      labels.update();
      hoverOrbit.update(dt, t);
    });

    if (unsubscribePhysics) unsubscribePhysics();
    unsubscribePhysics = onFrame((dt) => physics.step(dt));

    if (unsubscribeTethers) unsubscribeTethers();
    unsubscribeTethers = onFrame((dt, t) => tethers.update(dt, t));

    applyHomeView();
    updateStatsHud();
    if (stateDirty) persistState();
    console.log(`[bz] ready in ${Math.round(performance.now() - t0)}ms`);

    // Onboarding hooks — after the universe is visible, teach one gesture.
    setTimeout(() => {
      coachmarks.schedule("click-to-open");
    }, 1200);

    // Tag-prompt: fires on first workspace load per user, and only if the
    // mapping doesn't already cover most of the vault.
    maybeShowTagPrompt();

    // Brief: "where you are" panel. Shown ~300ms after the canvas has
    // rendered so it doesn't compete with the vault scan animation, and
    // only when the tag prompt isn't about to take the screen.
    setTimeout(() => {
      if (settings.brief_on_open !== false && !tagPromptActive) {
        brief.show();
      }
    }, 300);

    // Soft-toast if the prune list has grown since the user last ran Weed.
    // Deferred so it doesn't compete with onboarding coachmarks or the tag
    // prompt for attention.
    setTimeout(() => {
      checkWeedGrowth();
    }, 3500);
  } catch (err) {
    console.error("[bz] workspace load failed:", err);
    toast(err.message ?? "Could not read workspace.");
    statsHud.textContent = "load failed";
  }
}

// Fire the tag→kind prompt if the user hasn't seen it yet and coverage is
// below threshold. `{ force: true }` re-shows even if dismissed.
function maybeShowTagPrompt({ force = false } = {}) {
  if (!vault) return;
  if (tagPromptActive) return;
  const seen = localStorage.getItem(TAG_PROMPT_KEY) === "1";
  if (seen && !force) return;
  const cov = computeTagCoverage(vault, settings);
  if (!force && cov.fraction >= 0.8) {
    localStorage.setItem(TAG_PROMPT_KEY, "1");
    return;
  }
  tagPromptActive = true;
  showTagPrompt({
    vault,
    settings,
    onApply: (patch, added) => {
      tagPromptActive = false;
      localStorage.setItem(TAG_PROMPT_KEY, "1");
      handleSettingsChange({ tag_to_kind: patch });
      if (added > 0)
        toast(
          `Mapped ${added} tag${added === 1 ? "" : "s"} — colours updated.`,
          { duration: 2400 },
        );
    },
    onDismiss: () => {
      tagPromptActive = false;
      localStorage.setItem(TAG_PROMPT_KEY, "1");
    },
  });
}

function applyHomeView() {
  const mode = settings.home_view || "last_focused";
  if (mode === "overview") {
    frameOnContents();
    return;
  }
  if (mode === "daily") {
    const today = findTodayDaily();
    if (today) {
      openNote(today.id, { mode: "read", skipFocusSnapshot: true });
      return;
    }
  }
  if (lastFocusedId && vault.byId.has(lastFocusedId)) {
    openNote(lastFocusedId, { mode: "read", skipFocusSnapshot: true });
    return;
  }
  frameOnContents();
}

function findTodayDaily() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const target = `${y}-${m}-${d}`;
  for (const n of vault.notes) {
    if (n.isDaily && n.name.replace(/\.md$/i, "") === target) return n;
  }
  return null;
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

// ── Save pipeline ───────────────────────────────────────────
async function handleSave(note, rawText) {
  if (!saver) throw new Error("no saver — workspace not open");
  const result = await saver(note, rawText);
  // Edits may have changed outgoing links. Rebuild physics + tethers.
  if (physics) physics.rebuildEdges();
  if (tethers) tethers.rebuild();
  // First successful edit in the app's lifetime unlocks the next coachmark.
  coachmarks.markSeen("cmd-n");
  coachmarks.schedule("alt-drag");
  return result;
}

function handleNoteChanged(note, { renameResult }) {
  if (bodies) {
    bodies.updateBody(note.id, { note });
    bodies.setPinned(note.id, !!(note.frontmatter && note.frontmatter.pinned));
  }
  if (physics) physics.refreshEdgesFor(note.id);
  // Tag or frontmatter.affinity may have changed — recompute the
  // affinity vector so the next salience scoring pass sees the new shape.
  note.affinity = affinityFor(note);
  stateDirty = true;
  persistStateSoon();

  if (search?.invalidate) search.invalidate();
  updateStatsHud();

  if (renameResult?.renamed && renameResult.linkPatches > 0) {
    toast(
      `Renamed → ${renameResult.newPath} · ${renameResult.linkPatches} link${renameResult.linkPatches === 1 ? "" : "s"} updated`,
      { duration: 3500 },
    );
  }
}

// State persistence is batched — a rapid burst of edits shouldn't thrash
// the .universe/state.json file.
let persistTimer = 0;
function persistStateSoon() {
  if (!workspaceHandle) return;
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    persistState();
  }, 600);
}

function persistState() {
  if (!workspaceHandle || !vault || !bodies) return;
  const positions = {};
  for (const n of vault.notes) {
    const p = bodies.positionOf(n.id);
    if (p) positions[n.id] = [p[0], p[1], p[2]];
  }
  const state = {
    positions,
    lastFocused: lastFocusedId,
    kmatrix: kmatrix ? kmatrix.serialize() : null,
    savedAt: Date.now(),
  };
  saveState(workspaceHandle, state).catch(() => {});
  stateDirty = false;
}

// ── N: new note ─────────────────────────────────────────────
function createNewNote() {
  if (!vault || !saver) {
    toast("Open a workspace first.");
    return;
  }
  if (!bodies) return;

  const taken = new Set(vault.notes.map((n) => n.path));
  const path = uniquePath("", titleToStem("Untitled"), taken);
  const note = makeEmptyNote({ path, title: "Untitled", settings });
  const seed = "# Untitled\n\n";
  note.body = seed;
  note.rawText = seed;

  addNoteToVault(vault, note);

  const worldPos = pickNewNodeWorldPos();
  bodies.addBody(note, worldPos);
  if (physics) physics.rebuildEdges();
  if (tethers) tethers.rebuild();
  stateDirty = true;
  persistStateSoon();

  if (search?.invalidate) search.invalidate();
  updateStatsHud();

  notePanel.open(note, { mode: "edit" });
  focusCamera(worldPos);

  // Once the user has made one note, the "cmd-n" hint is moot.
  coachmarks.markSeen("cmd-n");
}

function pickNewNodeWorldPos() {
  const t = controls.target;
  const r = 40 + Math.random() * 40;
  const a = Math.random() * Math.PI * 2;
  const z = (Math.random() - 0.5) * 30;
  return [t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, t.z + z];
}

// ── Link create / delete ────────────────────────────────────
async function createLink(srcId, dstId) {
  if (!vault || !saver) return;
  const src = vault.byId.get(srcId);
  const dst = vault.byId.get(dstId);
  if (!src || !dst) return;

  if (vault.forward.get(src.id)?.has(dst.id)) {
    toast("Already linked.", { duration: 1500 });
    return;
  }

  const plan = planLinkCreate(src, dst, vault);
  if (!plan) return;

  try {
    await saver(src, plan.text);
    if (kmatrix) kmatrix.onLink(src.kind || 0, dst.kind || 0);
    if (physics) {
      physics.rebuildEdges();
      physics.kickTogether(src.id, dst.id, 220);
    }
    if (tethers) tethers.rebuild();
    stateDirty = true;
    persistStateSoon();

    coachmarks.markSeen("alt-drag");
    coachmarks.schedule("right-click");
  } catch (err) {
    console.error("[bz] link create failed", err);
    toast("Could not create link.");
  }
}

async function deleteLink(aId, bId) {
  if (!vault || !saver) return;
  const a = vault.byId.get(aId);
  const b = vault.byId.get(bId);
  if (!a || !b) return;

  const forward = vault.forward;
  const sides = [];
  if (forward.get(a.id)?.has(b.id)) sides.push([a, b]);
  if (forward.get(b.id)?.has(a.id)) sides.push([b, a]);
  if (sides.length === 0) return;

  // Remember which directions existed so Undo can restore them exactly.
  const restore = sides.map(([src, dst]) => ({ srcId: src.id, dstId: dst.id }));

  if (settings.confirm_unlink) {
    toast.actions(
      `Unlink ${a.title} ↮ ${b.title}?`,
      [
        {
          label: "Cancel",
          onClick: () => {},
        },
        {
          label: "Unlink",
          kind: "primary",
          onClick: () => performDelete(a, b, sides, restore),
        },
      ],
      { duration: 8000 },
    );
    return;
  }
  performDelete(a, b, sides, restore);
}

async function performDelete(a, b, sides, restore) {
  try {
    for (const [src, dst] of sides) {
      const plan = planLinkDelete(src, dst);
      if (!plan) continue;
      await saver(src, plan.text);
    }
    if (kmatrix) kmatrix.onUnlink(a.kind || 0, b.kind || 0);
    if (physics) physics.rebuildEdges();
    if (tethers) tethers.rebuild();
    if (physics) physics.kickApart(a.id, b.id, 60);
    stateDirty = true;
    persistStateSoon();
    coachmarks.markSeen("right-click");

    // Undo toast — recreates the link in the same direction(s) as before.
    toast.actions(
      `Unlinked ${a.title} ↮ ${b.title}`,
      [
        {
          label: "Undo",
          kind: "primary",
          onClick: () => undoUnlink(restore),
        },
      ],
      { duration: 10000 },
    );
  } catch (err) {
    console.error("[bz] link delete failed", err);
    toast("Could not delete link.");
  }
}

async function undoUnlink(restore) {
  if (!vault || !saver) return;
  try {
    for (const { srcId, dstId } of restore) {
      const src = vault.byId.get(srcId);
      const dst = vault.byId.get(dstId);
      if (!src || !dst) continue;
      // createLink handles the "already linked" guard + kmatrix + kick +
      // physics/tether rebuild.
      await createLink(srcId, dstId);
    }
  } catch (err) {
    console.error("[bz] undo unlink failed", err);
    toast("Could not restore link.");
  }
}

// ── Pin toggle ──────────────────────────────────────────────
async function handleTogglePin(note, nextPinned) {
  if (!saver) return;
  const fm = { ...(note.frontmatter || {}) };
  fm.id = fm.id || note.id;
  if (!fm.created)
    fm.created = new Date(note.mtime || Date.now()).toISOString();
  if (nextPinned) {
    fm.pinned = true;
    const p = bodies && bodies.positionOf(note.id);
    if (p) fm.position = [round(p[0]), round(p[1]), round(p[2])];
  } else {
    delete fm.pinned;
    delete fm.position;
  }
  const nextText = stringifyFrontmatter(fm, note.body);
  try {
    await saver(note, nextText);
    if (bodies) bodies.setPinned(note.id, nextPinned);
    toast(nextPinned ? "Pinned" : "Unpinned", { duration: 1500 });
    coachmarks.markSeen("pin");
  } catch (err) {
    console.error("[bz] pin toggle failed", err);
    toast("Could not update pin.");
  }
}

function round(v) {
  return Math.round(v * 100) / 100;
}

// ── Note open / navigate ────────────────────────────────────
function openNote(noteId, { mode = "read", skipFocusSnapshot = false } = {}) {
  const note = vault?.byId.get(noteId);
  if (!note) return;
  bodies.setSelected(noteId);
  const pos = bodies.positionOf(noteId);
  if (pos) {
    if (skipFocusSnapshot) {
      snapCameraTo(pos);
    } else {
      focusCamera(pos);
    }
  }
  notePanel.open(note, { mode });
  lastFocusedId = noteId;
  stateDirty = true;
  persistStateSoon();

  // Parent-engagement nudge for the salience layer — opening a parent
  // bumps its children's freshness so they don't age out behind the
  // user's actual reading.
  salienceLayer?.touchParent?.(noteId);

  // First time the user clicks a star, unlock the next gesture.
  if (!skipFocusSnapshot) {
    coachmarks.markSeen("click-to-open");
    coachmarks.schedule("cmd-n");
  }
}

function focusNote(noteId) {
  openNote(noteId);
}

// ── Camera tween ────────────────────────────────────────────
let camSnapshot = null;
let camTween = null;
const TMP_OFFSET = new THREE.Vector3();

function focusCamera(worldPos) {
  if (!worldPos) return;
  const target = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
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

function snapCameraTo(worldPos) {
  const target = new THREE.Vector3(worldPos[0], worldPos[1], worldPos[2]);
  TMP_OFFSET.subVectors(camera.position, controls.target);
  const dist = Math.max(160, Math.min(420, TMP_OFFSET.length()));
  TMP_OFFSET.normalize().multiplyScalar(dist);
  camera.position.copy(target.clone().add(TMP_OFFSET));
  controls.target.copy(target);
  controls.update();
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
    controls.enabled = !(linkDrag && linkDrag.isActive);
  }
});

// K-matrix homeostasis: pull entries gently toward 1.0 each second. Runs
// on the render loop but is throttled so it doesn't dominate the frame.
let lastHomeo = 0;
onFrame((dt, t) => {
  if (!kmatrix) return;
  if (t - lastHomeo < 1.0) return;
  lastHomeo = t;
  kmatrix.homeostasis();
});

// Camera auto-orbit while dreaming. Slow yaw around the current target
// when depth > 0.2, no user tween active, no panel open — i.e. no one is
// looking but the mode. See DREAM.md §1 "Camera: auto-orbit + drift".
const _dreamOrbit = new THREE.Vector3();
onFrame((dt) => {
  if (!dream) return;
  const depth = dream.getDepth();
  if (depth < 0.2) return;
  if (camTween) return;
  if (notePanel.isOpen()) return;
  if (linkDrag && linkDrag.isActive) return;
  // Rotate camera position around controls.target, on the Y axis.
  const yaw = 0.035 * depth * dt;
  _dreamOrbit.copy(camera.position).sub(controls.target);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const x = _dreamOrbit.x * cos - _dreamOrbit.z * sin;
  const z = _dreamOrbit.x * sin + _dreamOrbit.z * cos;
  _dreamOrbit.x = x;
  _dreamOrbit.z = z;
  camera.position.copy(controls.target).add(_dreamOrbit);
  controls.update();
});

controls.addEventListener("change", () => {
  if (!notePanel.isOpen() && !camTween) camSnapshot = null;
});

// ── Ambience ────────────────────────────────────────────────
// Cross-fade the user's wake preset toward the `dream` preset as sleep
// depth rises. The fade starts at depth 0.1 and saturates at 0.8 so a
// shallow nap doesn't wash out the wake look, and deep dream gets the
// full overcranked vibe. See AMBIENCE.md §4.3.
function updateAmbience() {
  const wakeId = settings.ambience_wake || "default";
  const wake = getAmbiencePreset(wakeId);
  const depth = dream ? dream.getDepth() : 0;
  // Steeper early ramp so DREAM_ENGINE.md §11.9 Phase 1 (depth 0.1–0.3)
  // produces a visible dusk rather than a subtle one. Phase 1 ends at
  // depth ~0.3; the blend reaches ~0.45 there so the user sees cool
  // temperature, soft vignette, higher bloom — the "drifting off" mood.
  const t = Math.max(0, Math.min(1, (depth - 0.05) / 0.55));
  const preset = t <= 0 ? wake : mixAmbience(wake, AMBIENCE_PRESETS.dream, t);
  const intensity =
    typeof settings.ambience_intensity === "number"
      ? settings.ambience_intensity
      : 1;
  applyAmbience(preset, intensity);
  if (bodies && typeof bodies.setDensityBoost === "function")
    bodies.setDensityBoost(preset.densityBoost ?? 1.0);
}
updateAmbience();
onFrame(() => updateAmbience());

// ── Settings changes ────────────────────────────────────────
function handleSettingsChange(patch) {
  Object.assign(settings, patch);
  saveSettings(settings);
  if (patch.accent) applyAccent(patch.accent);
  if ("ambience_wake" in patch || "ambience_intensity" in patch)
    updateAmbience();
  if (patch.tag_to_kind || patch.kind_labels) {
    if (vault) recomputeAllKinds(vault, settings);
    if (bodies) bodies.refreshAllKinds();
    const cur = notePanel.getCurrent();
    if (cur) notePanel.refreshIfOpen(cur);
  }
  if (patch.folder_tints !== undefined) {
    if (bodies) bodies.refreshAllFolderTints();
  }
  if (patch.observer_chorus !== undefined && chorus) {
    chorus.setEnabled(!!patch.observer_chorus);
  }
  if ("utterance_backend" in patch) {
    applyUtteranceBackendSetting(patch.utterance_backend);
  }
  // folder_influence, chorus_density and chorus_font_size are read live via
  // their respective getters — no refresh call needed.
}

// ── Global hotkeys ──────────────────────────────────────────
// Plain single letters (no Ctrl/Cmd) are used for app actions because
// Chromium's window/tab/bookmark shortcuts (Ctrl+N, Ctrl+D, Ctrl+T, Ctrl+W)
// can't be intercepted with preventDefault. The isEditable guard below
// keeps these letters from firing while the user is typing.
window.addEventListener("keydown", (e) => {
  const isEditable =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    (e.target && e.target.closest && e.target.closest(".cm-editor"));

  // Cmd/Ctrl+K stays — the browser doesn't claim it at the keydown layer.
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    coachmarks.markSeen("cmd-k");
  }

  if (isEditable) return;
  // Ignore if any modifier is held — leaves browser shortcuts alone.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    createNewNote();
    return;
  }

  if (e.key === "d" || e.key === "D") {
    e.preventDefault();
    if (!vault) {
      toast("Open a workspace first.");
      return;
    }
    if (e.shiftKey) {
      // Shift+D = Dream now. Ramps to 1.0 for 60s, then auto-wakes and
      // produces a morning report.
      if (dream) {
        dream.dreamNow();
        toast("Dreaming — move the mouse to wake up early.", {
          duration: 2500,
        });
      }
    } else {
      showMorningReport({
        vault,
        bodies,
        settings,
        chorus,
        salienceLayer,
        onOpenIdeas: () => ideasDrawer?.open(),
      });
    }
    return;
  }

  if (e.key === "\\") {
    coachmarks.markSeen("settings-slash");
  }

  if (e.key === "e" || e.key === "E") {
    if (notePanel.isOpen()) {
      e.preventDefault();
      notePanel.toggleMode();
    }
  }

  if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    ideasDrawer?.toggle();
    updateNoticedPill();
  }

  // T — symmetric with W. Open drawer with fresh Tend scan if closed
  // and empty; close if open; toggle if closed-with-content. Runs a
  // real scan (rank + polish) when opening from empty so the user
  // doesn't have to go through Settings for the common case.
  if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    if (tendDrawer.isOpen()) {
      tendDrawer.close();
    } else if (tendDrawer.count() > 0) {
      // Content already loaded from a prior run — just reveal it.
      tendDrawer.open();
      if (ideasDrawer?.isOpen?.()) ideasDrawer.close?.();
      if (weedDrawer?.isOpen?.()) weedDrawer.close?.();
    } else {
      // Empty drawer — kick a fresh Tend run. The function closes
      // the other drawers itself when it opens ours.
      runTendAndOpen().catch((err) => {
        console.warn("[bz] tend hotkey run failed", err);
      });
    }
  }

  // W toggles the weed drawer. Unlike T, opening always triggers a
  // fresh load of prune-candidates.json so the list reflects the most
  // recent dream pass.
  if (e.key === "w" || e.key === "W") {
    e.preventDefault();
    if (weedDrawer.isOpen()) weedDrawer.close();
    else openWeed();
  }

  // Shift+S opens the salience debug palette. Capture only when Shift is
  // the ONLY modifier — leaves Cmd+Shift+S / Alt+Shift+S alone for the
  // browser.
  if (
    e.shiftKey &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    e.code === "KeyS"
  ) {
    e.preventDefault();
    salienceDebug.toggle();
  }

  if (e.key === "l" || e.key === "L") {
    e.preventDefault();
    const order = ["always", "hover", "never"];
    const cur = settings.label_mode || "always";
    const next = order[(order.indexOf(cur) + 1) % order.length] || "always";
    const labelFor = {
      always: "Labels: always",
      hover: "Labels: on hover",
      never: "Labels: off",
    };
    handleSettingsChange({ label_mode: next });
    toast(labelFor[next], { duration: 1400 });
  }
});

// ── Accent ──────────────────────────────────────────────────
function applyAccent(hex) {
  document.documentElement.style.setProperty("--accent", hex);
  if (bodies) bodies.updateAccent(hex);
  if (tethers) tethers.updateAccent(hex);
  if (sparks) sparks.updateAccent(hex);
  if (linkDrag) linkDrag.updateAccent(hex);
}

// ── Sleep HUD ───────────────────────────────────────────────
// The br-corner "◐" glyph advertises sleep depth. At depth 0 it's muted;
// as depth rises it fills to a solid disc and tints toward the accent.
const sleepHud = document.getElementById("sleep-hud");
function updateSleepHud(depth = 0) {
  // Feed depth to the face HUD so it can drift to "sleeping" at high
  // depth. Cheap even when sleepHud isn't wired yet.
  if (modelFace) modelFace.setSleepDepth(depth);
  if (!sleepHud) return;
  const d = Math.max(0, Math.min(1, depth));
  const glyphs = ["◐", "◓", "◑", "◒", "●"];
  const idx = Math.min(glyphs.length - 1, Math.floor(d * glyphs.length));
  sleepHud.textContent = glyphs[idx];
  sleepHud.title =
    d < 0.02
      ? "Awake"
      : `Sleep depth ${d.toFixed(2)} · ${dream?.getState?.() || ""}`;
  sleepHud.style.color =
    d < 0.02 ? "" : `rgba(138, 180, 255, ${0.45 + d * 0.55})`;
}

// ── Dream log ───────────────────────────────────────────────
// "Load full dream" action from the morning report — resolves the dream
// path to an actual note record and opens the panel.
function openDreamLog(path) {
  if (!vault || !path) return;
  for (const n of vault.notes) {
    if (n.path === path) {
      openNote(n.id);
      return;
    }
  }
  toast(`Dream log not yet indexed: ${path}`, { duration: 3000 });
}

window.addEventListener("beforeunload", () => {
  saveSettings(settings);
  if (notePanel.isDirty()) notePanel.flushSave();
  if (stateDirty) persistState();
});

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
    get physics() {
      return physics;
    },
    get tethers() {
      return tethers;
    },
    get kmatrix() {
      return kmatrix;
    },
    get chorus() {
      return chorus;
    },
    get captions() {
      return captions;
    },
    get dream() {
      return dream;
    },
    get salienceLayer() {
      return salienceLayer;
    },
    get salienceParams() {
      return salienceParams;
    },
    get ideasDrawer() {
      return ideasDrawer;
    },
    tendDrawer,
    runTend: (enabled) => {
      if (!vault) return { proposals: [] };
      const result = runTendPasses(vault, {
        enabled: enabled || undefined,
      });
      tendDrawer.setProposals(result.proposals);
      if (result.proposals.length > 0) tendDrawer.open();
      return result;
    },
    weedDrawer,
    openWeed,
    get weedKeep() {
      return weedKeepState;
    },
    brief,
    showBrief: () => brief.show(),
    utterance,
    utteranceStatus: () => utterance.status(),
    modelFace,
    get sparks() {
      return sparks;
    },
    dreamNow: () => dream && dream.dreamNow(),
    camera,
    controls,
    scene,
    notePanel,
    coachmarks,
    createNewNote,
    createLink,
    deleteLink,
    showMorningReport: () => showMorningReport({ vault, bodies, settings }),
    showTagPrompt: () => maybeShowTagPrompt({ force: true }),
    showAbout,
    resetDemoWorkspace,
    debug: {
      // Getter/setter so `__boltzsidian.debug.showPickRadii = true` just
      // works in the devtools console.
      get showPickRadii() {
        return pickDebug.isEnabled();
      },
      set showPickRadii(v) {
        pickDebug.set(v);
      },
      togglePickRadii: () => pickDebug.toggle(),
      // Live-tunable params. Modify on the live object:
      //   __boltzsidian.debug.pick.radiusScale = 2
      //   __boltzsidian.debug.pick.offsetX = -12
      //   __boltzsidian.debug.pick.offsetY = 4
      //   __boltzsidian.debug.pick.extraTolerance = 30
      pick: pickOverrides,
    },
  };
}
