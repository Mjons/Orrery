// High-level save pipeline.
//
// Responsibilities, in order:
//   1. Canonicalize frontmatter (inject id/created on first save).
//   2. Write the file atomically. Create it if phantom.
//   3. Reparse the note back into the vault (titles, tags, links, kind).
//   4. If the title's "file stem" has drifted from the on-disk filename,
//      rename — rate-limited to one rename per minute per note.
//   5. Rewrite wikilink targets in notes that pointed at the old title.

import {
  writeNoteAt,
  createNoteAt,
  renameNote,
  titleToStem,
  uniquePath,
} from "./writer.js";
import {
  canonicalizeForSave,
  reparseNote,
  planIncomingLinkRewrites,
} from "./mutations.js";

const RENAME_COOLDOWN_MS = 60_000;
const _lastRenameAt = new Map(); // noteId → ms timestamp

export function createSaver({ vault, getSettings, onNoteChanged }) {
  return async function save(note, rawText) {
    const settings = getSettings();
    const { text: canonText, frontmatter } = canonicalizeForSave(rawText, note);

    // Keep note.frontmatter in sync with what we just canonicalized so the
    // first reparse doesn't lose injected id/created.
    if (!note.frontmatter) note.frontmatter = {};
    note.frontmatter.id = frontmatter.id || note.id;
    if (frontmatter.created && !note.frontmatter.created)
      note.frontmatter.created = frontmatter.created;

    if (note._isPhantom) {
      await createNoteAt(vault.root, note.path, canonText);
      note._isPhantom = false;
    } else {
      await writeNoteAt(vault.root, note.path, canonText);
    }

    const beforeTitle = note.title;
    reparseNote(vault, note, canonText, settings);

    const renameResult = await maybeRename(vault, note, beforeTitle, settings);

    if (onNoteChanged) onNoteChanged(note, { renameResult, beforeTitle });

    return { rawText: canonText, renamed: renameResult?.renamed };
  };
}

async function maybeRename(vault, note, beforeTitle, settings) {
  const desiredStem = titleToStem(note.title);
  const currentStem = note.name.replace(/\.md$/i, "");
  if (desiredStem === currentStem) return { renamed: false };

  const last = _lastRenameAt.get(note.id) || 0;
  const now = Date.now();
  if (now - last < RENAME_COOLDOWN_MS)
    return { renamed: false, throttled: true };

  const dirPath = note.path.includes("/")
    ? note.path.slice(0, note.path.lastIndexOf("/"))
    : "";
  const taken = new Set(
    vault.notes.filter((n) => n !== note).map((n) => n.path),
  );
  const newPath = uniquePath(dirPath, desiredStem, taken);

  const linkPatches = planIncomingLinkRewrites(vault, note, beforeTitle);

  try {
    await renameNote(vault.root, note.path, newPath);
  } catch (err) {
    console.warn("[bz] rename failed, keeping old path:", err);
    return { renamed: false, error: err };
  }

  note.path = newPath;
  note.name = newPath.includes("/")
    ? newPath.slice(newPath.lastIndexOf("/") + 1)
    : newPath;
  _lastRenameAt.set(note.id, now);

  // Apply link rewrites. Each is a full file write; keep sequential so we
  // don't storm the FS write queue. Failures are logged but don't abort.
  const rewriteErrors = [];
  for (const patch of linkPatches) {
    try {
      await writeNoteAt(vault.root, patch.note.path, patch.text);
      reparseNote(vault, patch.note, patch.text, settings);
    } catch (err) {
      console.warn("[bz] link rewrite failed for", patch.note.path, err);
      rewriteErrors.push({ note: patch.note, error: err });
    }
  }

  return {
    renamed: true,
    oldTitle: beforeTitle,
    newPath,
    linkPatches: linkPatches.length,
    rewriteErrors: rewriteErrors.length ? rewriteErrors : undefined,
  };
}
