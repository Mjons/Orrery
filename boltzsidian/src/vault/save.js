// High-level save pipeline.
//
// Responsibilities, in order:
//   1. Canonicalize frontmatter (inject id/created on first save).
//   2. Write the file atomically. Create it if phantom.
//   3. Reparse the note back into the vault (titles, tags, links, kind).
//   4. If the title's "file stem" has drifted from the on-disk filename,
//      rename — rate-limited to one rename per minute per note.
//   5. Rewrite wikilink targets in notes that pointed at the old title.
//
// MULTI_PROJECT_PLAN.md Phase 3: every write resolves the note's root
// at call time via vault.getRootForNote. A readOnly root short-
// circuits before any FS access; the saver returns
// `{ applied: false, reason: "read-only" }` so callers can toast.
// Single-root vaults: `vault.getRootForNote` always returns the same
// writable root — behaviour is identical to the pre-Phase-3 path.

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

    // Resolve the target root before doing any work. Unknown root
    // (note has no rootId or root isn't registered) falls back to
    // the legacy vault.root alias so single-root flows keep working.
    const root = resolveRoot(vault, note);
    if (!root) {
      return {
        applied: false,
        reason: "no-root",
        rawText,
      };
    }
    if (root.readOnly) {
      console.warn(
        `[bz] save blocked — note "${note.path}" lives in read-only root "${root.id}"`,
      );
      return {
        applied: false,
        reason: "read-only",
        rootId: root.id,
        rawText,
      };
    }

    const { text: canonText, frontmatter } = canonicalizeForSave(rawText, note);

    // Keep note.frontmatter in sync with what we just canonicalized so the
    // first reparse doesn't lose injected id/created.
    if (!note.frontmatter) note.frontmatter = {};
    note.frontmatter.id = frontmatter.id || note.id;
    if (frontmatter.created && !note.frontmatter.created)
      note.frontmatter.created = frontmatter.created;

    if (note._isPhantom) {
      await createNoteAt(root.handle, note.path, canonText);
      note._isPhantom = false;
    } else {
      await writeNoteAt(root.handle, note.path, canonText);
    }

    const beforeTitle = note.title;
    reparseNote(vault, note, canonText, settings);

    const renameResult = await maybeRename(
      vault,
      note,
      beforeTitle,
      settings,
      root,
    );

    if (onNoteChanged) onNoteChanged(note, { renameResult, beforeTitle });

    return {
      applied: true,
      rawText: canonText,
      renamed: renameResult?.renamed,
      rootId: root.id,
    };
  };
}

function resolveRoot(vault, note) {
  // Preferred path — multi-root aware.
  if (vault.getRootForNote) {
    const explicit = vault.getRootForNote(note.id);
    if (explicit) return explicit;
  }
  // Fallback for Phase-pre-2 vault shapes — synthesise a minimal
  // record from the legacy `vault.root` handle. Treats everything as
  // writable (same as pre-multi-root behaviour).
  if (vault.root) {
    return {
      id: "default",
      handle: vault.root,
      readOnly: false,
    };
  }
  return null;
}

async function maybeRename(vault, note, beforeTitle, settings, root) {
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
  // Path uniqueness is scoped to the note's own root — different
  // projects can each have "Untitled.md" without clashing. Filter to
  // same-root notes before computing `taken`.
  const sameRootNotes = vault.notes.filter(
    (n) => n !== note && (!n.rootId || n.rootId === note.rootId),
  );
  const taken = new Set(sameRootNotes.map((n) => n.path));
  const newPath = uniquePath(dirPath, desiredStem, taken);

  const linkPatches = planIncomingLinkRewrites(vault, note, beforeTitle);

  try {
    await renameNote(root.handle, note.path, newPath);
  } catch (err) {
    console.warn("[bz] rename failed, keeping old path:", err);
    return { renamed: false, error: err };
  }

  note.path = newPath;
  note.name = newPath.includes("/")
    ? newPath.slice(newPath.lastIndexOf("/") + 1)
    : newPath;
  _lastRenameAt.set(note.id, now);

  // Apply link rewrites to notes that referenced the old title. Each
  // patch may live in a DIFFERENT root than the renamed note (a
  // read-only project can contain links to writeRoot titles). We
  // skip read-only roots — their wikilinks become dangling when the
  // title no longer resolves, same behaviour as an external rename.
  const rewriteErrors = [];
  const skippedReadOnly = [];
  for (const patch of linkPatches) {
    const patchRoot = resolveRoot(vault, patch.note);
    if (!patchRoot) {
      rewriteErrors.push({ note: patch.note, error: new Error("no-root") });
      continue;
    }
    if (patchRoot.readOnly) {
      skippedReadOnly.push(patch.note);
      continue;
    }
    try {
      await writeNoteAt(patchRoot.handle, patch.note.path, patch.text);
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
    skippedReadOnly: skippedReadOnly.length ? skippedReadOnly : undefined,
  };
}
