// Named ambience presets and linear interpolation between them.
//
// Values tuned against the bodies shader's emission and the bloom pass's
// default threshold. Sleep depth cross-fades the user's wake preset
// toward `dream` during dream mode (DREAM.md §4.3).

export const AMBIENCE_PRESETS = {
  default: {
    id: "default",
    label: "Default",
    blurb: "Balanced — what ships.",
    bloomStrength: 0.95,
    bloomRadius: 0.8,
    bloomThreshold: 0.32,
    vignette: 0.35,
    temperature: 0.0,
    grain: 0.0,
    densityBoost: 0.9,
  },
  galactic: {
    id: "galactic",
    label: "Galactic",
    blurb: "Wide bloom, deep vignette. Like looking from the outside in.",
    bloomStrength: 1.45,
    bloomRadius: 1.0,
    bloomThreshold: 0.22,
    vignette: 0.6,
    temperature: -0.12,
    grain: 0.04,
    densityBoost: 1.3,
  },
  clinical: {
    id: "clinical",
    label: "Clinical",
    blurb: "Tight, crisp, no flourish. For focused reading.",
    bloomStrength: 0.35,
    bloomRadius: 0.5,
    bloomThreshold: 0.55,
    vignette: 0.15,
    temperature: 0.0,
    grain: 0.0,
    densityBoost: 0.4,
  },
  dream: {
    id: "dream",
    label: "Dream",
    blurb: "Overcranked. Used automatically at depth > 0.3.",
    bloomStrength: 1.9,
    bloomRadius: 1.15,
    bloomThreshold: 0.14,
    vignette: 0.5,
    temperature: -0.22,
    grain: 0.14,
    densityBoost: 1.7,
  },
  vintage: {
    id: "vintage",
    label: "Vintage",
    blurb: "Warm, grainy, cozy. Good for journal-heavy vaults.",
    bloomStrength: 1.0,
    bloomRadius: 0.9,
    bloomThreshold: 0.3,
    vignette: 0.55,
    temperature: 0.32,
    grain: 0.2,
    densityBoost: 0.9,
  },
};

export const AMBIENCE_ORDER = ["default", "galactic", "clinical", "vintage"];

export function getPreset(id) {
  return AMBIENCE_PRESETS[id] || AMBIENCE_PRESETS.default;
}

export function mixPresets(a, b, t) {
  const u = Math.max(0, Math.min(1, t));
  const lerp = (x, y) => x + (y - x) * u;
  return {
    bloomStrength: lerp(a.bloomStrength, b.bloomStrength),
    bloomRadius: lerp(a.bloomRadius, b.bloomRadius),
    bloomThreshold: lerp(a.bloomThreshold, b.bloomThreshold),
    vignette: lerp(a.vignette, b.vignette),
    temperature: lerp(a.temperature, b.temperature),
    grain: lerp(a.grain, b.grain),
    densityBoost: lerp(a.densityBoost, b.densityBoost),
  };
}
