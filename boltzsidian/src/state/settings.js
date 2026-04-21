// Settings model. Phase 0: defaults + localStorage persistence.
// Phase 1+: workspace-level `.universe/settings.json` overrides.

const USER_SETTINGS_KEY = "boltzsidian.user.settings.v1";

export const DEFAULT_SETTINGS = {
  accent: "#8ab4ff",
  home_view: "last_focused", // 'last_focused' | 'daily' | 'overview'
  idle_minutes_to_dream: 10,
  sleep_depth_cap: 0.85,
  observer_chorus: false,
  utterance_backend: "template", // 'template' | 'webllm' | 'claude'
  claude_api_key_ref: null,
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
