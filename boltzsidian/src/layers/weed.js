// Weed layer — the acting half of the prune cycle.
//
// Phase 5 computes `.universe/prune-candidates.json` during the dream.
// This module reads that file, keeps a parallel `.universe/weed-keep.json`
// of ids the user has explicitly kept-forever, moves files into
// `.universe/archive/YYYY/` on Archive, and deletes via FS Access on
// Delete. The drawer in ui/weed-drawer.js is the only consumer.
//
// Decisions layered on top of Phase 5 output:
//   - A kept id never re-appears. Survives future prune passes.
//   - Archive is reversible: the file is moved, not destroyed. The vault
//     walker already skips hidden dirs so archived files disappear from
//     the universe.
//   - Delete goes through removeEntry — no undo, per the spec's
//     "uncomfortable by design" stance.
//
// weed-keep.json schema:
//   {
//     "version": 1,
//     "keptIds":        [noteId, …],
//     "lastSeenCount":  number,      // prune count when Weed last opened
//     "lastSeenAt":     iso-timestamp
//   }

const UNIVERSE_DIR = ".universe";
const PRUNE_FILE = "prune-candidates.json";
const KEEP_FILE = "weed-keep.json";
const ARCHIVE_DIR = "archive";

export async function loadPruneCandidates(rootHandle) {
  if (!rootHandle) return { candidates: [], generatedAt: null };
  try {
    const dir = await rootHandle.getDirectoryHandle(UNIVERSE_DIR, {
      create: false,
    });
    const fh = await dir.getFileHandle(PRUNE_FILE);
    const text = await (await fh.getFile()).text();
    const parsed = JSON.parse(text);
    return {
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      generatedAt: parsed.generatedAt || null,
    };
  } catch (err) {
    // Missing file = no dream has run yet, or user never dreamed.
    if (err?.name === "NotFoundError") {
      return { candidates: [], generatedAt: null };
    }
    console.warn("[bz] weed: prune-candidates read failed", err);
    return { candidates: [], generatedAt: null };
  }
}

export async function loadWeedKeep(rootHandle) {
  const empty = { version: 1, keptIds: [], lastSeenCount: 0, lastSeenAt: null };
  if (!rootHandle) return empty;
  try {
    const dir = await rootHandle.getDirectoryHandle(UNIVERSE_DIR, {
      create: false,
    });
    const fh = await dir.getFileHandle(KEEP_FILE);
    const text = await (await fh.getFile()).text();
    const parsed = JSON.parse(text);
    return {
      version: 1,
      keptIds: Array.isArray(parsed.keptIds) ? parsed.keptIds.slice() : [],
      lastSeenCount: Number(parsed.lastSeenCount) || 0,
      lastSeenAt: parsed.lastSeenAt || null,
    };
  } catch (err) {
    if (err?.name === "NotFoundError") return empty;
    console.warn("[bz] weed: keep-list read failed", err);
    return empty;
  }
}

export async function saveWeedKeep(rootHandle, state) {
  if (!rootHandle) return false;
  try {
    const dir = await rootHandle.getDirectoryHandle(UNIVERSE_DIR, {
      create: true,
    });
    const fh = await dir.getFileHandle(KEEP_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(state, null, 2));
    await w.close();
    return true;
  } catch (err) {
    console.warn("[bz] weed: keep-list write failed", err);
    return false;
  }
}

// Filter a list of candidates against a keep set. Pure, testable.
export function filterKept(candidates, keptIds) {
  const kept = new Set(keptIds || []);
  return (candidates || []).filter((c) => !kept.has(c.id));
}

// How many new candidates appeared since the last time the user opened
// Weed. Negative if the list shrank (archive / delete / edit happened).
export function growthSinceLastSeen(candidates, keepState) {
  const cur = Array.isArray(candidates) ? candidates.length : 0;
  const prev = Number(keepState?.lastSeenCount) || 0;
  return cur - prev;
}

// Move a file to `.universe/archive/YYYY/<basename>`. If something is
// already at the destination, suffix with a timestamp so we never
// silently clobber. FileSystemFileHandle.move() is required (Chromium
// 122+, which Boltzsidian already requires elsewhere).
export async function archiveNote(rootHandle, path) {
  if (!rootHandle || !path) return { ok: false, reason: "bad-args" };
  const name = basename(path);
  const year = new Date().getFullYear();
  try {
    const universe = await rootHandle.getDirectoryHandle(UNIVERSE_DIR, {
      create: true,
    });
    const archive = await universe.getDirectoryHandle(ARCHIVE_DIR, {
      create: true,
    });
    const yearDir = await archive.getDirectoryHandle(String(year), {
      create: true,
    });
    const sourceDir = await resolveDirectoryHandle(rootHandle, dirname(path));
    const sourceFile = await sourceDir.getFileHandle(name);

    let targetName = name;
    if (await entryExists(yearDir, targetName)) {
      const stamp = Date.now();
      targetName = name.replace(/(\.md)?$/i, `-${stamp}.md`);
    }
    if (typeof sourceFile.move !== "function") {
      throw new Error("FileSystemFileHandle.move unavailable");
    }
    await sourceFile.move(yearDir, targetName);
    return {
      ok: true,
      archivedAs: `${UNIVERSE_DIR}/${ARCHIVE_DIR}/${year}/${targetName}`,
    };
  } catch (err) {
    console.warn("[bz] weed: archive failed", path, err);
    return { ok: false, reason: err?.message || "archive-failed" };
  }
}

// Delete a note from disk outright. No undo. Caller is responsible for
// showing confirmation UI before calling.
export async function deleteNoteFile(rootHandle, path) {
  if (!rootHandle || !path) return { ok: false, reason: "bad-args" };
  try {
    const dir = await resolveDirectoryHandle(rootHandle, dirname(path));
    await dir.removeEntry(basename(path));
    return { ok: true };
  } catch (err) {
    console.warn("[bz] weed: delete failed", path, err);
    return { ok: false, reason: err?.message || "delete-failed" };
  }
}

async function resolveDirectoryHandle(root, dirPath) {
  if (!dirPath) return root;
  let dir = root;
  for (const seg of dirPath.split("/")) {
    if (!seg) continue;
    dir = await dir.getDirectoryHandle(seg);
  }
  return dir;
}

async function entryExists(dir, name) {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

function dirname(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}
function basename(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}
