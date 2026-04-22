// WEAVE.md Phase 1 — network-completion scan for a hub.
//
// Given a hub note, collect its satellite neighborhood (one-hop in
// or out), then look for honest-prose reasons to link satellite A →
// satellite B. Signal 1: A's body contains B's title (or a
// distinctive suffix of it), word-bounded, case-insensitive, outside
// code fences / existing wikilinks.
//
// Returns a pure list of proposals. No writes, no side effects —
// the caller previews, lets the user uncheck, and applies through
// the same splice-into-body path the keyword-link picker uses.

import { findKeywordMatches } from "./keyword-link.js";

const MAX_PROPOSALS_PER_FROM = 10;
const CONTEXT_CHARS = 40;
const MIN_VARIANT_LENGTH = 3;

/**
 * @typedef {object} WeaveProposal
 * @property {object} from          satellite note A (the one that'll be edited)
 * @property {object} to            satellite note B (link target)
 * @property {number} charOffset    match offset in A.body
 * @property {string} matchedText   exact text in A.body that matches B.title
 * @property {string} replacement   `[[B.title]]` or `[[B.title|matched]]`
 * @property {string} before        short context before the match
 * @property {string} after         short context after the match
 */

/**
 * Scan a hub's satellite neighborhood for satellite-to-satellite
 * link proposals.
 *
 * @param {object} vault
 * @param {string} hubId
 * @param {object} [opts]
 * @param {boolean} [opts.sameRootOnly=true]
 *   Limit satellites to those sharing the hub's rootId. On by default
 *   because cross-project neighborhoods are usually tending-agent
 *   noise, not honest project structure. Disable to consider the
 *   whole graph.
 * @returns {{
 *   hub: object,
 *   satellites: object[],
 *   proposals: WeaveProposal[],
 *   skipped: { self: number, alreadyLinked: number, noMention: number, crossRoot: number }
 * }}
 */
export function scanWeave(vault, hubId, opts = {}) {
  const { sameRootOnly = true } = opts;
  const empty = {
    hub: null,
    satellites: [],
    proposals: [],
    skipped: { self: 0, alreadyLinked: 0, noMention: 0, crossRoot: 0 },
  };
  if (!vault?.byId || !hubId) return empty;
  const hub = vault.byId.get(hubId);
  if (!hub) return empty;

  // One-hop neighborhood: any note that either links to the hub or
  // that the hub links to. Dedupe; drop the hub itself.
  const satIds = new Set();
  for (const x of vault.forward?.get(hubId) || []) satIds.add(x);
  for (const x of vault.backward?.get(hubId) || []) satIds.add(x);
  satIds.delete(hubId);

  const satellites = [];
  const skipped = { self: 0, alreadyLinked: 0, noMention: 0, crossRoot: 0 };
  for (const id of satIds) {
    const n = vault.byId.get(id);
    if (!n) continue;
    // Same-root scope: drop cross-project false positives (tending
    // agents often append stray wikilinks across projects; those
    // would inflate the neighborhood with unrelated notes).
    if (sameRootOnly && hub.rootId && n.rootId && n.rootId !== hub.rootId) {
      skipped.crossRoot++;
      continue;
    }
    satellites.push(n);
  }

  /** @type {WeaveProposal[]} */
  const proposals = [];

  // Per-from cap so a single chatty note can't dominate the preview.
  const perFromCount = new Map();

  // For each ordered pair (A, B) in the satellite set, look for A's
  // body mentioning B's title OR a distinctive variant of B's title.
  // Ordered because A's edit is distinct from B's edit — we may
  // propose both A→B and B→A independently.
  for (const a of satellites) {
    for (const b of satellites) {
      if (a.id === b.id) {
        skipped.self++;
        continue;
      }
      if (!b.title) continue;
      // Skip read-only source roots for A — we'd fail to save.
      const root = vault.getRootForNote?.(a.id);
      if (root?.readOnly) continue;

      // Skip if A already links to B (bare or aliased).
      if (alreadyLinked(a.body || "", b.title)) {
        skipped.alreadyLinked++;
        continue;
      }

      // Try each variant in turn (full title first, then distinctive
      // suffixes). First hit wins — preserve the variant's alias form
      // so `[[Full Title|matched]]` reads naturally in prose.
      const variants = titleVariants(b.title, hub.title);
      let chosen = null;
      for (const v of variants) {
        const linkFor = (matched) =>
          matched === b.title ? `[[${b.title}]]` : `[[${b.title}|${matched}]]`;
        const { matches } = findKeywordMatches(a.body || "", {
          keyword: v,
          linkFor,
        });
        if (matches.length > 0) {
          chosen = matches[0];
          break;
        }
      }
      if (!chosen) {
        skipped.noMention++;
        continue;
      }

      const count = perFromCount.get(a.id) || 0;
      if (count >= MAX_PROPOSALS_PER_FROM) continue;
      perFromCount.set(a.id, count + 1);

      const body = a.body || "";
      proposals.push({
        from: a,
        to: b,
        charOffset: chosen.charOffset,
        matchedText: chosen.matchedText,
        replacement: chosen.replacement,
        before: body.slice(
          Math.max(0, chosen.charOffset - CONTEXT_CHARS),
          chosen.charOffset,
        ),
        after: body.slice(
          chosen.charOffset + chosen.matchedText.length,
          chosen.charOffset + chosen.matchedText.length + CONTEXT_CHARS,
        ),
      });
    }
  }

  return { hub, satellites, proposals, skipped };
}

/**
 * Derive candidate phrases to look for in prose when trying to link
 * to a note. Starts with the full title, then tries distinctive
 * suffixes peeled off by common separators (em-dash, colon, hyphen
 * used as a separator) and by stripping the hub's own title as a
 * prefix. Titles like `Delphica — Design Handoff` with hub
 * `Delphica` yield ["Delphica — Design Handoff", "Design Handoff"],
 * so a note saying "the design handoff shipped" still matches.
 */
export function titleVariants(title, hubTitle = "") {
  const out = [];
  const seen = new Set();
  // Distinctive-enough: at least 2 words OR ≥ 8 chars. "Plan" alone
  // would match every note about anything; "Landing Page" or
  // "Handoff" are specific enough to be useful wikilink signals.
  const hubKey = String(hubTitle || "")
    .trim()
    .toLowerCase();
  const push = (v) => {
    const clean = String(v || "").trim();
    if (!clean || clean.length < MIN_VARIANT_LENGTH) return;
    const words = clean.split(/\s+/).filter(Boolean).length;
    if (words < 2 && clean.length < 8) return;
    const key = clean.toLowerCase();
    // Never emit the hub's own title as a variant for a satellite.
    // Otherwise prose mentioning the hub would link to an arbitrary
    // satellite that happens to start with the hub name.
    if (hubKey && key === hubKey) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  const t = String(title || "").trim();
  // Seed set: the full title, plus the hub-prefix-stripped title
  // if the convention applies. Each seed then gets split by
  // separators into sub-variants.
  const seeds = [t];
  if (hubTitle) {
    const hubLower = hubTitle.toLowerCase();
    const tLower = t.toLowerCase();
    if (tLower.startsWith(hubLower + " ") && t.length > hubTitle.length + 1) {
      const tail = t
        .slice(hubTitle.length + 1)
        .trim()
        .replace(/^[—–\-:]\s*/, "");
      if (tail) seeds.push(tail);
    }
  }

  const sepRe = /\s[—–-]\s+|:\s+/;
  for (const seed of seeds) {
    push(seed);
    const parts = seed
      .split(sepRe)
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      // Last-piece ("Unified Business Plan") is usually the most
      // distinctive. Other pieces are kept as fallbacks.
      push(parts[parts.length - 1]);
      for (let i = 0; i < parts.length - 1; i++) push(parts[i]);
    }
  }

  return out;
}

function alreadyLinked(body, title) {
  if (!body || !title) return false;
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `\\[\\[\\s*${escaped}\\s*(?:\\|[^\\]]*)?\\s*\\]\\]`,
    "i",
  );
  return re.test(body);
}
