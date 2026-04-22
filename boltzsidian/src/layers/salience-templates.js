// Seed-text templates for child ideas.
//
// A child idea is a candidate note that *bridges* two existing notes. Its
// seed text has to point at the bridge in plain, grounded language —
// never claim relationship that isn't there, never invent facts. Same
// discipline as the Phase 4 observer chorus, just with two parents
// instead of one subject.
//
// Slots — every one pulls directly from note data:
//   {a_title}        parent A's title
//   {b_title}        parent B's title
//   {shared_tag}     a #tag both parents carry (if any)
//   {shared_folder}  top-level folder both parents live in (if any)
//   {a_folder}       parent A's top-level folder
//   {b_folder}       parent B's top-level folder
//   {age_gap}        rounded human phrase for |mtime(a) − mtime(b)|
//
// Templates declare `requires`. Any template whose required slots aren't
// satisfied is filtered out before picking. If NO template fits, we fall
// back to the raw `{a_title} ↔ {b_title}` pairing — honest, minimal,
// ungrounded in any claim beyond "these two came up together."

export const TEMPLATES = [
  // ── Shared-tag templates ──────────────────────────────────
  {
    text: "{a_title} and {b_title} are both {shared_tag}.",
    requires: ["a_title", "b_title", "shared_tag"],
  },
  {
    text: "Two {shared_tag} notes drifted together: {a_title}, {b_title}.",
    requires: ["a_title", "b_title", "shared_tag"],
  },
  {
    text: "{a_title} · {b_title} — {shared_tag} on both sides.",
    requires: ["a_title", "b_title", "shared_tag"],
  },

  // ── Shared-folder templates ───────────────────────────────
  {
    text: "{a_title} and {b_title} both live in {shared_folder}.",
    requires: ["a_title", "b_title", "shared_folder"],
  },
  {
    text: "A pair from {shared_folder}: {a_title} next to {b_title}.",
    requires: ["a_title", "b_title", "shared_folder"],
  },

  // ── Cross-folder (genuinely bridging) templates ───────────
  {
    text: "{a_title} ({a_folder}) sits close to {b_title} ({b_folder}).",
    requires: ["a_title", "b_title", "a_folder", "b_folder"],
  },
  {
    text: "A thread from {a_folder} reaching {b_folder}: {a_title} and {b_title}.",
    requires: ["a_title", "b_title", "a_folder", "b_folder"],
  },

  // ── Age-gap templates ─────────────────────────────────────
  {
    text: "{a_title}, then {age_gap} later, {b_title}.",
    requires: ["a_title", "b_title", "age_gap"],
  },
  {
    text: "{age_gap} between these two — {a_title} and {b_title}.",
    requires: ["a_title", "b_title", "age_gap"],
  },

  // ── Plain pair templates (always eligible) ────────────────
  {
    text: "{a_title} and {b_title} keep coming up together.",
    requires: ["a_title", "b_title"],
  },
  {
    text: "{a_title} is near {b_title}.",
    requires: ["a_title", "b_title"],
  },
  {
    text: "An orbit between {a_title} and {b_title}.",
    requires: ["a_title", "b_title"],
  },
  {
    text: "{a_title} ↔ {b_title}.",
    requires: ["a_title", "b_title"],
  },
  {
    text: "Something in {a_title} is close to something in {b_title}.",
    requires: ["a_title", "b_title"],
  },

  // ── Tag + folder combined ─────────────────────────────────
  {
    text: "{shared_tag} in {shared_folder}: {a_title}, {b_title}.",
    requires: ["a_title", "b_title", "shared_tag", "shared_folder"],
  },

  // ── Rare combos — tag + age ───────────────────────────────
  {
    text: "{a_title} and {b_title} — both {shared_tag}, {age_gap} apart.",
    requires: ["a_title", "b_title", "shared_tag", "age_gap"],
  },
];

// Filter to templates whose required slots are all satisfied.
export function eligibleTemplates(snap, pool = TEMPLATES) {
  return pool.filter((t) =>
    t.requires.every((k) => snap[k] != null && snap[k] !== ""),
  );
}

// Apply the chosen template against the snapshot. Fall back to raw
// "a ↔ b" if for some reason no eligible template was picked.
export function renderTemplate(tmpl, snap) {
  if (!tmpl) return `${snap.a_title ?? ""} ↔ ${snap.b_title ?? ""}`;
  return tmpl.text.replace(/\{(\w+)\}/g, (_, k) => {
    const v = snap[k];
    if (v == null || v === "") return "";
    return String(v);
  });
}

// Build a snapshot of grounded slot values from two parent notes.
// `topLevelFolder` is passed in to avoid a circular import.
//
// The `pairSeed` + `dayKey` pair drives a deterministic "warped
// attribute" per side per day — see DREAM_ENGINE.md §1. Each parent
// gets ONE of its own real slots picked (a tag it actually has, its
// folder, or its age class) and labelled as the attribute going loud
// tonight. Same (pair, day) ⇒ same warp; next day re-rolls.
export function buildPairSnap(a, b, { topLevelFolder, pairSeed, dayKey } = {}) {
  const sharedTag = firstShared(a.tags, b.tags);
  const aFolder = topLevelFolder(a) || null;
  const bFolder = topLevelFolder(b) || null;
  const sharedFolder = aFolder && aFolder === bFolder ? aFolder : null;
  const ageGap = ageGapLabel(a.mtime, b.mtime);

  const daySeed = dayKey ? hashStr(dayKey) : 0;
  const pairSeedV = pairSeed | 0 || 0;
  // XOR per-side salt so A and B roll independently within the same
  // (pair, day) seed; otherwise their warps correlate in weird ways.
  const aWarped = pickWarped(
    a,
    (pairSeedV ^ daySeed ^ 0xaaaaaaaa) >>> 0,
    aFolder,
  );
  const bWarped = pickWarped(
    b,
    (pairSeedV ^ daySeed ^ 0x55555555) >>> 0,
    bFolder,
  );

  return {
    a_title: a.title,
    b_title: b.title,
    a_warped: aWarped,
    b_warped: bWarped,
    a_excerpt: excerptFor(a),
    b_excerpt: excerptFor(b),
    shared_tag: sharedTag,
    shared_folder: sharedFolder,
    a_folder: aFolder,
    b_folder: bFolder,
    age_gap: ageGap,
  };
}

// Pull the first ~200 words of a note's body, stripped of code fences
// and frontmatter. This is the CONTENT the idea-seed model reasons
// over — previously we only fed titles/metadata and the model had to
// guess what each note actually said. With excerpts in play it can
// cite specific phrases and the claim+evidence structure becomes
// meaningfully grounded. DREAM_ENGINE Phase A.
const EXCERPT_MAX_WORDS = 200;
function excerptFor(note) {
  const body = note?.body || "";
  if (!body) return "";
  // Strip triple-backtick code blocks — they're rarely signal-rich
  // and they blow token budgets fast.
  let text = body.replace(/```[\s\S]*?```/g, "");
  // Collapse whitespace so word-count is meaningful.
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const words = text.split(/\s+/);
  if (words.length <= EXCERPT_MAX_WORDS) return text;
  return words.slice(0, EXCERPT_MAX_WORDS).join(" ") + "…";
}

// Enumerate the slots of a note that are legal warp candidates. Warp
// never invents content — only ever re-highlights something that's
// already true about the note. Currently: each real tag, the top-level
// folder, and a coarse age-class label. Extend here when new per-note
// slots become available.
function describeWarpCandidates(note, folder) {
  const out = [];
  if (Array.isArray(note.tags)) {
    for (const t of note.tags) if (t) out.push(`tag → #${t}`);
  }
  if (folder) out.push(`folder → ${folder}`);
  if (note.mtime) {
    const days = (Date.now() - note.mtime) / (1000 * 60 * 60 * 24);
    let label;
    if (days < 1) label = "fresh";
    else if (days < 3) label = "a couple of days stale";
    else if (days < 8) label = "about a week stale";
    else if (days < 21) label = "weeks stale";
    else if (days < 60) label = "a month or two stale";
    else label = "months stale";
    out.push(`age → ${label}`);
  }
  return out;
}

function pickWarped(note, seed, folder) {
  const candidates = describeWarpCandidates(note, folder);
  if (candidates.length === 0) return null;
  const rng = mulberry32(seed | 0);
  return candidates[Math.floor(rng() * candidates.length)];
}

// Cheap FNV-1a for turning a day-key string into a stable seed.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function firstShared(listA, listB) {
  if (!listA?.length || !listB?.length) return null;
  const set = new Set(listA.map((t) => t.toLowerCase()));
  for (const t of listB) if (set.has(t.toLowerCase())) return `#${t}`;
  return null;
}

// Rough human-scale phrase for a time gap. Never precise — a dream
// report doesn't need "4.3 hours."
function ageGapLabel(mtimeA, mtimeB) {
  if (!mtimeA || !mtimeB) return null;
  const delta = Math.abs(mtimeA - mtimeB);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (delta < hour * 2) return "within an hour";
  if (delta < day) return "the same day";
  if (delta < day * 3) return "a day or two";
  if (delta < day * 10) return "about a week";
  if (delta < day * 30) return "a few weeks";
  if (delta < day * 100) return "a couple of months";
  if (delta < day * 365) return "a few months";
  return "over a year";
}

// Pick a template deterministically from a seeded RNG so the same child
// reproduces the same seed text on repeat runs. `seed` is typically a
// hash of the two parent ids.
export function pickTemplate(snap, seed, pool = TEMPLATES) {
  const eligible = eligibleTemplates(snap, pool);
  if (eligible.length === 0) return null;
  const rng = mulberry32(seed | 0);
  return eligible[Math.floor(rng() * eligible.length)];
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
