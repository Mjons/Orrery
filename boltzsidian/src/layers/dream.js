// Dream controller.
//
// A single Sleep Depth float (0..1) drives the whole mode. Physics, chorus
// and camera read it via their respective getter hooks; this module owns
// the state machine that decides when depth rises, how deep it goes, and
// when the app wakes up with a morning report.
//
// Outer states:
//   wake       — default. Input resets the idle clock.
//   falling    — depth ramping from 0 toward warming's starting depth.
//   dreaming   — the cycle lifecycle is running (see phases below).
//   waking     — depth ramping back to 0 over ~2s, then onWake fires.
//
// Inside `dreaming`, four phases run in sequence
// (DREAM_ENGINE.md §11.2):
//
//   warming     — 45 s. Depth ramps 0.2→0.55. Physics loosens visibly.
//                 Salience layer runs but no candidates yet.
//   generating  — 120 s. Depth ~0.75. Pool fills with pair candidates.
//                 Each spawn has a chance to fire a spark. Drawer stays
//                 empty — surfacing is held back until discerning.
//   playing     — 75 s. Depth ~0.75. Top pool candidates get reworded /
//                 compounded / adversarially checked. (§11.4; not yet
//                 wired in this pass — phase still runs for timing but
//                 no play ops fire.)
//   discerning  — 20 s. Depth ~0.5. Judge picks top-K from the pool.
//                 Survivors move to the surfaced list, drawer populates.
//                 Rest are discarded.
//
// Then waking → wake; onWake fires with artifacts.
//
// Cycle total: ~260 s of dreaming + ~30 s falling + ~2 s waking ≈ 4.9 min.
// Matches the 3–5 min target in DREAM_ENGINE.md §11.2.

const FALL_RAMP_S = 8; // fast ramp so Dream Now produces the phase
// effects within ~5 seconds rather than dragging for 30. Idle-triggered
// dreams already had 10+ minutes of idle so the extra slow ramp no
// longer adds to the dream-approach feeling.
const WAKE_RAMP_S = 2;
const DREAM_NOW_RAMP_S = 0.8;
const DREAM_NOW_GRACE_MS = 6000; // suppress wake-on-input right after Dream Now
// Longer grace so the user can settle in, close settings, read the
// banner, without an accidental scroll or key-release wake.

// Phase durations (seconds) and the depth target each phase holds / moves
// toward. The depth curve within a phase ramps linearly from its start
// target (equal to the previous phase's end target) to its end target.
const PHASES = [
  // Warming starts at 0.45 so Phase 1 is assertive from tick one —
  // tethers fade, noise engages, clusters come apart immediately.
  // Gradual ramp from 0 → 0.45 happens in the `falling` state before
  // the cycle proper begins, so the user still sees the drift into
  // dream; the cycle itself then lands in meaningful depth right away.
  { id: "warming", durationS: 45, startDepth: 0.45, endDepth: 0.7 },
  { id: "generating", durationS: 120, startDepth: 0.7, endDepth: 0.85 },
  { id: "playing", durationS: 75, startDepth: 0.85, endDepth: 0.85 },
  { id: "discerning", durationS: 20, startDepth: 0.85, endDepth: 0.55 },
];

function findPhase(id) {
  return PHASES.find((p) => p.id === id);
}

export function createDream({
  getSettings,
  getChorusBuffer,
  computePruneCandidates,
  onWake,
  onDepthChange,
  onPhaseChange, // ({ prev, next, phase }) => void — fires on every
  // warming → generating → playing → discerning transition. Salience
  // layer, drawer, and main.js subscribe.
  now = () => Date.now(),
}) {
  let state = "wake";
  let phase = null; // only non-null while state === "dreaming"
  let phaseStartedAt = 0;
  let depth = 0;
  let target = 0;
  let idleSince = now();
  let dreamStartedAt = null;
  let graceUntil = 0;
  let peakDepth = 0;
  let events = [];
  let lastDepthEmit = 0;
  // Additional listeners beyond the single onPhaseChange callback for
  // modules that want to subscribe dynamically.
  const phaseListeners = new Set();
  if (onPhaseChange) phaseListeners.add(onPhaseChange);

  function tick(dt) {
    if (dt <= 0) return;
    const t = now();
    const settings = getSettings();
    const cap = clamp(Number(settings.sleep_depth_cap) || 0.85, 0, 1);
    const idleMs = Math.max(
      15_000,
      (Number(settings.idle_minutes_to_dream) || 10) * 60_000,
    );

    // ── State transitions ────────────────────────────────
    if (state === "wake") {
      if (t - idleSince > idleMs) enterFalling();
      target = 0;
    } else if (state === "falling") {
      // Ramp depth up to the warming phase's starting target. Once we
      // reach it, enter the cycle.
      const warming = findPhase("warming");
      target = warming.startDepth;
      if (Math.abs(depth - target) < 0.03) {
        state = "dreaming";
        enterPhase("warming");
        pushEvent("dreaming begins", depth);
      }
    } else if (state === "dreaming") {
      advancePhase(cap);
    } else if (state === "waking") {
      target = 0;
      if (depth < 0.02) {
        depth = 0;
        emitDepth();
        finishWake();
        return;
      }
    }

    // ── Depth ramp ───────────────────────────────────────
    const rate = rampRateFor(state);
    depth = approach(depth, target, dt * rate);
    if (depth > peakDepth) peakDepth = depth;
    emitDepthIfChanged();
  }

  function rampRateFor(s) {
    if (s === "waking") return 1 / WAKE_RAMP_S;
    if (s === "falling") return 1 / FALL_RAMP_S;
    // Inside dreaming, target is updated per tick from phase progress,
    // so a gentle follow is fine — it's a smoothing filter over the
    // phase curve, not the curve itself.
    return 1 / 3;
  }

  function enterFalling() {
    state = "falling";
    dreamStartedAt = now();
    peakDepth = 0;
    events = [];
    pushEvent("idle — falling", 0);
  }

  // Advance the phase machine while dreaming. Sets the depth target
  // according to phase progress (linear ramp between start and end).
  // Transitions to the next phase when the current one's duration has
  // elapsed; when discerning finishes, begins the wake.
  function advancePhase(cap) {
    if (!phase) return;
    const def = findPhase(phase);
    if (!def) return;
    const elapsedS = (now() - phaseStartedAt) / 1000;
    const progress = Math.min(1, elapsedS / def.durationS);
    // Phase depth is its own envelope; cap is still an upper bound
    // so the user's sleep_depth_cap setting remains meaningful.
    const phaseDepth =
      def.startDepth + (def.endDepth - def.startDepth) * progress;
    target = Math.min(cap, phaseDepth);
    // Advance.
    if (elapsedS >= def.durationS) {
      const nextIdx = PHASES.findIndex((p) => p.id === phase) + 1;
      if (nextIdx < PHASES.length) {
        enterPhase(PHASES[nextIdx].id);
      } else {
        // Discerning finished — begin the wake ramp and fire onWake.
        beginWake("cycle complete");
      }
    }
  }

  function enterPhase(next) {
    const prev = phase;
    phase = next;
    phaseStartedAt = now();
    pushEvent(`phase → ${next}`, depth);
    for (const fn of phaseListeners) {
      try {
        fn({ prev, next, phase: next });
      } catch (err) {
        console.warn("[bz] dream phase listener threw", err);
      }
    }
  }

  // Start the cycle immediately. Skips the idle wait; still runs through
  // the full warming/generating/playing/discerning phase sequence so the
  // user experiences the real dream shape, not a compressed test. Moving
  // the mouse still wakes it early.
  function dreamNow() {
    if (state === "dreaming" || state === "falling") {
      pushEvent("dream now (already dreaming)", depth);
      graceUntil = now() + DREAM_NOW_GRACE_MS;
      return;
    }
    state = "falling";
    dreamStartedAt = now();
    peakDepth = 0;
    events = [];
    phase = null;
    graceUntil = now() + DREAM_NOW_GRACE_MS;
    pushEvent("dream now", 0);
  }

  // Deliberate input — a click, keystroke, or scroll wheel. Wakes the
  // dream early. DREAM_ENGINE.md §11.2 intentionally runs ~5 minutes
  // so the user can observe it unfold; passive cursor drift over the
  // window must NOT count as "user wants to wake up," or the cycle
  // collapses to a 10-second animation.
  function noteInput() {
    idleSince = now();
    if (now() < graceUntil) return;
    if (state === "falling" || state === "dreaming") {
      beginWake("user input");
    }
  }

  // Passive presence — pointer movement, focus, tab visibility. Resets
  // the idle-to-dream timer so the user doesn't accidentally retrigger
  // another dream the moment this one ends, but does NOT wake an
  // in-flight cycle. Mouse hover over the canvas to watch the dream
  // play out stays legal.
  function noteIdleReset() {
    idleSince = now();
  }

  function beginWake(reason) {
    if (state === "waking" || state === "wake") return;
    // If we ended by running out of phases, fire the phase listeners one
    // last time with `next: null` so consumers can clean up (salience
    // layer resets pool, drawer clears "dreaming" indicator).
    if (phase) {
      const prev = phase;
      phase = null;
      for (const fn of phaseListeners) {
        try {
          fn({ prev, next: null, phase: null });
        } catch (err) {
          console.warn("[bz] dream phase listener threw on wake", err);
        }
      }
    }
    state = "waking";
    target = 0;
    pushEvent(`waking — ${reason}`, depth);
  }

  function finishWake() {
    const end = now();
    const artifacts = buildArtifacts(end);
    state = "wake";
    idleSince = end;
    dreamStartedAt = null;
    phase = null;
    events = [];
    if (onWake && artifacts) onWake(artifacts);
  }

  function buildArtifacts(endedAt) {
    if (!dreamStartedAt) return null;
    const startedAt = dreamStartedAt;
    const durationMs = endedAt - startedAt;
    // A cycle that never got past the falling ramp isn't worth surfacing.
    if (durationMs < 6_000) return null;

    const allCaptions = getChorusBuffer ? getChorusBuffer() : [];
    const captions = allCaptions.filter(
      (c) => c.at >= startedAt && c.at <= endedAt,
    );
    const pruneCandidates = computePruneCandidates
      ? computePruneCandidates()
      : [];

    return {
      startedAt,
      endedAt,
      durationMs,
      peakDepth,
      captions,
      pruneCandidates,
      events: events.slice(),
    };
  }

  function pushEvent(label, depthAt, extra = {}) {
    events.push({ at: now(), label, depth: depthAt, ...extra });
    if (events.length > 200) events.shift();
  }

  function emitDepthIfChanged() {
    if (!onDepthChange) return;
    const rounded = Math.round(depth * 100) / 100;
    if (Math.abs(rounded - lastDepthEmit) < 0.01) return;
    lastDepthEmit = rounded;
    onDepthChange(depth, state);
  }
  function emitDepth() {
    if (onDepthChange) onDepthChange(depth, state);
  }

  function getDepth() {
    return depth;
  }
  function getState() {
    return state;
  }

  // Manual override for the Sleep Depth slider in Settings. If the user is
  // wake but sets depth explicitly, we switch to a `manual` hold and skip
  // the idle loop — so the slider lets them preview dream physics without
  // waiting ten minutes.
  function setManualDepth(value) {
    const v = clamp(Number(value) || 0, 0, 1);
    if (v === 0) {
      if (state === "waking") finishWake();
      else {
        // Fire phase-cleanup listeners if we were mid-cycle.
        if (phase) {
          const prev = phase;
          phase = null;
          for (const fn of phaseListeners) {
            try {
              fn({ prev, next: null, phase: null });
            } catch (err) {
              console.warn("[bz] dream phase listener threw on manual 0", err);
            }
          }
        }
        state = "wake";
        depth = 0;
        target = 0;
        emitDepth();
      }
      idleSince = now();
      return;
    }
    // Manual depth previews physics without running the cycle. We hold
    // depth at the slider value but don't enter the phase machine — so
    // salience layer won't spawn a pool, no phase events fire. This is
    // intentional: the slider is a diagnostic for physics tuning, not a
    // dream trigger.
    if (state === "wake" || state === "falling" || state === "waking") {
      state = "falling"; // so isDreaming() returns true
      dreamStartedAt = now();
      peakDepth = 0;
      events = [];
      phase = null;
      graceUntil = now() + DREAM_NOW_GRACE_MS;
    }
    target = v;
    depth = v;
    if (depth > peakDepth) peakDepth = depth;
    emitDepth();
  }

  return {
    tick,
    noteInput,
    noteIdleReset,
    dreamNow,
    setManualDepth,
    getDepth,
    getState,
    getPhase: () => phase,
    getPhaseProgress: () => {
      if (!phase) return 0;
      const def = findPhase(phase);
      if (!def) return 0;
      return Math.min(1, (now() - phaseStartedAt) / 1000 / def.durationS);
    },
    onPhaseChange: (fn) => {
      phaseListeners.add(fn);
      return () => phaseListeners.delete(fn);
    },
    isDreaming: () =>
      state === "falling" || state === "dreaming" || state === "waking",
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function approach(cur, target, step) {
  if (cur === target) return cur;
  if (cur < target) return Math.min(target, cur + step);
  return Math.max(target, cur - step);
}
