// WEAVE.md Phase 1 — network-completion scan for a hub.
//
// Given a hub note, collect its satellite neighborhood (one-hop in
// or out), then look for honest-prose reasons to link satellite A →
// satellite B. Signal 1: A's body contains B's title (word-bounded,
// case-insensitive, outside code fences / existing wikilinks). Same
// matcher the obvious-link pass uses.
//
// Returns a pure list of proposals. No writes, no side effects —
// the caller previews, lets the user uncheck, and applies through
// the same splice-into-body path the keyword-link picker uses.

import { findKeywordMatches } from "./keyword-link.js";

const MAX_PROPOSALS_PER_FROM = 10;
const CONTEXT_CHARS = 40;

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
 * @returns {{
 *   hub: object,
 *   satellites: object[],
 *   proposals: WeaveProposal[],
 *   skipped: { self: number, alreadyLinked: number, noMention: number }
 * }}
 */
export function scanWeave(vault, hubId) {
  const empty = {
    hub: null,
    satellites: [],
    proposals: [],
    skipped: { self: 0, alreadyLinked: 0, noMention: 0 },
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
  for (const id of satIds) {
    const n = vault.byId.get(id);
    if (n) satellites.push(n);
  }

  /** @type {WeaveProposal[]} */
  const proposals = [];
  const skipped = { self: 0, alreadyLinked: 0, noMention: 0 };

  // Per-from cap so a single chatty note can't dominate the preview.
  const perFromCount = new Map();

  // For each ordered pair (A, B) in the satellite set, look for A's
  // body mentioning B's title. Ordered because A's edit is distinct
  // from B's edit — we may propose both A→B and B→A independently.
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

      const linkFor = (matched) =>
        matched === b.title ? `[[${b.title}]]` : `[[${b.title}|${matched}]]`;

      const { matches } = findKeywordMatches(a.body || "", {
        keyword: b.title,
        linkFor,
      });
      if (matches.length === 0) {
        skipped.noMention++;
        continue;
      }

      const count = perFromCount.get(a.id) || 0;
      if (count >= MAX_PROPOSALS_PER_FROM) continue;
      perFromCount.set(a.id, count + 1);

      // Take only the first match (first-per-paragraph is already
      // applied inside findKeywordMatches — the first returned
      // entry is the first usable paragraph). The applier will
      // splice this single match in.
      const m = matches[0];
      const body = a.body || "";
      proposals.push({
        from: a,
        to: b,
        charOffset: m.charOffset,
        matchedText: m.matchedText,
        replacement: m.replacement,
        before: body.slice(
          Math.max(0, m.charOffset - CONTEXT_CHARS),
          m.charOffset,
        ),
        after: body.slice(
          m.charOffset + m.matchedText.length,
          m.charOffset + m.matchedText.length + CONTEXT_CHARS,
        ),
      });
    }
  }

  return { hub, satellites, proposals, skipped };
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
