// Tend enrichment layer — the LLM-facing sidecar to the rule-based
// tend.js. Takes proposals produced by rules and enhances them via
// the utterance router while preserving the underlying facts.
//
// Design contract (MODEL_SURFACES.md §2.2):
//   - Rules propose. Enrichment only touches the English, never the
//     action. The proposal's `noteId`, `tags`, `linkTargetId`, etc.
//     remain exactly what the rules decided.
//   - Enrichment is optional. Template fallback = the rule-derived
//     reason unchanged. Tend works identically offline.
//   - Serial model calls, not parallel. Matches the harvester pattern
//     from salience-layer so Ollama is never overwhelmed.
//   - User action (Accept/Reject) is unchanged. They're still clicking
//     on a rule-proposed action, not a model-proposed one.
//
// Two operations:
//   polishProposalsSerial(proposals, utterance, { onUpdate })
//     → rewrites each proposal.reason via `tend-reason-polish`
//   rankProposals(proposals, utterance)
//     → returns proposals reordered via `tend-rank`, with reasoning

const POLISH_SETTLE_MS = 300;

// Rewrite the `reason` field on each proposal via the model. Mutates
// in place and calls `onUpdate(proposal)` after each successful polish
// so the drawer can re-render live rather than waiting for all to
// complete. Skip-on-error: failed proposals keep their original
// reason. Fire-and-forget from the caller's perspective — the returned
// promise resolves when the whole list has been attempted.
export async function polishProposalsSerial(
  proposals,
  utterance,
  { onUpdate, getAborted } = {},
) {
  if (!utterance || !Array.isArray(proposals) || proposals.length === 0) {
    return { polished: 0, skipped: proposals?.length || 0 };
  }
  let polished = 0;
  let skipped = 0;
  for (const proposal of proposals) {
    if (typeof getAborted === "function" && getAborted()) break;
    if (!proposal || !proposal.reason) {
      skipped++;
      continue;
    }
    const originalReason = proposal.reason;
    try {
      const result = await utterance.generate("tend-reason-polish", {
        pass: proposal.pass || "",
        noteTitle: proposal.noteTitle || "",
        originalReason,
      });
      if (
        result &&
        result.text &&
        result.backend !== "template" &&
        result.text.trim() !== originalReason.trim() &&
        looksSafe(result.text, originalReason)
      ) {
        proposal.reason = result.text.trim();
        proposal.reasonBackend = result.backend;
        polished++;
        if (onUpdate) {
          try {
            onUpdate(proposal);
          } catch (err) {
            console.warn("[bz] tend-polish onUpdate threw", err);
          }
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn("[bz] tend-polish call failed", err);
      skipped++;
    }
    // Small breath between calls, matching the salience harvester.
    await sleep(POLISH_SETTLE_MS);
  }
  return { polished, skipped };
}

// Paranoid safety check — catch a model that ignored the "preserve
// facts" rule. If the polished version is suspiciously longer (padded
// with fluff) or dropped a specific token the original contained (a
// tag, a number, a title in quotes), prefer the original. False
// negatives are fine — we just don't polish. False positives would be
// bad — we'd ship hallucinated "why."
function looksSafe(polished, original) {
  if (polished.length > original.length * 2.2) return false;
  // Tag tokens — #foo — must survive verbatim
  const tagsIn = [...original.matchAll(/#[A-Za-z][\w-]*/g)].map((m) => m[0]);
  for (const tag of tagsIn) {
    if (!polished.includes(tag)) return false;
  }
  // Quoted title tokens — "foo" — must survive verbatim
  const quotedIn = [...original.matchAll(/"([^"]{2,})"/g)].map((m) => m[1]);
  for (const quoted of quotedIn) {
    // Allow the quotes to be dropped but the content must appear.
    if (!polished.includes(quoted)) return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-rank the proposals list. Returns { proposals, reasoning, backend }
// where proposals is the reordered array (same objects, different
// order) and reasoning is a one-sentence rationale from the model. On
// failure returns the input unchanged with backend = "template".
export async function rankProposals(proposals, utterance) {
  if (!utterance || !Array.isArray(proposals) || proposals.length <= 1) {
    return { proposals, reasoning: "", backend: "template" };
  }
  const payload = proposals.map((p, i) => ({
    index: i + 1,
    pass: p.pass,
    noteTitle: p.noteTitle,
    reason: p.reason,
  }));
  try {
    const result = await utterance.generate("tend-rank", {
      proposals: payload,
    });
    if (!result || !result.text || result.backend === "template") {
      return { proposals, reasoning: "", backend: "template" };
    }
    const parsed = parseRankOutput(result.text);
    if (!parsed) {
      return { proposals, reasoning: "", backend: "template" };
    }
    // Map the 1-indexed order back to proposal objects. Guard against
    // models that drop indices or repeat them — fall back to original
    // order appended for any missing.
    const used = new Set();
    const out = [];
    for (const i of parsed.order) {
      const idx = Number(i) - 1;
      if (!Number.isInteger(idx)) continue;
      if (idx < 0 || idx >= proposals.length) continue;
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(proposals[idx]);
    }
    // Any index the model dropped gets appended in original order at
    // the bottom — never silently discard a proposal.
    for (let i = 0; i < proposals.length; i++) {
      if (!used.has(i)) out.push(proposals[i]);
    }
    return {
      proposals: out,
      reasoning: parsed.reasoning || "",
      backend: result.backend,
    };
  } catch (err) {
    console.warn("[bz] tend-rank failed", err);
    return { proposals, reasoning: "", backend: "template" };
  }
}

// Mirrors the forgiving JSON parser from salience-layer's runJudge.
// Accepts raw JSON, JSON wrapped in a code fence, JSON with preamble,
// or a bare comma-separated list of indices.
function parseRankOutput(text) {
  const stripped = String(text).trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (Array.isArray(obj.order) && obj.order.length > 0) {
        const order = obj.order
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (order.length > 0) {
          return { order, reasoning: obj.reasoning || "" };
        }
      }
    } catch {
      // fall through
    }
  }
  const indexMatches = stripped.match(/\b\d+\b/g);
  if (indexMatches) {
    const order = [
      ...new Set(
        indexMatches.map(Number).filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (order.length > 0) return { order, reasoning: "" };
  }
  return null;
}
