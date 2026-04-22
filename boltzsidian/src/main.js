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
import {
  TIERS as RENDER_TIERS,
  DEFAULT_TIER as DEFAULT_RENDER_TIER,
} from "./sim/render-quality.js";
import { createQualityMonitor } from "./sim/quality-monitor.js";
import { createQualityHud } from "./ui/quality-hud.js";
import { createBodies } from "./sim/bodies.js";
import { layoutNotes } from "./sim/layout.js";
import { computeLocalDensity, recomputeCentroidsLive } from "./sim/clusters.js";
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
import { collectProjectShapes } from "./sim/star-charts.js";
import { createLabels } from "./ui/labels.js";
import { createConstellations, saveClusterName } from "./ui/constellations.js";
import { createBatchLinkPicker } from "./ui/batch-link-picker.js";
import { createKeywordLinkPicker } from "./ui/keyword-link-picker.js";
import { createWeavePicker } from "./ui/weave-picker.js";
import { scanWeave } from "./layers/weave.js";
import { createPickDebug } from "./ui/pick-debug.js";
import { createSearch } from "./ui/search.js";
import { createLinkDrag } from "./ui/link-drag.js";
import { openVault } from "./vault/vault.js";
import {
  parseManifest,
  serializeManifest,
  synthesizeSingleRootManifest,
  loadManifestFromHandle,
  saveManifestToHandle,
  DEFAULT_EXCLUDES,
} from "./vault/manifest.js";
import {
  saveRootHandle,
  loadRootHandle,
  deleteRootHandle,
} from "./vault/handle-store.js";
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
import { parseFrontmatter, stringifyFrontmatter } from "./vault/frontmatter.js";
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
import { createFilterBar } from "./ui/filter-bar.js";
import { assignTints } from "./vault/folders.js";
import { createChorus } from "./layers/chorus.js";
import { createCaptions } from "./ui/captions.js";
import { createHover } from "./ui/hover.js";
import { createDream } from "./layers/dream.js";
import {
  resolveThemeSet,
  themeCentroid,
  MIN_THEME_SIZE,
} from "./layers/dream-theme.js";
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
// MULTI_PROJECT_PLAN.md Phase 5: roots that appeared in workspace.json
// but couldn't be reconstituted at boot (permission denied, user
// skipped the pick). Surfaced in the Settings pane as "re-grant
// needed" entries. Cleared on successful re-grant.
let droppedRoots = [];
let vault = null;

// MULTI_PROJECT_PLAN.md Phase 3 — resolution helpers used across
// every writer call site in this file.
//
// getWriteHandle() — for Boltzsidian's own artifacts: ideas/, the
// .universe/ sidecar family (state, prune candidates, dream logs,
// weed keep-list). Always lands in the writeRoot. Single-root users
// have writeRoot === sole root, so this is a clean alias of the old
// workspaceHandle reference.
//
// getSourceRoot(noteId) — for writes back to an EXISTING note (tend
// stamps, panel saves, weed archive/delete). Returns the RootSpec
// the note was read from. Caller gates on root.readOnly.
//
// These helpers exist so Phase-5's manifest-driven pick flow can
// swap the source-of-truth for the writeRoot without rippling through
// every call site.
function getWriteHandle() {
  const fromVault = vault?.getWriteRoot?.()?.handle;
  return fromVault || workspaceHandle;
}
function getSourceRoot(noteId) {
  return vault?.getRootForNote?.(noteId) || null;
}
let bodies = null;
let labels = null;
let constellations = null;
let batchLinkPicker = null;
let keywordLinkPicker = null;
let weavePicker = null;
// Hoisted so openNote() can promote the open note's body into its
// orange "orrery" state (orbiting planets), not just label-hover.
let hoverOrbit = null;
let activeNoteId = null;
// DREAM_GRAVITY.md preview — while this timestamp is in the future,
// physics callbacks below report "dreaming · playing" so the
// attractor runs at full strength even though the dream controller
// isn't actually in a cycle.
let previewUntil = 0;
// TEND_BULK_CRASH — flipped during a tend bulk-accept so background
// work (polish pipeline, salience scanner) suspends itself and
// leaves the main thread free for the write + reparse cascade.
let isBulkInProgress = false;
// DREAM_THEMES.md Phase C — cached theme anchor (centroid + extent)
// recomputed alongside the live cluster centroids every ~30 frames.
// Null when no theme is set OR the theme is too small (< MIN_THEME_SIZE).
let themeAnchorCache = null;
// STAR_CHARTS.md first cut — cache of project-hub shapes read by
// physics. Rebuilt on vault reload and refreshed on the same tick
// that recomputes cluster centroids.
let projectShapesCache = [];
// DREAM_THEMES.md Phase D — cached theme Set<noteId> used by the
// salience layer for pair-sampling bias. Refreshed on the same tick
// as the anchor. Null when no theme is set.
let themeSetCache = null;
let physics = null;
let tethers = null;
let sparks = null;
let linkDrag = null;
let kmatrix = null;
let formations = null;
let formationsRail = null;
let filterBar = null;
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
let unsubscribeConstellations = null;
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

// Suppress coachmarks while the user is exploring the `welcome` demo —
// its notes already teach every gesture the coachmarks would point at.
const coachmarks = createCoachmarks({
  isSuppressed: () =>
    workspaceKind === "demo" && getDemoTheme && getDemoTheme() === "welcome",
});

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
const {
  scene,
  camera,
  controls,
  renderer,
  onFrame,
  applyAmbience,
  setQuality: setRenderQuality,
} = createRenderer(canvas);

// RENDER_QUALITY.md Phase A/C — direct tier application. Named
// tier → dispatched to every wired subsystem. Called from the
// monitor on tier transitions and from setWorkspace after new
// subsystems come online.
function applyRenderTier(name) {
  const tier = RENDER_TIERS[name] || RENDER_TIERS[DEFAULT_RENDER_TIER];
  if (setRenderQuality) setRenderQuality(tier);
  if (labels?.setQuality) labels.setQuality(tier);
  if (constellations?.setQuality) constellations.setQuality(tier);
  if (tethers?.setQuality) tethers.setQuality(tier);
  if (sparks?.setQuality) sparks.setQuality(tier);
  if (physics?.setQuality) physics.setQuality(tier);
}

// RENDER_QUALITY.md Phase C — auto-throttle monitor. Owns the
// "effective tier" state and fires onTierChange only when a
// transition actually happens. We subscribe to onFrame below so
// the monitor sees every frame's dt.
const qualityMonitor = createQualityMonitor({
  onTierChange: (name) => applyRenderTier(name),
});
qualityMonitor.setCeiling(
  settings.render_quality_ceiling || DEFAULT_RENDER_TIER,
);
qualityMonitor.setEnabled(settings.render_quality_auto !== false);
// Initial explicit apply — monitor's initial currentTier equals
// ceiling, which is the SAME value setCeiling just sent it, so
// setCeiling doesn't fire onTierChange on its own. Apply once
// here so renderer + post pick up the tier at boot.
applyRenderTier(qualityMonitor.getCurrentTier());
onFrame((dt) => qualityMonitor.tick(dt));

// RENDER_QUALITY.md Phase D — quiet HUD pill that surfaces when the
// monitor has dropped below the user's ceiling. Hidden when
// effective === ceiling so the UI stays silent in the common case.
createQualityHud({ qualityMonitor });

// Keep a small wrapper so old call sites (and the Phase-D HUD pill)
// can ask "re-apply whatever the current effective tier is" without
// knowing whether it's come from the ceiling or the monitor's
// throttle logic.
function applyCurrentRenderQuality() {
  applyRenderTier(qualityMonitor.getCurrentTier());
}

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

// Face "hone in" — when a note is open, aim the observer face's pupils
// at the focused body's screen-space projection. Falls back to cursor
// tracking (handled inside model-face.js) when no note is active.
// Throttled to ~6 Hz so the pupils drift rather than snap every frame.
const _faceLookTmp = new THREE.Vector3();
let _faceLookNext = 0;
onFrame(() => {
  const now = performance.now();
  if (now < _faceLookNext) return;
  _faceLookNext = now + 160;
  if (!activeNoteId || !bodies) return;
  const p = bodies.positionOf?.(activeNoteId);
  if (!p) return;
  _faceLookTmp.set(p[0], p[1], p[2]).project(camera);
  if (_faceLookTmp.z >= 1) return;
  const sx = (_faceLookTmp.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (1 - (_faceLookTmp.y * 0.5 + 0.5)) * window.innerHeight;
  modelFace.lookAt(sx, sy);
});

// ── HUD elements ────────────────────────────────────────────
const workspaceNameEl = document.getElementById("workspace-name");
const pickPane = document.getElementById("pick-pane");
const pickButton = document.getElementById("pick-button");
const demoButton = document.getElementById("demo-button");
const aboutLink = document.getElementById("about-link");
const progressEl = document.getElementById("welcome-progress");
const statsHud = document.getElementById("stats-hud");
// Sleep-depth HUD glyph at bottom-right. Declared up here (rather than
// next to its updateSleepHud consumer lower in the file) because
// setWorkspace / dream onDepthChange can fire before the latter block
// evaluates on some restore paths, which triggers TDZ on the const.
const sleepHud = document.getElementById("sleep-hud");

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
  onDreamPreview: () => {
    if (!dream) {
      toast("Open a workspace first.");
      return;
    }
    // DREAM_GRAVITY.md visual-tuning aid: force the attractor to
    // peak-strength conditions for 30s without waiting through
    // falling + warming. `previewUntil` is read by the physics
    // phase/state getters below; while it's in the future, they
    // lie to physics and say "state=dreaming, phase=playing" so
    // the weight table returns 1.0.
    dream.setManualDepth(0.85);
    previewUntil = performance.now() + 30_000;
    toast("Previewing dream gravity for 30s — peak strength.", {
      duration: 2500,
    });
    window.setTimeout(() => {
      if (performance.now() >= previewUntil) {
        dream.setManualDepth(0);
      }
    }, 30_500);
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
    const wh = getWriteHandle();
    if (wh) await saveWeedKeep(wh, weedKeepState);
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
  // Phase 5: workspace roots panel — show connected + dropped roots,
  // wire the re-grant button to the same single-root prompt used at
  // boot. A successful re-grant clears the dropped entry and reopens
  // the vault so the root's notes join the scene immediately.
  getWorkspaceRoots: () => ({
    roots: vault?.roots || [],
    writeRootId: vault?.writeRootId || null,
    dropped: droppedRoots.slice(),
  }),
  onReconnectRoot: async (dropped) => regrantDroppedRoot(dropped),
  onAddRoot: async () => addProjectRoot(),
  onRemoveRoot: async (rootId) => removeProjectRoot(rootId),
  onRescan: async () => {
    // beforeunload handles flushing any pending edits + persisting state.
    toast("Rescanning workspace — reloading…", { duration: 1500 });
    window.setTimeout(() => window.location.reload(), 400);
  },
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
    // Pass the polished proposal through so tendDrawer.refresh can
    // update ONLY that row's reason text, not rebuild the entire
    // list. TEND_BULK_CRASH.md — full rebuild on every polish was
    // the crash vector on large batches.
    onUpdate: (proposal) => {
      tendDrawer.refresh?.(proposal);
    },
    // Stop polishing during Fast-pace bulk accepts where every
    // main-thread microsecond matters. At Chill pace (default) the
    // 250 ms between accepts leaves ample room for polish to run
    // concurrently — which is the "no rush, LLM tempo" design from
    // TEND_STAMP_MISMATCH.md §7.5.
    getAborted: () => isBulkInProgress && settings.tend_bulk_pace === "fast",
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
    activeNoteId = null;
    if (hoverOrbit) hoverOrbit.setTarget(null);
    // The observer face slides back to its home side when no note is
    // open — CSS handles the swap via body.note-open.
    document.body.classList.remove("note-open");
    if (modelFace) modelFace.lookAt(null, null);
    returnCamera();
  },
  onNavigate: (noteId) => focusNote(noteId),
  onSave: handleSave,
  onTogglePin: handleTogglePin,
  onToggleProject: handleToggleProject,
  // WEAVE.md — open the picker on the current note. Starts with
  // the defaults (same-root on, no prefix); the user can toggle
  // scope from inside the modal.
  onWeave: (note) => {
    if (!weavePicker) return;
    weavePicker.open(note, null);
  },
  // Manual note deletion from the panel header. The panel's click
  // handler fires the native confirm(); by the time we're called the
  // user has already said yes. We reuse Weed's two-stage path:
  // deleteNoteFile removes the file on disk via FS Access removeEntry,
  // then removeNoteEverywhere scrubs vault indices + body pool + physics
  // edges + tethers and closes the panel if it was showing this note.
  onDelete: async (note) => {
    if (!note || !vault) return;
    // Phase 3C: delete lands on the note's SOURCE root — not
    // writeRoot — so the file actually disappears from its project.
    // Read-only projects reject the delete with a toast.
    const sourceRoot = getSourceRoot(note.id);
    if (!sourceRoot) {
      toast(`Can't delete: unknown root for this note.`);
      return;
    }
    if (sourceRoot.readOnly) {
      toast(
        `Can't delete — "${sourceRoot.name || sourceRoot.id}" is read-only.`,
        { duration: 3500 },
      );
      return;
    }
    const result = await deleteNoteFile(sourceRoot.handle, note.path);
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
  getVault: () => vault,
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

// TEND_BULK_CRASH.md §5C — coalesce physics/tether/kind rebuilds
// across a tick. During bulk accept, many proposals schedule a
// rebuild in quick succession; rAF-gating collapses them to one
// rebuild per animation frame (typically one per batch).
let _pendingGraphRebuild = false;
function scheduleGraphRebuild() {
  if (_pendingGraphRebuild) return;
  _pendingGraphRebuild = true;
  requestAnimationFrame(() => {
    _pendingGraphRebuild = false;
    if (physics) physics.rebuildEdges();
    if (tethers) tethers.rebuild();
  });
}
let _pendingKindRefresh = false;
function scheduleKindRefresh() {
  if (_pendingKindRefresh) return;
  _pendingKindRefresh = true;
  requestAnimationFrame(() => {
    _pendingKindRefresh = false;
    if (bodies) bodies.refreshAllKinds?.();
  });
}

// Tend drawer — janitorial proposals from the Tend scanner. One shared
// instance; proposals are passed in as a snapshot per Tend run.
const tendDrawer = createTendDrawer({
  onAccept: async (proposal) => {
    if (!vault || !saver) return;
    // MULTI_PROJECT_PLAN.md Phase 3D — preempt accepts that would land on
    // a read-only root. Saver would decline anyway, but the proposal also
    // stamps `tended_on` which we don't want to lose to a silent skip.
    const sourceRoot = getSourceRoot(proposal.noteId);
    if (sourceRoot?.readOnly) {
      toast(
        `Can't tend — "${sourceRoot.name || sourceRoot.id}" is read-only.`,
        { duration: 3500 },
      );
      return;
    }
    const result = await applyProposal({ proposal, vault, saver });
    // TEND_BULK_CRASH.md §5B — only rebuild physics/tethers for
    // passes that actually change the link graph, and only refresh
    // kinds for passes that change tags. Previously we ran all
    // three on every accept; for a bulk batch mostly composed of
    // fm-normalise / stub / title-collision proposals that's pure
    // wasted work compounding the DOM churn on §5A's hot path.
    if (result?.applied) {
      const pass = proposal.pass;
      // TEND_BULK_CRASH.md §5C — coalesce rebuilds. During a bulk
      // accept the loop awaits an FS write between proposals, so
      // many accepts schedule in rapid succession. Using rAF-gated
      // schedulers means multiple schedule calls collapse to ONE
      // rebuild per frame regardless of how many accepts fired.
      if (pass === TEND_PASSES.OBVIOUS_LINK) {
        scheduleGraphRebuild();
      }
      if (pass === TEND_PASSES.TAG_INFER) {
        scheduleKindRefresh();
      }
    }
  },
  onReject: async (proposal) => {
    if (!vault || !saver) return;
    // Reject stamps `rejected:` into tended_on — still a write, so
    // read-only roots get the same preempt as accept.
    const sourceRoot = getSourceRoot(proposal.noteId);
    if (sourceRoot?.readOnly) {
      toast(
        `Can't tend — "${sourceRoot.name || sourceRoot.id}" is read-only.`,
        { duration: 3500 },
      );
      return;
    }
    await rejectProposal({ proposal, vault, saver });
  },
  onOpenNote: (noteId) => openNote(noteId),
  onBulkStart: () => {
    // Suspend polish + salience so the bulk write loop has the
    // main thread to itself. The flag is checked by polish's
    // getAborted and salience's getPaused callbacks below.
    // TEND_STAMP_MISMATCH.md §7.5 — only meaningful at Fast pace;
    // at Chill pace the bulk yields long enough (250 ms) that
    // polish can run concurrently without competing.
    isBulkInProgress = true;
  },
  onBulkEnd: () => {
    isBulkInProgress = false;
  },
  getBulkPace: () => settings.tend_bulk_pace || "chill",
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
    const wh = getWriteHandle();
    if (!wh) return;
    if (!weedKeepState.keptIds.includes(candidate.id)) {
      weedKeepState.keptIds.push(candidate.id);
    }
    await saveWeedKeep(wh, weedKeepState);
  },
  onArchive: async (candidate) => {
    if (!vault) return;
    // Source root = where the note actually lives. Archive destination
    // = writeRoot (Boltzsidian-owned sidecar). In single-root vaults
    // these are the same handle — fast move() path. In multi-root,
    // copy-then-delete crosses the boundary safely.
    const sourceRoot = getSourceRoot(candidate.id);
    const writeHandle = getWriteHandle();
    if (!sourceRoot || !writeHandle) return;
    if (sourceRoot.readOnly) {
      toast(
        `Can't archive — "${sourceRoot.name || sourceRoot.id}" is read-only.`,
        { duration: 3500 },
      );
      throw new Error("read-only");
    }
    const result = await archiveNote(sourceRoot.handle, candidate.path, {
      writeHandle,
    });
    if (!result.ok) {
      toast(`Archive failed: ${candidate.path}`);
      throw new Error(result.reason);
    }
    removeNoteEverywhere(candidate.id);
  },
  onDelete: async (candidate) => {
    if (!vault) return;
    const sourceRoot = getSourceRoot(candidate.id);
    if (!sourceRoot) return;
    if (sourceRoot.readOnly) {
      toast(
        `Can't delete — "${sourceRoot.name || sourceRoot.id}" is read-only.`,
        { duration: 3500 },
      );
      throw new Error("read-only");
    }
    const result = await deleteNoteFile(sourceRoot.handle, candidate.path);
    if (!result.ok) {
      toast(`Delete failed: ${candidate.path}`);
      throw new Error(result.reason);
    }
    removeNoteEverywhere(candidate.id);
    toast(`Deleted ${candidate.path}`, { duration: 3000 });
  },
  onOpenNote: (noteId) => openNote(noteId),
  onBulkKeep: async (candidates) => {
    const wh = getWriteHandle();
    if (!wh) return;
    const set = new Set(weedKeepState.keptIds);
    for (const c of candidates) set.add(c.id);
    weedKeepState.keptIds = [...set];
    await saveWeedKeep(wh, weedKeepState);
    weedDrawer.setCandidates([]);
    toast(
      `Kept ${candidates.length} note${candidates.length === 1 ? "" : "s"}.`,
    );
  },
  onBulkArchive: async (candidates) => {
    if (!vault) return;
    const writeHandle = getWriteHandle();
    if (!writeHandle) return;
    let ok = 0;
    let skipped = 0;
    for (const c of candidates) {
      const sourceRoot = getSourceRoot(c.id);
      if (!sourceRoot || sourceRoot.readOnly) {
        skipped++;
        continue;
      }
      const r = await archiveNote(sourceRoot.handle, c.path, { writeHandle });
      if (r.ok) {
        removeNoteEverywhere(c.id);
        ok++;
      }
    }
    if (skipped > 0) {
      console.warn(
        `[bz] weed bulk-archive skipped ${skipped} read-only / unresolved candidates`,
      );
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
  const writeHandle = getWriteHandle();
  if (!writeHandle) {
    toast("Open a workspace first.");
    return 0;
  }
  if (settings.weed_enabled === false) {
    toast("Weed is disabled in Settings.");
    return 0;
  }
  const { candidates } = await loadPruneCandidates(writeHandle);
  const live = filterKept(candidates, weedKeepState.keptIds);
  weedDrawer.setCandidates(live);
  // Mark the current count as seen so the soft-toast only fires when
  // the list actually grows past this baseline.
  weedKeepState.lastSeenCount = candidates.length;
  weedKeepState.lastSeenAt = new Date().toISOString();
  saveWeedKeep(writeHandle, weedKeepState).catch(() => {});
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
  const writeHandle = getWriteHandle();
  if (!writeHandle) return;
  if (settings.weed_enabled === false) return;
  try {
    weedKeepState = await loadWeedKeep(writeHandle);
    const { candidates } = await loadPruneCandidates(writeHandle);
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
// Hoisted so the demoButton click handler and first-run default
// check below can reference it without TDZ.
const WELCOME_SEEN_KEY = "boltzsidian.welcome.seen.v1";

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
      // Welcome theme has been opened — from now on the first-run
      // default shifts to astronomer's notebook. See ONBOARDING.md §10.
      if (theme === "welcome") {
        try {
          localStorage.setItem(WELCOME_SEEN_KEY, "1");
        } catch {}
      }
      setProgress("");
      await setWorkspace(ws);
    } catch (err) {
      console.error("[bz] demo start failed:", err);
      toast(err.message ?? "Could not start the demo.");
      setProgress("");
      setWelcomeBusy(false);
    }
  });

  // First-run default: Welcome for users who've never opened it;
  // astronomer for everyone else. The welcome radio is already
  // `checked` in the HTML — only switch away if the user has already
  // been through the tour. No-op for fresh IndexedDB / localStorage.
  if (localStorage.getItem(WELCOME_SEEN_KEY) === "1") {
    const astroRadio = document.querySelector(
      "#welcome-theme input[name='demo-theme'][value='astronomer']",
    );
    if (astroRadio) astroRadio.checked = true;
  }
}

// WELCOME_SEEN_KEY moved up; see declaration near demoButton wiring.

// Read whichever theme radio is currently selected on the welcome card.
function pickedWelcomeTheme() {
  const el = document.querySelector(
    "#welcome-theme input[name='demo-theme']:checked",
  );
  return el ? el.value : "welcome";
}

// Seed folder basin strength for a freshly-installed demo so the
// top-level clusters pull visibly apart under physics. Different themes
// want different amounts — the project theme has two genuinely separate
// sub-projects and wants a stronger basin; the astronomer theme has
// categories inside one domain and wants a gentler pull.
function seedDemoInfluence(theme) {
  // Welcome is a tiny hand-authored ring — basins would fight the
  // pinned positions, so leave it at 0. Project has two genuinely
  // separate sub-projects that want strong pull. Astronomer has
  // categories inside one domain and wants a gentler pull.
  const target = theme === "welcome" ? 0 : theme === "project" ? 0.55 : 0.3;
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

// Cursor affordance — while Alt/Shift is held AND the pointer is
// actually near a tether, the cursor flips so the user sees delete
// is armed. Cosmetic; the real gate is the key check in the
// pointerdown handler above. Narrowed to "hovering a tether" so
// modifier-hotkeys (Shift / Alt during typing combos) don't flip
// the whole canvas cursor.
let _lastPointerX = -1;
let _lastPointerY = -1;
function updateTetherCursor(e) {
  if (!canvas) return;
  // `e` is either a keydown/keyup (no clientX) or a pointermove.
  if (typeof e.clientX === "number") {
    _lastPointerX = e.clientX;
    _lastPointerY = e.clientY;
  }
  const modHeld = !!(e.altKey || e.shiftKey);
  let armed = false;
  if (modHeld && tethers && _lastPointerX >= 0) {
    // Only arm when the pointer is near a real tether segment.
    const hit = tethers.pickAt?.(_lastPointerX, _lastPointerY);
    armed = !!hit;
  }
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

// MULTI_PROJECT_PLAN.md Phase 5: resolve the on-disk manifest (if any)
// before the vault walks. The returned shape drops straight into
// openVault — either `{ handle, kind }` for legacy single-root or
// `{ manifest }` for a multi-root workspace with every root's handle
// hydrated.
async function resolveWorkspaceManifest(ws) {
  const singleRoot = () => ({
    openVaultArg: { handle: ws.handle, kind: ws.kind },
    manifest: null,
    dropped: [],
  });

  // Demo (OPFS) workspaces are always single-root — don't even look
  // for a manifest. They ship pre-authored.
  if (ws.kind === "demo") return singleRoot();

  let manifest;
  try {
    manifest = await loadManifestFromHandle(ws.handle);
  } catch (err) {
    console.warn("[bz] manifest read failed, using single-root fallback", err);
    return singleRoot();
  }
  if (!manifest) return singleRoot();

  const writeRoot = manifest.roots.find((r) => r.id === manifest.writeRootId);
  if (!writeRoot) {
    console.warn(
      `[bz] manifest writeRootId "${manifest.writeRootId}" not in roots; falling back to single-root`,
    );
    return singleRoot();
  }
  // The folder the user just picked IS the writeRoot, regardless of
  // which id the manifest assigns it. Pin the live handle + kind
  // there; every other root reconstitutes via IDB or user pick.
  writeRoot.handle = ws.handle;
  writeRoot.kind = ws.kind;

  const additional = manifest.roots.filter(
    (r) => r.id !== manifest.writeRootId,
  );
  const pending = []; // handle in IDB, permission lapsed
  const missing = []; // no handle in IDB yet
  for (const root of additional) {
    try {
      const h = await loadRootHandle(root.id);
      if (!h) {
        missing.push(root);
        continue;
      }
      const state = await h.queryPermission({ mode: "readwrite" });
      if (state === "granted") {
        root.handle = h;
        root.kind = "project";
      } else {
        root.handle = h; // attach so requestPermission reuses it
        pending.push(root);
      }
    } catch (err) {
      console.warn(`[bz] root "${root.id}" IDB lookup failed`, err);
      missing.push(root);
    }
  }

  const dropped = [];
  if (pending.length || missing.length) {
    await resolveRootsInteractively({ pending, missing, dropped });
  }

  // Drop any root that never got a handle. writeRoot is always hydrated
  // via ws.handle so it survives. A dropped root gets surfaced via the
  // dropped[] return — callers (setWorkspace) toast about it.
  manifest.roots = manifest.roots.filter((r) => r.handle);

  return { openVaultArg: { manifest }, manifest, dropped };
}

// Walk the pending/missing lists one root at a time, asking the user
// to grant access to each. Each step shows a toast with a Grant/Skip
// button — single-step flow is important because each FS Access pick
// consumes the page's transient user activation, so batching multiple
// pickers into one click handler fails on the second pick.
async function resolveRootsInteractively({ pending, missing, dropped }) {
  for (const root of pending) {
    const granted = await promptPermission(root);
    if (!granted) {
      root.handle = null;
      dropped.push({ id: root.id, name: root.name, reason: "permission" });
    }
  }
  for (const root of missing) {
    const handle = await promptPickRoot(root);
    if (handle) {
      root.handle = handle;
      root.kind = "project";
      try {
        await saveRootHandle(root.id, handle);
      } catch (err) {
        console.warn(`[bz] saveRootHandle("${root.id}") failed`, err);
      }
    } else {
      dropped.push({ id: root.id, name: root.name, reason: "not-picked" });
    }
  }
}

function promptPermission(root) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    toast.actions(
      `Reconnect to project "${root.name || root.id}"?`,
      [
        {
          label: "Grant",
          kind: "primary",
          onClick: async () => {
            try {
              const state = await root.handle.requestPermission({
                mode: "readwrite",
              });
              done(state === "granted");
            } catch (err) {
              console.warn(`[bz] requestPermission("${root.id}") failed`, err);
              done(false);
            }
          },
        },
        { label: "Skip", onClick: () => done(false) },
      ],
      { duration: 60000 },
    );
    window.setTimeout(() => done(false), 65000);
  });
}

function promptPickRoot(root) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (handle) => {
      if (settled) return;
      settled = true;
      resolve(handle);
    };
    toast.actions(
      `Workspace references project "${root.name || root.id}" — pick its folder?`,
      [
        {
          label: "Pick folder",
          kind: "primary",
          onClick: async () => {
            try {
              const handle = await window.showDirectoryPicker({
                mode: "readwrite",
                id: `boltzsidian-root-${root.id}`,
                startIn: "documents",
              });
              done(handle);
            } catch (err) {
              if (err?.name !== "AbortError") {
                console.warn(`[bz] pick root "${root.id}" failed`, err);
              }
              done(null);
            }
          },
        },
        { label: "Skip", onClick: () => done(null) },
      ],
      { duration: 60000 },
    );
    window.setTimeout(() => done(null), 65000);
  });
}

// Re-drive the grant flow for a root that got dropped at boot. Used
// by the Settings pane's per-root "Re-grant" button. On success we
// patch the live vault's manifest + walk the new root's notes in,
// then rebuild physics/tethers/etc. A failed re-grant leaves the
// entry in droppedRoots so the user can try again.
async function regrantDroppedRoot(entry) {
  if (!entry?.id) return false;
  if (!vault || !vault.manifest) {
    toast("Open a workspace first.");
    return false;
  }
  // Look up the manifest entry by id. It may have been filtered out
  // of vault.roots but should still be in vault.manifest.roots (which
  // we trim too — so re-read workspace.json to recover the spec).
  let root = vault.manifest.roots.find((r) => r.id === entry.id);
  if (!root) {
    let disk;
    try {
      disk = await loadManifestFromHandle(getWriteHandle());
    } catch (err) {
      console.warn("[bz] regrant: manifest reread failed", err);
    }
    root = disk?.roots?.find((r) => r.id === entry.id);
  }
  if (!root) {
    toast(`Can't re-grant — "${entry.id}" is no longer in workspace.json.`);
    droppedRoots = droppedRoots.filter((d) => d.id !== entry.id);
    return false;
  }

  // Try IDB first — the handle may have survived even though its
  // permission lapsed between sessions.
  let handle = null;
  try {
    const stored = await loadRootHandle(entry.id);
    if (stored) {
      root.handle = stored;
      handle = (await promptPermission(root)) ? stored : null;
    }
  } catch (err) {
    console.warn("[bz] regrant: IDB lookup failed", err);
  }
  if (!handle) {
    handle = await promptPickRoot(root);
    if (handle) {
      try {
        await saveRootHandle(entry.id, handle);
      } catch (err) {
        console.warn("[bz] regrant: saveRootHandle failed", err);
      }
    }
  }
  if (!handle) return false;

  droppedRoots = droppedRoots.filter((d) => d.id !== entry.id);
  toast(`Connected "${root.name || root.id}". Reloading…`, { duration: 2000 });
  // Reload rather than reopen in place — the full vault pipeline
  // (bodies / physics / tethers / search / salience / dream) is
  // wired at setWorkspace time and isn't designed for mid-session
  // rebuilds. A reload is predictable and takes ~1s; a broken
  // in-place rebuild loses work. Revisit when Phase 7 ships a
  // proper workspace-swap flow.
  window.setTimeout(() => window.location.reload(), 600);
  return true;
}

// Settings → Workspace → "Add project root". Must run inside the
// user-click handler: showDirectoryPicker consumes the page's
// transient activation, so any async work before the picker call
// risks "SecurityError: must be handling a user gesture".
async function addProjectRoot() {
  if (workspaceKind !== "user") {
    toast("Project roots can only be added to a user workspace.");
    return false;
  }
  if (!vault) {
    toast("Open a workspace first.");
    return false;
  }
  let handle;
  try {
    handle = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "boltzsidian-root-add",
      startIn: "documents",
    });
  } catch (err) {
    if (err?.name === "AbortError") return false;
    console.warn("[bz] addProjectRoot: pick failed", err);
    toast(err.message ?? "Could not open folder.");
    return false;
  }

  try {
    // Load the current on-disk manifest. If the workspace has been
    // single-root so far there's no file yet — synthesise one from
    // the live writeRoot before appending.
    const writeHandle = getWriteHandle();
    if (!writeHandle) {
      toast("No write root available.");
      return false;
    }
    let manifest = await loadManifestFromHandle(writeHandle);
    if (!manifest) {
      manifest = synthesizeSingleRootManifest(writeHandle, {
        kind: "user",
        id: vault.writeRootId || undefined,
        name: workspaceHandle?.name || undefined,
      });
    }
    // Strip runtime-only fields the serializer would reject.
    for (const r of manifest.roots) {
      delete r.handle;
      delete r.kind;
    }

    // Derive a stable kebab-case id from the folder name, collision-
    // suffix if we already have one with that id.
    const baseId = deriveRootId(handle.name);
    const takenIds = new Set(manifest.roots.map((r) => r.id));
    let id = baseId;
    let n = 2;
    while (takenIds.has(id)) id = `${baseId}-${n++}`;

    manifest.roots.push({
      id,
      name: handle.name || id,
      path: handle.name || id,
      readOnly: false,
      include: [],
      exclude: manifest.defaultExcludes?.slice() || DEFAULT_EXCLUDES.slice(),
    });

    await saveManifestToHandle(writeHandle, manifest);
    await saveRootHandle(id, handle);

    toast(`Added "${handle.name}" · reloading…`, { duration: 2000 });
    window.setTimeout(() => window.location.reload(), 600);
    return true;
  } catch (err) {
    console.error("[bz] addProjectRoot failed", err);
    toast(err.message ?? "Could not add project root.");
    return false;
  }
}

function deriveRootId(name) {
  return (
    String(name || "root")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "root"
  );
}

// Settings → Workspace → "Remove". Disconnects a project root from
// the workspace WITHOUT touching files on disk — strips the entry
// from workspace.json and drops the saved handle from IDB, then
// reloads. writeRoot is never removable through this path; the
// caller (settings UI) filters it out.
async function removeProjectRoot(rootId) {
  if (!rootId) return false;
  if (!vault) {
    toast("Open a workspace first.");
    return false;
  }
  if (rootId === vault.writeRootId) {
    toast("Can't remove the writeRoot — open a different workspace instead.");
    return false;
  }
  try {
    const writeHandle = getWriteHandle();
    if (!writeHandle) {
      toast("No write root available.");
      return false;
    }
    const manifest = await loadManifestFromHandle(writeHandle);
    if (!manifest) {
      toast("No workspace.json on disk — nothing to remove.");
      return false;
    }
    const before = manifest.roots.length;
    manifest.roots = manifest.roots.filter((r) => r.id !== rootId);
    if (manifest.roots.length === before) {
      toast(`Root "${rootId}" not in workspace.json.`);
      return false;
    }
    for (const r of manifest.roots) {
      delete r.handle;
      delete r.kind;
    }
    await saveManifestToHandle(writeHandle, manifest);
    try {
      await deleteRootHandle(rootId);
    } catch (err) {
      console.warn(`[bz] removeProjectRoot: deleteRootHandle failed`, err);
    }
    toast(`Removed "${rootId}" · reloading…`, { duration: 2000 });
    window.setTimeout(() => window.location.reload(), 600);
    return true;
  } catch (err) {
    console.error("[bz] removeProjectRoot failed", err);
    toast(err.message ?? "Could not remove project root.");
    return false;
  }
}

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
    // MULTI_PROJECT_PLAN.md Phase 5: resolve workspace.json (if any)
    // before the walker runs. Single-root users hit the legacy
    // `{ handle, kind }` path unchanged — nothing on disk references
    // extra roots so resolveWorkspaceManifest returns singleRoot().
    const resolved = await resolveWorkspaceManifest(ws);
    if (resolved.dropped.length > 0) {
      const list = resolved.dropped.map((d) => d.name || d.id).join(", ");
      toast(
        `Skipped ${resolved.dropped.length} project root${resolved.dropped.length === 1 ? "" : "s"}: ${list}. Re-grant from Settings.`,
        { duration: 6000 },
      );
      console.warn("[bz] dropped roots:", resolved.dropped);
    }
    droppedRoots = resolved.dropped.slice();

    vault = await openVault(resolved.openVaultArg, {
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
      // DREAM_GRAVITY.md — the attractor needs state + phase to
      // pick its weight (ramping during warming, exhaling during
      // discerning). dream controller may not exist yet at the
      // very first boot frame, so both callbacks defend.
      getDreamPhase: () => {
        if (performance.now() < previewUntil) return "playing";
        return dream ? dream.getPhase() : null;
      },
      getDreamState: () => {
        if (performance.now() < previewUntil) return "dreaming";
        return dream ? dream.getState() : "wake";
      },
      getDreamGravity: () => settings.dream_gravity !== false,
      getDreamGravityStrength: () => {
        const v = Number(settings.dream_gravity_strength);
        return Number.isFinite(v) ? v : 2800;
      },
      // DREAM_THEMES.md — theme anchor is refreshed every ~30 frames
      // in the same tick that updates cluster centroids. Physics
      // reads the cached value so every step is O(1).
      getThemeAnchor: () => themeAnchorCache,
      // STAR_CHARTS.md — project-hub shapes cached on vault load
      // and refreshed every ~30 frames alongside centroids. Physics
      // reads it per-step.
      getProjectShapes: () => projectShapesCache,
    });
    // Seed the shape cache so the first physics frame already sees
    // any project hubs in the vault.
    projectShapesCache = collectProjectShapes(vault);

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
    // VISIBILITY_FILTER.md — user-typed tag/keyword filter. Created
    // once; `refresh()` re-applies the current filter string against
    // the newly-loaded vault so matches stay in sync.
    if (!filterBar) {
      filterBar = createFilterBar({
        formations,
        getVault: () => vault,
      });
    } else {
      filterBar.refresh();
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
          const writeHandle = getWriteHandle();
          if (writeHandle && artifacts.pruneCandidates.length)
            await writePruneCandidates(writeHandle, artifacts.pruneCandidates);
          if (writeHandle) await writeDreamLog(writeHandle, artifacts);
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
      // DREAM_THEMES.md Phase D — tell the sampler about the
      // current theme. Null when no theme is active or the theme
      // fell back to random (too few members).
      getThemeSet: () => themeSetCache,
      // Suspend the scanner tick during Fast-pace bulk accepts
      // only — Chill pace leaves plenty of room for salience to
      // keep ticking concurrently (TEND_STAMP_MISMATCH.md §7.5).
      getPaused: () => isBulkInProgress && settings.tend_bulk_pace === "fast",
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
    hoverOrbit = createHoverOrbit({ scene, bodies, vault, renderer });
    // If a note was already open when the vault reloaded, promote it
    // back into the orrery state.
    if (activeNoteId) hoverOrbit.setTarget(activeNoteId);
    labels = createLabels({
      vault,
      bodies,
      camera,
      getMode: () => settings.label_mode || "always",
      getHoveredId: () => hover?.getHoveredId?.() || null,
      onLabelHover: (id) => {
        if (bodies) bodies.setLabelHover?.(id);
        // Hover is transient; when it clears, fall back to the open
        // note (if any) so the orrery stays on the current note.
        hoverOrbit.setTarget(id || activeNoteId);
      },
      onLabelClick: (id) => openNote(id),
    });
    unsubscribeLabels = onFrame((dt, t) => {
      labels.update();
      hoverOrbit.update(dt, t);
    });

    // CONSTELLATIONS.md — cluster-level labels that rise when you zoom
    // out past a cluster's own extent. Runs on the same frame cadence
    // as star labels; the update loop short-circuits when the setting
    // is off or dream depth is high.
    if (unsubscribeConstellations) unsubscribeConstellations();
    if (constellations) constellations.dispose();
    constellations = createConstellations({
      vault,
      bodies,
      camera,
      getMode: () =>
        settings.show_constellations !== false &&
        settings.label_mode !== "never",
      getDreamDepth: () => (dream ? dream.getDepth() : 0),
      getSettings: () => settings,
      onConstellationClick: (cid) => focusCluster(cid),
      onClusterRename: (cluster, newName) => {
        saveClusterName(cluster, newName, settings);
        saveSettings(settings);
        toast(
          newName ? `Renamed region to "${newName}"` : "Region name cleared",
          { duration: 2000 },
        );
      },
      onBatchLinkRequest: (cluster) => {
        if (!batchLinkPicker) return;
        batchLinkPicker.open(cluster);
      },
    });

    // BATCH_LINK.md §3 — the floating picker that takes a cluster
    // and a target note and writes the wikilink to every member.
    // One shared instance per workspace; disposed + rebuilt on
    // workspace change so it closes over the fresh vault.
    if (batchLinkPicker) batchLinkPicker.dispose();
    batchLinkPicker = createBatchLinkPicker({
      getVault: () => vault,
      onChoose: (cluster, target) => applyBatchLink(cluster, target),
    });

    // KEYWORD_LINK.md Phase C — modal instance. Phase D wires the
    // real apply loop; until then, log the selection so we can
    // verify Phase B + C end-to-end from the console dev hook.
    if (keywordLinkPicker) keywordLinkPicker.dispose();
    keywordLinkPicker = createKeywordLinkPicker({
      getVault: () => vault,
      onApply: async ({ target, selection }) => {
        if (!saver || !target) return;
        // Sanitise the title before wrapping. If the target note's own
        // title literally contains `[[`, `]]`, or `|`, naive wrapping
        // produces malformed output like `[[Title — [[Nested]]]]` —
        // the inner `]]` closes the outer wikilink early and neither
        // our parser nor Obsidian resolves it. Stripping these three
        // tokens keeps the link valid and still resolves to the same
        // note because resolution is title-based case-insensitive.
        const cleanTitle = String(target.title || "")
          .replace(/\[\[|\]\]|\|/g, "")
          .trim();
        if (!cleanTitle) {
          toast("Target title is empty. Rename the target first.", {
            duration: 4000,
          });
          return;
        }
        let writtenNotes = 0;
        let writtenOccurrences = 0;
        let errored = 0;
        for (const group of selection) {
          try {
            const { note, occurrences } = group;
            const { data, content } = parseFrontmatter(note.rawText);
            let newBody = content;
            // Apply end-to-start so earlier offsets stay valid after
            // later slices are inserted. Each occurrence's charOffset
            // is relative to the body (post-frontmatter).
            const sorted = [...occurrences].sort(
              (a, b) => b.charOffset - a.charOffset,
            );
            for (const o of sorted) {
              const replacement =
                o.matchedText === cleanTitle
                  ? `[[${cleanTitle}]]`
                  : `[[${cleanTitle}|${o.matchedText}]]`;
              newBody =
                newBody.slice(0, o.charOffset) +
                replacement +
                newBody.slice(o.charOffset + o.matchedText.length);
            }
            const newRawText = stringifyFrontmatter(data, newBody);
            await saver(note, newRawText);
            writtenNotes++;
            writtenOccurrences += occurrences.length;
          } catch (err) {
            console.warn("[bz] keyword-link write failed:", err);
            errored++;
          }
        }
        toast(
          errored > 0
            ? `Linked ${writtenOccurrences} mentions across ${writtenNotes} notes (${errored} failed — see console).`
            : `Linked ${writtenOccurrences} mentions across ${writtenNotes} notes → [[${cleanTitle}]]`,
          { duration: 4500 },
        );
      },
    });

    // WEAVE.md — network-completion picker. Takes a hub note, scans
    // its satellite neighborhood for prose mentions of each other,
    // and splices in-place via the same frontmatter/body/saver path
    // the keyword-link picker uses.
    if (weavePicker) weavePicker.dispose();
    weavePicker = createWeavePicker({
      getVault: () => vault,
      runScan: (v, hubId, opts) => scanWeave(v, hubId, opts || {}),
      onApply: async (proposals) => {
        if (!saver) return;
        // Group proposals by source note so each note is parsed and
        // written once, with all its accepted edits applied end-to-
        // start for offset stability (same pattern as keyword-link).
        const byFrom = new Map();
        for (const p of proposals) {
          if (!byFrom.has(p.from.id))
            byFrom.set(p.from.id, { note: p.from, items: [] });
          byFrom.get(p.from.id).items.push(p);
        }
        let wroteNotes = 0;
        let wroteLinks = 0;
        let errored = 0;
        for (const { note, items } of byFrom.values()) {
          try {
            const { data, content } = parseFrontmatter(note.rawText);
            let newBody = content;
            const sorted = [...items].sort(
              (a, b) => b.charOffset - a.charOffset,
            );
            for (const p of sorted) {
              // Sanitise the target's title in case it contains
              // bracket / pipe tokens that would produce a malformed
              // wikilink when wrapped.
              const cleanTitle = String(p.to.title || "")
                .replace(/\[\[|\]\]|\|/g, "")
                .trim();
              if (!cleanTitle) continue;
              const replacement =
                p.matchedText === cleanTitle
                  ? `[[${cleanTitle}]]`
                  : `[[${cleanTitle}|${p.matchedText}]]`;
              newBody =
                newBody.slice(0, p.charOffset) +
                replacement +
                newBody.slice(p.charOffset + p.matchedText.length);
              wroteLinks++;
            }
            const newRawText = stringifyFrontmatter(data, newBody);
            await saver(note, newRawText);
            wroteNotes++;
          } catch (err) {
            console.warn("[bz] weave write failed:", err);
            errored++;
          }
        }
        toast(
          errored > 0
            ? `Wove ${wroteLinks} links across ${wroteNotes} notes (${errored} failed — see console).`
            : `Wove ${wroteLinks} links across ${wroteNotes} notes.`,
          { duration: 4500 },
        );
      },
    });

    // RENDER_QUALITY.md Phase A — by now every visual subsystem is
    // wired (tethers, sparks, labels, constellations). Re-dispatch
    // the current tier so each sees the right pool size + cadence
    // before the first frame renders with the new vault.
    applyCurrentRenderQuality();
    // Centroid drift fix — physics moves bodies but cluster.centroid
    // was baked at initial layout. Refresh every ~30 frames (~500ms
    // @60fps) so constellation halos follow their actual clusters.
    // Cheap: O(notes) per pass, no clustering re-run.
    let _centroidTick = 0;
    unsubscribeConstellations = onFrame(() => {
      if (++_centroidTick % 30 === 0) {
        recomputeCentroidsLive(vault, bodies);
        // DREAM_THEMES.md Phases C+D — refresh theme caches on
        // the same tick. Both null when no theme, or the theme is
        // under MIN_THEME_SIZE (fall back to random everywhere).
        refreshThemeCaches();
        // STAR_CHARTS.md — rebuild project-hub shape cache so new
        // `project: true` frontmatter (or link graph changes) take
        // effect within a second.
        projectShapesCache = collectProjectShapes(vault);
      }
      constellations.update();
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
  // Phase 3: saver may decline on a read-only root. Surface the
  // reason so the user knows why their edit didn't persist.
  if (result && result.applied === false) {
    if (result.reason === "read-only") {
      toast("Can't save — this note lives in a read-only project root.", {
        duration: 3500,
      });
    } else if (result.reason === "no-root") {
      toast("Can't save — unknown root for this note.", { duration: 3500 });
    }
    return result;
  }
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
  if (!getWriteHandle()) return;
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    persistState();
  }, 600);
}

function persistState() {
  const writeHandle = getWriteHandle();
  if (!writeHandle || !vault || !bodies) return;
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
  saveState(writeHandle, state).catch(() => {});
  stateDirty = false;
}

// ── N: new note ─────────────────────────────────────────────
function createNewNote() {
  if (!vault || !saver) {
    toast("Open a workspace first.");
    return;
  }
  if (!bodies) return;

  // MULTI_PROJECT_PLAN.md Phase 3E — new notes always land in writeRoot.
  // Path uniqueness is scoped to the writeRoot's notes only so two
  // projects can each have "Untitled.md" without clashing.
  const writeRoot = vault.getWriteRoot?.();
  const writeRootId = writeRoot?.id || null;
  const taken = new Set(
    vault.notes
      .filter((n) => !n.rootId || n.rootId === writeRootId)
      .map((n) => n.path),
  );
  const path = uniquePath("", titleToStem("Untitled"), taken);
  const note = makeEmptyNote({
    path,
    title: "Untitled",
    settings,
    rootId: writeRootId,
  });
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
// nextShape is one of: null (clear project status), "ring", "disc",
// "spine", "fan". Unknown values are treated as "clear".
async function handleToggleProject(note, nextShape) {
  if (!saver) return;
  const KNOWN_SHAPES = ["ring", "disc", "spine", "fan"];
  const valid = KNOWN_SHAPES.includes(nextShape);
  const fm = { ...(note.frontmatter || {}) };
  fm.id = fm.id || note.id;
  if (!fm.created)
    fm.created = new Date(note.mtime || Date.now()).toISOString();
  if (valid) {
    fm.project = true;
    fm.shape = nextShape;
  } else {
    delete fm.project;
    delete fm.shape;
  }
  const nextText = stringifyFrontmatter(fm, note.body);
  try {
    await saver(note, nextText);
    // Refresh the project-shape cache so physics sees the change on
    // the next frame instead of waiting for the ~500ms centroid tick.
    if (vault) projectShapesCache = collectProjectShapes(vault);
    // One-shot velocity kick so the rearrangement is visible
    // immediately, not just over seconds of settling. Only when
    // turning a shape ON (not when clearing) — clearing should
    // just let spring forces take over naturally.
    if (valid && physics?.kickShape) physics.kickShape();
    const msg = valid
      ? `Project: ${nextShape} — satellites arranging`
      : "Project hub cleared";
    toast(msg, { duration: 1800 });
  } catch (err) {
    console.error("[bz] project toggle failed", err);
    toast("Could not update project flag.");
  }
}

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
  // Promote the opened note into its orange "orrery" state — planets
  // orbit the selected body so the currently-read note reads as the
  // center of its own little system. Cleared on panel close.
  activeNoteId = noteId;
  if (hoverOrbit) hoverOrbit.setTarget(noteId);
  // Slide the observer face to the right so it doesn't sit under the
  // note panel, and aim its pupils at the focused body.
  document.body.classList.add("note-open");
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

// CONSTELLATIONS.md §5 — click a constellation to frame the whole
// cluster. Distance chosen so zoom_ratio lands around 3 (slightly
// inside the cross-fade, stars just starting to read).
function focusCluster(clusterId) {
  if (!vault?.clusters?.byId) return;
  const cluster = vault.clusters.byId.get(clusterId);
  if (!cluster?.centroid) return;
  const target = new THREE.Vector3(
    cluster.centroid[0],
    cluster.centroid[1],
    cluster.centroid[2],
  );
  // Preserve the viewing angle — just reset distance. Distance = 3×
  // extent puts the cluster almost filling the frame with a little
  // breathing room.
  TMP_OFFSET.subVectors(camera.position, controls.target);
  const dist = Math.max(80, cluster.extent * 3);
  TMP_OFFSET.normalize().multiplyScalar(dist);
  const toPos = target.clone().add(TMP_OFFSET);
  if (!camSnapshot) {
    camSnapshot = {
      pos: camera.position.clone(),
      target: controls.target.clone(),
    };
  }
  startTween(toPos, target, 0.9);
}

// BATCH_LINK.md §3 — apply the wikilink from the picker to every
// member of the cluster. Reuses the Phase-3 root-aware saver so
// read-only sources decline naturally, and applyObviousLink from
// tend-apply.js so the body mutation matches how tend already adds
// links (append to body end, skip if already present).
async function applyBatchLink(cluster, target) {
  if (!vault || !saver || !cluster || !target) return;
  const memberIds = Array.isArray(cluster.noteIds)
    ? cluster.noteIds.slice()
    : [];
  if (memberIds.length === 0) return;

  // §3 confirmation threshold — large batches get a guard rail.
  if (memberIds.length > 50) {
    if (
      !confirm(
        `Add [[${target.title}]] to ${memberIds.length} notes? This writes to every member of the region.`,
      )
    )
      return;
  }

  // Flush any in-progress edit on the panel so its dirty buffer
  // doesn't clobber the batch writes on the next autosave tick.
  if (notePanel.isDirty?.()) notePanel.flushSave();

  let written = 0;
  let alreadyLinked = 0;
  let readOnlySkipped = 0;
  let selfSkipped = 0;
  let failed = 0;

  for (const id of memberIds) {
    if (id === target.id) {
      selfSkipped++;
      continue;
    }
    const note = vault.byId.get(id);
    if (!note) continue;
    if (note._isPhantom) continue;

    // Already linked? The forward graph is authoritative.
    const forward = vault.forward.get(id);
    if (forward && forward.has(target.id)) {
      alreadyLinked++;
      continue;
    }

    // Use a collision-proof wikilink token. applyObviousLink writes
    // `[[Title]]`, which on reparse resolves via prefer-same-root —
    // fatal for batch links when the target's title exists in
    // multiple roots (each source note would map `[[Title]]` to ITS
    // OWN-root namesake instead of the picked target). Writing
    // `[[id|Title]]` when the title collides keeps the visible text
    // and forces resolution through byId.
    const nextText = appendBatchLinkToBody(note, target, vault);
    if (nextText === note.rawText) {
      alreadyLinked++;
      continue;
    }
    try {
      const result = await saver(note, nextText);
      if (result?.applied) {
        written++;
      } else if (result?.reason === "read-only") {
        readOnlySkipped++;
      } else {
        failed++;
      }
    } catch (err) {
      console.warn("[bz] batch-link write failed for", note.path, err);
      failed++;
    }
  }

  // Physics / tethers / search all need to see the new edges.
  if (physics) physics.rebuildEdges();
  if (tethers) tethers.rebuild();
  if (search?.invalidate) search.invalidate();
  updateStatsHud();

  const summary = [
    `Linked ${written} → [[${target.title}]]`,
    alreadyLinked && `${alreadyLinked} already linked`,
    readOnlySkipped && `${readOnlySkipped} read-only`,
    selfSkipped && "1 self",
    failed && `${failed} failed`,
  ]
    .filter(Boolean)
    .join(" · ");
  toast(summary, { duration: 4500 });
}

// Compose a wikilink token for batch writes. If the target's title
// is unique across the whole vault, use a readable `[[Title]]` —
// cheap and the common case. If the title collides across roots
// (e.g. every project has its own `INDEX.md`), write `[[id|Title]]`
// so each source note resolves to the EXACT target the user picked,
// not its own-root namesake via the prefer-same-root policy.
// DREAM_THEMES.md Phases B–D — compute both the member Set and the
// centroid/extent anchor in one pass. The Set is also used by the
// salience layer for pair-sampling bias. Returns `{ set, anchor }`
// where either may be null if the theme isn't viable.
function refreshThemeCaches() {
  const theme = settings.dream_theme;
  if (!theme || !vault || !bodies) {
    themeSetCache = null;
    themeAnchorCache = null;
    return;
  }
  const ids = resolveThemeSet(vault, theme);
  if (ids.size < MIN_THEME_SIZE) {
    // Too narrow to be useful — fall back to random behaviour
    // everywhere (attractor AND salience).
    themeSetCache = null;
    themeAnchorCache = null;
    return;
  }
  themeSetCache = ids;
  themeAnchorCache = themeCentroid(ids, bodies);
}

function composeBatchLinkToken(target, vault) {
  if (!target) return "";
  const key = String(target.title || "")
    .toLowerCase()
    .trim();
  if (!key) return `[[${target.id}]]`;
  const bucket = vault?.byTitle?.get(key);
  if (!bucket || bucket.length <= 1) return `[[${target.title}]]`;
  return `[[${target.id}|${target.title}]]`;
}

// Append the batch-link token to a note's body. Mirrors
// applyObviousLink's placement (end of body, preserved frontmatter),
// but the "already contains" check matches on title OR id so a
// re-run of the same batch after a collision-proof write doesn't
// add a duplicate.
function appendBatchLinkToBody(note, target, vault) {
  const token = composeBatchLinkToken(target, vault);
  const body = note.body || "";
  const escTitle = escapeRegExp(target.title || "");
  const escId = escapeRegExp(target.id || "");
  const alt = [escTitle, escId].filter(Boolean).join("|");
  const re = new RegExp(`\\[\\[\\s*(${alt})\\s*(?:\\|[^\\]]*)?\\s*\\]\\]`, "i");
  if (re.test(body)) return note.rawText;
  const trimmed = body.replace(/\s+$/, "");
  const sep = trimmed ? "\n\n" : "";
  const newBody = `${trimmed}${sep}${token}\n`;
  const fmMatch = note.rawText.match(/^---[\s\S]*?\n---\s*\n/);
  if (fmMatch) return fmMatch[0] + newBody;
  return newBody;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
// DREAM_GRAVITY.md adds a second term: the orbit target lerps toward
// the attractor so the viewpoint drifts along with the cluster that's
// being pulled, instead of rotating around an empty point.
const _dreamOrbit = new THREE.Vector3();
onFrame((dt) => {
  if (!dream) return;
  const depth = dream.getDepth();
  if (depth < 0.2) return;
  if (camTween) return;
  if (notePanel.isOpen()) return;
  if (linkDrag && linkDrag.isActive) return;

  // DREAM_GRAVITY.md §"First cut" point 5 — orbit target rides the
  // attractor's current position, weighted by depth so the pull is
  // subtle when drifting off and strong at peak generating.
  const att = physics?.getAttractor?.();
  if (att?.active) {
    const k = Math.min(1, 0.3 * depth * dt);
    const target = controls.target;
    target.x += (att.position[0] - target.x) * k;
    target.y += (att.position[1] - target.y) * k;
    target.z += (att.position[2] - target.z) * k;
  }

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
  if ("dream_theme" in patch) {
    // Invalidate immediately so the user doesn't wait ~500 ms (one
    // refresh tick) to see the attractor swing + the salience layer
    // start biasing toward the new theme.
    refreshThemeCaches();
  }
  if ("render_quality_ceiling" in patch) {
    // Phase C — route through the monitor so effective tier clamps
    // to the new ceiling and the streak counters reset.
    qualityMonitor.setCeiling(patch.render_quality_ceiling);
    applyRenderTier(qualityMonitor.getCurrentTier());
  }
  if ("render_quality_auto" in patch) {
    qualityMonitor.setEnabled(patch.render_quality_auto);
    applyRenderTier(qualityMonitor.getCurrentTier());
  }
  if ("tend_bulk_pace" in patch) {
    // Re-render the drawer so the Accept-all button shows/hides to
    // match the new pace. Mid-bulk pace changes don't retroactively
    // affect the running loop — the pause value was snapshotted at
    // click time — but a fresh Accept-all picks up the new value.
    tendDrawer.refresh?.();
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
    (e.target && e.target.isContentEditable) ||
    (e.target && e.target.closest && e.target.closest(".cm-editor")) ||
    (e.target &&
      e.target.closest &&
      e.target.closest("[contenteditable='true']"));

  // Cmd/Ctrl+K stays — the browser doesn't claim it at the keydown layer.
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    coachmarks.markSeen("cmd-k");
  }

  // Cmd/Ctrl+Shift+L → keyword-link picker (KEYWORD_LINK.md Phase E).
  // Held before the isEditable / modifier early-returns so it works
  // even when a note is open in edit mode — the picker is a separate
  // modal and shouldn't be blocked by editor focus.
  if (
    (e.metaKey || e.ctrlKey) &&
    e.shiftKey &&
    (e.key === "l" || e.key === "L")
  ) {
    e.preventDefault();
    if (!vault) {
      toast("Open a workspace first.");
      return;
    }
    keywordLinkPicker?.open?.({});
    return;
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

  // VISIBILITY_FILTER.md — F focuses the top-center filter bar.
  // Browsers also bind Ctrl/Cmd+F to find-in-page; we only steal
  // the BARE F key here, so the native shortcut still works.
  if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    if (filterBar) filterBar.focus();
  }

  // WEAVE.md — Shift+O opens the weave picker on the currently
  // selected note as the hub. No selection → toast. Unshifted O is
  // reserved for pull-into-orbit (PULL_INTO_ORBIT.md) but not yet
  // wired.
  if (e.shiftKey && (e.code === "KeyO" || e.key === "O")) {
    e.preventDefault();
    if (!vault) {
      toast("Open a workspace first.");
      return;
    }
    const hubId = activeNoteId;
    if (!hubId) {
      toast("Click a note first — that's the hub to weave around.", {
        duration: 3000,
      });
      return;
    }
    const hub = vault.byId?.get(hubId);
    if (!hub) return;
    weavePicker?.open?.(hub);
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
// `sleepHud` itself is declared up near the other HUD elements (see top
// of file) so module-init callers that reach updateSleepHud before this
// block evaluates don't hit a TDZ. This block just owns the renderer.
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
    get writeHandle() {
      return getWriteHandle();
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
    // MULTI_PROJECT_PLAN.md Phase 1 dev hooks. Smoke-test the parser
    // / synthesiser from the console without touching the running
    // vault. Will be removed or promoted to real API in later phases.
    // KEYWORD_LINK.md Phase C dev hook — open the keyword-linker
    // modal before Phase E wires Cmd+Shift+L. Run:
    //   __boltzsidian.__openKeywordLink({ keyword: "pipeline" })
    // then pick a target and try Apply. Selection is handed to
    // onApply which today just logs; Phase D replaces the log with
    // the real write loop.
    __openKeywordLink: (opts) => keywordLinkPicker?.open?.(opts || {}),
    // WEAVE.md console hook. Accepts a note id or a title. Opens the
    // weave picker on that note as the hub. Use this before the
    // Shift+O hotkey to run a dry-run scan:
    //   __boltzsidian.__weave("Delphica")        // resolve by title
    //   __boltzsidian.__weave(note.id)           // resolve by id
    //   __boltzsidian.__weaveScan("Delphica")    // scan-only, logs proposals
    // STAR_CHARTS.md debug hook — show what the shape cache
    // currently sees. Useful when the glyph lit up but nothing
    // moved: this tells you whether collectProjectShapes found
    // your hub at all, how many satellites it picked up, and via
    // which path (link graph vs title-prefix fallback).
    __projectShapes: () => {
      console.log(
        "[bz] project shapes cache:",
        projectShapesCache.map((s) => ({
          hub: vault?.byId?.get(s.hubId)?.title,
          shape: s.shape,
          sats: s.satIds.length,
          radius: s.radius,
          sampleSats: s.satIds
            .slice(0, 5)
            .map((id) => vault?.byId?.get(id)?.title),
        })),
      );
      return projectShapesCache;
    },
    __weave: (idOrTitle, opts) => {
      if (!vault) return console.warn("[bz] no vault loaded");
      const hub =
        vault.byId?.get(idOrTitle) ||
        vault.resolveTitle?.(String(idOrTitle)) ||
        null;
      if (!hub) return console.warn("[bz] weave: no note matches", idOrTitle);
      weavePicker?.open?.(hub, opts || null);
    },
    __weaveScan: (idOrTitle, opts) => {
      if (!vault) return console.warn("[bz] no vault loaded");
      const hub =
        vault.byId?.get(idOrTitle) ||
        vault.resolveTitle?.(String(idOrTitle)) ||
        null;
      if (!hub) return console.warn("[bz] weaveScan: no note matches");
      // Second arg: { sameRootOnly: true|false }. Defaults on.
      const result = scanWeave(vault, hub.id, opts || {});
      console.log(
        `[bz] weave ${hub.title}: ${result.satellites.length} satellites, ${result.proposals.length} proposals`,
        result,
      );
      return result;
    },
    __parseManifest: (input) => parseManifest(input),
    __serializeManifest: (manifest) => serializeManifest(manifest),
    __synthesizeSingleRootManifest: synthesizeSingleRootManifest,
    __defaultExcludes: () => DEFAULT_EXCLUDES.slice(),
    // Phase 5 helpers for exercising the manifest-on-disk flow.
    // Typical script: write a manifest, reload the tab, accept the
    // pick prompts, verify vault spans all roots.
    __loadManifestFromDisk: async () => {
      const wh = getWriteHandle();
      if (!wh) throw new Error("no write handle");
      return loadManifestFromHandle(wh);
    },
    __saveManifestToDisk: async (manifest) => {
      const wh = getWriteHandle();
      if (!wh) throw new Error("no write handle");
      await saveManifestToHandle(wh, manifest);
    },
    __loadRootHandle: (id) => loadRootHandle(id),
    __deleteRootHandle: (id) => deleteRootHandle(id),
    __droppedRoots: () => droppedRoots.slice(),
    // Phase 2 smoke-test — reopen the current vault with an arbitrary
    // manifest. Caller is responsible for attaching `handle` and
    // `kind` to each root. Synthetic tests (point two root entries
    // at the same handle) use this to exercise the merge path
    // without picking a second directory.
    __reopenWithManifest: async (manifest) => {
      if (!manifest || !manifest.roots) {
        throw new Error("__reopenWithManifest: expected a parsed manifest");
      }
      const next = await openVault(
        { manifest },
        { settings, onProgress: null },
      );
      vault = next;
      if (search?.invalidate) search.invalidate();
      return {
        notes: next.notes.length,
        roots: next.roots.map((r) => r.id),
        titleBuckets: next.byTitle.size,
        collisions: [...next.byTitle.entries()]
          .filter(([, arr]) => arr.length > 1)
          .map(([title, arr]) => ({ title, count: arr.length })),
      };
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
