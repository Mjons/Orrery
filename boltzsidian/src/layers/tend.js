// Tend scanner — finds the *obvious* structural work in a vault.
//
// Five passes, any subset runnable. Each pass is a pure function over the
// current vault state; each returns a flat list of proposals that the
// tend drawer surfaces for the user to accept or reject. Nothing writes
// here — application happens in tend-apply.js, gated on user action.
//
// The discipline for every pass: **produce suggestions a human would make
// after 30 seconds of scanning.** Nothing clever, nothing insight-flavoured
// (that's what the salience layer is for). Tend is the janitor.
//
// See STATES.md §2 for the full design. BUILD_PLAN §Phase 6.5 for the
// acceptance bar (~3–10 suggestions per 50 notes).

import { topLevelFolder } from "../vault/folders.js";

// Pass identifiers. Used as proposal-id prefixes and as the enabled-pass
// keys in the settings/API.
export const PASSES = {
  TAG_INFER: "tag-infer",
  OBVIOUS_LINK: "obvious-link",
  TITLE_COLLISION: "title-collision",
  FM_NORMALISE: "fm-normalise",
  STUB: "stub",
};

export const ALL_PASSES = Object.values(PASSES);

// Tune-ables at the top so it's easy to find what moved when we later
// adjust based on real-vault runs.
const TAG_INFER_MIN_COHORT = 3; // existing vocabulary = used by ≥ N notes
const TAG_INFER_MIN_HITS_BODY = 2;
const TAG_INFER_MAX_PER_NOTE = 3;
const TITLE_COLLISION_MIN_LEN = 3;
const STUB_MAX_WORDS = 30;
const STUB_GENERIC_TITLES = new Set([
  "untitled",
  "note",
  "notes",
  "idea",
  "ideas",
  "meeting",
  "meeting notes",
  "draft",
  "todo",
  "new note",
  "temp",
]);

// Words that would trigger too many false positives if used as tag
// evidence. Keep this conservative.
const TAG_STOPWORDS = new Set([
  "note",
  "notes",
  "idea",
  "ideas",
  "day",
  "today",
  "time",
  "project",
  "work",
  "thing",
  "stuff",
  "kind",
  "type",
]);

// Top-level entry point. Returns an object with proposals grouped by pass
// plus a flat list. Caller decides what to do with them.
export function runTendPasses(vault, { enabled = ALL_PASSES } = {}) {
  const on = new Set(enabled);
  const proposals = [];
  if (on.has(PASSES.TAG_INFER)) proposals.push(...inferTags(vault));
  if (on.has(PASSES.OBVIOUS_LINK)) proposals.push(...detectObviousLinks(vault));
  if (on.has(PASSES.TITLE_COLLISION))
    proposals.push(...detectTitleCollisions(vault));
  if (on.has(PASSES.FM_NORMALISE))
    proposals.push(...normaliseFrontmatter(vault));
  if (on.has(PASSES.STUB)) proposals.push(...detectStubs(vault));

  // Apply the tended-on filter: if a note's frontmatter says we already
  // proposed this specific pass on it and the user acted, skip.
  const filtered = proposals.filter((p) => !alreadyTended(vault, p));

  // Sort by confidence within each pass so high-signal proposals float
  // to the top of their group.
  filtered.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return {
    proposals: filtered,
    byPass: groupByPass(filtered),
    totalScanned: vault.notes.length,
  };
}

// ── Pass 1: Tag inference ────────────────────────────────
// For each note with no tags (or fewer than 1 tag), find existing tags
// whose name literally appears as a word in the body. Requires the tag
// to be well-established (≥ TAG_INFER_MIN_COHORT uses in the vault) so
// a one-off tag doesn't contaminate everything.
export function inferTags(vault) {
  const proposals = [];
  const tagCounts = vault.tagCounts || new Map();
  const eligibleTags = [...tagCounts.entries()]
    .filter(([tag, count]) => count >= TAG_INFER_MIN_COHORT)
    .filter(([tag]) => !TAG_STOPWORDS.has(tag.toLowerCase()))
    .map(([tag]) => tag);
  if (eligibleTags.length === 0) return proposals;

  // Precompile one regex per eligible tag for body scanning. Word-boundary
  // + case-insensitive so "person" matches "Person." and "persons".
  const tagRegexes = eligibleTags.map((tag) => ({
    tag,
    re: new RegExp(`\\b${escapeRegex(tag)}s?\\b`, "gi"),
  }));

  for (const note of vault.notes) {
    if (note.tags && note.tags.length >= 1) continue;
    const body = stripCode(note.body || "");
    const title = note.title || "";
    const candidates = [];
    for (const { tag, re } of tagRegexes) {
      const bodyHits = (body.match(re) || []).length;
      const titleHit = new RegExp(`\\b${escapeRegex(tag)}s?\\b`, "i").test(
        title,
      );
      if (bodyHits >= TAG_INFER_MIN_HITS_BODY || titleHit) {
        candidates.push({
          tag,
          score: bodyHits + (titleHit ? 3 : 0),
        });
      }
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, TAG_INFER_MAX_PER_NOTE).map((c) => c.tag);
    proposals.push({
      id: `${PASSES.TAG_INFER}:${note.id}:${top.join(",")}`,
      pass: PASSES.TAG_INFER,
      noteId: note.id,
      noteTitle: note.title,
      notePath: note.path,
      tags: top,
      reason: buildTagReason(top, note, tagCounts),
      confidence: Math.min(1, top.length * 0.3 + 0.4),
    });
  }
  return proposals;
}

// ── Pass 2: Obvious link detection ───────────────────────
// Title of A literally appears in body of B (and vice versa), AND they're
// not already linked either direction. High-quality signal — someone
// wrote the other note's name in this note's body and forgot to bracket
// it. This skips mentions that ALREADY appear inside `[[…]]`.
export function detectObviousLinks(vault) {
  const proposals = [];
  // Phase 2: byTitle is Map<title, Note[]>. Iterate every candidate
  // in every bucket — collisions across roots produce multiple
  // candidates for the same lowercased title and we want to consider
  // each. `mentioned` dedup is now keyed by target.id so a source
  // note can only generate one proposal per unique target, even if
  // two notes share a title.
  const byTitle = vault.byTitle || new Map();
  for (const source of vault.notes) {
    if (!source.body) continue;
    const strippedBody = stripCodeAndWikilinks(source.body);
    const mentioned = new Set();
    for (const bucket of byTitle.values()) {
      for (const target of bucket) {
        if (target.id === source.id) continue;
        const t = target.title || "";
        if (t.length < 3) continue;
        // Require title length ≥ 3 so common short words don't trigger.
        const re = new RegExp(`\\b${escapeRegex(t)}\\b`, "i");
        if (!re.test(strippedBody)) continue;
        // Already linked? Skip.
        const outgoing = vault.forward.get(source.id);
        if (outgoing?.has(target.id)) continue;
        if (mentioned.has(target.id)) continue;
        mentioned.add(target.id);
        proposals.push({
          id: `${PASSES.OBVIOUS_LINK}:${source.id}:${target.id}`,
          pass: PASSES.OBVIOUS_LINK,
          noteId: source.id,
          noteTitle: source.title,
          notePath: source.path,
          linkTargetId: target.id,
          linkTargetTitle: target.title,
          reason: `"${source.title}" mentions "${target.title}" in its body but doesn't link to it.`,
          confidence: 0.85,
        });
      }
    }
  }
  return proposals;
}

// ── Pass 3: Title collision ──────────────────────────────
// Two notes whose normalised titles match exactly. Flagged, never merged.
// A duplicate-detection pass is intentionally STRICT here (exact match
// after case/punctuation normalisation) because fuzzy matching produces
// too many false positives on short titles. If the user wants near-match
// detection they can rerun this pass with a fuzzy threshold later.
export function detectTitleCollisions(vault) {
  const proposals = [];
  const byKey = new Map();
  for (const note of vault.notes) {
    const t = note.title || "";
    if (t.length < TITLE_COLLISION_MIN_LEN) continue;
    const key = normaliseTitle(t);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(note);
  }
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    // Produce one proposal per pair — older-mtime note becomes the
    // "canonical" default, newer one is the "duplicate" candidate.
    group.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    const canonical = group[0];
    for (let i = 1; i < group.length; i++) {
      const dupe = group[i];
      proposals.push({
        id: `${PASSES.TITLE_COLLISION}:${canonical.id}:${dupe.id}`,
        pass: PASSES.TITLE_COLLISION,
        noteId: dupe.id,
        noteTitle: dupe.title,
        notePath: dupe.path,
        duplicateOf: canonical.id,
        duplicateOfTitle: canonical.title,
        duplicateOfPath: canonical.path,
        reason: `"${dupe.title}" (${dupe.path}) shares a title with "${canonical.title}" (${canonical.path}).`,
        confidence: 0.95,
      });
    }
  }
  return proposals;
}

// ── Pass 4: Frontmatter normalisation ────────────────────
// Notes missing `id` or `created`, or whose `id` conflicts with another
// note's. The saver canonicalises these on first edit, so this pass
// mostly matters for freshly imported folders that haven't been touched.
export function normaliseFrontmatter(vault) {
  const proposals = [];
  const byId = new Map();
  for (const note of vault.notes) {
    const idInFm = note.frontmatter?.id;
    if (idInFm) {
      if (!byId.has(idInFm)) byId.set(idInFm, []);
      byId.get(idInFm).push(note);
    }
  }
  for (const note of vault.notes) {
    const missing = [];
    // note.frontmatter is what's currently in the text. If the parser
    // had to synthesise an id (because the file had none), the note has
    // an `id` property but no frontmatter.id.
    if (!note.frontmatter?.id) missing.push("id");
    if (!note.frontmatter?.created) missing.push("created");
    if (missing.length === 0) continue;
    proposals.push({
      id: `${PASSES.FM_NORMALISE}:${note.id}:${missing.join(",")}`,
      pass: PASSES.FM_NORMALISE,
      noteId: note.id,
      noteTitle: note.title,
      notePath: note.path,
      missingFields: missing,
      reason: `"${note.title}" is missing ${missing.join(", ")} in its frontmatter. The app needs these to maintain stable links across renames.`,
      confidence: 0.7,
    });
  }
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    // Conflicting ids: all but the earliest need a new id.
    group.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
    for (let i = 1; i < group.length; i++) {
      const n = group[i];
      proposals.push({
        id: `${PASSES.FM_NORMALISE}:${n.id}:id-conflict`,
        pass: PASSES.FM_NORMALISE,
        noteId: n.id,
        noteTitle: n.title,
        notePath: n.path,
        missingFields: ["id"],
        idConflict: true,
        reason: `"${n.title}" shares its frontmatter id with "${group[0].title}". One of them needs a new id.`,
        confidence: 0.9,
      });
    }
  }
  return proposals;
}

// ── Pass 5: Stub detection ───────────────────────────────
// body < 30 words AND generic title. Low-action: the drawer surfaces
// these so the user can decide to flesh out or discard. Tend itself
// does not delete.
export function detectStubs(vault) {
  const proposals = [];
  for (const note of vault.notes) {
    const words = note.words ?? wordCount(note.body || "");
    if (words >= STUB_MAX_WORDS) continue;
    const titleLow = (note.title || "").toLowerCase().trim();
    const generic =
      STUB_GENERIC_TITLES.has(titleLow) ||
      // Single generic-sounding word title
      (/^(\w+)$/.test(titleLow) && titleLow.length < 6);
    if (!generic) continue;
    proposals.push({
      id: `${PASSES.STUB}:${note.id}`,
      pass: PASSES.STUB,
      noteId: note.id,
      noteTitle: note.title,
      notePath: note.path,
      bodyWords: words,
      reason: `"${note.title}" is ${words} word${words === 1 ? "" : "s"} under a generic title. Flesh out, retitle, or delete — the universe can't do much with it.`,
      confidence: 0.6,
    });
  }
  return proposals;
}

// ── Helpers ──────────────────────────────────────────────
function groupByPass(proposals) {
  const out = new Map();
  for (const p of proposals) {
    if (!out.has(p.pass)) out.set(p.pass, []);
    out.get(p.pass).push(p);
  }
  return out;
}

function alreadyTended(vault, proposal) {
  const note = vault.byId.get(proposal.noteId);
  if (!note) return true; // can't propose on a deleted note
  const stamp = note.frontmatter?.tended_on;
  if (!stamp) return false;
  const key = keyForProposal(proposal);
  const rejectedKey = `rejected:${key}`;
  // TEND_STAMP_MISMATCH.md — tend-apply writes tended_on as an
  // ARRAY of "<pass>:<target?>" strings. The original dict-shape
  // check always returned undefined on an array + string index,
  // which meant every accepted proposal was considered fresh and
  // re-proposed on every scan. Handle both shapes: current writes
  // are arrays; any legacy dict-shape frontmatter still resolves.
  if (Array.isArray(stamp)) {
    return stamp.includes(key) || stamp.includes(rejectedKey);
  }
  if (typeof stamp === "object") {
    return !!stamp[key] || !!stamp[rejectedKey];
  }
  return false;
}

export function keyForProposal(proposal) {
  switch (proposal.pass) {
    case PASSES.OBVIOUS_LINK:
      return `${proposal.pass}:${proposal.linkTargetId}`;
    case PASSES.TITLE_COLLISION:
      return `${proposal.pass}:${proposal.duplicateOf}`;
    default:
      return proposal.pass;
  }
}

function buildTagReason(tags, note, tagCounts) {
  const parts = tags.map((t) => `#${t} (used on ${tagCounts.get(t)} notes)`);
  const joined = parts.join(", ");
  return `"${note.title}" has no tags. Its body uses ${joined} — worth adopting one of the vault's existing tags.`;
}

function normaliseTitle(t) {
  return (t || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(body) {
  const t = body.trim();
  return t ? t.split(/\s+/).length : 0;
}

function stripCode(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "");
}

function stripCodeAndWikilinks(text) {
  return stripCode(text).replace(/\[\[[^\]\n]*?\]\]/g, "");
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
