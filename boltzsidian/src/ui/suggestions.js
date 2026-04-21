// Heuristic tag + link suggestions for a note being written. Pure —
// no DOM, no events. Called by the note panel on save pauses and
// returns { tags, links } arrays of candidates to render in the
// suggestions row. See SUGGESTIONS.md §6.
//
// Zero LLM. Everything here runs off the vault's existing indexes:
//   - vault.tagCounts       (Map<tag, count>)
//   - vault.byTitle         (Map<lowercased-title, note>)
//   - vault.byId            (Map<id, note>)
//   - vault.forward.get(id) (Set<id> for already-linked targets)
//
// Dismissed candidates live in a Set<string> the caller owns and passes
// in. Dismissal is per-note, per-session — users change their minds.

const MAX_TAGS = 6;
const MAX_LINKS = 6;
const MIN_BODY_WORDS = 20; // don't spam tiny notes
const MIN_TITLE_LENGTH = 3; // don't suggest one-letter titles

// Tokens inside these patterns don't count as title mentions — code
// blocks / inline code / URLs will match note titles spuriously.
const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]*`/g;
const URL = /https?:\/\/\S+/g;

export function computeSuggestions({
  vault,
  note,
  body = "",
  currentTags = [],
  currentLinks = [],
  dismissed = new Set(),
}) {
  if (!vault) return { tags: [], links: [] };
  const words = countWords(body);
  if (words < MIN_BODY_WORDS) return { tags: [], links: [] };

  const have = new Set((currentTags || []).map((t) => t.toLowerCase()));
  const linked = new Set(currentLinks || []);

  return {
    tags: suggestTags({ vault, have, note, dismissed }),
    links: suggestLinks({ vault, body, linked, note, dismissed }),
  };
}

// ── Tags ─────────────────────────────────────────────────────

function suggestTags({ vault, have, note, dismissed }) {
  const tagCounts = vault.tagCounts || new Map();
  if (tagCounts.size === 0) return [];

  // Signal 1: co-occurrence. Tags that co-appear with the note's
  // existing tags in other notes. Build a weighted map.
  const cooccurrence = new Map();
  if (have.size > 0) {
    for (const other of vault.notes) {
      if (other === note) continue;
      const otherTags = other.tags || [];
      const sharesAny = otherTags.some((t) => have.has(t.toLowerCase()));
      if (!sharesAny) continue;
      for (const t of otherTags) {
        const lower = t.toLowerCase();
        if (have.has(lower)) continue;
        cooccurrence.set(lower, (cooccurrence.get(lower) || 0) + 1);
      }
    }
  }

  // Signal 2: folder kinship. If the note's folder has consensus tags,
  // surface them.
  const folderTags = new Map();
  if (note?.path) {
    const folder = topLevelFolder(note.path);
    if (folder) {
      for (const other of vault.notes) {
        if (other === note) continue;
        if (topLevelFolder(other.path) !== folder) continue;
        for (const t of other.tags || []) {
          const lower = t.toLowerCase();
          if (have.has(lower)) continue;
          folderTags.set(lower, (folderTags.get(lower) || 0) + 1);
        }
      }
    }
  }

  // Score each candidate: strong co-occurrence + folder + global frequency.
  const seen = new Set();
  const scored = [];
  for (const [tag] of tagCounts) {
    const lower = tag.toLowerCase();
    if (have.has(lower)) continue;
    if (dismissed.has(`tag:${lower}`)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    const cooc = cooccurrence.get(lower) || 0;
    const fold = folderTags.get(lower) || 0;
    const global = tagCounts.get(tag) || 0;
    // Co-occurrence matters most, folder next, global freq as a tiebreak.
    const score = cooc * 3 + fold * 2 + Math.log(1 + global);
    if (score <= 0.1) continue;
    scored.push({ tag, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_TAGS).map((s) => s.tag);
}

// ── Links ────────────────────────────────────────────────────

function suggestLinks({ vault, body, linked, note, dismissed }) {
  const byTitle = vault.byTitle;
  if (!byTitle || byTitle.size === 0) return [];

  const clean = stripBody(body);
  const out = [];
  const seen = new Set();

  // Single pass — for each existing note title, check whether its text
  // appears in the body, not already linked, not the note itself.
  for (const [lowered, other] of byTitle) {
    if (!lowered || lowered.length < MIN_TITLE_LENGTH) continue;
    if (other === note) continue;
    if (linked.has(other.id)) continue;
    if (seen.has(other.id)) continue;
    if (dismissed.has(`link:${other.id}`)) continue;
    // Already wikilinked in the body? Skip.
    if (alreadyWikilinkedTo(body, other)) continue;
    // Word-boundary case-insensitive match.
    const escaped = escapeRegExp(lowered);
    const re = new RegExp(`(^|[^\\w])${escaped}([^\\w]|$)`, "i");
    if (!re.test(clean)) continue;
    seen.add(other.id);
    out.push({
      id: other.id,
      title: other.title,
    });
    if (out.length >= MAX_LINKS * 2) break; // over-pull, we'll trim
  }

  // If we have more than MAX_LINKS, prefer longer titles (more specific
  // matches are less likely to be spurious).
  out.sort((a, b) => b.title.length - a.title.length);
  return out.slice(0, MAX_LINKS);
}

// ── Helpers ──────────────────────────────────────────────────

function stripBody(body) {
  return String(body || "")
    .replace(CODE_FENCE, " ")
    .replace(INLINE_CODE, " ")
    .replace(URL, " ");
}

function countWords(body) {
  const s = stripBody(body).trim();
  if (!s) return 0;
  return s.split(/\s+/).length;
}

function alreadyWikilinkedTo(body, other) {
  // Matches [[Title]] or [[Title|alias]] or [[id]].
  const escTitle = escapeRegExp(other.title);
  const reTitle = new RegExp(`\\[\\[\\s*${escTitle}(\\s*\\||\\s*\\]\\])`, "i");
  if (reTitle.test(body)) return true;
  if (other.id) {
    const reId = new RegExp(
      `\\[\\[\\s*${escapeRegExp(other.id)}\\s*\\]\\]`,
      "i",
    );
    if (reId.test(body)) return true;
  }
  return false;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topLevelFolder(path) {
  if (!path) return null;
  const parts = path.split("/");
  return parts.length > 1 ? parts[0] : null;
}
