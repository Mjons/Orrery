// WebLLM utterance backend — on-device inference via @mlc-ai/web-llm.
//
// Boltzsidian ships without this dependency by default because the
// model weights alone are ~500 MB and the initial install + download
// is a material user cost. To turn this backend on:
//
//   1. `npm install @mlc-ai/web-llm` in the boltzsidian/ directory
//      (Windows side — do NOT run from WSL).
//   2. Toggle the backend on in Settings → Voice.
//   3. Confirm the ~500 MB one-time download on first use.
//
// Until step 1 is done, available() returns false and the settings
// chooser greys the option out. The dynamic import() is wrapped so a
// missing package fails soft rather than crashing the module graph.
//
// Model choice: `Llama-3.2-1B-Instruct-q4f32_1-MLC`. Small, quantised
// to ~500 MB, WebGPU-capable. Good enough for the voice surfaces
// Phase 7 covers. GPU contention caveats live in MODEL_SURFACES.md §4.

// Short system prompt — the backend never invents vault content, it
// only rephrases the grounded slots the snapshot provides. Matches the
// chorus-templates §1 "observational, grounded in slots" tone rule.
const SYSTEM_PROMPT = [
  "You are the observer voice for a personal note-taking app.",
  "You write one short sentence (≤ 16 words) grounded strictly in the",
  "provided slots. Never invent titles, tags, neighbours, or dates.",
  "Observational, quiet, anti-mystical. Never prescriptive.",
].join(" ");

export function createWebLLMBackend({ getSettings } = {}) {
  let engine = null;
  let initPromise = null;
  let initFailed = false;
  let initError = null;
  let enabled = false;
  let downloadProgress = null;

  async function ensureEngine() {
    if (engine) return engine;
    if (initFailed) throw initError;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      let webllm;
      try {
        // Dynamic import so the module graph loads without the package.
        webllm = await import("@mlc-ai/web-llm");
      } catch (err) {
        initFailed = true;
        initError = new Error(
          "@mlc-ai/web-llm is not installed. Run `npm install @mlc-ai/web-llm` from the boltzsidian directory on Windows.",
        );
        throw initError;
      }
      try {
        const modelId = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
        engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback: (p) => {
            downloadProgress = {
              text: p.text,
              progress: p.progress ?? 0,
              at: Date.now(),
            };
          },
        });
        downloadProgress = { text: "ready", progress: 1, at: Date.now() };
        return engine;
      } catch (err) {
        initFailed = true;
        initError = err;
        throw err;
      }
    })();
    return initPromise;
  }

  function available() {
    if (!enabled) return false;
    if (initFailed) return false;
    return engine != null;
  }

  async function ready() {
    if (!enabled) return false;
    try {
      await ensureEngine();
      return true;
    } catch {
      return false;
    }
  }

  async function generate({ snapshot } = {}) {
    if (!enabled) throw new Error("webllm: disabled in settings");
    await ensureEngine();
    const userPrompt = buildPrompt(snapshot || {});
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 48,
      temperature: 0.6,
    });
    const text = (reply?.choices?.[0]?.message?.content || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!text) throw new Error("webllm: empty completion");
    return {
      text,
      confidence: 0.7,
      backend: "webllm",
      templateId: null,
    };
  }

  function cost() {
    return {
      latencyMs: 250,
      tokensOut: 48,
      network: false,
      offline: true,
      oneTimeDownloadMb: 500,
    };
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      // Kick off init in the background so the first generate() isn't
      // blocked on model load. Errors are swallowed — available() will
      // just return false.
      ensureEngine().catch(() => {});
    }
  }

  return {
    id: "webllm",
    available,
    ready,
    generate,
    cost,
    setEnabled,
    getDownloadProgress: () => downloadProgress,
    getInitError: () => (initFailed ? initError : null),
  };
}

// Build a tight, slot-ground prompt. No invented vault content — the
// model is told exactly what's observable and asked to rephrase.
function buildPrompt(snapshot) {
  const parts = [];
  if (snapshot.title) parts.push(`title: "${snapshot.title}"`);
  if (snapshot.neighbor) parts.push(`neighbour: "${snapshot.neighbor}"`);
  if (snapshot.tag) parts.push(`tag: #${snapshot.tag}`);
  if (snapshot.folder) parts.push(`folder: ${snapshot.folder}`);
  if (snapshot.age) parts.push(`last touched ${snapshot.age}`);
  if (snapshot.count) parts.push(`${snapshot.count} neighbours nearby`);
  const slots = parts.length > 0 ? parts.join(", ") : "no grounded slots";
  return [
    "Write exactly one short sentence (≤ 16 words) about the primary note.",
    "Use only what these slots say. Do not invent details.",
    `Slots: ${slots}.`,
  ].join(" ");
}
