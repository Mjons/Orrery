// KEYWORD_LINK.md Phase A (per-body matcher + wrapper) and Phase B
// (vault-wide scanner). Zero DOM, no writes. The vault scanner uses
// the same matching semantics as the per-body helper, plus filters
// for self-skip / already-linked / read-only / scope.
//
// Given a note's body and a keyword, find every in-prose occurrence
// and wrap the FIRST occurrence in each paragraph with whatever
// link string `linkFor(matched)` returns. Returns the mutated body
// plus a match record the caller can use for preview / logging.
//
// Excluded from matching (same regions applyObviousLink scrubs):
//   - fenced code blocks ``` ```
//   - inline code `…`
//   - existing wikilinks [[…]]
//   - existing markdown links [text](url)
//   - URLs (http / https)
//   - ATX headings (# Title, ## Heading)
//
// Excluded regions are replaced with equal-length whitespace in a
// SCRUBBED copy of the body, so regex match indexes in the scrubbed
// copy map 1:1 to character offsets in the original body.
//
// First-per-paragraph wrapping: one wrapped mention per paragraph
// preserves readable prose. Readers clicking through only need one
// click per region.

import { topLevelFolder } from "../vault/folders.js";

const FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const WIKILINK_RE = /\[\[[^\]]*\]\]/g;
const MD_LINK_RE = /\[[^\]]*\]\([^)]*\)/g;
const URL_RE = /https?:\/\/\S+/g;
const HEADING_RE = /^#{1,6}[ \t]+.*$/gm;

/**
 * @typedef {object} KeywordMatch
 * @property {number} paragraphIndex  index of the paragraph (0-based)
 * @property {number} charOffset      start offset in the ORIGINAL body
 * @property {string} matchedText     the exact substring that matched
 * @property {string} replacement     the string that replaces matchedText
 */

/**
 * Wrap keyword mentions in a body as wikilinks.
 *
 * @param {string} body
 * @param {object} opts
 * @param {string} opts.keyword                 phrase to find (literal, not regex)
 * @param {(matched: string) => string} opts.linkFor
 *   called for each accepted match; its return value replaces the
 *   matched text in the body. Caller composes the `[[…]]` string
 *   including any alias / id-vs-title decisions.
 * @param {boolean} [opts.caseSensitive=false]
 * @returns {{ nextBody: string, matches: KeywordMatch[] }}
 */
export function wrapKeywordInBody(body, opts = {}) {
  const { matches } = findKeywordMatches(body, opts);
  if (matches.length === 0) return { nextBody: body || "", matches };
  // Apply replacements end-to-start so earlier offsets stay valid
  // after later slices are inserted.
  let nextBody = body;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    nextBody =
      nextBody.slice(0, m.charOffset) +
      m.replacement +
      nextBody.slice(m.charOffset + m.matchedText.length);
  }
  return { nextBody, matches };
}

/**
 * Find keyword matches without mutating the body. Same semantics as
 * wrapKeywordInBody — excluded regions scrubbed, first-per-paragraph,
 * linkFor composes replacements — but returns only the match list.
 * Used by the vault scanner to collect candidates for preview.
 *
 * @param {string} body
 * @param {object} opts
 * @param {string} opts.keyword
 * @param {(matched: string) => string} opts.linkFor
 * @param {boolean} [opts.caseSensitive=false]
 * @returns {{ matches: KeywordMatch[] }}
 */
export function findKeywordMatches(
  body,
  { keyword, linkFor, caseSensitive = false } = {},
) {
  if (!body || !keyword || typeof linkFor !== "function") {
    return { matches: [] };
  }
  const phrase = String(keyword).trim();
  if (!phrase) return { matches: [] };

  const re = buildKeywordRegex(phrase, caseSensitive);
  if (!re) return { matches: [] };

  const scrubbed = scrubExcluded(body);
  const paragraphs = splitParagraphs(scrubbed);

  /** @type {KeywordMatch[]} */
  const matches = [];
  for (const p of paragraphs) {
    const slice = scrubbed.slice(p.start, p.end);
    re.lastIndex = 0;
    const m = re.exec(slice);
    if (!m) continue;
    const charOffset = p.start + m.index;
    // Match text read from the ORIGINAL body so casing / accented
    // characters are preserved for the alias in linkFor.
    const matchedText = body.slice(charOffset, charOffset + m[0].length);
    const replacement = linkFor(matchedText);
    if (typeof replacement !== "string") continue;
    matches.push({
      paragraphIndex: p.index,
      charOffset,
      matchedText,
      replacement,
    });
  }
  return { matches };
}

/**
 * Quick-count version of wrapKeywordInBody — returns just the
 * number of paragraphs that would match. Used by the preview's
 * per-note summary before the user commits to running the full
 * scan. Same matching rules; no string allocation for replacements.
 */
export function countKeywordMatches(
  body,
  { keyword, caseSensitive = false } = {},
) {
  if (!body || !keyword) return 0;
  const phrase = String(keyword).trim();
  if (!phrase) return 0;
  const re = buildKeywordRegex(phrase, caseSensitive);
  if (!re) return 0;
  const scrubbed = scrubExcluded(body);
  const paragraphs = splitParagraphs(scrubbed);
  let n = 0;
  for (const p of paragraphs) {
    const slice = scrubbed.slice(p.start, p.end);
    re.lastIndex = 0;
    if (re.exec(slice)) n++;
  }
  return n;
}

/**
 * Build the word-boundary regex for a phrase. Multi-word phrases
 * tolerate any whitespace between words so soft-wrapped prose
 * still matches. Special regex characters in the phrase are
 * escaped literally.
 *
 * @param {string} phrase
 * @param {boolean} caseSensitive
 * @returns {RegExp | null}
 */
export function buildKeywordRegex(phrase, caseSensitive = false) {
  const trimmed = String(phrase || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/).map(escapeRegex).filter(Boolean);
  if (parts.length === 0) return null;
  // Use explicit non-word lookarounds instead of `\b` so keywords
  // ending in non-word chars (C++, foo.bar, A&B, #hashtag) match
  // cleanly. `\b` requires a word char on one side; `(?<![A-Za-z0-9_])`
  // works regardless of what the phrase ends with.
  const pattern = `(?<![A-Za-z0-9_])${parts.join("\\s+")}(?![A-Za-z0-9_])`;
  try {
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────

function scrubExcluded(body) {
  // Replace each excluded region with equal-length whitespace so
  // char offsets on the scrubbed string still match the original.
  const spaces = (m) => " ".repeat(m.length);
  return body
    .replace(FENCE_RE, spaces)
    .replace(INLINE_CODE_RE, spaces)
    .replace(WIKILINK_RE, spaces)
    .replace(MD_LINK_RE, spaces)
    .replace(URL_RE, spaces)
    .replace(HEADING_RE, spaces);
}

/**
 * Split a string into paragraphs by blank-line boundaries. Returns
 * an array of { index, start, end } where end is exclusive.
 * Preserves offsets in the source so regex results compose.
 */
function splitParagraphs(text) {
  const out = [];
  const paraRe = /\n{2,}/g;
  let start = 0;
  let idx = 0;
  let m;
  while ((m = paraRe.exec(text)) !== null) {
    out.push({ index: idx++, start, end: m.index });
    start = paraRe.lastIndex;
  }
  out.push({ index: idx, start, end: text.length });
  return out;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Vault scan (Phase B) ─────────────────────────────────

const CONTEXT_CHARS = 40;

/**
 * @typedef {object} NoteMatchGroup
 * @property {object} note               the full note object
 * @property {KeywordMatch[]} occurrences matches in this note, with context
 */

/**
 * @typedef {object} ScanResult
 * @property {NoteMatchGroup[]} matches   notes with at least one match
 * @property {{ self: string|null,
 *              alreadyLinked: string[],
 *              readOnly: string[],
 *              phantom: string[] }} skipped
 * @property {number} totalMatches        sum of occurrences across notes
 * @property {number} totalNotes          count of notes with matches
 */

/**
 * Scan the entire vault for keyword mentions and group by note.
 * Pure — no writes, no side effects. Caller (Phase D) takes the
 * result, the user reviews in the preview, and the apply step
 * performs the writes via the saver.
 *
 * @param {object} vault
 * @param {object} opts
 * @param {string} opts.keyword
 * @param {object} opts.target              note object the keyword links to
 * @param {boolean} [opts.caseSensitive=false]
 * @param {object} [opts.scope={}]
 * @param {string} [opts.scope.rootId]             restrict to one root
 * @param {string} [opts.scope.folder]             restrict to one top-level folder
 * @param {string} [opts.scope.tag]                restrict to notes with this tag
 * @param {boolean} [opts.scope.includeAlreadyLinked=false]
 *   if true, notes that already contain a link to the target are
 *   still scanned (the match list adds any NEW mentions that aren't
 *   already wrapped).
 * @returns {ScanResult}
 */
export function scanVaultForKeyword(
  vault,
  { keyword, target, caseSensitive = false, scope = {} } = {},
) {
  const empty = {
    matches: [],
    skipped: { self: null, alreadyLinked: [], readOnly: [], phantom: [] },
    totalMatches: 0,
    totalNotes: 0,
  };
  if (!vault?.notes || !target || !keyword) return empty;

  const token = composeTokenForKeywordLink(target, vault);
  const titleLower = String(target.title || "").toLowerCase();
  const alreadyLinkedRe = buildAlreadyLinkedRegex(target);

  // linkFor: exact-title match → bare [[Title]]; otherwise alias.
  // When the title collides across roots, `token` becomes the id,
  // so we always use the alias form in that case for readability
  // (a bare [[<ULID>]] would be visually ugly in prose).
  const linkFor = (matched) => {
    const isTitle = token === target.title;
    if (isTitle && matched.toLowerCase() === titleLower) {
      return `[[${target.title}]]`;
    }
    return `[[${token}|${matched}]]`;
  };

  const skipped = {
    self: null,
    alreadyLinked: [],
    readOnly: [],
    phantom: [],
  };
  /** @type {NoteMatchGroup[]} */
  const matches = [];
  let totalMatches = 0;

  const scopeTag = scope.tag
    ? String(scope.tag).toLowerCase().replace(/^#/, "")
    : null;

  for (const note of vault.notes) {
    // Scope filters
    if (scope.rootId && note.rootId !== scope.rootId) continue;
    if (scope.folder && topLevelFolder(note) !== scope.folder) continue;
    if (scopeTag) {
      const has = (note.tags || []).some(
        (t) => String(t).toLowerCase() === scopeTag,
      );
      if (!has) continue;
    }

    const body = note.body || "";

    // Self-skip: target's own note, even if body mentions keyword.
    if (note.id === target.id) {
      if (bodyHasKeyword(body, keyword, caseSensitive)) skipped.self = note.id;
      continue;
    }

    // Phantom notes (unsaved Cmd+N) — skip with reason.
    if (note._isPhantom) {
      if (bodyHasKeyword(body, keyword, caseSensitive))
        skipped.phantom.push(note.id);
      continue;
    }

    // Read-only root — saver would decline. Skip in preview so the
    // user isn't teased with matches they can't apply.
    const root = vault.getRootForNote?.(note.id);
    if (root?.readOnly) {
      if (bodyHasKeyword(body, keyword, caseSensitive))
        skipped.readOnly.push(note.id);
      continue;
    }

    // Already-linked check. If the body has [[Target]] or
    // [[Target|alias]] (or id variants), skip unless caller
    // explicitly includes them.
    const isAlreadyLinked = alreadyLinkedRe.test(body);
    if (isAlreadyLinked && !scope.includeAlreadyLinked) {
      if (bodyHasKeyword(body, keyword, caseSensitive))
        skipped.alreadyLinked.push(note.id);
      continue;
    }

    const { matches: occ } = findKeywordMatches(body, {
      keyword,
      linkFor,
      caseSensitive,
    });
    if (occ.length === 0) continue;

    // Attach context snippets for preview rendering.
    const decorated = occ.map((o) => ({
      ...o,
      before: body.slice(
        Math.max(0, o.charOffset - CONTEXT_CHARS),
        o.charOffset,
      ),
      after: body.slice(
        o.charOffset + o.matchedText.length,
        o.charOffset + o.matchedText.length + CONTEXT_CHARS,
      ),
    }));

    matches.push({ note, occurrences: decorated });
    totalMatches += decorated.length;
  }

  return {
    matches,
    skipped,
    totalMatches,
    totalNotes: matches.length,
  };
}

/**
 * Compose the wikilink token for a keyword-link target. Mirrors
 * main.js's composeBatchLinkToken — prefer the readable title when
 * it's unique across the vault, fall back to the ULID when the
 * title collides.
 */
export function composeTokenForKeywordLink(target, vault) {
  if (!target) return "";
  const key = String(target.title || "")
    .toLowerCase()
    .trim();
  if (!key) return target.id || "";
  const bucket = vault?.byTitle?.get(key);
  // Unique title (or this is the only note by that title) → bare title.
  if (!bucket || bucket.length <= 1) return target.title;
  // Collision → use ULID so resolution is unambiguous regardless of
  // source root. Callers always alias this shape in prose.
  return target.id;
}

/**
 * Regex that matches `[[Target]]` or `[[Target|alias]]` (or the
 * same forms with target.id) anywhere in a body. Used to detect
 * notes that are already linked and skip them by default.
 */
function buildAlreadyLinkedRegex(target) {
  const parts = [];
  if (target.title) parts.push(escapeRegex(target.title));
  if (target.id) parts.push(escapeRegex(target.id));
  if (parts.length === 0) return /(?!)/;
  return new RegExp(
    `\\[\\[\\s*(${parts.join("|")})\\s*(?:\\|[^\\]]*)?\\s*\\]\\]`,
    "i",
  );
}

/**
 * Cheaper "does this body have any keyword match?" — used inside
 * the scanner's skip branches where we only need a boolean to
 * decide whether to add the note to the skipped list. Avoids
 * allocating match records when the note is going to be filtered
 * out anyway.
 */
function bodyHasKeyword(body, keyword, caseSensitive) {
  if (!body) return false;
  const re = buildKeywordRegex(keyword, caseSensitive);
  if (!re) return false;
  re.lastIndex = 0;
  return re.test(scrubExcluded(body));
}
