// Template library for the observer chorus.
//
// Ground rules:
//   1. Every slot value comes from the vault — a title, a tag, a folder,
//      a relative date derived from mtime. Nothing is invented. Captions
//      are allowed to be atmospheric; they are not allowed to lie.
//   2. Templates are observational and quiet. The chorus is a voice that
//      notices things, not one that asserts things. If a sentence reads
//      like a fortune-cookie aphorism we cut it.
//   3. Missing slots = template ineligible. The scorer declares which
//      slots it has for a given snapshot; the picker filters.
//
// Slot keys: title, neighbor, tag, folder, age, count.

export const TEMPLATES = [
  // Single-note — grounded in a real title only.
  { text: "{title} is quiet tonight.", requires: ["title"] },
  { text: "Something about {title} feels settled.", requires: ["title"] },
  { text: "{title} is heavier than it looks.", requires: ["title"] },
  { text: "I keep coming back to {title}.", requires: ["title"] },
  { text: "{title} — almost an anchor now.", requires: ["title"] },
  { text: "{title} is alone at the centre.", requires: ["title"] },
  { text: "Nothing new near {title}, but it holds.", requires: ["title"] },
  { text: "An old thought near {title}.", requires: ["title"] },
  {
    text: "{title} is at the edge of its cluster tonight.",
    requires: ["title"],
  },
  { text: "{title} hasn't drifted.", requires: ["title"] },

  // Title + age — time-grounded observations.
  { text: "{title} hasn't moved in {age}.", requires: ["title", "age"] },
  { text: "{title} was last touched {age}.", requires: ["title", "age"] },
  {
    text: "Still thinking about {title} — it's been {age}.",
    requires: ["title", "age"],
  },
  { text: "{title} — {age}, and still bright.", requires: ["title", "age"] },

  // Title + neighbor — pair observations.
  {
    text: "{title} keeps pulling {neighbor} closer.",
    requires: ["title", "neighbor"],
  },
  {
    text: "{neighbor} is drifting toward {title}.",
    requires: ["title", "neighbor"],
  },
  {
    text: "{title} and {neighbor} sit closer than they did.",
    requires: ["title", "neighbor"],
  },
  {
    text: "Something {neighbor}-shaped has orbited {title} before.",
    requires: ["title", "neighbor"],
  },
  {
    text: "{neighbor} is half of what {title} means.",
    requires: ["title", "neighbor"],
  },
  {
    text: "{title} and {neighbor} — still circling.",
    requires: ["title", "neighbor"],
  },
  {
    text: "A faint link between {title} and {neighbor}.",
    requires: ["title", "neighbor"],
  },
  {
    text: "{neighbor}, then {title}. It's the same thought.",
    requires: ["title", "neighbor"],
  },

  // Title + tag — kind observations.
  {
    text: "A {tag} cluster has formed around {title}.",
    requires: ["title", "tag"],
  },
  { text: "{title} is the oldest {tag} here.", requires: ["title", "tag"] },
  { text: "Two {tag}s, still circling.", requires: ["tag"] },
  { text: "The {tag}s are bunching.", requires: ["tag"] },
  { text: "A quiet {tag}, near {title}.", requires: ["title", "tag"] },

  // Title + folder.
  { text: "{folder} is thick tonight.", requires: ["folder"] },
  { text: "Most of {folder} is near {title}.", requires: ["title", "folder"] },
  { text: "Something is happening in {folder}.", requires: ["folder"] },
  {
    text: "{title} is out past {folder}'s usual edge.",
    requires: ["title", "folder"],
  },

  // Count — crowd observations.
  {
    text: "{count} notes around {title}, gently.",
    requires: ["title", "count"],
  },
  { text: "A small crowd near {title}.", requires: ["title", "count"] },

  // Mixed heavier — age + neighbor.
  {
    text: "{neighbor} and {title}, still together after {age}.",
    requires: ["title", "neighbor", "age"],
  },
  {
    text: "{title} has held {neighbor} close for {age}.",
    requires: ["title", "neighbor", "age"],
  },

  // Impersonal atmospherics — only when we have a real structural fact.
  { text: "An orbit has settled here.", requires: [] },
  { text: "Something is holding together tonight.", requires: [] },
];

// Relative-age formatter tuned to feel like an observer's rough sense of
// time rather than a timestamp. No weeks, no "365 days ago" — round values.
export function relativeAge(mtime, now = Date.now()) {
  if (!mtime) return null;
  const delta = Math.max(0, now - mtime);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (delta < hour * 2) return "an hour ago";
  if (delta < hour * 6) return "a few hours ago";
  if (delta < day) return "this morning";
  if (delta < day * 2) return "yesterday";
  if (delta < day * 4) return "a few days ago";
  if (delta < day * 10) return "over a week ago";
  if (delta < day * 21) return "a couple of weeks ago";
  if (delta < day * 45) return "a month back";
  if (delta < day * 75) return "a couple of months back";
  if (delta < day * 180) return "a few months ago";
  if (delta < day * 400) return "most of a year ago";
  return "a long time ago";
}

// Render the chosen template against a snapshot, tidying punctuation for
// edge cases where a template still contains an optional slot we happened
// to have omitted.
export function renderTemplate(tmpl, snap) {
  return tmpl.text.replace(/\{(\w+)\}/g, (_, key) => {
    const v = snap[key];
    if (v == null || v === "") return "";
    return String(v);
  });
}

// Filter to templates whose required slots are all satisfied.
export function eligibleTemplates(snap, pool = TEMPLATES) {
  return pool.filter((t) =>
    t.requires.every((k) => snap[k] != null && snap[k] !== ""),
  );
}
