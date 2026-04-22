// RENDER_QUALITY.md Phase C — auto-throttle monitor.
//
// Owns the "effective tier" state. The user picks a CEILING; the
// monitor's effective tier is always ≤ the ceiling. Under sustained
// lag the monitor drops one tier at a time; under sustained health
// it raises one tier at a time, never exceeding the ceiling.
//
// Asymmetric hysteresis is deliberate:
//   - Drop fast (2 s sustained lag)  → user doesn't watch the app choke.
//   - Raise slow (5 s sustained calm) → we don't flap mid-motion.
//
// When `enabled === false`, the monitor parks currentTier at the
// ceiling and stops evaluating — lets users pin quality for
// recording / screenshots.
//
// `document.visibilityState` check pauses evaluation in background
// tabs, where the browser throttles rAF and the EMA would otherwise
// spike and force a drop for no reason.

import { TIER_ORDER, DEFAULT_TIER } from "./render-quality.js";

const EMA_ALPHA = 0.1; // running mean over ~10 frames
const DROP_MS_THRESHOLD = 33; // >30 fps → we're lagging
const RAISE_MS_THRESHOLD = 18; // <55 fps → we're healthy
const DROP_STREAK_FRAMES = 120; // ~2 s at 60 fps
const RAISE_STREAK_FRAMES = 300; // ~5 s at 60 fps

export function createQualityMonitor({ onTierChange } = {}) {
  let ceiling = DEFAULT_TIER;
  let enabled = true;
  let currentTier = ceiling;
  let ema = 16.7; // assume 60 fps at boot
  let belowStreak = 0;
  let aboveStreak = 0;

  function setCurrentTier(name) {
    if (name === currentTier) return;
    currentTier = name;
    if (onTierChange) onTierChange(currentTier);
  }

  function setCeiling(name) {
    if (!name) return;
    ceiling = name;
    const ceilingIdx = TIER_ORDER.indexOf(ceiling);
    const currentIdx = TIER_ORDER.indexOf(currentTier);
    // Effective is clamped below the ceiling. If user lowered
    // ceiling while we were at or above it, drop immediately.
    if (!enabled || currentIdx > ceilingIdx) {
      setCurrentTier(ceiling);
    }
    // Reset streaks so the next evaluation starts clean relative to
    // the new ceiling.
    belowStreak = 0;
    aboveStreak = 0;
  }

  function setEnabled(flag) {
    enabled = !!flag;
    if (!enabled) {
      // Park at ceiling; future ticks do nothing until re-enabled.
      setCurrentTier(ceiling);
      belowStreak = 0;
      aboveStreak = 0;
    }
  }

  function tick(dt) {
    if (!enabled) return;
    // Skip when tab is backgrounded — rAF throttles to 1 Hz and the
    // EMA would spike to >500 ms, triggering false drops.
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return;
    }
    const dtMs = Math.max(0, (dt || 0) * 1000);
    // Guard against single-frame pathologies (tab just regained
    // focus, one huge dt). Clamp the sample at 200 ms before EMA.
    const sample = Math.min(dtMs, 200);
    ema = ema * (1 - EMA_ALPHA) + sample * EMA_ALPHA;

    if (ema > DROP_MS_THRESHOLD) {
      belowStreak++;
      aboveStreak = 0;
    } else if (ema < RAISE_MS_THRESHOLD) {
      aboveStreak++;
      belowStreak = 0;
    } else {
      // Neutral zone — slowly decay both streaks so borderline
      // conditions don't accumulate indefinitely.
      if (belowStreak > 0) belowStreak--;
      if (aboveStreak > 0) aboveStreak--;
    }

    if (belowStreak > DROP_STREAK_FRAMES) {
      const i = TIER_ORDER.indexOf(currentTier);
      if (i > 0) setCurrentTier(TIER_ORDER[i - 1]);
      belowStreak = 0;
      aboveStreak = 0;
    } else if (aboveStreak > RAISE_STREAK_FRAMES) {
      const i = TIER_ORDER.indexOf(currentTier);
      const ceilingIdx = TIER_ORDER.indexOf(ceiling);
      if (i < ceilingIdx) setCurrentTier(TIER_ORDER[i + 1]);
      belowStreak = 0;
      aboveStreak = 0;
    }
  }

  return {
    tick,
    setCeiling,
    setEnabled,
    getCurrentTier: () => currentTier,
    getCeiling: () => ceiling,
    getEma: () => ema,
    getEnabled: () => enabled,
    // Diagnostic for the Phase D HUD pill.
    isDropped: () =>
      TIER_ORDER.indexOf(currentTier) < TIER_ORDER.indexOf(ceiling),
  };
}
