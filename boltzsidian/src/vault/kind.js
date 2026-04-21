// Tag → kind resolution.
//
// Precedence:
//   1. frontmatter `kind: <int>` is an explicit override (respect it).
//   2. first tag (in note order) whose key is in settings.tag_to_kind.
//   3. default kind 0.
//
// Kinds stay integers 0..6 so they line up with the sim's kind vocabulary:
// star · planet · BH · dust · halo · galaxyA · galaxyB (see CLAUDE.md).

export const NUM_KINDS = 7;
export const DEFAULT_KIND = 0;

export function computeKind(note, settings) {
  const fm = note.frontmatter;
  if (fm && Number.isInteger(fm.kind) && fm.kind >= 0 && fm.kind < NUM_KINDS) {
    return fm.kind;
  }
  const map = settings.tag_to_kind || {};
  for (const tag of note.tags) {
    const k = map[tag];
    if (Number.isInteger(k) && k >= 0 && k < NUM_KINDS) return k;
  }
  return DEFAULT_KIND;
}

// Assign kind on every note in the vault. Called once at load and whenever
// the tag→kind mapping changes.
export function assignKinds(notes, settings) {
  for (const n of notes) n.kind = computeKind(n, settings);
}

// Sim-parity tints keyed by kind. Muted so bloom doesn't blow them out.
// Each value is an RGB triple in 0..1. The fragment shader mixes these with
// the accent for the core fill.
export const KIND_TINTS = [
  [1.0, 0.94, 0.84], // 0 star — warm white
  [0.72, 0.86, 1.0], // 1 planet — cool blue
  [0.68, 0.58, 0.98], // 2 BH — violet
  [0.95, 0.78, 0.58], // 3 dust — amber
  [0.58, 0.95, 0.86], // 4 halo — teal
  [1.0, 0.76, 0.84], // 5 galaxyA — rose
  [0.82, 1.0, 0.66], // 6 galaxyB — chartreuse
];
