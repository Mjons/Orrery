// CONNECT_QUERY.md v1 — parse a verb-prefixed sentence in the search
// strip into a structured plan, then resolve term lists against the
// MiniSearch index to produce a candidate set.
//
// Pure module. No DOM, no writes. The UI calls parse() to detect plan
// mode, then resolve() with a search function to materialise the set.
// Apply lives in main.js where the saver and graph rebuild hooks are.

const VERB_RE = /^\s*(connect|link|weave)\b/i;

// Filler words and prepositions to strip after the verb. Order
// matters — multi-word phrases first so they collapse before a
// surviving fragment is mistaken for a term.
const FILLER_PHRASES = [
  /\bevery\s+note\s+(that|which)\s+(mentions?|references?|talks?\s+about)\b/gi,
  /\ball\s+notes?\s+(that|which)\s+(mentions?|references?|talks?\s+about)\b/gi,
  /\bnotes?\s+(that|which)\s+(mentions?|references?|talks?\s+about)\b/gi,
  /\bnotes?\s+(mentioning|referencing)\b/gi,
  /\bnotes?\s+about\b/gi,
  /\bevery\s+note\b/gi,
  /\ball\s+notes?\b/gi,
  /\bnotes?\b/gi,
  /\b(mentions?|references?|mentioning|referencing)\b/gi,
  /\b(that|which|with)\b/gi,
  /\babout\b/gi,
];

const TRAILING_TO_EACH_OTHER =
  /\s+(?:and\s+)?(?:link\s+)?(?:them\s+)?(?:to\s+each\s+other|together|pairwise|in\s+a\s+clique)\s*$/i;

/**
 * @typedef {object} ConnectPlan
 * @property {"connect"|"link"|"weave"} verb
 * @property {string[]} terms                   normalized phrase list
 * @property {"all"|"any"} match                set policy
 * @property {"clique"} topology                v1 supports clique only
 * @property {string} raw                       original input
 * @property {string|null} reject               human-readable reason if not actionable
 */

/**
 * Try to parse the raw search input as a connect-query plan.
 * Returns `{ kind: "search" }` for ordinary searches (no verb), or
 * `{ kind: "plan", plan: ConnectPlan }` when a verb is detected.
 *
 * The parser is permissive — it never throws. If the verb is present
 * but the rest is unparseable, it returns a plan with `reject` set so
 * the UI can show a hint instead of silently falling back to search.
 *
 * @param {string} input
 * @returns {{kind:"search"} | {kind:"plan", plan: ConnectPlan}}
 */
export function parse(input) {
  const raw = String(input || "");
  const m = raw.match(VERB_RE);
  if (!m) return { kind: "search" };
  const verb = m[1].toLowerCase();

  let rest = raw.slice(m[0].length).trim();
  // Drop the explicit "to each other" marker — clique is already the
  // only v1 topology, so it's only a parser hint, not a behaviour
  // switch. Removing it before splitting keeps the term list clean.
  rest = rest.replace(TRAILING_TO_EACH_OTHER, "").trim();
  // Strip filler phrases. Quoted phrases are preserved because the
  // filler patterns only match unquoted words.
  rest = stripFiller(rest);

  const terms = splitTerms(rest);
  const cleanTerms = terms.map((t) => t.trim()).filter((t) => t.length >= 3);

  /** @type {ConnectPlan} */
  const plan = {
    verb,
    terms: cleanTerms,
    match: "all",
    topology: "clique",
    raw,
    reject: null,
  };

  if (cleanTerms.length === 0) {
    plan.reject = "type one or more terms after the verb";
  } else if (cleanTerms.length === 1) {
    // Single term is fine — the user's connecting every note that
    // mentions one phrase. Set is whatever matches that one term.
    // (Not a rejection.)
  }

  return { kind: "plan", plan };
}

// Splits on commas and the conjunctions "and" / "&" while preserving
// double-quoted phrases as single terms. Whitespace inside a quoted
// phrase is collapsed to single spaces (the matcher handles soft-
// wrap matching itself, but the term list stays readable).
function splitTerms(rest) {
  const out = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && (c === "," || c === "&")) {
      out.push(buf);
      buf = "";
      continue;
    }
    if (
      !inQuote &&
      c === " " &&
      rest.slice(i, i + 5).toLowerCase() === " and "
    ) {
      out.push(buf);
      buf = "";
      i += 4; // skip past " and"
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function stripFiller(s) {
  let out = s;
  for (const re of FILLER_PHRASES) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Resolve a plan to a candidate Set of note ids.
 *
 * @param {ConnectPlan} plan
 * @param {object} ctx
 * @param {(term: string) => Array<{id:string}>} ctx.search
 *   per-term lookup — typically a thin wrapper around MiniSearch
 *   that returns ids for substring/prefix/fuzzy hits. The matcher
 *   trusts whatever the search function returns; selection policy
 *   ("all" vs "any") is applied here.
 * @param {(id:string) => any} [ctx.resolve]
 *   optional lookup so we can return notes (not just ids) and skip
 *   phantoms. If omitted, resolution returns ids only.
 * @returns {{ids: string[], notes?: Array<any>, perTerm: Record<string, number>}}
 */
export function resolve(plan, ctx) {
  const { search, resolve: resolveNote } = ctx || {};
  const perTerm = Object.create(null);
  if (!plan || plan.reject || !plan.terms.length) {
    return { ids: [], perTerm };
  }

  // Collect a Set per term.
  const sets = [];
  for (const term of plan.terms) {
    const hits = search ? search(term) : [];
    const ids = new Set();
    for (const h of hits) {
      if (h && h.id) ids.add(h.id);
    }
    perTerm[term] = ids.size;
    sets.push(ids);
  }

  // Apply set policy.
  let working;
  if (plan.match === "all") {
    if (sets.length === 0) working = new Set();
    else {
      // Intersect — start from the smallest set for cheap pruning.
      sets.sort((a, b) => a.size - b.size);
      working = new Set(sets[0]);
      for (let i = 1; i < sets.length; i++) {
        const next = sets[i];
        for (const id of working) {
          if (!next.has(id)) working.delete(id);
        }
      }
    }
  } else {
    // "any" — union
    working = new Set();
    for (const s of sets) for (const id of s) working.add(id);
  }

  const ids = [...working];
  if (!resolveNote) return { ids, perTerm };

  const notes = [];
  for (const id of ids) {
    const n = resolveNote(id);
    if (!n) continue;
    if (n._isPhantom) continue;
    notes.push(n);
  }
  // Stable order: by title, falls back to id.
  notes.sort((a, b) => {
    const ta = (a.title || "").toLowerCase();
    const tb = (b.title || "").toLowerCase();
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.id || "").localeCompare(b.id || "");
  });
  return { ids: notes.map((n) => n.id), notes, perTerm };
}

// Edge-count for a clique topology — used by the preview pane to
// show "12 notes → 132 wikilinks". Each unordered pair contributes
// one wikilink (a → b only; b → a is the next pass when b is the
// source).
//
// Wait — clarification: in the doc the clique writes both directions
// so each ordered pair contributes one body edit. So 12 notes →
// 12 × 11 = 132 edits. That matches the formula below.
export function cliqueEdgeCount(n) {
  if (n < 2) return 0;
  return n * (n - 1);
}

// v1 hard cap. Above this, the apply step refuses with a hint so the
// user can re-scope or pick a different gesture.
export const CLIQUE_CAP = 12;
