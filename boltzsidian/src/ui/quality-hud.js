// RENDER_QUALITY.md Phase D — subtle top-right pill that appears
// only when the auto-throttle has dropped the effective tier below
// the user's ceiling. Tooltip carries the details (current FPS
// estimate + ceiling). Click-to-expand / pin-current-as-ceiling
// are deferred to a later polish pass.
//
// Polls the monitor at a slow cadence (2 Hz). The monitor's own
// transitions are already gated by multi-second streak counters,
// so a faster poll here would show the same value repeatedly.

const POLL_MS = 500;

const TIER_LABEL = {
  low: "Low",
  medium: "Medium",
  high: "High",
  ultra: "Ultra",
};

export function createQualityHud({ qualityMonitor } = {}) {
  if (!qualityMonitor) return { dispose: () => {} };

  const el = document.createElement("div");
  el.id = "quality-hud";
  el.className = "quality-hud";
  el.setAttribute("aria-live", "polite");
  Object.assign(el.style, {
    position: "fixed",
    top: "14px",
    right: "14px",
    display: "none",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    fontSize: "10px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(215, 219, 228, 0.7)",
    background: "rgba(20, 22, 30, 0.55)",
    border: "1px solid rgba(138, 180, 255, 0.2)",
    borderRadius: "4px",
    backdropFilter: "blur(4px)",
    zIndex: "9",
    pointerEvents: "none", // display-only; no interactions yet
    userSelect: "none",
    fontFamily: "inherit",
  });
  document.body.appendChild(el);

  let lastShownTier = null;
  let lastShownDropped = null;

  function render() {
    const dropped = qualityMonitor.isDropped();
    const tier = qualityMonitor.getCurrentTier();
    const ceiling = qualityMonitor.getCeiling();
    const ema = qualityMonitor.getEma();

    // Hide when effective equals ceiling — the user doesn't need a
    // badge saying "everything's fine."
    if (!dropped) {
      if (lastShownDropped !== false) {
        el.style.display = "none";
        lastShownDropped = false;
      }
      return;
    }

    if (lastShownDropped !== true || lastShownTier !== tier) {
      el.style.display = "flex";
      el.innerHTML = `
        <span>Rendering at</span>
        <strong style="color:#e8eaf0;font-weight:500;letter-spacing:0.06em;">${TIER_LABEL[tier] || tier}</strong>
        <span style="opacity:0.6;">· auto</span>
      `;
      lastShownDropped = true;
      lastShownTier = tier;
    }

    // Title (tooltip) updates every poll so the FPS estimate stays
    // current even when the tier hasn't moved.
    const fps = ema > 0 ? (1000 / ema).toFixed(0) : "—";
    el.title = `Current: ${TIER_LABEL[tier] || tier}\nCeiling: ${TIER_LABEL[ceiling] || ceiling}\n~${fps} fps (${ema.toFixed(1)} ms/frame)\nAuto-throttle dropped the effective tier.`;
  }

  render();
  const intervalId = window.setInterval(render, POLL_MS);

  return {
    dispose() {
      window.clearInterval(intervalId);
      el.remove();
    },
  };
}
