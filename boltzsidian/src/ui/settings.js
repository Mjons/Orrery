// Settings pane. Editable form for the subset of settings that matter
// today. Changes fire an onChange patch; the root controller writes to
// localStorage and asks the vault to recompute derived state. Also surfaces
// app-level actions: about, reset demo vault (when in demo mode), reset
// coachmarks, re-trigger the tag prompt.

import { NUM_KINDS } from "../vault/kind.js";
import { AURA_PALETTE, listTopLevelFolders } from "../vault/folders.js";
import { deriveClusterName } from "./constellations.js";
import { DEMO_THEMES } from "../vault/opfs.js";
import { AMBIENCE_PRESETS, AMBIENCE_ORDER } from "../sim/ambience.js";
import { PASSES as TEND_PASSES } from "../layers/tend.js";
import { BACKEND_META } from "../layers/utterance/backend.js";
import { showHotkeyOverlay } from "./hotkey-overlay.js";

const TEND_PASS_LABELS = {
  [TEND_PASSES.TAG_INFER]: "Tag inference",
  [TEND_PASSES.OBVIOUS_LINK]: "Obvious links",
  [TEND_PASSES.TITLE_COLLISION]: "Duplicate titles",
  [TEND_PASSES.FM_NORMALISE]: "Frontmatter normalisation",
  [TEND_PASSES.STUB]: "Stub detection",
};

export function initSettings({
  getSettings,
  getVault,
  getWorkspaceKind,
  getDemoTheme,
  onChange,
  onShowAbout,
  onReshowTagPrompt,
  onResetCoachmarks,
  onResetDemo,
  onSwitchDemo,
  onDreamNow,
  onDreamPreview, // () => void — force peak attractor for 30s preview
  onSetSleepDepth,
  getSleepDepth,
  onRunTend, // (enabledPasses: string[]) => Promise<number> — returns proposal count
  onOpenWeed, // () => Promise<number> — returns candidate count
  getWeedKeep, // () => { keptIds, lastSeenCount, lastSeenAt }
  onWeedUnkeep, // async (noteId) => void — removes id from keep list
  getUtteranceStatus, // () => { template: {...}, webllm: {...}, claude: {...} }
  getClaudeApiKey, // async () => string | null
  onSetClaudeApiKey, // async (string | null) => void
  onTestLocalBackend, // async () => { ok, detail }
  getDreamStatus, // () => { state, phase, depth } — live dream probe
  // Phase 5: surface the workspace roots list + dropped entries so
  // the user can see which projects connected and re-grant any that
  // lapsed.
  getWorkspaceRoots, // () => { roots, writeRootId, dropped }
  onReconnectRoot, // async (droppedEntry) => boolean
  onAddRoot, // async () => boolean — pick a folder, append to manifest, reload
  onRemoveRoot, // async (rootId) => boolean — strip from manifest, drop IDB handle, reload
  onRescan, // async () => void — flush pending edits + reload to pick up external file changes
  // surfaces the ON/OFF indicator so the user can verify at a glance
  // whether the dream loop is actually running.
}) {
  const pane = document.getElementById("settings");
  if (!pane) return { open: () => {}, close: () => {}, toggle: () => {} };

  // Replace the read-only preview with a structured form scaffold.
  pane.innerHTML = `
    <h2>Settings</h2>

    <section class="settings-group">
      <h3>Appearance</h3>
      <label class="settings-row">
        <span>Accent</span>
        <input type="color" id="s-accent" />
      </label>
      <label class="settings-row">
        <span>Ambience</span>
        <select id="s-ambience"></select>
      </label>
      <p class="settings-hint" id="s-ambience-blurb"></p>
      <label class="settings-row">
        <span>Intensity</span>
        <input type="range" id="s-ambience-intensity" min="0" max="2" step="0.05" />
        <span id="s-ambience-intensity-value" class="tag-count"></span>
      </label>
      <p class="settings-hint">
        How pronounced the ambience shift reads — 1 is the preset as authored.
      </p>
      <label class="settings-row">
        <span>Labels</span>
        <select id="s-label-mode">
          <option value="always">Always</option>
          <option value="hover">On hover</option>
          <option value="never">Never</option>
        </select>
      </label>
      <p class="settings-hint">
        Toggle with <b>L</b>. Hover shows one title near the pointed star;
        Never keeps the universe silent.
      </p>
      <label class="settings-row">
        <span>Constellations</span>
        <input type="checkbox" id="s-show-constellations" />
      </label>
      <p class="settings-hint">
        Cluster-level labels that appear when you zoom out. Click one to
        frame the whole region.
      </p>
      <label class="settings-row">
        <span>Quality</span>
        <div class="settings-quality-pick" id="s-quality-pick">
          <button type="button" data-tier="low">Low</button>
          <button type="button" data-tier="medium">Medium</button>
          <button type="button" data-tier="high">High</button>
          <button type="button" data-tier="ultra">Ultra</button>
        </div>
      </label>
      <label class="settings-row">
        <span>Auto-throttle</span>
        <input type="checkbox" id="s-quality-auto" />
      </label>
      <p class="settings-hint">
        The chosen quality is the ceiling. Auto-throttle may temporarily
        drop lower under peak load (heavy dream motion, post-bulk settle)
        and raise back up when the scene quiets. Turn off for stable
        recording / screenshots.
      </p>
    </section>

    <section class="settings-group">
      <h3>Home view</h3>
      <p class="settings-hint">
        Where the camera lands when you open the app.
      </p>
      <label class="settings-row">
        <span>Mode</span>
        <select id="s-home-view">
          <option value="last_focused">Last focused</option>
          <option value="daily">Today's daily</option>
          <option value="overview">Overview</option>
        </select>
      </label>
    </section>

    <section class="settings-group">
      <h3>Observer chorus</h3>
      <p class="settings-hint">
        Ambient voice. The universe occasionally surfaces a sentence about a
        note or a cluster, grounded strictly in what's in your vault. Off by
        default.
      </p>
      <label class="settings-row">
        <span>Enabled</span>
        <input type="checkbox" id="s-chorus-on" />
      </label>
      <label class="settings-row">
        <span>Density</span>
        <select id="s-chorus-density">
          <option value="low">Low — one every 20 s</option>
          <option value="med">Medium — one every 10 s</option>
          <option value="high">High — one every 5 s</option>
        </select>
      </label>
      <label class="settings-row">
        <span>Font size</span>
        <input
          type="range"
          id="s-chorus-font"
          min="9"
          max="18"
          step="1"
        />
        <span class="settings-row-num" id="s-chorus-font-val">12</span>
      </label>
    </section>

    <section class="settings-group">
      <h3>
        Dream
        <span id="s-dream-status" class="settings-status">off</span>
      </h3>
      <p class="settings-hint" id="s-dream-status-line">
        After the app is idle for a while, Sleep Depth ramps up; physics
        loosens, the chorus quiets, and captions are logged for a morning
        report. Move the mouse to wake up.
      </p>
      <label class="settings-row">
        <span>Sleep depth</span>
        <input
          type="range"
          id="s-sleep-depth"
          min="0"
          max="1"
          step="0.02"
        />
        <span class="settings-row-num" id="s-sleep-depth-val">0.00</span>
      </label>
      <label class="settings-row">
        <span>Cap</span>
        <input
          type="range"
          id="s-sleep-cap"
          min="0"
          max="1"
          step="0.02"
        />
        <span class="settings-row-num" id="s-sleep-cap-val">0.85</span>
      </label>
      <label class="settings-row">
        <span>Idle min</span>
        <input type="number" id="s-idle-min" min="1" max="120" step="1" />
      </label>
      <div class="settings-row">
        <button type="button" id="s-dream-now" class="ghost">Dream now</button>
      </div>
      <label class="settings-row">
        <span>Gravity</span>
        <input type="checkbox" id="s-dream-gravity" />
      </label>
      <p class="settings-hint">
        An invisible attractor wanders through the universe while you
        sleep, curling linked notes into arcs. Off = quieter dream.
      </p>
      <label class="settings-row">
        <span>Strength</span>
        <input
          type="range"
          id="s-dream-gravity-strength"
          min="0"
          max="10000"
          step="200"
        />
        <span class="settings-row-num" id="s-dream-gravity-strength-val">2800</span>
      </label>
      <div class="settings-row">
        <button type="button" id="s-dream-preview" class="ghost">Preview peak</button>
      </div>
      <p class="settings-hint">
        Preview forces Sleep depth to 0.85 for 30&nbsp;s so you can see the
        attractor at its most aggressive without waiting through the cycle.
      </p>
      <label class="settings-row">
        <span>Theme</span>
        <select id="s-dream-theme"></select>
      </label>
      <p class="settings-hint">
        Tonight's dream focuses here. Pairs can still come from anywhere,
        but every suggestion at morning time is FOR the theme. Random =
        no focus.
      </p>
    </section>

    <section class="settings-group">
      <h3>Folders</h3>
      <p class="settings-hint">
        Folders tint the halo around each note without changing its core.
        Influence is how much folder membership pulls notes into their own
        region during layout. Off by default.
      </p>
      <label class="settings-row">
        <span>Influence</span>
        <input type="range" id="s-folder-influence" min="0" max="1" step="0.02" />
        <span class="settings-row-num" id="s-folder-influence-val">0</span>
      </label>
      <div id="s-folder-tints" class="settings-grid"></div>
    </section>

    <section class="settings-group">
      <h3>Safety</h3>
      <p class="settings-hint">
        Extra confirmation steps for destructive actions. Turn off once the
        gestures feel second-nature.
      </p>
      <label class="settings-row">
        <span>Confirm before unlinking</span>
        <input type="checkbox" id="s-confirm-unlink" />
      </label>
    </section>

    <section class="settings-group">
      <h3>Kind labels</h3>
      <div id="s-kind-labels" class="settings-grid"></div>
    </section>

    <section class="settings-group">
      <h3>Tags → kind</h3>
      <p class="settings-hint">
        The top tags in your vault. Pick which kind each belongs to — tinting
        is immediate, nothing is saved to your notes.
      </p>
      <div id="s-tag-rows" class="settings-grid"></div>
      <div class="settings-row add-row">
        <input id="s-new-tag" type="text" placeholder="add tag" spellcheck="false" />
        <select id="s-new-kind"></select>
        <button id="s-add-btn" type="button">+</button>
      </div>
      <div class="settings-row">
        <button type="button" id="s-reshow-tag-prompt" class="ghost">
          Re-run tag discovery prompt
        </button>
      </div>
    </section>

    <section class="settings-group" id="s-workspace-section">
      <h3>Workspace</h3>
      <p class="settings-hint" id="s-workspace-desc"></p>
      <div class="settings-row" id="s-workspace-actions"></div>
      <div id="s-workspace-roots" class="settings-roots"></div>
    </section>

    <section class="settings-group" id="s-voice-section">
      <h3>Voice backend</h3>
      <p class="settings-hint">
        How the chorus and dream captions are phrased. Template is the floor
        and the fallback; on-device and Claude are optional depth. See
        MODEL_SURFACES.md for what each is allowed to touch.
      </p>
      <div class="settings-row">
        <span>Backend</span>
        <select id="s-voice-backend"></select>
      </div>
      <p class="settings-hint" id="s-voice-backend-meta"></p>

      <div id="s-voice-local-rows" style="display:none">
        <label class="settings-row">
          <span>Endpoint URL</span>
          <input
            type="text"
            id="s-voice-local-endpoint"
            placeholder="http://10.0.0.201:11434/api/chat"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-row">
          <span>Model name</span>
          <input
            type="text"
            id="s-voice-local-model"
            placeholder="qwen3.5:9b"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <label class="settings-row">
          <span>API key (optional)</span>
          <input
            type="password"
            id="s-voice-local-key"
            placeholder="only needed for LM Studio / tabbyAPI"
            autocomplete="off"
            spellcheck="false"
          />
        </label>
        <div class="settings-row">
          <button type="button" id="s-voice-local-test" class="ghost">
            Test connection
          </button>
          <span class="settings-row-num" id="s-voice-local-status"></span>
        </div>
        <p class="settings-hint">
          Ollama needs <code>OLLAMA_ORIGINS=*</code> (or the dev server's
          origin) set on the rig, else the browser blocks the response
          with CORS. On the rig:
          <code>launchctl setenv OLLAMA_ORIGINS "*"</code> (macOS) or set
          it as a systemd env var / Windows environment variable.
        </p>
      </div>

      <div class="settings-row" id="s-voice-claude-row" style="display:none">
        <span>Claude API key</span>
        <input
          type="password"
          id="s-voice-claude-key"
          placeholder="sk-ant-…"
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" id="s-voice-claude-save" class="ghost">
          Save
        </button>
      </div>
      <p class="settings-hint" id="s-voice-claude-status"></p>
    </section>

    <section class="settings-group" id="s-tend-section">
      <h3>Tend</h3>
      <p class="settings-hint">
        Scan the vault for obvious housekeeping — missing tags, un-linked
        mentions, duplicate titles, stubs. Proposes, never writes without
        confirmation. See STATES.md §2.
      </p>
      <div class="settings-grid" id="s-tend-passes"></div>
      <div class="settings-row">
        <button type="button" id="s-tend-run" class="ghost">
          Run Tend now
        </button>
        <span class="settings-row-num" id="s-tend-status"></span>
      </div>
      <label class="settings-row">
        <span>Bulk pace</span>
        <div class="settings-quality-pick" id="s-tend-pace-pick">
          <button type="button" data-pace="fast">Fast</button>
          <button type="button" data-pace="chill">Chill</button>
          <button type="button" data-pace="manual">Manual</button>
        </div>
      </label>
      <p class="settings-hint">
        Accept-all tempo. <b>Fast</b> is the legacy sprint (~80 items/s) —
        good for small batches on beefy machines. <b>Chill</b> matches
        what the LLM polish pass can keep up with (~4 items/s), safe at
        any batch size. <b>Manual</b> hides the Accept-all button entirely.
      </p>
    </section>

    <section class="settings-group" id="s-weed-section">
      <h3>Weed</h3>
      <p class="settings-hint">
        Review the orphan candidates computed during the dream cycle. Keep
        what you want to hold on to; archive what you're willing to lose;
        delete what you want gone from disk. See STATES.md §3.
      </p>
      <label class="settings-row">
        <span>Enabled</span>
        <input type="checkbox" id="s-weed-enabled" />
      </label>
      <label class="settings-row">
        <span>Growth toast threshold</span>
        <input type="number" id="s-weed-threshold" min="1" max="100" step="1" />
      </label>
      <p class="settings-hint">
        Soft-toast fires when this many new candidates accumulate since you
        last opened Weed.
      </p>
      <div class="settings-row">
        <button type="button" id="s-weed-open" class="ghost">
          Open Weed now
        </button>
        <span class="settings-row-num" id="s-weed-status"></span>
      </div>
      <div class="settings-row">
        <span>Kept permanently</span>
        <span class="settings-row-num" id="s-weed-keep-count">0</span>
      </div>
      <div id="s-weed-keep-list" class="settings-grid"></div>
    </section>

    <section class="settings-group" id="s-brief-section">
      <h3>Brief</h3>
      <p class="settings-hint">
        A small panel on workspace open with your anchors, recent notes,
        one long-quiet orphan, and one obvious-link pair. Dismissable with
        esc or any nav key. See STATES.md §4.
      </p>
      <label class="settings-row">
        <span>Show on open</span>
        <input type="checkbox" id="s-brief-on-open" />
      </label>
    </section>

    <section class="settings-group">
      <h3>Help</h3>
      <div class="settings-row">
        <button type="button" id="s-show-hotkeys" class="ghost">
          Show hotkeys
        </button>
        <button type="button" id="s-reset-coachmarks" class="ghost">
          Reset coachmarks
        </button>
        <button type="button" id="s-about" class="ghost">About</button>
      </div>
    </section>

    <div class="settings-hint settings-footer">press \\ to close</div>
  `;

  const accentInput = pane.querySelector("#s-accent");
  const ambienceSelect = pane.querySelector("#s-ambience");
  const ambienceBlurb = pane.querySelector("#s-ambience-blurb");
  const ambienceIntensity = pane.querySelector("#s-ambience-intensity");
  const ambienceIntensityValue = pane.querySelector(
    "#s-ambience-intensity-value",
  );
  const labelModeSelect = pane.querySelector("#s-label-mode");
  const showConstellations = pane.querySelector("#s-show-constellations");
  const qualityPick = pane.querySelector("#s-quality-pick");
  const qualityAuto = pane.querySelector("#s-quality-auto");
  const tendPacePick = pane.querySelector("#s-tend-pace-pick");
  const homeViewSelect = pane.querySelector("#s-home-view");

  // Populate ambience options once; selection reflects current setting on
  // each render() call.
  for (const id of AMBIENCE_ORDER) {
    const preset = AMBIENCE_PRESETS[id];
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = preset.label;
    ambienceSelect.appendChild(opt);
  }
  ambienceSelect.addEventListener("change", () => {
    const id = ambienceSelect.value;
    onChange({ ambience_wake: id });
    const preset = AMBIENCE_PRESETS[id];
    if (ambienceBlurb) ambienceBlurb.textContent = preset?.blurb || "";
  });
  ambienceIntensity.addEventListener("input", () => {
    const v = Number(ambienceIntensity.value);
    if (ambienceIntensityValue)
      ambienceIntensityValue.textContent = v.toFixed(2);
    onChange({ ambience_intensity: v });
  });
  labelModeSelect.addEventListener("change", () => {
    onChange({ label_mode: labelModeSelect.value });
  });
  if (showConstellations) {
    showConstellations.addEventListener("change", () => {
      onChange({ show_constellations: showConstellations.checked });
    });
  }
  if (qualityPick) {
    qualityPick.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-tier]");
      if (!btn) return;
      const tier = btn.dataset.tier;
      if (!tier) return;
      onChange({ render_quality_ceiling: tier });
      syncQualityPick(tier);
    });
  }
  if (qualityAuto) {
    qualityAuto.addEventListener("change", () => {
      onChange({ render_quality_auto: qualityAuto.checked });
    });
  }

  function syncQualityPick(tier) {
    if (!qualityPick) return;
    const buttons = qualityPick.querySelectorAll("button[data-tier]");
    for (const b of buttons) {
      b.classList.toggle("is-active", b.dataset.tier === tier);
    }
  }
  if (tendPacePick) {
    tendPacePick.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-pace]");
      if (!btn) return;
      const pace = btn.dataset.pace;
      if (!pace) return;
      onChange({ tend_bulk_pace: pace });
      syncTendPacePick(pace);
    });
  }
  function syncTendPacePick(pace) {
    if (!tendPacePick) return;
    const buttons = tendPacePick.querySelectorAll("button[data-pace]");
    for (const b of buttons) {
      b.classList.toggle("is-active", b.dataset.pace === pace);
    }
  }
  const chorusOn = pane.querySelector("#s-chorus-on");
  const chorusDensity = pane.querySelector("#s-chorus-density");
  const chorusFont = pane.querySelector("#s-chorus-font");
  const chorusFontVal = pane.querySelector("#s-chorus-font-val");
  const dreamStatusEl = pane.querySelector("#s-dream-status");
  const dreamStatusLineEl = pane.querySelector("#s-dream-status-line");
  // Poll the dream state every 400 ms while the settings pane is open.
  // Deliberately not bound to onFrame — the pane is hidden most of the
  // time and a 2.5 Hz poll is more than sufficient for an ON/OFF + phase
  // indicator. Cancelled when close() runs.
  let dreamStatusTimer = 0;
  function renderDreamStatus() {
    if (!dreamStatusEl || !getDreamStatus) return;
    const s = getDreamStatus();
    if (!s) {
      dreamStatusEl.textContent = "no workspace";
      dreamStatusEl.dataset.state = "off";
      return;
    }
    const { state, phase, depth } = s;
    let label;
    let flag;
    if (state === "wake") {
      label = "OFF · idle";
      flag = "off";
    } else if (state === "falling") {
      label = `DRIFTING · depth ${(depth || 0).toFixed(2)}`;
      flag = "on";
    } else if (state === "waking") {
      label = `WAKING · depth ${(depth || 0).toFixed(2)}`;
      flag = "on";
    } else if (state === "dreaming" && phase) {
      label = `ON · ${phase.toUpperCase()} · depth ${(depth || 0).toFixed(2)}`;
      flag = "on";
    } else {
      label = `ON · depth ${(depth || 0).toFixed(2)}`;
      flag = "on";
    }
    dreamStatusEl.textContent = label;
    dreamStatusEl.dataset.state = flag;
  }

  const sleepDepth = pane.querySelector("#s-sleep-depth");
  const sleepDepthVal = pane.querySelector("#s-sleep-depth-val");
  const sleepCap = pane.querySelector("#s-sleep-cap");
  const sleepCapVal = pane.querySelector("#s-sleep-cap-val");
  const idleMin = pane.querySelector("#s-idle-min");
  const dreamNowBtn = pane.querySelector("#s-dream-now");
  const dreamGravityToggle = pane.querySelector("#s-dream-gravity");
  const dreamGravityStrength = pane.querySelector("#s-dream-gravity-strength");
  const dreamGravityStrengthVal = pane.querySelector(
    "#s-dream-gravity-strength-val",
  );
  const dreamPreviewBtn = pane.querySelector("#s-dream-preview");
  const dreamThemeSelect = pane.querySelector("#s-dream-theme");
  const tendPassesEl = pane.querySelector("#s-tend-passes");
  const tendRunBtn = pane.querySelector("#s-tend-run");
  const tendStatusEl = pane.querySelector("#s-tend-status");
  const folderInfluence = pane.querySelector("#s-folder-influence");
  const folderInfluenceVal = pane.querySelector("#s-folder-influence-val");
  const folderTintsEl = pane.querySelector("#s-folder-tints");
  const confirmUnlink = pane.querySelector("#s-confirm-unlink");
  const kindLabelsEl = pane.querySelector("#s-kind-labels");
  const tagRowsEl = pane.querySelector("#s-tag-rows");
  const newTagInput = pane.querySelector("#s-new-tag");
  const newKindSelect = pane.querySelector("#s-new-kind");
  const addBtn = pane.querySelector("#s-add-btn");
  const reshowTagBtn = pane.querySelector("#s-reshow-tag-prompt");
  const resetCoachBtn = pane.querySelector("#s-reset-coachmarks");
  const aboutBtn = pane.querySelector("#s-about");
  const workspaceDesc = pane.querySelector("#s-workspace-desc");
  const workspaceActions = pane.querySelector("#s-workspace-actions");
  const workspaceRoots = pane.querySelector("#s-workspace-roots");

  if (reshowTagBtn && onReshowTagPrompt) {
    reshowTagBtn.addEventListener("click", () => {
      close();
      onReshowTagPrompt();
    });
  }
  if (resetCoachBtn && onResetCoachmarks) {
    resetCoachBtn.addEventListener("click", () => {
      onResetCoachmarks();
    });
  }
  if (aboutBtn && onShowAbout) {
    aboutBtn.addEventListener("click", () => onShowAbout());
  }
  const showHotkeysBtn = pane.querySelector("#s-show-hotkeys");
  if (showHotkeysBtn) {
    showHotkeysBtn.addEventListener("click", () => {
      showHotkeyOverlay();
    });
  }

  accentInput.addEventListener("input", () => {
    onChange({ accent: accentInput.value });
  });
  homeViewSelect.addEventListener("change", () => {
    onChange({ home_view: homeViewSelect.value });
  });
  folderInfluence.addEventListener("input", () => {
    const v = Number(folderInfluence.value);
    folderInfluenceVal.textContent = v.toFixed(2);
    onChange({ folder_influence: v });
  });
  chorusOn.addEventListener("change", () => {
    onChange({ observer_chorus: chorusOn.checked });
  });
  if (confirmUnlink) {
    confirmUnlink.addEventListener("change", () => {
      onChange({ confirm_unlink: confirmUnlink.checked });
    });
  }
  chorusDensity.addEventListener("change", () => {
    onChange({ chorus_density: chorusDensity.value });
  });
  chorusFont.addEventListener("input", () => {
    const v = Number(chorusFont.value);
    chorusFontVal.textContent = String(v);
    onChange({ chorus_font_size: v });
  });
  sleepDepth.addEventListener("input", () => {
    const v = Number(sleepDepth.value);
    sleepDepthVal.textContent = v.toFixed(2);
    if (onSetSleepDepth) onSetSleepDepth(v);
  });
  sleepCap.addEventListener("input", () => {
    const v = Number(sleepCap.value);
    sleepCapVal.textContent = v.toFixed(2);
    onChange({ sleep_depth_cap: v });
  });
  idleMin.addEventListener("change", () => {
    const v = Math.max(1, Math.min(120, Math.round(Number(idleMin.value))));
    idleMin.value = String(v);
    onChange({ idle_minutes_to_dream: v });
  });
  if (dreamNowBtn) {
    dreamNowBtn.addEventListener("click", () => {
      if (onDreamNow) onDreamNow();
    });
  }
  if (dreamGravityToggle) {
    dreamGravityToggle.addEventListener("change", () => {
      onChange({ dream_gravity: dreamGravityToggle.checked });
    });
  }
  if (dreamGravityStrength) {
    dreamGravityStrength.addEventListener("input", () => {
      const v = Number(dreamGravityStrength.value);
      if (dreamGravityStrengthVal)
        dreamGravityStrengthVal.textContent = String(v);
      onChange({ dream_gravity_strength: v });
    });
  }
  if (dreamPreviewBtn) {
    dreamPreviewBtn.addEventListener("click", () => {
      if (onDreamPreview) onDreamPreview();
    });
  }
  if (dreamThemeSelect) {
    dreamThemeSelect.addEventListener("change", () => {
      const raw = dreamThemeSelect.value;
      // "" sentinel = random / no theme.
      if (!raw) {
        onChange({ dream_theme: null });
        return;
      }
      // Format: "<kind>::<value>". Split only on the first "::" so
      // values containing colons (rare but possible in tags) survive.
      const sep = raw.indexOf("::");
      if (sep < 0) {
        onChange({ dream_theme: null });
        return;
      }
      const kind = raw.slice(0, sep);
      const value = raw.slice(sep + 2);
      onChange({ dream_theme: { kind, value } });
    });
  }

  addBtn.addEventListener("click", () => {
    const tag = newTagInput.value.trim().replace(/^#/, "");
    if (!tag) return;
    const kind = Number(newKindSelect.value);
    const settings = getSettings();
    const next = { ...settings.tag_to_kind, [tag]: kind };
    newTagInput.value = "";
    onChange({ tag_to_kind: next });
    render();
  });
  newTagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn.click();
    }
  });

  function render() {
    const settings = getSettings();
    renderTendPasses();
    renderVoice();
    renderWeed();
    accentInput.value = settings.accent || "#8ab4ff";
    const ambId = settings.ambience_wake || "default";
    ambienceSelect.value = AMBIENCE_PRESETS[ambId] ? ambId : "default";
    if (ambienceBlurb)
      ambienceBlurb.textContent = AMBIENCE_PRESETS[ambId]?.blurb || "";
    const ambInt =
      typeof settings.ambience_intensity === "number"
        ? settings.ambience_intensity
        : 1;
    ambienceIntensity.value = String(ambInt);
    if (ambienceIntensityValue)
      ambienceIntensityValue.textContent = ambInt.toFixed(2);
    const lm = settings.label_mode || "always";
    labelModeSelect.value =
      lm === "hover" || lm === "never" || lm === "always" ? lm : "always";
    if (showConstellations) {
      showConstellations.checked = settings.show_constellations !== false;
    }
    const currentTier = settings.render_quality_ceiling || "high";
    syncQualityPick(currentTier);
    if (qualityAuto) {
      qualityAuto.checked = settings.render_quality_auto !== false;
    }
    syncTendPacePick(settings.tend_bulk_pace || "chill");
    homeViewSelect.value = settings.home_view || "last_focused";
    chorusOn.checked = !!settings.observer_chorus;
    if (confirmUnlink)
      confirmUnlink.checked = settings.confirm_unlink !== false;
    chorusDensity.value = settings.chorus_density || "med";
    const fs = Number(settings.chorus_font_size) || 12;
    chorusFont.value = String(fs);
    chorusFontVal.textContent = String(fs);
    const liveDepth = getSleepDepth ? getSleepDepth() : 0;
    sleepDepth.value = String(liveDepth);
    sleepDepthVal.textContent = liveDepth.toFixed(2);
    const cap = Number(settings.sleep_depth_cap);
    const capV = Number.isFinite(cap) ? cap : 0.85;
    sleepCap.value = String(capV);
    sleepCapVal.textContent = capV.toFixed(2);
    idleMin.value = String(settings.idle_minutes_to_dream || 10);
    if (dreamGravityToggle) {
      dreamGravityToggle.checked = settings.dream_gravity !== false;
    }
    if (dreamGravityStrength) {
      const strengthV = Number(settings.dream_gravity_strength);
      const v = Number.isFinite(strengthV) ? strengthV : 2800;
      dreamGravityStrength.value = String(v);
      if (dreamGravityStrengthVal)
        dreamGravityStrengthVal.textContent = String(v);
    }
    renderDreamThemeOptions();
    const inf = Number(settings.folder_influence || 0);
    folderInfluence.value = String(inf);
    folderInfluenceVal.textContent = inf.toFixed(2);
    renderFolderTints();
    renderWorkspaceSection();

    // kind labels
    kindLabelsEl.innerHTML = "";
    for (let k = 0; k < NUM_KINDS; k++) {
      const row = document.createElement("label");
      row.className = "settings-row";
      const name = document.createElement("span");
      name.className = "kind-num";
      name.textContent = String(k);
      const input = document.createElement("input");
      input.type = "text";
      input.value =
        settings.kind_labels?.[k] ||
        settings.kind_labels?.[String(k)] ||
        `Kind ${k}`;
      input.addEventListener("change", () => {
        const next = { ...(settings.kind_labels || {}) };
        next[k] = input.value.trim() || `Kind ${k}`;
        onChange({ kind_labels: next });
        populateKindSelects();
      });
      row.append(name, input);
      kindLabelsEl.append(row);
    }

    populateKindSelects();

    // tag rows: top tags in vault first, then any manually-added tags
    const vault = getVault && getVault();
    const tagCounts = vault?.tagCounts || new Map();
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map((x) => x[0]);
    const mapped = Object.keys(settings.tag_to_kind || {});
    const order = [];
    const seen = new Set();
    for (const t of topTags)
      if (!seen.has(t) && (seen.add(t), true)) order.push(t);
    for (const t of mapped)
      if (!seen.has(t) && (seen.add(t), true)) order.push(t);

    tagRowsEl.innerHTML = "";
    for (const tag of order) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const label = document.createElement("span");
      label.className = "tag-label";
      label.textContent = `#${tag}`;
      const count = document.createElement("span");
      count.className = "tag-count";
      count.textContent = tagCounts.get(tag) ? `${tagCounts.get(tag)}` : "—";
      const select = kindSelect();
      const current = settings.tag_to_kind?.[tag];
      select.value = Number.isInteger(current) ? String(current) : "";
      select.addEventListener("change", () => {
        const next = { ...(settings.tag_to_kind || {}) };
        const v = select.value;
        if (v === "") delete next[tag];
        else next[tag] = Number(v);
        onChange({ tag_to_kind: next });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost";
      remove.textContent = "×";
      remove.title = "Unmap this tag";
      remove.addEventListener("click", () => {
        const next = { ...(settings.tag_to_kind || {}) };
        delete next[tag];
        onChange({ tag_to_kind: next });
        render();
      });
      row.append(label, count, select, remove);
      tagRowsEl.append(row);
    }
  }

  // Render the Phase 7 voice backend chooser + Claude key row. The
  // chooser shows latency / cost / offline expectations from
  // BACKEND_META so the choice isn't made blind. The Claude row is
  // only visible when Claude is selected — seeing an API key field
  // while on template would be noise.
  function renderVoice() {
    if (!voiceBackendSelect) return;
    const settings = getSettings();
    const choice = settings.utterance_backend || "template";
    voiceBackendSelect.value = BACKEND_META[choice] ? choice : "template";
    const meta = BACKEND_META[voiceBackendSelect.value];
    if (voiceBackendMeta && meta) {
      const netLabel =
        meta.network === false
          ? "offline"
          : meta.network === "LAN only"
            ? "LAN only"
            : meta.network === true
              ? "needs network"
              : String(meta.network);
      voiceBackendMeta.textContent = `${meta.latency} · ${meta.costPerCall} · ${netLabel} — ${meta.notes}`;
    }
    if (voiceLocalRows) {
      voiceLocalRows.style.display =
        voiceBackendSelect.value === "local" ? "" : "none";
    }
    // Fill the local inputs from settings so switching into Local shows
    // the current values immediately — blank fields mid-session reads
    // as broken.
    if (voiceLocalEndpoint)
      voiceLocalEndpoint.value = settings.utterance_local_endpoint || "";
    if (voiceLocalModel)
      voiceLocalModel.value = settings.utterance_local_model || "";
    if (voiceLocalKey)
      voiceLocalKey.value = settings.utterance_local_api_key || "";
    if (voiceClaudeRow) {
      voiceClaudeRow.style.display =
        voiceBackendSelect.value === "claude" ? "" : "none";
    }
    // Surface the current key (masked) + availability hint.
    if (voiceBackendSelect.value === "claude" && getClaudeApiKey) {
      Promise.resolve(getClaudeApiKey()).then((key) => {
        if (voiceClaudeKey) voiceClaudeKey.value = "";
        if (voiceClaudeStatus) {
          voiceClaudeStatus.textContent = key
            ? `Key on file (…${key.slice(-4)}). First request of each shape this session will show a payload preview.`
            : "No key saved. Paste one above to enable Claude. Anthropic keys start with sk-ant-.";
        }
      });
    }
    // Show the fleet-wide status if available — offline/unavailable
    // backends should read "unavailable" rather than silently falling
    // back in the background.
    if (getUtteranceStatus) {
      const status = getUtteranceStatus();
      for (const opt of voiceBackendSelect.options) {
        const s = status[opt.value];
        if (!s) continue;
        const tail = s.available ? "" : " · (unavailable)";
        if (!opt.textContent.endsWith(tail))
          opt.textContent = `${BACKEND_META[opt.value].label}${tail}`;
      }
    }
  }

  // Render the Weed toggle, threshold, and keep-list editor. The keep
  // list is surfaced as id · title rows with a × button — removing a row
  // un-keeps the note so future prune passes will re-surface it.
  function renderWeed() {
    if (!weedEnabledInput) return;
    const settings = getSettings();
    if (briefOnOpenInput)
      briefOnOpenInput.checked = settings.brief_on_open !== false;
    weedEnabledInput.checked = settings.weed_enabled !== false;
    const t = Number(settings.weed_growth_threshold);
    weedThresholdInput.value = String(Number.isFinite(t) && t > 0 ? t : 5);
    const keep = getWeedKeep ? getWeedKeep() : { keptIds: [] };
    const ids = keep?.keptIds || [];
    if (weedKeepCountEl) weedKeepCountEl.textContent = String(ids.length);
    if (!weedKeepListEl) return;
    weedKeepListEl.innerHTML = "";
    if (ids.length === 0) return;
    const vault = getVault && getVault();
    for (const id of ids) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const label = document.createElement("span");
      label.className = "tag-label";
      const note = vault?.byId?.get(id);
      label.textContent = note ? note.title || note.path : id;
      const path = document.createElement("span");
      path.className = "tag-count";
      path.textContent = note ? note.path : "(not in vault)";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost";
      remove.textContent = "×";
      remove.title =
        "Remove from keep list — future prune passes can re-surface this.";
      remove.addEventListener("click", async () => {
        if (!onWeedUnkeep) return;
        await onWeedUnkeep(id);
        renderWeed();
      });
      row.append(label, path, remove);
      weedKeepListEl.appendChild(row);
    }
  }

  // Render the per-pass checkbox list for Tend. Each row toggles the
  // `tend_passes[<passId>]` value in settings; the default is true when
  // the flag is absent so new passes opt-in by default.
  function renderTendPasses() {
    if (!tendPassesEl) return;
    const settings = getSettings();
    const state = settings.tend_passes || {};
    tendPassesEl.innerHTML = "";
    for (const [id, label] of Object.entries(TEND_PASS_LABELS)) {
      const row = document.createElement("label");
      row.className = "settings-row";
      const span = document.createElement("span");
      span.textContent = label;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state[id] !== false;
      input.addEventListener("change", () => {
        const next = { ...(getSettings().tend_passes || {}) };
        next[id] = input.checked;
        onChange({ tend_passes: next });
      });
      row.append(span, input);
      tendPassesEl.appendChild(row);
    }
  }

  if (tendRunBtn) {
    tendRunBtn.addEventListener("click", async () => {
      if (!onRunTend) return;
      const state = getSettings().tend_passes || {};
      const enabled = Object.keys(TEND_PASS_LABELS).filter(
        (id) => state[id] !== false,
      );
      if (enabled.length === 0) {
        if (tendStatusEl) tendStatusEl.textContent = "no passes enabled";
        return;
      }
      tendRunBtn.disabled = true;
      if (tendStatusEl) tendStatusEl.textContent = "scanning…";
      try {
        const n = await onRunTend(enabled);
        if (tendStatusEl)
          tendStatusEl.textContent =
            n > 0
              ? `${n} proposal${n === 1 ? "" : "s"} — opening drawer`
              : "no proposals";
      } catch (err) {
        console.error("[bz] tend run failed", err);
        if (tendStatusEl) tendStatusEl.textContent = "scan failed";
      } finally {
        tendRunBtn.disabled = false;
      }
    });
  }

  const voiceBackendSelect = pane.querySelector("#s-voice-backend");
  const voiceBackendMeta = pane.querySelector("#s-voice-backend-meta");
  const voiceLocalRows = pane.querySelector("#s-voice-local-rows");
  const voiceLocalEndpoint = pane.querySelector("#s-voice-local-endpoint");
  const voiceLocalModel = pane.querySelector("#s-voice-local-model");
  const voiceLocalKey = pane.querySelector("#s-voice-local-key");
  const voiceLocalTest = pane.querySelector("#s-voice-local-test");
  const voiceLocalStatus = pane.querySelector("#s-voice-local-status");
  const voiceClaudeRow = pane.querySelector("#s-voice-claude-row");
  const voiceClaudeKey = pane.querySelector("#s-voice-claude-key");
  const voiceClaudeSave = pane.querySelector("#s-voice-claude-save");
  const voiceClaudeStatus = pane.querySelector("#s-voice-claude-status");

  // Local-rig field changes flow directly into settings via onChange,
  // matching the pattern used for accent / ambience / sleep cap.
  if (voiceLocalEndpoint) {
    voiceLocalEndpoint.addEventListener("change", () => {
      onChange({ utterance_local_endpoint: voiceLocalEndpoint.value.trim() });
    });
  }
  if (voiceLocalModel) {
    voiceLocalModel.addEventListener("change", () => {
      onChange({ utterance_local_model: voiceLocalModel.value.trim() });
    });
  }
  if (voiceLocalKey) {
    voiceLocalKey.addEventListener("change", () => {
      onChange({ utterance_local_api_key: voiceLocalKey.value });
    });
  }
  if (voiceLocalTest) {
    voiceLocalTest.addEventListener("click", async () => {
      if (!onTestLocalBackend) return;
      voiceLocalTest.disabled = true;
      if (voiceLocalStatus) voiceLocalStatus.textContent = "testing…";
      try {
        const result = await onTestLocalBackend();
        if (voiceLocalStatus) {
          voiceLocalStatus.textContent = result?.ok
            ? `ok · ${result.detail || ""}`
            : `failed · ${result?.detail || "unknown error"}`;
          voiceLocalStatus.style.color = result?.ok
            ? "var(--accent)"
            : "var(--text-dim)";
        }
      } catch (err) {
        if (voiceLocalStatus) {
          voiceLocalStatus.textContent = `failed · ${err?.message || err}`;
          voiceLocalStatus.style.color = "var(--text-dim)";
        }
      } finally {
        voiceLocalTest.disabled = false;
      }
    });
  }

  if (voiceBackendSelect) {
    for (const [id, meta] of Object.entries(BACKEND_META)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = meta.label;
      voiceBackendSelect.appendChild(opt);
    }
    voiceBackendSelect.addEventListener("change", () => {
      onChange({ utterance_backend: voiceBackendSelect.value });
      renderVoice();
    });
  }

  if (voiceClaudeSave) {
    voiceClaudeSave.addEventListener("click", async () => {
      if (!onSetClaudeApiKey) return;
      const key = (voiceClaudeKey?.value || "").trim();
      voiceClaudeSave.disabled = true;
      try {
        await onSetClaudeApiKey(key || null);
        if (voiceClaudeStatus) {
          voiceClaudeStatus.textContent = key
            ? "Key saved locally in your browser (IndexedDB). Never sent anywhere except Anthropic on your approved calls."
            : "Key cleared.";
        }
      } finally {
        voiceClaudeSave.disabled = false;
      }
    });
  }

  const briefOnOpenInput = pane.querySelector("#s-brief-on-open");
  if (briefOnOpenInput) {
    briefOnOpenInput.addEventListener("change", () => {
      onChange({ brief_on_open: briefOnOpenInput.checked });
    });
  }

  const weedEnabledInput = pane.querySelector("#s-weed-enabled");
  const weedThresholdInput = pane.querySelector("#s-weed-threshold");
  const weedOpenBtn = pane.querySelector("#s-weed-open");
  const weedStatusEl = pane.querySelector("#s-weed-status");
  const weedKeepCountEl = pane.querySelector("#s-weed-keep-count");
  const weedKeepListEl = pane.querySelector("#s-weed-keep-list");

  if (weedEnabledInput) {
    weedEnabledInput.addEventListener("change", () => {
      onChange({ weed_enabled: weedEnabledInput.checked });
    });
  }
  if (weedThresholdInput) {
    weedThresholdInput.addEventListener("change", () => {
      const v = Math.max(
        1,
        Math.min(100, Math.round(Number(weedThresholdInput.value) || 5)),
      );
      weedThresholdInput.value = String(v);
      onChange({ weed_growth_threshold: v });
    });
  }
  if (weedOpenBtn) {
    weedOpenBtn.addEventListener("click", async () => {
      if (!onOpenWeed) return;
      weedOpenBtn.disabled = true;
      if (weedStatusEl) weedStatusEl.textContent = "loading…";
      try {
        const n = await onOpenWeed();
        if (weedStatusEl)
          weedStatusEl.textContent =
            n > 0 ? `${n} candidate${n === 1 ? "" : "s"}` : "nothing to weed";
      } catch (err) {
        console.error("[bz] weed open failed", err);
        if (weedStatusEl) weedStatusEl.textContent = "failed";
      } finally {
        weedOpenBtn.disabled = false;
      }
    });
  }

  function renderFolderTints() {
    if (!folderTintsEl) return;
    const settings = getSettings();
    const vault = getVault && getVault();
    folderTintsEl.innerHTML = "";
    if (!vault) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = "Open a workspace to see its folders.";
      folderTintsEl.appendChild(empty);
      return;
    }
    const folders = listTopLevelFolders(vault);
    if (folders.length === 0) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = "This vault has no top-level folders.";
      folderTintsEl.appendChild(empty);
      return;
    }
    const tints = settings.folder_tints || {};
    for (const folder of folders) {
      const row = document.createElement("div");
      row.className = "settings-row";
      const label = document.createElement("span");
      label.className = "tag-label";
      label.textContent = `/${folder}/`;
      const sel = document.createElement("select");
      sel.appendChild(new Option("(no tint)", ""));
      for (const tone of AURA_PALETTE) {
        sel.appendChild(new Option(tone.key, tone.key));
      }
      sel.value = tints[folder] || "";
      // Colour-preview swatch next to the dropdown so the tone name reads
      // as more than a word.
      const swatch = document.createElement("span");
      swatch.className = "folder-swatch";
      const paint = (v) => {
        const tone = AURA_PALETTE.find((t) => t.key === v);
        swatch.style.background = tone ? tone.hex : "transparent";
        swatch.style.borderColor = tone ? tone.hex : "rgba(255,255,255,0.12)";
      };
      paint(sel.value);
      sel.addEventListener("change", () => {
        const next = { ...(getSettings().folder_tints || {}) };
        if (sel.value) next[folder] = sel.value;
        else delete next[folder];
        paint(sel.value);
        onChange({ folder_tints: next });
      });
      row.append(label, swatch, sel);
      folderTintsEl.appendChild(row);
    }
  }

  function renderWorkspaceSection() {
    if (!workspaceDesc || !workspaceActions) return;
    const kind = getWorkspaceKind ? getWorkspaceKind() : null;
    workspaceActions.innerHTML = "";
    if (kind === "demo") {
      workspaceDesc.textContent =
        "You're using the demo vault — a sandboxed copy in browser storage. Resetting reinstalls the original notes.";

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "ghost";
      resetBtn.textContent = "Reset demo vault";
      resetBtn.addEventListener("click", () => {
        if (!onResetDemo) return;
        if (
          !confirm(
            "Reset the demo vault? Any edits you've made to it will be lost.",
          )
        )
          return;
        onResetDemo();
      });
      workspaceActions.appendChild(resetBtn);

      // Second button: swap in the other demo theme. Only render if we have
      // the callbacks wired and there's actually a different theme to offer.
      const currentTheme = getDemoTheme ? getDemoTheme() : null;
      const otherTheme = DEMO_THEMES.find((t) => t.id !== currentTheme);
      if (onSwitchDemo && otherTheme) {
        const switchBtn = document.createElement("button");
        switchBtn.type = "button";
        switchBtn.className = "ghost";
        switchBtn.textContent = `Switch to ${otherTheme.label}`;
        switchBtn.title = otherTheme.blurb || "";
        switchBtn.addEventListener("click", () => {
          if (
            !confirm(
              `Switch demo vault to "${otherTheme.label}"? Any edits to the current demo will be lost.`,
            )
          )
            return;
          onSwitchDemo(otherTheme.id);
        });
        workspaceActions.appendChild(switchBtn);
      }
    } else if (kind === "user") {
      workspaceDesc.textContent =
        "A real folder on your disk. Nothing in this app touches anything outside that folder.";
      if (onRescan) {
        const rescanBtn = document.createElement("button");
        rescanBtn.type = "button";
        rescanBtn.className = "ghost";
        rescanBtn.textContent = "Rescan workspace";
        rescanBtn.title = "Reload to pick up files edited outside Boltzsidian.";
        rescanBtn.addEventListener("click", async () => {
          rescanBtn.disabled = true;
          try {
            await onRescan();
          } finally {
            rescanBtn.disabled = false;
          }
        });
        workspaceActions.appendChild(rescanBtn);
      }
    } else {
      workspaceDesc.textContent = "No workspace open yet.";
    }
    renderWorkspaceRoots();
  }

  // DREAM_THEMES.md Phase A — populate the theme dropdown from the
  // live vault: constellations (≥ 3 members, named or ordinal),
  // top-level folders, top tags, and roots when multi-root. Option
  // value format: `<kind>::<value>`. Random is the empty string
  // sentinel.
  function renderDreamThemeOptions() {
    if (!dreamThemeSelect) return;
    const vault = getVault ? getVault() : null;
    const settings = getSettings();
    const currentTheme = settings.dream_theme || null;
    const currentKey = currentTheme
      ? `${currentTheme.kind}::${currentTheme.value}`
      : "";

    // Preserve scroll / focus by rebuilding in memory then swapping.
    const frag = document.createDocumentFragment();

    const randomOpt = document.createElement("option");
    randomOpt.value = "";
    randomOpt.textContent = "Random (any pair)";
    frag.appendChild(randomOpt);

    if (!vault) {
      dreamThemeSelect.innerHTML = "";
      dreamThemeSelect.appendChild(frag);
      dreamThemeSelect.value = currentKey;
      return;
    }

    // Constellations — clusters with ≥ 3 members.
    const clusters = [...(vault.clusters?.byId?.values?.() || [])]
      .filter((c) => (c.noteIds?.length || 0) >= 3)
      .sort((a, b) => (b.noteIds?.length || 0) - (a.noteIds?.length || 0));
    if (clusters.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Constellations";
      for (const c of clusters) {
        const label = deriveClusterName(c, vault);
        const opt = document.createElement("option");
        opt.value = `constellation::${c.id}`;
        opt.textContent = `${label} · ${c.noteIds.length}`;
        group.appendChild(opt);
      }
      frag.appendChild(group);
    }

    // Folders.
    const folders = listTopLevelFolders(vault);
    if (folders.length > 0) {
      const group = document.createElement("optgroup");
      group.label = "Folders";
      for (const f of folders) {
        const opt = document.createElement("option");
        opt.value = `folder::${f}`;
        opt.textContent = f;
        group.appendChild(opt);
      }
      frag.appendChild(group);
    }

    // Tags — top 12 by count.
    const tagCounts = vault.tagCounts;
    if (tagCounts && tagCounts.size > 0) {
      const top = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);
      const group = document.createElement("optgroup");
      group.label = "Tags";
      for (const [tag, count] of top) {
        const opt = document.createElement("option");
        opt.value = `tag::${tag}`;
        opt.textContent = `#${tag} · ${count}`;
        group.appendChild(opt);
      }
      frag.appendChild(group);
    }

    // Roots — only when multi-root.
    const roots = vault.roots || [];
    if (roots.length > 1) {
      const group = document.createElement("optgroup");
      group.label = "Roots";
      for (const r of roots) {
        const opt = document.createElement("option");
        opt.value = `root::${r.id}`;
        opt.textContent = r.name || r.id;
        group.appendChild(opt);
      }
      frag.appendChild(group);
    }

    dreamThemeSelect.innerHTML = "";
    dreamThemeSelect.appendChild(frag);
    // Restore selection. If the current theme no longer resolves
    // (cluster dissolved, folder renamed), fall back to random.
    const options = [...dreamThemeSelect.options].map((o) => o.value);
    dreamThemeSelect.value = options.includes(currentKey) ? currentKey : "";
  }

  function renderWorkspaceRoots() {
    if (!workspaceRoots) return;
    workspaceRoots.innerHTML = "";
    if (!getWorkspaceRoots) return;
    const kind = getWorkspaceKind ? getWorkspaceKind() : null;
    const {
      roots = [],
      writeRootId = null,
      dropped = [],
    } = getWorkspaceRoots() || {};
    // Demo workspaces don't support multi-root — no list, no button.
    if (kind !== "user") return;

    const header = document.createElement("p");
    header.className = "settings-hint";
    header.textContent = "Project roots";
    workspaceRoots.appendChild(header);

    for (const r of roots) {
      const row = document.createElement("div");
      row.className = "settings-root-row";
      const name = document.createElement("span");
      name.className = "settings-root-name";
      name.textContent = r.name || r.id;
      const status = document.createElement("span");
      status.className = "settings-root-status";
      const tags = [];
      if (r.id === writeRootId) tags.push("writeRoot");
      if (r.readOnly) tags.push("read-only");
      tags.push("connected");
      status.textContent = tags.join(" · ");
      row.append(name, status);
      // Remove button — only for non-writeRoot entries. Can't yank the
      // writeRoot out from under the running app; that would orphan
      // every sidecar file in .universe/.
      if (r.id !== writeRootId && onRemoveRoot) {
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "ghost settings-root-remove";
        rm.textContent = "Remove";
        rm.title = `Disconnect "${r.name || r.id}" from this workspace.`;
        rm.addEventListener("click", async () => {
          if (
            !confirm(
              `Disconnect "${r.name || r.id}" from this workspace?\n\nThe folder's files are NOT deleted — the root is just dropped from the manifest. You can re-add it later.`,
            )
          )
            return;
          rm.disabled = true;
          try {
            await onRemoveRoot(r.id);
          } finally {
            rm.disabled = false;
            renderWorkspaceRoots();
          }
        });
        row.append(rm);
      }
      workspaceRoots.appendChild(row);
    }

    for (const d of dropped) {
      const row = document.createElement("div");
      row.className = "settings-root-row settings-root-dropped";
      const name = document.createElement("span");
      name.className = "settings-root-name";
      name.textContent = d.name || d.id;
      const status = document.createElement("span");
      status.className = "settings-root-status";
      status.textContent =
        d.reason === "permission"
          ? "re-grant needed"
          : d.reason === "not-picked"
            ? "not connected"
            : "unavailable";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.textContent = "Connect";
      btn.addEventListener("click", async () => {
        if (!onReconnectRoot) return;
        btn.disabled = true;
        try {
          await onReconnectRoot(d);
        } finally {
          btn.disabled = false;
          renderWorkspaceRoots();
        }
      });
      row.append(name, status, btn);
      workspaceRoots.appendChild(row);
    }

    // Add-root button is always available for user workspaces. Runs
    // inside a direct user-click handler so showDirectoryPicker gets
    // the transient activation it requires.
    if (onAddRoot) {
      const addRow = document.createElement("div");
      addRow.className = "settings-root-row settings-root-add";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "ghost";
      addBtn.textContent = "Add project root";
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        try {
          await onAddRoot();
        } finally {
          addBtn.disabled = false;
          renderWorkspaceRoots();
        }
      });
      addRow.appendChild(addBtn);
      workspaceRoots.appendChild(addRow);
    }
  }

  function populateKindSelects() {
    const settings = getSettings();
    const opts = [];
    opts.push(`<option value="">(none)</option>`);
    for (let k = 0; k < NUM_KINDS; k++) {
      const label =
        settings.kind_labels?.[k] ||
        settings.kind_labels?.[String(k)] ||
        `Kind ${k}`;
      opts.push(`<option value="${k}">${k} · ${escapeHtml(label)}</option>`);
    }
    newKindSelect.innerHTML = opts.join("");
  }

  function kindSelect() {
    const s = document.createElement("select");
    const settings = getSettings();
    const opts = [];
    opts.push(`<option value="">(unmapped)</option>`);
    for (let k = 0; k < NUM_KINDS; k++) {
      const label =
        settings.kind_labels?.[k] ||
        settings.kind_labels?.[String(k)] ||
        `Kind ${k}`;
      opts.push(`<option value="${k}">${k} · ${escapeHtml(label)}</option>`);
    }
    s.innerHTML = opts.join("");
    return s;
  }

  function open() {
    render();
    pane.classList.add("open");
    pane.setAttribute("aria-hidden", "false");
    renderDreamStatus();
    if (!dreamStatusTimer) {
      dreamStatusTimer = window.setInterval(renderDreamStatus, 400);
    }
  }
  function close() {
    pane.classList.remove("open");
    pane.setAttribute("aria-hidden", "true");
    if (dreamStatusTimer) {
      clearInterval(dreamStatusTimer);
      dreamStatusTimer = 0;
    }
  }
  function toggle() {
    pane.classList.contains("open") ? close() : open();
  }

  window.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target && e.target.isContentEditable) ||
      (e.target.closest && e.target.closest(".cm-editor")) ||
      (e.target.closest && e.target.closest("[contenteditable='true']"))
    )
      return;
    if (e.key === "\\") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Escape" && pane.classList.contains("open")) {
      e.preventDefault();
      close();
    }
  });

  return { open, close, toggle, refresh: render };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
