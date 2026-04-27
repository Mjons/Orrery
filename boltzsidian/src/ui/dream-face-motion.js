// DREAM_FACE.md v1 floor — couple three avatar properties (scale,
// opacity, tilt oscillation) to dream depth so the face physically
// breathes during dream phase. Wake transition is hold-then-settle:
// when the dream ends, the current pose freezes for 400ms, then
// eases home over 800ms — so the avatar reads as something that was
// elsewhere and is gradually returning to attention, not a state
// machine flipping a flag.
//
// Pure DOM driver. The model-face's existing CSS consumes three new
// custom properties:
//   --mface-dream-scale       multiplier on transform: scale(...)
//   --mface-dream-opacity     multiplier on the 0.5 baseline opacity
//   --mface-dream-tilt-osc    additive degrees on the rotation
//
// When dream isn't running, the loop writes neutral values (1, 1, 0)
// so the face sits exactly where it would without this module loaded.

const BREATH_PERIOD_MS = 22_000; // matches the cloud's ::before breathe
const TILT_PERIOD_MS = 12_000;
const HOLD_MS = 400;
const SETTLE_MS = 800;

export function createDreamFaceMotion({ dream, mountId = "model-face" } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount || !dream) {
    return { dispose: () => {} };
  }

  // Reduced-motion accessibility: bail out and leave neutral values.
  // Watching the media query stays cheap; if the user toggles it
  // mid-session we pick that up and stop animating without reload.
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let reducedMotion = !!mq?.matches;
  const onMq = () => {
    reducedMotion = !!mq?.matches;
    if (reducedMotion) writeNeutral();
  };
  mq?.addEventListener?.("change", onMq);

  let raf = 0;
  let lastState = dream.getState?.();
  // Wake transition state.
  let frozen = null; // { scale, opacity, tilt } captured at wake start
  let holdUntil = 0; // wall-clock ms while pose is frozen
  let settleStart = 0; // wall-clock ms when ease-home begins

  function writeNeutral() {
    mount.style.setProperty("--mface-dream-scale", "1");
    mount.style.setProperty("--mface-dream-opacity", "1");
    mount.style.setProperty("--mface-dream-tilt-osc", "0deg");
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (reducedMotion) return;

    const t = performance.now();
    const state = dream.getState?.();

    // Wake start — fires at the precise dream→waking edge so the
    // hold captures whatever pose the depth-coupled live loop was
    // currently driving, before the depth ramp drains the
    // amplitudes back to neutral on its own. Without this we would
    // hold a near-neutral pose and the wake "load-bearing" character
    // would dissolve.
    if (
      (lastState === "dreaming" || lastState === "falling") &&
      state === "waking"
    ) {
      const cur = readCurrent();
      frozen = cur;
      holdUntil = t + HOLD_MS;
      settleStart = t + HOLD_MS;
    }
    lastState = state;

    // Live coupling fires only during falling/dreaming. Once "waking"
    // begins, the wake transition overlay below owns the pose so
    // freezing actually freezes (rather than fighting depth's drain).
    const dreaming = state === "falling" || state === "dreaming";

    let scale = 1;
    let opacityMul = 1;
    let tiltOsc = 0;

    if (dreaming) {
      // Live dream — couple to depth. depth ∈ [0, 1] roughly; clamp
      // for safety (sleep_depth_cap setting can shape the curve).
      const depth = clamp01(dream.getDepth?.() || 0);
      const breath = Math.sin((t / BREATH_PERIOD_MS) * Math.PI * 2);
      const tiltSine = Math.sin((t / TILT_PERIOD_MS) * Math.PI * 2);

      // Scale amplitude grows with depth: ±10% baseline, up to ±25%
      // at peak depth. Slow breath, never snaps.
      const scaleAmp = 0.1 + depth * 0.15;
      scale = 1 + breath * scaleAmp;

      // Opacity dips on the trough of the same breath. At low depth
      // dips ~10%, at peak ~60% — the face gets quieter when the
      // dream is heaviest, like deep sleep breathing.
      const opacityAmp = 0.1 + depth * 0.5;
      opacityMul = 1 + (breath - 1) * (opacityAmp / 2);

      // Tilt oscillation: ±2° baseline, up to ±8° at peak depth.
      // Slow head-nodding-off motion.
      const tiltAmp = 2 + depth * 6;
      tiltOsc = tiltSine * tiltAmp;
    }

    // Wake transition overlay. When inside the hold window we
    // ignore the dreaming branch (which would already be writing
    // neutral) and replay the captured pose. After the hold, ease
    // home over SETTLE_MS using easeOutCubic.
    if (frozen) {
      if (t < holdUntil) {
        scale = frozen.scale;
        opacityMul = frozen.opacity;
        tiltOsc = frozen.tilt;
      } else if (t < settleStart + SETTLE_MS) {
        const k = (t - settleStart) / SETTLE_MS;
        const eased = easeOutCubic(clamp01(k));
        scale = lerp(frozen.scale, 1, eased);
        opacityMul = lerp(frozen.opacity, 1, eased);
        tiltOsc = lerp(frozen.tilt, 0, eased);
      } else {
        // Settle done — clear the frozen state and fall through to
        // neutral writes from this frame on.
        frozen = null;
      }
    }

    mount.style.setProperty("--mface-dream-scale", scale.toFixed(3));
    mount.style.setProperty("--mface-dream-opacity", opacityMul.toFixed(3));
    mount.style.setProperty(
      "--mface-dream-tilt-osc",
      `${tiltOsc.toFixed(2)}deg`,
    );
  }

  function readCurrent() {
    const cs = mount.style;
    return {
      scale: parseFloat(cs.getPropertyValue("--mface-dream-scale")) || 1,
      opacity: parseFloat(cs.getPropertyValue("--mface-dream-opacity")) || 1,
      tilt: parseFloat(cs.getPropertyValue("--mface-dream-tilt-osc")) || 0,
    };
  }

  writeNeutral();
  raf = requestAnimationFrame(tick);

  function dispose() {
    if (raf) cancelAnimationFrame(raf);
    mq?.removeEventListener?.("change", onMq);
    writeNeutral();
  }

  return { dispose };
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  const x = 1 - t;
  return 1 - x * x * x;
}
