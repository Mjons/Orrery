// Model face — the visual persona of whatever backend is currently
// speaking. Sits in the top-left HUD, always visible, reacts to every
// call made through the utterance router. Gives the user an at-a-glance
// answer to two questions MODEL_SURFACES.md §1.2 demanded visible UI for:
//
//   1. Is a model producing this output, or is it template fallback?
//   2. Which backend produced it (local / claude / webllm / template)?
//
// Expression is chosen by job kind; glow colour is chosen by backend.
// A small SVG with six expression groups — only one is visible at any
// time. Expression changes are instant; the glow and mouth pulse animate.

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
// Thinking is handled separately as a transient state during the fetch.
const JOB_TO_EXPRESSION = {
  "chorus-line": "snarky",
  "dream-caption": "dreaming",
  "idea-seed": "speculating",
  "morning-synthesis": "speculating",
};

// Dwell time for a result expression before the face drifts back to idle.
// Long enough to feel connected to the caption that just appeared.
const DWELL_MS = 4500;

export function createModelFace({ mountId = "model-face" } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) {
    // Graceful no-op so main.js doesn't have to null-check.
    return {
      setBackend: () => {},
      setExpression: () => {},
      onGenerateStart: () => {},
      onGenerateResult: () => {},
      setSleepDepth: () => {},
    };
  }

  mount.innerHTML = SVG_TEMPLATE;
  const svg = mount.querySelector("svg");
  let expression = "idle";
  let backend = "template";
  let sleepDepth = 0;
  let inFlight = 0;
  let dwellTimer = 0;

  applyClasses();

  function applyClasses() {
    svg.dataset.expression = expression;
    svg.dataset.backend = backend;
  }

  function setExpression(next) {
    if (!EXPRESSIONS.includes(next)) return;
    expression = next;
    applyClasses();
  }

  function setBackend(id) {
    backend = id || "template";
    applyClasses();
  }

  function setSleepDepth(d) {
    sleepDepth = Number(d) || 0;
    // Deep sleep + no pending generation → sleeping face. The drawer
    // and chorus are still emitting captions at this depth, but the
    // face goes quiet to match the app's mood.
    if (sleepDepth > 0.85 && inFlight === 0 && expression === "idle") {
      setExpression("sleeping");
    } else if (sleepDepth < 0.5 && expression === "sleeping") {
      setExpression("idle");
    }
  }

  // Called by the utterance router before a generate() kicks off.
  function onGenerateStart({ backend: b } = {}) {
    inFlight++;
    if (b) setBackend(b);
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = 0;
    }
    setExpression("thinking");
  }

  // Called after generate() lands. Pass the full result or null.
  function onGenerateResult({ jobKind, backend: b, text } = {}) {
    inFlight = Math.max(0, inFlight - 1);
    // No result at all — everything failed, router returned null. Rare
    // but possible; stay thinking a beat then fade.
    if (!text) {
      setExpression("template");
      scheduleIdle();
      return;
    }
    if (b) setBackend(b);
    if (b === "template") {
      setExpression("template");
      scheduleIdle();
      return;
    }
    const mood = JOB_TO_EXPRESSION[jobKind] || "snarky";
    setExpression(mood);
    scheduleIdle();
  }

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

  return {
    setBackend,
    setExpression,
    onGenerateStart,
    onGenerateResult,
    setSleepDepth,
  };
}

// ── SVG template ─────────────────────────────────────────────
// Each expression is its own <g> group. Only the one whose name matches
// [data-expression] on the parent <svg> is visible (CSS handles it).
// Keeping the shapes in SVG rather than pre-baked images means the
// accent colour and glow can be driven live from CSS custom properties,
// so switching between backends retints the face without new assets.
const SVG_TEMPLATE = `
<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg"
     class="mface" data-expression="idle" data-backend="template"
     aria-hidden="true">

  <!-- idle: two scribble-knot eyes + a soft curled smile -->
  <g class="mface-expr" data-name="idle">
    <path class="mface-scribble" d="M -18 -5 Q -14 -10 -10 -5 M -18 -3 Q -14 2 -10 -3"/>
    <path class="mface-scribble" d="M 10 -5 Q 14 -10 18 -5 M 10 -3 Q 14 2 18 -3"/>
    <path class="mface-mouth" d="M -12 14 Q -6 17 0 15 Q 6 13 12 16"/>
  </g>

  <!-- thinking: squinty scribbles + bouncing ellipsis -->
  <g class="mface-expr" data-name="thinking">
    <path class="mface-scribble" d="M -18 -4 Q -14 -2 -10 -4 M -18 -3 Q -14 -6 -10 -3"/>
    <path class="mface-scribble" d="M 10 -4 Q 14 -2 18 -4 M 10 -3 Q 14 -6 18 -3"/>
    <circle cx="-9" cy="16" r="2" class="mface-mouth-dot"/>
    <circle cx="0" cy="16" r="2.4" class="mface-mouth-dot"/>
    <circle cx="9" cy="16" r="2" class="mface-mouth-dot"/>
  </g>

  <!-- snarky: raised scribble brow, one half-lid scribble, cocky smirk -->
  <g class="mface-expr" data-name="snarky">
    <path class="mface-scribble" d="M -22 -13 Q -15 -19 -7 -11"/>
    <path class="mface-scribble" d="M -18 -5 Q -14 -2 -10 -5"/>
    <path class="mface-scribble" d="M 10 -5 Q 14 -10 18 -5 M 10 -3 Q 14 2 18 -3"/>
    <path class="mface-mouth" d="M -12 15 Q -4 12 2 17 Q 9 20 13 13"/>
  </g>

  <!-- dreaming: closed arc scribble eyes + generous crescent smile -->
  <g class="mface-expr" data-name="dreaming">
    <path class="mface-scribble" d="M -19 -3 Q -14 -11 -9 -3"/>
    <path class="mface-scribble" d="M 9 -3 Q 14 -11 19 -3"/>
    <path class="mface-mouth" d="M -13 11 Q -4 21 4 19 Q 9 18 13 11"/>
  </g>

  <!-- speculating: wide scribble eyes, pupils, shouting-O mouth + spark -->
  <g class="mface-expr" data-name="speculating">
    <path class="mface-scribble" d="M -20 -6 Q -14 -12 -8 -6 M -20 -2 Q -14 4 -8 -2"/>
    <path class="mface-scribble" d="M 8 -6 Q 14 -12 20 -6 M 8 -2 Q 14 4 20 -2"/>
    <circle cx="-14" cy="-4" r="2.3" class="mface-pupil"/>
    <circle cx="14" cy="-4" r="2.3" class="mface-pupil"/>
    <ellipse cx="0" cy="16" rx="4.5" ry="6" class="mface-mouth-o"/>
    <!-- Tiny spark above to suggest an idea landing. -->
    <path d="M 0 -28 L -3 -36 M 0 -28 L 3 -36 M 0 -28 L -5 -33 M 0 -28 L 5 -33"
          class="mface-spark"/>
  </g>

  <!-- template: flat scribble eyes, flat line mouth (drained, uninspired) -->
  <g class="mface-expr" data-name="template">
    <path class="mface-scribble" d="M -18 -4 L -10 -4 M -18 -3 L -10 -5"/>
    <path class="mface-scribble" d="M 10 -4 L 18 -4 M 10 -3 L 18 -5"/>
    <path class="mface-mouth" d="M -11 16 L 11 16"/>
  </g>

  <!-- sleeping: closed scribble arcs + soft smile + z's -->
  <g class="mface-expr" data-name="sleeping">
    <path class="mface-scribble" d="M -18 -3 Q -14 -7 -10 -3"/>
    <path class="mface-scribble" d="M 10 -3 Q 14 -7 18 -3"/>
    <path class="mface-mouth" d="M -10 14 Q 0 18 10 14"/>
    <text x="18" y="-22" class="mface-z" font-size="10">z</text>
    <text x="24" y="-16" class="mface-z mface-z-small" font-size="8">z</text>
  </g>
</svg>
`;
