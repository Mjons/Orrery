// Settings model. Phase 0: defaults + localStorage persistence.
// Phase 1+: workspace-level `.universe/settings.json` overrides.

const USER_SETTINGS_KEY = "boltzsidian.user.settings.v1";

export const DEFAULT_SETTINGS = {
  accent: "#8ab4ff",
  home_view: "last_focused", // 'last_focused' | 'daily' | 'overview'
  idle_minutes_to_dream: 10,
  sleep_depth_cap: 0.85,
  observer_chorus: false,
  chorus_density: "med", // 'low' | 'med' | 'high'
  chorus_font_size: 12,
  utterance_backend: "template", // 'template' | 'local' | 'webllm' | 'claude'
  claude_api_key_ref: null,
  // Local-rig (OpenAI-compatible HTTP) backend config. Empty = unset.
  // Endpoint must include the full path, e.g. /v1/chat/completions.
  utterance_local_endpoint: "",
  utterance_local_model: "",
  utterance_local_api_key: "", // optional bearer token for LM Studio / tabbyAPI
  tag_to_kind: {
    episode: 0,
    fact: 1,
    anchor: 2,
    mood: 3,
    context: 4,
    self: 5,
    person: 6,
  },
  kind_labels: {
    0: "Episode",
    1: "Fact",
    2: "Anchor",
    3: "Mood",
    4: "Context",
    5: "Self",
    6: "Person",
  },
  // Folders. Off by default; see FORMATIONS.md §1.
  folder_influence: 0, // 0 = dissolve, 1 = strong basin
  folder_tints: {}, // folder-name → palette key (cobalt, teal, sage, …)
  // Ambience. See AMBIENCE.md §4. 'dream' is reserved — selected
  // automatically at depth > 0.3; don't set it as the wake preset.
  ambience_wake: "default", // 'default' | 'galactic' | 'clinical' | 'vintage'
  ambience_intensity: 1.0, // 0..2 scalar on look-pass effects (temperature, vignette, grain)
  // Label visibility. See LABELS.md.
  // 'always' = current cursor-lens + ambient behavior
  // 'hover'  = only the currently pointer-hovered body shows its title
  // 'never'  = no titles at all; universe reads as pure space
  label_mode: "always",
  // Cluster-level labels. See CONSTELLATIONS.md. When zoomed out
  // past a cluster's own extent, the cluster gets a soft centered
  // label instead of its individual star titles. Off = no named
  // regions; zoom behaviour on star labels is unchanged.
  show_constellations: true,
  // DREAM_GRAVITY.md — invisible wandering attractor during dream
  // mode that pulls bodies into curling arcs. Toggle off for a
  // quieter dream (no gravitational protagonist, just the loose
  // springs and wander noise).
  dream_gravity: true,
  // Peak attractor strength. With the strong-near/zero-at-edge force
  // profile, force magnitude at d=100 is roughly `strength * 0.0055`.
  // 2800 default ≈ 15.4 per axis, comparable to dream spring forces.
  // 0 disables without flipping the toggle; 5000+ starts to feel like
  // a true gravity well; 8000+ risks collapse despite the softening.
  dream_gravity_strength: 2800,
  // DREAM_THEMES.md — null = random (dream about anything), or
  // { kind: 'constellation' | 'folder' | 'tag' | 'root', value: string }
  // Phase A ships only the persistence + UI; runtime effect lands
  // in phases B–E.
  dream_theme: null,
  // RENDER_QUALITY.md — user-selectable ceiling + auto-throttle
  // toggle. Phase A ships the registry + plumbing; the UI and
  // auto-detect land in Phases B / C. Default `high` preserves
  // prior behaviour.
  render_quality_ceiling: "high",
  render_quality_auto: true,
  // User-renamed constellations. Keyed by an arbitrary slot id; each
  // entry carries the memberIds snapshot from when the user named it
  // so we can match the same region back even after cluster ids
  // renumber. Resolution uses Jaccard overlap ≥ 0.6.
  //   { [slotId]: { name: string, memberIds: [noteId, …] } }
  cluster_names: {},
  // Interaction safeguards.
  confirm_unlink: true, // confirm before right-click deletes a tether
  // Tend passes — per-pass opt-outs. Absent key = enabled by default so
  // new passes added later opt-in automatically. See STATES.md §2.
  tend_passes: {
    "tag-infer": true,
    "obvious-link": true,
    "title-collision": true,
    "fm-normalise": true,
    stub: true,
  },
  // Weed — manual review of prune candidates. STATES.md §3,
  // BUILD_PLAN Phase 6.6.
  weed_enabled: true,
  // How many new candidates since last Weed open triggers the soft toast.
  weed_growth_threshold: 5,
  // Brief — 90-second "where you are" panel on workspace open.
  // STATES.md §4, BUILD_PLAN Phase 6.7.
  brief_on_open: true,
  // Multi-project manifest — MULTI_PROJECT_PLAN.md Phase 1. Null
  // means "legacy single-root mode" and the app boots exactly as
  // before. A truthy value is a normalised manifest object (see
  // src/vault/manifest.js parseManifest). Phase 2 onward reads this;
  // Phase 5 writes it through the pick flow. Dormant in Phase 1 —
  // present so later phases can read without migrating settings.
  workspace_manifest: null,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
}
