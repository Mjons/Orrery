// SFX — minimal HTMLAudio wrapper for the four cues in /demo-vault/sfx.
//
// Files live under public/demo-vault/sfx and are served by Vite at
// /demo-vault/sfx/<name>.mp3. Each cue is lazy-loaded on first play
// and shares a single Audio element thereafter (cloned on play so
// rapid retriggers don't truncate the previous instance).
//
// Cooldown per cue throttles spam (e.g. accent firing on every salience
// surface during dream burst). Settings hooks let the user mute or
// lower volume; absent settings, the module defaults to enabled at
// 0.35 volume — present but never the loudest thing in the room.

const SFX_BASE = "/demo-vault/sfx";

const CUES = {
  // assigned-on event …………………………………………………… intent
  click: { file: "click.mp3", cooldown: 80 }, // user opens a note
  lock: { file: "lock.mp3", cooldown: 200 }, // link / connect committed
  transition: { file: "transition.mp3", cooldown: 400 }, // dream cycle starts
  accent: { file: "accent.mp3", cooldown: 250 }, // idea surfaces in drawer
};

const DEFAULT_VOLUME = 0.35;

export function createSfx({ getSettings } = {}) {
  // One <audio> per cue, lazy.
  const elements = new Map();
  const lastPlayedAt = new Map();

  function get(cueName) {
    const cue = CUES[cueName];
    if (!cue) return null;
    let el = elements.get(cueName);
    if (!el) {
      el = new Audio(`${SFX_BASE}/${cue.file}`);
      el.preload = "auto";
      elements.set(cueName, el);
    }
    return el;
  }

  function readSettings() {
    const s = getSettings ? getSettings() : null;
    const enabled = s?.sfx_enabled !== false; // default on
    const volume =
      typeof s?.sfx_volume === "number"
        ? Math.max(0, Math.min(1, s.sfx_volume))
        : DEFAULT_VOLUME;
    return { enabled, volume };
  }

  function play(cueName) {
    const cue = CUES[cueName];
    if (!cue) return;
    const { enabled, volume } = readSettings();
    if (!enabled || volume <= 0) return;

    const now = performance.now();
    const last = lastPlayedAt.get(cueName) || 0;
    if (now - last < cue.cooldown) return;
    lastPlayedAt.set(cueName, now);

    const base = get(cueName);
    if (!base) return;
    // Clone so an in-flight play doesn't get cut. cloneNode keeps the
    // src + preload state but starts at the beginning.
    const inst = base.cloneNode();
    inst.volume = volume;
    // Browsers reject .play() outside a user gesture before the page
    // has had any interaction. Swallow the rejection — the cue is
    // optional ambience, not load-bearing UX.
    const p = inst.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  return { play };
}
