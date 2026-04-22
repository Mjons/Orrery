// RENDER_QUALITY.md Phase A — tier registry + subsystem plumbing.
//
// Four quality tiers (low / medium / high / ultra). Each tier is a
// set of scalar knobs that subsystems read via their own
// `setQuality(tier)` method. The registry is plain data; the only
// exported function is `applyTier(name, subsystems)` which
// dispatches to every subsystem that cares.
//
// Phase A ships the registry + the plumbing. No UI yet (Phase B)
// and no auto-throttle (Phase C). Default tier is `high` to match
// prior behaviour.
//
// Scale semantics:
//   - `*Scale` values multiply the subsystem's baseline knobs
//     rather than replacing them. Bloom strength scale of 0.7
//     means "render at 70% of the ambience preset's chosen
//     strength," so ambience identity survives across tiers.
//   - `pixelRatio` is absolute. `null` means use
//     `min(window.devicePixelRatio, 2)` — the browser-preferred
//     ratio, capped so high-DPI doesn't melt integrated GPUs.

export const DEFAULT_TIER = "high";

export const TIER_ORDER = ["low", "medium", "high", "ultra"];

export const TIERS = {
  low: {
    // Post-processing — strip grain/vignette, soft bloom, no
    // temperature warp. Look lands at "clean monochrome sky" —
    // still readable and atmospheric, just without the heavy
    // signature glow.
    bloomStrengthScale: 0.35,
    bloomRadiusScale: 0.6,
    vignetteScale: 0,
    grainScale: 0,
    temperatureScale: 0.4,
    pixelRatio: 0.75,
    // Label / constellation pools shrink. Update cadence slows to
    // every 6 frames (~10 Hz at 60 fps) so DOM reprojection is
    // half as expensive.
    labelMaxScale: 0.5,
    labelUpdateEveryN: 6,
    constellationMaxScale: 0.5,
    constellationUpdateEveryN: 6,
    // Tether cap — drop to a quarter. Requires the shrink-tether
    // ghost-fade path to dispose overflow; live tethers still
    // render cleanly.
    tetherMaxScale: 0.25,
    // Physics — mild damping via the maxSpeed cap so bodies don't
    // blur across the frame at low pixel-ratio.
    physicsMaxSpeedScale: 0.8,
    // Spark renderer off entirely.
    sparksEnabled: false,
  },
  medium: {
    bloomStrengthScale: 0.7,
    bloomRadiusScale: 0.85,
    vignetteScale: 0.7,
    grainScale: 0.4,
    temperatureScale: 0.8,
    pixelRatio: 1.0,
    labelMaxScale: 0.75,
    labelUpdateEveryN: 4,
    constellationMaxScale: 0.75,
    constellationUpdateEveryN: 4,
    tetherMaxScale: 0.5,
    physicsMaxSpeedScale: 1.0,
    sparksEnabled: true,
  },
  high: {
    // Today's default — every feature present at its designed
    // strength. Scales all 1.0.
    bloomStrengthScale: 1.0,
    bloomRadiusScale: 1.0,
    vignetteScale: 1.0,
    grainScale: 1.0,
    temperatureScale: 1.0,
    pixelRatio: 1.0,
    labelMaxScale: 1.0,
    labelUpdateEveryN: 3,
    constellationMaxScale: 1.0,
    constellationUpdateEveryN: 3,
    tetherMaxScale: 1.0,
    physicsMaxSpeedScale: 1.0,
    sparksEnabled: true,
  },
  ultra: {
    // Everything extra. Bloom slightly brighter + wider, render at
    // devicePixelRatio up to 2×. Pool sizes 1.5× so bigger vaults
    // get fuller skies on beefy GPUs.
    bloomStrengthScale: 1.2,
    bloomRadiusScale: 1.1,
    vignetteScale: 1.0,
    grainScale: 1.0,
    temperatureScale: 1.0,
    pixelRatio: null, // devicePixelRatio capped at 2
    labelMaxScale: 1.5,
    labelUpdateEveryN: 2,
    constellationMaxScale: 1.5,
    constellationUpdateEveryN: 2,
    tetherMaxScale: 2.0,
    physicsMaxSpeedScale: 1.0,
    sparksEnabled: true,
  },
};

// Dispatch a tier to the subsystem bag. Missing subsystems are
// silently ignored so callers can pass a subset during boot-up
// (before every subsystem has been instantiated).
export function applyTier(name, subsystems) {
  const tier = TIERS[name] || TIERS[DEFAULT_TIER];
  const bag = subsystems || {};

  if (bag.renderer) {
    const pr =
      tier.pixelRatio == null
        ? Math.min(window.devicePixelRatio || 1, 2)
        : tier.pixelRatio;
    bag.renderer.setPixelRatio(pr);
  }
  // Composer needs to match the renderer's pixel ratio so post
  // passes don't render into a mismatched buffer.
  if (bag.post?.setQuality) bag.post.setQuality(tier);
  if (bag.labels?.setQuality) bag.labels.setQuality(tier);
  if (bag.constellations?.setQuality) bag.constellations.setQuality(tier);
  if (bag.tethers?.setQuality) bag.tethers.setQuality(tier);
  if (bag.sparks?.setQuality) bag.sparks.setQuality(tier);
  if (bag.physics?.setQuality) bag.physics.setQuality(tier);
}

// Helper for callers that need to know the numeric knob for a
// baseline × scale computation without calling applyTier.
export function getTier(name) {
  return TIERS[name] || TIERS[DEFAULT_TIER];
}
