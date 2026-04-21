// Folder helpers.
//
// The flat-universe ideal (see FORMATIONS.md §0) keeps tags as the primary
// structural axis. Folders are a secondary one: they tint the space
// *around* a body without touching its core colour, and they can exert a
// gentle gravitational basin on layout if the user wants.
//
// Top-level folder only. `/work/clients/acme.md` → "work". Root-level
// notes → no folder. This module never recurses and never treats nested
// folders as independent entities.

// A curated 8-tone palette designed to coexist with the single accent. Low
// saturation, perceptually distinguishable under the bloom pass, no rainbow.
export const AURA_PALETTE = [
  { key: "cobalt", hex: "#5d88f5" },
  { key: "teal", hex: "#4fa4a4" },
  { key: "sage", hex: "#8eb688" },
  { key: "amber", hex: "#e6b85c" },
  { key: "ochre", hex: "#c38c5c" },
  { key: "rose", hex: "#d88aa5" },
  { key: "violet", hex: "#a583d4" },
  { key: "slate", hex: "#7b8494" },
];

export const NO_TINT = [0, 0, 0];

// Return the top-level folder name for a note, or "" if the note is at the
// vault root. Pure function of path.
export function topLevelFolder(pathOrNote) {
  const path = typeof pathOrNote === "string" ? pathOrNote : pathOrNote?.path;
  if (!path) return "";
  const i = path.indexOf("/");
  if (i === -1) return "";
  return path.slice(0, i);
}

// Collect the set of top-level folders actually present in the vault, sorted
// alphabetically so tone assignment is stable across runs.
export function listTopLevelFolders(vault) {
  const set = new Set();
  for (const n of vault.notes) {
    const f = topLevelFolder(n);
    if (f) set.add(f);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Ensure every top-level folder in the vault has a tint key assigned. Does
// not overwrite user assignments. Returns the folder_tints object (new or
// mutated) and a changed flag so the caller knows whether to persist.
export function assignTints(vault, settings) {
  const folders = listTopLevelFolders(vault);
  const tints = { ...(settings.folder_tints || {}) };
  const used = new Set(Object.values(tints).filter(Boolean));
  let changed = false;

  // Spread across the palette first — only start repeating tones after all
  // eight have been used.
  for (const f of folders) {
    if (tints[f]) continue;
    const nextTone =
      AURA_PALETTE.find((t) => !used.has(t.key))?.key ||
      AURA_PALETTE[folders.indexOf(f) % AURA_PALETTE.length].key;
    tints[f] = nextTone;
    used.add(nextTone);
    changed = true;
  }
  return { tints, changed };
}

// Look up the tint RGB for a given note, in 0–1 floats ready for a shader
// uniform. Returns [0, 0, 0] if the note has no folder or the user has
// cleared its tint (`folder_tints[f] === ""`).
export function tintRgbForNote(note, settings) {
  const folder = topLevelFolder(note);
  if (!folder) return NO_TINT;
  const tints = settings.folder_tints || {};
  const key = tints[folder];
  if (!key) return NO_TINT;
  const tone = AURA_PALETTE.find((t) => t.key === key);
  if (!tone) return NO_TINT;
  return hexToRgb(tone.hex);
}

export function hexToRgb(hex) {
  const s = hex.replace("#", "");
  const n = s.length === 3 ? s.replace(/(.)/g, "$1$1") : s;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return [r, g, b];
}
