// Apply a tend proposal to the underlying note.
//
// Splits naturally into two kinds of proposals:
//   1. Content-changing: tag-infer, obvious-link, fm-normalise. These
//      modify the note's body or frontmatter and go through the Phase 2
//      saver so the atomic-write + link-rewrite flow applies.
//   2. Acknowledgement-only: title-collision, stub. The user saw it and
//      either decided to act on it manually or not — we stamp the note so
//      future runs don't re-propose.
//
// Every accepted proposal writes a `tended_on` frontmatter array listing
// the pass keys we've already handled for this note. keyForProposal from
// tend.js decides the key. The presence of the key is what tend.js reads
// to suppress re-proposal.

import {
  parseFrontmatter,
  stringifyFrontmatter,
} from "../vault/frontmatter.js";
import { PASSES, keyForProposal } from "./tend.js";
import { ulid } from "ulid";

export async function applyProposal({
  proposal,
  vault,
  saver,
  now = Date.now(),
}) {
  const note = vault?.byId?.get(proposal.noteId);
  if (!note) return { applied: false, reason: "note-missing" };

  let nextText = note.rawText;
  switch (proposal.pass) {
    case PASSES.TAG_INFER:
      nextText = applyTagInfer(note, proposal);
      break;
    case PASSES.OBVIOUS_LINK:
      nextText = applyObviousLink(note, proposal, vault);
      break;
    case PASSES.FM_NORMALISE:
      nextText = applyFmNormalise(note, proposal, now);
      break;
    case PASSES.TITLE_COLLISION:
    case PASSES.STUB:
      // No content change — acknowledgement only. The stamp below is the
      // entire effect.
      break;
    default:
      return { applied: false, reason: "unknown-pass" };
  }

  // Stamp `tended_on[<key>] = iso` regardless of which branch above ran
  // so the proposal doesn't come back next scan.
  nextText = stampTendedOn(nextText, proposal, now);

  if (nextText === note.rawText) {
    // Could happen for stamp-only proposals when the stamp was already
    // there. Saver would no-op anyway, but skip the round-trip.
    return { applied: false, reason: "no-change" };
  }

  await saver(note, nextText);
  return { applied: true };
}

// Rejection leaves the note untouched but still stamps `tended_on` with
// a `rejected:` prefix so we don't re-propose the same thing.
export async function rejectProposal({
  proposal,
  vault,
  saver,
  now = Date.now(),
}) {
  const note = vault?.byId?.get(proposal.noteId);
  if (!note) return { applied: false, reason: "note-missing" };
  const nextText = stampTendedOn(note.rawText, proposal, now, {
    prefix: "rejected:",
  });
  if (nextText === note.rawText) return { applied: false, reason: "no-change" };
  await saver(note, nextText);
  return { applied: true };
}

// ── Content mutations ─────────────────────────────────────
function applyTagInfer(note, proposal) {
  const tags = (proposal.tags || []).filter(Boolean);
  if (tags.length === 0) return note.rawText;
  // Convention: inline hashtags at the bottom of the body. Re-parse picks
  // them up as note.tags on next load. Safer than frontmatter because we
  // don't know whether the user keeps `tags:` in frontmatter or inline.
  const existing = new Set((note.tags || []).map((t) => t.toLowerCase()));
  const fresh = tags.filter((t) => !existing.has(t.toLowerCase()));
  if (fresh.length === 0) return note.rawText;
  const tagLine = fresh.map((t) => `#${t}`).join(" ");
  const body = note.body || "";
  const trimmed = body.replace(/\s+$/, "");
  const sep = trimmed.endsWith("\n") || !trimmed ? "" : "\n";
  const newBody = `${trimmed}${sep}\n\n${tagLine}\n`;
  return replaceBody(note.rawText, body, newBody);
}

export function applyObviousLink(note, proposal, vault) {
  const target = vault?.byId?.get(proposal.linkTargetId);
  if (!target || !target.title) return note.rawText;
  const body = note.body || "";
  // Skip if this target is already linked anywhere in the body —
  // exact `[[Title]]` or aliased `[[Title|whatever]]`.
  const alreadyLinked = new RegExp(
    `\\[\\[\\s*${escapeRegex(target.title)}\\s*(?:\\|[^\\]]*)?\\]\\]`,
    "i",
  ).test(body);
  if (alreadyLinked) return note.rawText;
  // Per DOCS_AGENT.md Pass 3 and TENDING_FIX_PLAN.md §Phase 2:
  // wikilinks go IN-PROSE as first-mention replacements, never as
  // EOF appends. Find the first unbounded prose occurrence of the
  // target's title; replace in place. If no prose mention exists,
  // this applier is a no-op — we never invent a link.
  //
  // Scrub code fences, inline code, existing wikilinks, and
  // markdown links to spaces of equal length so character offsets
  // stay valid against `body` while the search only considers prose.
  const scrubbed = body
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length))
    .replace(/\[\[[^\]]*\]\]/g, (m) => " ".repeat(m.length))
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => " ".repeat(m.length));
  const phraseRe = new RegExp(`\\b${escapeRegex(target.title)}\\b`, "i");
  const m = phraseRe.exec(scrubbed);
  if (!m) return note.rawText;
  const matched = body.slice(m.index, m.index + m[0].length);
  // Preserve author casing via an alias when it diverges from the
  // canonical stem — reads naturally, resolves the same target.
  const replacement =
    matched === target.title
      ? `[[${target.title}]]`
      : `[[${target.title}|${matched}]]`;
  const newBody =
    body.slice(0, m.index) + replacement + body.slice(m.index + m[0].length);
  return replaceBody(note.rawText, body, newBody);
}

function applyFmNormalise(note, proposal, now) {
  const { data, content } = parseFrontmatter(note.rawText);
  let changed = false;
  const missing = proposal.missingFields || [];
  if (missing.includes("id") && (!data.id || proposal.idConflict)) {
    data.id = note.id || ulid();
    changed = true;
  }
  if (missing.includes("created") && !data.created) {
    data.created = new Date(note.mtime || now).toISOString();
    changed = true;
  }
  if (!changed) return note.rawText;
  return stringifyFrontmatter(data, content);
}

// ── tended_on stamp ──────────────────────────────────────
function stampTendedOn(rawText, proposal, now, { prefix = "" } = {}) {
  const { data, content } = parseFrontmatter(rawText);
  const existing = Array.isArray(data.tended_on) ? data.tended_on : [];
  const key = `${prefix}${keyForProposal(proposal)}`;
  if (existing.includes(key)) return rawText;
  data.tended_on = [...existing, key];
  return stringifyFrontmatter(data, content);
}

// ── Helpers ──────────────────────────────────────────────
function replaceBody(rawText, oldBody, newBody) {
  // Find the end of the frontmatter block; preserve it verbatim.
  const fmMatch = rawText.match(/^---[\s\S]*?\n---\s*\n/);
  if (fmMatch) return fmMatch[0] + newBody;
  // No frontmatter: the whole file is the body.
  return newBody;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
