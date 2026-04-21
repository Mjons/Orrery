// Utterance backend interface.
//
// Phase 7 per BUILD_PLAN.md. One interface, three concrete backends
// (template, WebLLM, Claude). The chorus and dream-report layers call
// generate() and don't care which backend answers. Every backend has
// a transparent template fallback on error — a dropped utterance is
// never acceptable (caption systems look broken when they silently
// go quiet).
//
// Scope is strictly voice surfaces (chorus lines, dream captions,
// morning-report synthesis). Extending model output to structural
// enhancement, content assistance, or semantic search is explicitly
// post-Phase-7 work governed by MODEL_SURFACES.md.
//
// ── Snapshot shape ────────────────────────────────────────
// The caller builds a plain-object snapshot. Every backend sees the
// same shape. Slots are optional — backends are expected to handle
// missing fields gracefully (template uses eligibleTemplates() to
// filter; LLM backends either condition on what's present or skip).
//
//   snapshot = {
//     title:    string | null,   // primary note title
//     neighbor: string | null,   // adjacent note title
//     tag:      string | null,   // primary tag, no '#'
//     folder:   string | null,   // top-level folder
//     age:      string | null,   // human-readable relative age
//     count:    number | null,   // neighbor count if > 2
//     // … additional slots added per new template class, never breaking
//   }
//
// ── Backend contract ──────────────────────────────────────
// Every backend exposes exactly this object:
//
//   {
//     id:          "template" | "webllm" | "claude",
//     available(): boolean                — ready right now?
//     ready():     Promise<boolean>       — resolve after lazy init
//     generate(req): Promise<Result>      — see below
//     cost():      { latencyMs, tokensOut, network, offline }
//   }
//
// req = { snapshot, templateHint? }
//
// Result = {
//   text:       string,
//   confidence: number 0..1,      // model's self-reported or 1.0 for template
//   backend:    "template"|"webllm"|"claude",
//   templateId: string | null,    // set only when the template path was used
// }
//
// If a backend can't produce a usable result, it MUST throw — never
// return {text:""}. The router catches and falls back.

export const BACKEND_IDS = ["template", "local", "webllm", "claude"];

// Human-readable expectations for the settings chooser. Kept next to
// the interface so adding a backend updates both in one place.
export const BACKEND_META = {
  template: {
    label: "Template",
    latency: "instant",
    costPerCall: "free",
    network: false,
    notes:
      "Ships with the app. Grounded in vault content, never invents. The floor every other backend falls back to.",
  },
  local: {
    label: "Local rig (OpenAI-compatible)",
    latency: "200–1500 ms (depends on model + rig)",
    costPerCall: "free",
    network: "LAN only",
    notes:
      "HTTP to your own machine — Ollama, LM Studio, llama.cpp server, vLLM, tabbyAPI, anything speaking /v1/chat/completions. Bytes stay on hardware you own. Quality is whatever you loaded on the rig.",
  },
  webllm: {
    label: "On-device (in-browser, WebLLM)",
    latency: "100–400 ms",
    costPerCall: "free after download",
    network: "download once, then offline",
    notes:
      "Quantised ~1 B param model runs inside the browser tab via WebGPU. First use downloads ~500 MB. Competes with the renderer for the same GPU — pick the Local rig option instead if you have a separate machine.",
  },
  claude: {
    label: "Claude API",
    latency: "400–1200 ms",
    costPerCall: "your Anthropic credits",
    network: true,
    notes:
      "User-supplied API key. Every new request shape shows a payload preview you must approve once per session. Best quality.",
  },
};

// Wraps a backend call in the fallback contract. If the primary backend
// throws or returns bogus output, try the next id in `chain`. If every
// backend fails, returns null — caller must treat null as "skip this
// tick" (chorus rate-limits anyway, so silent skip is correct).
//
// `req` is forwarded to each backend verbatim. It MUST include the
// job kind so backends can switch prompts per surface — a chorus line
// wants a different system prompt than a dream idea-seed, even though
// both come from the same model.
export async function generateWithFallback(req, chain, backends) {
  for (const id of chain) {
    const backend = backends[id];
    if (!backend || !backend.available()) continue;
    try {
      const result = await backend.generate(req);
      if (result && typeof result.text === "string" && result.text.trim()) {
        return { ...result, backend: id };
      }
    } catch (err) {
      console.warn(`[bz] utterance backend "${id}" failed`, err);
      // fall through to the next backend in chain
    }
  }
  return null;
}

// Static policy for voice surfaces. Each caller declares its job kind.
// Order matters — first available backend in the chain wins. Template
// is ALWAYS last so we never ship a job whose fallback is silence.
//
// idea-seed is a content-assistance surface per MODEL_SURFACES.md §2.3:
// the salience layer uses it to propose candidate child ideas during
// dream cycles. Output is shown in the ideas drawer and only touches
// disk if the user clicks Promote. Template remains the deterministic
// floor.
export const VOICE_POLICY = {
  "chorus-line": ["template"],
  "dream-caption": ["template"],
  "morning-synthesis": ["template"],
  "idea-seed": ["template"],
  // Phase 3 play operation — takes an existing idea-seed output and
  // rewords it from a different angle. Only fires during the "playing"
  // phase of a dream cycle. Template fallback is "keep the original,"
  // which is handled at the caller since the template doesn't know how
  // to reword itself — see local-backend PROMPTS["idea-reword"].
  "idea-reword": ["template"],
  // Phase 4 discernment — takes the full pool and returns the top-K
  // picks with reasoning. Only fires once at end-of-cycle. Template
  // fallback is "use the existing salience-score top-K," which the
  // salience layer handles synchronously before firing the model call.
  "idea-judge": ["template"],
  // Tend Level 1 — rewrite a rule-generated "reason" as a short
  // conversational nudge. FACTS stay deterministic (the proposal
  // itself is unchanged); only the English changes. Template fallback
  // = original reason unchanged. MODEL_SURFACES.md §2.2.
  "tend-reason-polish": ["template"],
  // Tend Level 2 — rank a list of proposals by usefulness. Returns
  // indices in priority order. Template fallback = confidence-sorted
  // order already produced by the rules.
  "tend-rank": ["template"],
};

// Pick the chain for a job kind, honouring the user's settings override.
// Settings shape: { utterance_backend: "template" | "webllm" | "claude" }.
// If the user has picked a non-template backend, prepend it to the
// default chain so it runs first but falls through on failure.
export function chainForJob(jobKind, settings) {
  const defaults = VOICE_POLICY[jobKind] || ["template"];
  const picked = settings?.utterance_backend;
  if (!picked || picked === "template") return defaults;
  if (!BACKEND_IDS.includes(picked)) return defaults;
  if (defaults[0] === picked) return defaults;
  return [picked, ...defaults.filter((id) => id !== picked)];
}
