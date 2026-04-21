// Entry point for the utterance subsystem. Callers import from here.
// Exposes:
//   - createUtteranceRouter({ settings, rng? }) — the one-call API
//   - BACKEND_META — for the settings chooser UI
//   - chainForJob — exposed for tests / debug
//
// The router holds one instance per backend, shares them across callers
// (chorus, dream, morning-report), and routes each generate() call
// through the fallback chain. Backends that require init (WebLLM,
// Claude) lazy-init on first use so boot stays fast.

import { createTemplateBackend } from "./template-backend.js";
import { createLocalBackend } from "./local-backend.js";
import { createWebLLMBackend } from "./webllm-backend.js";
import { createClaudeBackend } from "./claude-backend.js";
import {
  BACKEND_META,
  BACKEND_IDS,
  chainForJob,
  generateWithFallback,
} from "./backend.js";

export { BACKEND_META, BACKEND_IDS, chainForJob };

export function createUtteranceRouter({ getSettings, rng = Math.random } = {}) {
  // One instance per backend. The WebLLM/Claude backends are created
  // up-front but stay in `available:false` until they successfully
  // initialise — the chooser UI reads `available()` to decide whether
  // the option is selectable.
  const backends = {
    template: createTemplateBackend({ rng }),
    local: createLocalBackend({ getSettings }),
    webllm: createWebLLMBackend({ getSettings }),
    claude: createClaudeBackend({ getSettings }),
  };

  // Listeners for every generate() lifecycle — used by the model-face
  // HUD to flip expression between "thinking" (pre-fetch) and
  // the job-kind-specific mood (post-result). Multiple subscribers
  // supported so main can bind one face now and add diagnostics later
  // without rearchitecting.
  const startListeners = new Set();
  const resultListeners = new Set();
  function onGenerateStart(fn) {
    startListeners.add(fn);
    return () => startListeners.delete(fn);
  }
  function onGenerateResult(fn) {
    resultListeners.add(fn);
    return () => resultListeners.delete(fn);
  }
  function emitStart(payload) {
    for (const fn of startListeners) {
      try {
        fn(payload);
      } catch (err) {
        console.warn("[bz] utterance start listener threw", err);
      }
    }
  }
  function emitResult(payload) {
    for (const fn of resultListeners) {
      try {
        fn(payload);
      } catch (err) {
        console.warn("[bz] utterance result listener threw", err);
      }
    }
  }

  async function generate(jobKind, snapshot, opts = {}) {
    const settings = getSettings ? getSettings() : {};
    const chain = chainForJob(jobKind, settings);
    // Preview the likely backend to the listener so the face can tint
    // its glow even before the fetch completes. If the chain falls
    // through, onGenerateResult will correct it.
    const previewBackend =
      chain.find((id) => backends[id]?.available()) || "template";
    emitStart({ jobKind, backend: previewBackend });
    const result = await generateWithFallback(
      { jobKind, snapshot, templateHint: opts.templateHint },
      chain,
      backends,
    );
    emitResult({
      jobKind,
      backend: result?.backend || "template",
      text: result?.text || null,
      ok: !!result,
    });
    return result;
  }

  function setEnabled(backendId, on) {
    const b = backends[backendId];
    if (!b || !b.setEnabled) return;
    b.setEnabled(on);
  }

  return {
    generate,
    setEnabled,
    backends,
    onGenerateStart,
    onGenerateResult,
    // Per-backend readiness snapshot for the settings chooser.
    status: () =>
      Object.fromEntries(
        BACKEND_IDS.map((id) => [
          id,
          {
            available: backends[id].available(),
            meta: BACKEND_META[id],
            cost: backends[id].cost(),
          },
        ]),
      ),
  };
}
