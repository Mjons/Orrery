// Model face — the visual persona of whatever backend is currently
// speaking. Sits as an amorphous tilted observer behind the universe,
// reacts to every call made through the utterance router AND to the
// user's actions on the vault.
//
// Expression is chosen by job kind; glow colour is chosen by backend.
// Transient *pulses* (delete bulge, save blink, recoil, etc.) ride on
// top of whichever expression is current — they're one-shot CSS
// keyframes keyed off `data-pulse-<name>` attributes.
//
// See docs/FACE_EXPRESSIONS.md for the full menu of context-sensitive
// reactions and which trigger fires which pulse.

const EXPRESSIONS = [
  "idle",
  "thinking",
  "snarky",
  "dreaming",
  "speculating",
  "template",
  "sleeping",
];

// Map job kind → expression when a result LANDS (not while generating).
const JOB_TO_EXPRESSION = {
  "chorus-line": "snarky",
  "dream-caption": "dreaming",
  "idea-seed": "speculating",
  "morning-synthesis": "speculating",
};

// Dwell time for a result expression before the face drifts back to idle.
// He's a gentle giant — every beat lingers.
const DWELL_MS = 6500;

// Long-think fidget — eyes drift side-to-side after this many ms in flight.
const LONG_THINK_MS = 6500;

// Pulse duration table. Every reaction is methodical: durations are
// long, curves are smooth, nothing snaps. The face is weather, not a
// notification — he reacts the way a cloud changes shape.
const PULSE_MS = {
  bulge: 2000, // delete: deep anticipation + slow swell + settle
  wince: 800, // empty trash: gradual flatten + bend
  brow: 1700, // weird link: slow brow rise + hold
  pursed: 800, // rename: mouth slowly compresses
  blink: 420, // save: a deliberate blink, not a flicker
  "blink-slow": 620, // autosave: slower still
  "blink-double": 760, // ambient double blink
  squint: 1100, // long search query → release
  "search-empty": 1300, // sad arc, lingering
  "tag-flicker": 320, // even the twitch is gentle
  "look-up": 900, // link picker: unhurried gaze
  settle: 1700, // link confirmed: cloud breath cycle
  "tether-snap": 1100, // wide eyes
  "lean-collide": 1300, // anticipation lean
  flash: 1300, // supernova mirror
  "constellation-pride": 2400, // bigger, slower breath
  inhale: 320, // pre-think
  recoil: 1500, // result lands — settles, doesn't bounce
  "snarky-double": 700, // brow lift on entry
  "template-defeat": 4000, // slow, slow exhale
  "backend-swap": 1100, // crossfade
  "cost-flinch": 280, // a wince in slow motion
  bow: 1600, // morning report — a deep, slow nod
  "gaze-away": 7500, // long idle — he looks out the window
  perk: 1000, // window focus
  "first-action": 1200, // first edit of session
  stretch: 2400, // wake-up yawn
  "weather-sigh": 22000, // ambient slower breath
  microsmile: 4200, // resting smile bump
  // Per-keystroke hmm cycle for Cmd+K typing — six small, asymmetric
  // hesitations that rotate so rapid typing reads as the avatar
  // following along, mumbling. Names use word suffixes (not digits)
  // so the dataset→attribute conversion keeps the kebab-case selector
  // CSS expects (digits don't get a separator inserted).
  "hmm-up-l": 600, // left eye scribble peeks up
  "hmm-up-r": 600, // right eye scribble peeks up
  "hmm-down-l": 600, // left eye scribble drifts down
  "hmm-right-r": 600, // right eye scribble drifts right
  "hmm-skew-l": 700, // mouth skews left (skeptical)
  "hmm-skew-r": 700, // mouth skews right
};

export function createModelFace({ mountId = "model-face" } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    return {
      setBackend: () => {},
      setExpression: () => {},
      onGenerateStart: () => {},
      onGenerateResult: () => {},
      setSleepDepth: () => {},
      lookAt: () => {},
      bulge: () => {},
      react: () => {},
      pulse: () => {},
      lookAtClient: () => {},
    };
  }

  mount.innerHTML = SVG_TEMPLATE;
  const svg = mount.querySelector("svg");
  let expression = "idle";
  let backend = "template";
  let sleepDepth = 0;
  let inFlight = 0;
  let inFlightStart = 0;
  let dwellTimer = 0;
  let firstActionFired = false;
  // last time the *user* did something deliberate (not just mouse drift).
  let lastInteraction = performance.now();
  let blurEnteredAt = 0;
  let isWindowFocused = document.hasFocus();

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  applyClasses();

  function applyClasses() {
    svg.dataset.expression = expression;
    svg.dataset.backend = backend;
    mount.dataset.backend = backend;
  }

  // ── Eye tracking ───────────────────────────────────────────
  const EYE_MAX = 4.5;
  let lookTargetX = 0;
  let lookTargetY = 0;
  let lookX = 0;
  let lookY = 0;
  // Pre-saccade — before drifting toward a new target, both pupils
  // pull briefly the OTHER way (anticipation). Slow and subtle.
  let saccadeKickX = 0;
  let saccadeKickY = 0;
  let saccadeKickDecay = 0;
  let rafPending = false;
  let lastMove = 0;
  function scheduleTick() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(tickLook);
  }
  function tickLook(t) {
    rafPending = false;
    // Decay any pre-saccade kick exponentially. Slow decay so the
    // anticipation reads as deliberate, not twitchy.
    saccadeKickX *= 0.9;
    saccadeKickY *= 0.9;
    if (Math.abs(saccadeKickX) < 0.02) saccadeKickX = 0;
    if (Math.abs(saccadeKickY) < 0.02) saccadeKickY = 0;
    // Ease current offset toward target. Low coefficients so the
    // pupils drift like clouds — never snap to a target.
    lookX += (lookTargetX + saccadeKickX - lookX) * 0.05;
    lookY += (lookTargetY + saccadeKickY - lookY) * 0.06;
    const dx = (lookX * EYE_MAX).toFixed(2);
    const dy = (lookY * EYE_MAX).toFixed(2);
    svg.style.setProperty("--mface-eye-dx", dx);
    svg.style.setProperty("--mface-eye-dy", dy);
    const extraTilt = (lookX * -3).toFixed(2);
    mount.style.setProperty("--mface-look-tilt", `${extraTilt}deg`);
    const settled =
      Math.abs(lookTargetX - lookX) < 0.005 &&
      Math.abs(lookTargetY - lookY) < 0.005 &&
      saccadeKickX === 0 &&
      saccadeKickY === 0;
    if (!settled || t - lastMove < 800) scheduleTick();
  }
  function setLookTarget(nx, ny, { saccade = false } = {}) {
    const newTx = Math.max(-1, Math.min(1, Number(nx) || 0));
    const newTy = Math.max(-1, Math.min(1, Number(ny) || 0));
    if (saccade && !reduceMotion) {
      // Kick the eyes briefly the OTHER way before they swing toward
      // the new target. Gentle giants don't dart — keep this subtle.
      const ddx = newTx - lookTargetX;
      const ddy = newTy - lookTargetY;
      saccadeKickX = -ddx * 0.18;
      saccadeKickY = -ddy * 0.18;
      saccadeKickDecay = 1;
    }
    lookTargetX = newTx;
    lookTargetY = newTy;
    lastMove = performance.now();
    scheduleTick();
  }

  let pointerListener = null;
  function attachPointerTracking() {
    if (pointerListener) return;
    pointerListener = (e) => {
      const nx = ((e.clientX / window.innerWidth) * 2 - 1) * 0.85;
      const ny = ((e.clientY / window.innerHeight) * 2 - 1) * 0.75;
      setLookTarget(nx, ny);
    };
    window.addEventListener("pointermove", pointerListener, { passive: true });
  }
  attachPointerTracking();

  function lookAt(clientX, clientY) {
    if (clientX == null || clientY == null) {
      setLookTarget(0, 0);
      return;
    }
    const nx = ((clientX / window.innerWidth) * 2 - 1) * 0.85;
    const ny = ((clientY / window.innerHeight) * 2 - 1) * 0.75;
    setLookTarget(nx, ny);
  }
  // Cursor → screen-space target with explicit pre-saccade.
  function lookAtClient(clientX, clientY) {
    if (clientX == null || clientY == null) return;
    const nx = ((clientX / window.innerWidth) * 2 - 1) * 0.85;
    const ny = ((clientY / window.innerHeight) * 2 - 1) * 0.75;
    setLookTarget(nx, ny, { saccade: true });
  }

  function setExpression(next) {
    if (!EXPRESSIONS.includes(next)) return;
    expression = next;
    applyClasses();
  }

  function setBackend(id) {
    const next = id || "template";
    if (next !== backend) {
      // Subtle acknowledgement of a backend swap — quick blink + a
      // short cloud crossfade (CSS handles the colour fade via the
      // [data-pulse-backend-swap] class).
      backend = next;
      applyClasses();
      pulse("backend-swap");
      pulse("blink");
      return;
    }
    backend = next;
    applyClasses();
  }

  function setSleepDepth(d) {
    const prev = sleepDepth;
    sleepDepth = Number(d) || 0;
    // Smoothly map sleep depth to halo opacity (0.5 → 0.85 sleep range).
    // Past 0.5 the halo dims toward the sleep level so the transition
    // feels gradual rather than switched.
    const dim = Math.max(0, Math.min(1, (sleepDepth - 0.5) / 0.35));
    svg.style.setProperty("--mface-sleep-dim", String(dim));
    // Wake-up stretch — sleeping → not-sleeping triggers a yawn.
    if (prev > 0.85 && sleepDepth <= 0.85) pulse("stretch");
    if (sleepDepth > 0.85 && inFlight === 0 && expression === "idle") {
      setExpression("sleeping");
    } else if (sleepDepth < 0.5 && expression === "sleeping") {
      setExpression("idle");
    }
  }

  // Called by the utterance router before a generate() kicks off.
  function onGenerateStart({ backend: b } = {}) {
    inFlight++;
    inFlightStart = performance.now();
    if (b) setBackend(b);
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = 0;
    }
    pulse("inhale");
    // Switch expression after a longer inhale so the swap has a real
    // beat of anticipation. Gentle giant — slow draw of breath.
    setTimeout(() => {
      if (inFlight > 0) setExpression("thinking");
    }, 280);
    scheduleLongThinkCheck();
  }

  // Called after generate() lands.
  function onGenerateResult({ jobKind, backend: b, text } = {}) {
    inFlight = Math.max(0, inFlight - 1);
    if (!text) {
      setExpression("template");
      pulse("template-defeat");
      scheduleIdle();
      return;
    }
    if (b) setBackend(b);
    if (b === "template") {
      setExpression("template");
      pulse("template-defeat");
      scheduleIdle();
      return;
    }
    const mood = JOB_TO_EXPRESSION[jobKind] || "snarky";
    setExpression(mood);
    pulse("recoil");
    if (mood === "snarky") pulse("snarky-double");
    scheduleIdle();
  }

  // ── Long-think fidget ─────────────────────────────────────
  // While generation is in flight beyond LONG_THINK_MS, drift the eyes
  // to one side, hold, drift to the other. Subtle "still working".
  let fidgetTimer = 0;
  let fidgetSide = 0;
  function scheduleLongThinkCheck() {
    if (fidgetTimer) return;
    fidgetTimer = window.setTimeout(() => {
      fidgetTimer = 0;
      if (inFlight === 0) return;
      if (performance.now() - inFlightStart < LONG_THINK_MS) {
        scheduleLongThinkCheck();
        return;
      }
      // Drift to alternating sides while still in flight. Long holds
      // — he considers each side properly before moving on.
      fidgetSide = fidgetSide ? 0 : 1;
      const tx = fidgetSide ? 0.6 : -0.6;
      setLookTarget(tx, lookTargetY);
      fidgetTimer = window.setTimeout(
        () => {
          fidgetTimer = 0;
          if (inFlight > 0) scheduleLongThinkCheck();
        },
        1700 + Math.random() * 1200,
      );
    }, 1500);
  }

  // ── Pulse mechanic ────────────────────────────────────────
  // Generic transient. Sets `data-pulse-<name>="1"` on the SVG; CSS
  // keyframes pinned to that selector run for the duration; then we
  // clear the attribute. Each pulse name has its own slot so multiple
  // can be active in parallel (delete + blink + cloud-puff = fine).
  const pulseTimers = new Map();
  function pulse(name, ms) {
    if (reduceMotion && name !== "blink" && name !== "blink-slow") return;
    if (!name) return;
    const dur = Number.isFinite(ms) ? ms : PULSE_MS[name] || 600;
    svg.dataset[pulseKey(name)] = "1";
    const prev = pulseTimers.get(name);
    if (prev) clearTimeout(prev);
    const t = window.setTimeout(() => {
      delete svg.dataset[pulseKey(name)];
      pulseTimers.delete(name);
    }, dur);
    pulseTimers.set(name, t);
  }
  function pulseKey(name) {
    // Convert "kebab-case" → "pulseKebabCase" dataset key. Browsers
    // store dataset keys camelCase, but the rendered HTML attribute is
    // `data-pulse-kebab-case`. CSS targets the attribute.
    return "pulse" + name.replace(/(^|-)(.)/g, (_, _d, c) => c.toUpperCase());
  }

  // ── Bulge (legacy + delete) ────────────────────────────────
  // Kept as a named function for back-compat; internally a pulse.
  function bulge() {
    pulse("bulge");
  }
  // Ambient bulge — long, long random gap so it feels like he's
  // genuinely surprised once in a while, not ticcing.
  function scheduleAmbientBulge() {
    const delay = 90000 + Math.random() * 150000;
    setTimeout(() => {
      if (expression !== "sleeping" && sleepDepth < 0.85) bulge();
      scheduleAmbientBulge();
    }, delay);
  }
  scheduleAmbientBulge();

  // ── Variable-rate blink scheduler ─────────────────────────
  // Slow Poisson blinks. Sky-creatures blink rarely; the gentle giant
  // is patient. Mean ~16s, range 4–40s.
  function scheduleNextBlink() {
    const u = Math.random();
    let delay = -Math.log(1 - u) * 16000;
    delay = Math.max(4000, Math.min(40000, delay));
    setTimeout(() => {
      if (expression !== "sleeping" && sleepDepth < 0.85) {
        if (Math.random() < 0.15) pulse("blink-double");
        else pulse("blink");
      }
      scheduleNextBlink();
    }, delay);
  }
  scheduleNextBlink();

  // ── Cloud weather (slow sigh) ─────────────────────────────
  // Very rare — he sighs as the weather changes, not as a tic.
  function scheduleCloudWeather() {
    const delay = 110000 + Math.random() * 80000;
    setTimeout(() => {
      if (!reduceMotion && expression !== "sleeping") pulse("weather-sigh");
      scheduleCloudWeather();
    }, delay);
  }
  scheduleCloudWeather();

  // ── Resting microsmile (idle only) ────────────────────────
  function scheduleMicrosmile() {
    const delay = 38000 + Math.random() * 32000;
    setTimeout(() => {
      if (
        !reduceMotion &&
        expression === "idle" &&
        sleepDepth < 0.5 &&
        isWindowFocused
      ) {
        pulse("microsmile");
      }
      scheduleMicrosmile();
    }, delay);
  }
  scheduleMicrosmile();

  // ── Long-idle gaze-away ───────────────────────────────────
  // No interaction for > 90s → eyes drift to one extreme, hold,
  // drift back. Looking out the window.
  let gazeAwayTimer = 0;
  function scheduleGazeAwayCheck() {
    if (gazeAwayTimer) clearTimeout(gazeAwayTimer);
    gazeAwayTimer = window.setTimeout(() => {
      gazeAwayTimer = 0;
      const idleFor = performance.now() - lastInteraction;
      if (
        idleFor > 120000 &&
        expression !== "sleeping" &&
        sleepDepth < 0.5 &&
        isWindowFocused
      ) {
        // Drift to a random extreme. Holds for a long beat — he's
        // looking properly out the window, not glancing.
        const dir = Math.random() < 0.5 ? -1 : 1;
        setLookTarget(dir * 0.95, -0.4);
        pulse("gaze-away");
        setTimeout(() => setLookTarget(0, 0), 7500);
      }
      scheduleGazeAwayCheck();
    }, 45000);
  }
  scheduleGazeAwayCheck();

  // ── Window focus / blur ───────────────────────────────────
  // Blur → eyes flatten (reduce ambient motion when user is elsewhere).
  // Focus → wake-up perk if we were away for > 5min.
  window.addEventListener("blur", () => {
    isWindowFocused = false;
    blurEnteredAt = performance.now();
    svg.dataset.windowBlur = "1";
  });
  window.addEventListener("focus", () => {
    isWindowFocused = true;
    delete svg.dataset.windowBlur;
    const away = blurEnteredAt ? performance.now() - blurEnteredAt : 0;
    if (away > 5 * 60 * 1000) {
      pulse("perk");
    }
    blurEnteredAt = 0;
    lastInteraction = performance.now();
  });

  function scheduleIdle() {
    if (dwellTimer) clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(() => {
      dwellTimer = 0;
      if (inFlight > 0) return;
      if (sleepDepth > 0.85) {
        setExpression("sleeping");
      } else {
        setExpression("idle");
      }
    }, DWELL_MS);
  }

  // ── Per-keystroke hmm cycle ──────────────────────────────
  // Six tiny hesitations rotated in order. Called from the search
  // input on every keystroke so the avatar appears to follow each
  // letter the user types in Cmd+K. Cycle stays deterministic so the
  // user can predict the rhythm; randomness here would feel chaotic.
  const HMM_KEYS = [
    "hmm-up-l",
    "hmm-up-r",
    "hmm-down-l",
    "hmm-right-r",
    "hmm-skew-l",
    "hmm-skew-r",
  ];
  let hmmCursor = 0;
  function nextHmm() {
    const name = HMM_KEYS[hmmCursor];
    hmmCursor = (hmmCursor + 1) % HMM_KEYS.length;
    pulse(name);
  }

  // ── Public reaction map ───────────────────────────────────
  // One name per event, internally maps to a pulse (sometimes more
  // than one, sometimes with anticipation). Wiring sites in main.js
  // call `modelFace.react("delete")` rather than `pulse("bulge")`
  // so the trigger stays meaningful at the call site.
  function react(name, opts = {}) {
    lastInteraction = performance.now();
    if (!firstActionFired && USER_EVENTS.has(name)) {
      firstActionFired = true;
      pulse("first-action");
    }
    switch (name) {
      case "delete":
        // Slow anticipation pull-in → slow bulge. The face notices the
        // delete properly before it reacts.
        pulse("anticipate", 220);
        setTimeout(() => pulse("bulge"), 220);
        break;
      case "wince":
        pulse("wince");
        break;
      case "weird-link":
        pulse("brow");
        break;
      case "rename":
        pulse("pursed");
        break;
      case "save":
        pulse("blink");
        break;
      case "autosave":
        pulse("blink-slow");
        break;
      case "search-empty":
        pulse("search-empty");
        break;
      case "search-long-query":
        // Set a flag for as long as the query is long; cleared via
        // `search-end`. Stack with other pulses.
        svg.dataset.pulseSquint = "1";
        break;
      case "search-end":
        delete svg.dataset.pulseSquint;
        break;
      case "hmm":
        // Cycle through the 6 micro-hesitations. Called per
        // keystroke from the search input.
        nextHmm();
        break;
      case "tag-mismatch":
        pulse("tag-flicker");
        break;
      case "link-picker":
        pulse("look-up");
        if (opts.x != null && opts.y != null) lookAtClient(opts.x, opts.y);
        break;
      case "link-confirmed":
        pulse("settle");
        setLookTarget(0, 0);
        break;
      case "tether-snap":
        pulse("tether-snap");
        break;
      case "lean-collide":
        pulse("lean-collide");
        break;
      case "supernova":
        pulse("flash");
        break;
      case "constellation-confirmed":
        pulse("constellation-pride");
        break;
      case "morning-bow":
        pulse("bow");
        break;
      case "perk":
        pulse("perk");
        break;
      case "cost-flinch":
        pulse("cost-flinch");
        break;
      case "stretch":
        pulse("stretch");
        break;
      default:
        // Unknown reaction — surface in console so we catch typos in
        // wiring sites without crashing.
        if (PULSE_MS[name]) pulse(name);
        else console.warn("[modelFace] unknown react:", name);
    }
  }

  return {
    setBackend,
    setExpression,
    onGenerateStart,
    onGenerateResult,
    setSleepDepth,
    lookAt,
    lookAtClient,
    bulge,
    pulse,
    react,
  };
}

// User-action events that count as "first action of session". Universe
// + model events don't count; only deliberate vault edits do.
const USER_EVENTS = new Set([
  "delete",
  "rename",
  "save",
  "link-confirmed",
  "constellation-confirmed",
]);

// ── SVG template ─────────────────────────────────────────────
// Each expression is its own <g> group. Eyes are wrapped in
// per-side <g class="mface-eye-grp" data-side="l|r"> so CSS can
// asymmetric-animate (eyebrow flicker, single-side wince).
const SVG_TEMPLATE = `
<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg"
     class="mface" data-expression="idle" data-backend="template"
     aria-hidden="true">

  <!-- idle -->
  <g class="mface-expr" data-name="idle">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -18 -5 Q -14 -10 -10 -5 M -18 -3 Q -14 2 -10 -3"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 10 -5 Q 14 -10 18 -5 M 10 -3 Q 14 2 18 -3"/>
    </g>
    <g class="mface-mouth-grp">
      <path class="mface-mouth" d="M -12 14 Q -6 17 0 15 Q 6 13 12 16"/>
    </g>
  </g>

  <!-- thinking -->
  <g class="mface-expr" data-name="thinking">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -18 -4 Q -14 -2 -10 -4 M -18 -3 Q -14 -6 -10 -3"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 10 -4 Q 14 -2 18 -4 M 10 -3 Q 14 -6 18 -3"/>
    </g>
    <g class="mface-mouth-grp">
      <circle cx="-9" cy="16" r="2" class="mface-mouth-dot"/>
      <circle cx="0" cy="16" r="2.4" class="mface-mouth-dot"/>
      <circle cx="9" cy="16" r="2" class="mface-mouth-dot"/>
    </g>
  </g>

  <!-- snarky -->
  <g class="mface-expr" data-name="snarky">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble mface-brow-arch" d="M -22 -13 Q -15 -19 -7 -11"/>
      <path class="mface-scribble" d="M -18 -5 Q -14 -2 -10 -5"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 10 -5 Q 14 -10 18 -5 M 10 -3 Q 14 2 18 -3"/>
    </g>
    <g class="mface-mouth-grp">
      <path class="mface-mouth" d="M -12 15 Q -4 12 2 17 Q 9 20 13 13"/>
    </g>
  </g>

  <!-- dreaming -->
  <g class="mface-expr" data-name="dreaming">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -19 -3 Q -14 -11 -9 -3"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 9 -3 Q 14 -11 19 -3"/>
    </g>
    <g class="mface-mouth-grp">
      <path class="mface-mouth" d="M -13 11 Q -4 21 4 19 Q 9 18 13 11"/>
    </g>
  </g>

  <!-- speculating -->
  <g class="mface-expr" data-name="speculating">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -20 -6 Q -14 -12 -8 -6 M -20 -2 Q -14 4 -8 -2"/>
      <circle cx="-14" cy="-4" r="2.3" class="mface-pupil"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 8 -6 Q 14 -12 20 -6 M 8 -2 Q 14 4 20 -2"/>
      <circle cx="14" cy="-4" r="2.3" class="mface-pupil"/>
    </g>
    <g class="mface-mouth-grp">
      <ellipse cx="0" cy="16" rx="4.5" ry="6" class="mface-mouth-o"/>
    </g>
    <path d="M 0 -28 L -3 -36 M 0 -28 L 3 -36 M 0 -28 L -5 -33 M 0 -28 L 5 -33"
          class="mface-spark"/>
  </g>

  <!-- template -->
  <g class="mface-expr" data-name="template">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -18 -4 L -10 -4 M -18 -3 L -10 -5"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 10 -4 L 18 -4 M 10 -3 L 18 -5"/>
    </g>
    <g class="mface-mouth-grp">
      <path class="mface-mouth" d="M -11 16 L 11 16"/>
    </g>
  </g>

  <!-- sleeping -->
  <g class="mface-expr" data-name="sleeping">
    <g class="mface-eye-grp" data-side="l">
      <path class="mface-scribble" d="M -18 -3 Q -14 -7 -10 -3"/>
    </g>
    <g class="mface-eye-grp" data-side="r">
      <path class="mface-scribble" d="M 10 -3 Q 14 -7 18 -3"/>
    </g>
    <g class="mface-mouth-grp">
      <path class="mface-mouth" d="M -10 14 Q 0 18 10 14"/>
    </g>
    <text x="18" y="-22" class="mface-z" font-size="10">z</text>
    <text x="24" y="-16" class="mface-z mface-z-small" font-size="8">z</text>
  </g>
</svg>
`;
