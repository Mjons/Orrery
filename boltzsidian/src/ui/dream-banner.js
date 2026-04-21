// Dream banner — a top-centre HUD strip that reads out the current
// dream phase, depth, and progress. Only visible while state is
// falling / dreaming / waking. The whole point is making "is the
// dream doing anything" answerable at a glance without opening
// devtools — after the feedback where Michael couldn't tell if the
// cycle was running, this is the cheapest diagnostic that also reads
// as a legitimate part of the UI rather than a debug overlay.

const PHASE_LABELS = {
  falling: "Drifting off",
  warming: "Warming · bodies loosening",
  generating: "Dreaming · ideas forming",
  playing: "Playing · variants surfacing",
  discerning: "Waking up · judging what survived",
};

const TICK_INTERVAL_MS = 120; // keep the depth readout feeling live

export function createDreamBanner({ mountId = "dream-banner", getDream } = {}) {
  const el = document.getElementById(mountId);
  if (!el) {
    return {
      update: () => {},
      dispose: () => {},
    };
  }

  el.innerHTML = `
    <div class="dream-banner-phase"></div>
    <div class="dream-banner-bar">
      <div class="dream-banner-fill"></div>
    </div>
    <div class="dream-banner-depth"></div>
  `;
  const phaseEl = el.querySelector(".dream-banner-phase");
  const fillEl = el.querySelector(".dream-banner-fill");
  const depthEl = el.querySelector(".dream-banner-depth");

  let timer = 0;

  function update() {
    const dream = getDream?.();
    if (!dream) return hide();
    const state = dream.getState?.();
    if (state === "wake") return hide();
    const phase = dream.getPhase?.();
    const depth = dream.getDepth?.() || 0;
    const progress = dream.getPhaseProgress?.() || 0;

    // State label: while falling we don't have a phase yet, so show
    // "Drifting off." While waking we show the last phase's exit.
    const labelKey = phase || (state === "waking" ? "discerning" : "falling");
    phaseEl.textContent = PHASE_LABELS[labelKey] || labelKey;

    // Progress bar shows phase-progress during a phase; drops to
    // depth-based progress during falling (so the user can see the
    // ramp climbing).
    const fillFraction = phase
      ? progress
      : state === "falling"
        ? Math.min(1, depth / 0.45)
        : state === "waking"
          ? 1 - Math.min(1, depth / 0.5)
          : 0;
    fillEl.style.width = `${Math.round(fillFraction * 100)}%`;

    depthEl.textContent = `depth ${depth.toFixed(2)}`;
    el.classList.add("show");
  }

  function hide() {
    el.classList.remove("show");
  }

  function start() {
    if (timer) return;
    timer = window.setInterval(update, TICK_INTERVAL_MS);
    update();
  }
  function dispose() {
    if (timer) clearInterval(timer);
    timer = 0;
  }

  start();

  return { update, dispose };
}
