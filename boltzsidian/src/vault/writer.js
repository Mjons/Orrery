// Write-back to the workspace via File System Access API.
//
// All writes go through createWritable(), which under the hood writes to a
// swap file and atomically commits on close — so a crash mid-write cannot
// corrupt the user's note. Best we can get from the browser.
//
// Rename uses FileSystemFileHandle.move() (Chromium ≥ 110); we require 122+
// for Boltzsidian so it's always available.

export async function writeNoteAt(root, path, text) {
  const handle = await resolveFileHandle(root, path, { create: false });
  await writeFileHandle(handle, text);
  return handle;
}

export async function createNoteAt(root, path, text) {
  const handle = await resolveFileHandle(root, path, { create: true });
  await writeFileHandle(handle, text);
  return handle;
}

export async function renameNote(root, oldPath, newPath) {
  if (oldPath === newPath) return;
  const oldHandle = await resolveFileHandle(root, oldPath, { create: false });

  const oldDirPath = dirnameOf(oldPath);
  const newDirPath = dirnameOf(newPath);
  const newName = basenameOf(newPath);

  if (typeof oldHandle.move === "function") {
    if (oldDirPath === newDirPath) {
      await oldHandle.move(newName);
    } else {
      const newDir = await resolveDirectoryHandle(root, newDirPath, {
        create: true,
      });
      await oldHandle.move(newDir, newName);
    }
    return;
  }

  // Very defensive fallback; modern Chromium has move().
  const file = await oldHandle.getFile();
  const text = await file.text();
  await createNoteAt(root, newPath, text);
  const oldDir = await resolveDirectoryHandle(root, oldDirPath, {
    create: false,
  });
  await oldDir.removeEntry(basenameOf(oldPath));
}

export async function deleteNote(root, path) {
  const dirPath = dirnameOf(path);
  const name = basenameOf(path);
  const dir = await resolveDirectoryHandle(root, dirPath, { create: false });
  await dir.removeEntry(name);
}

async function writeFileHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function resolveFileHandle(root, path, { create }) {
  const dirPath = dirnameOf(path);
  const name = basenameOf(path);
  const dir = await resolveDirectoryHandle(root, dirPath, { create });
  return dir.getFileHandle(name, { create });
}

async function resolveDirectoryHandle(root, dirPath, { create }) {
  if (!dirPath) return root;
  let dir = root;
  for (const seg of dirPath.split("/")) {
    if (!seg) continue;
    dir = await dir.getDirectoryHandle(seg, { create });
  }
  return dir;
}

function dirnameOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function basenameOf(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

// Given a desired title, produce a file-system-safe stem. Does NOT include
// the .md suffix. Collisions are resolved by the caller by appending -1, -2…
export function titleToStem(title) {
  let s = String(title || "untitled").trim();
  if (!s) s = "untitled";
  // Replace runs of problem chars with a single hyphen.
  s = s.replace(/[\\\/:*?"<>|\x00-\x1f]+/g, "-");
  // Collapse whitespace → single hyphen, tidy edges.
  s = s
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Avoid reserved Windows stems.
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  if (!s) s = "untitled";
  // Keep length reasonable so the filesystem is happy.
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/, "");
  return s;
}

// Try new-stem.md, new-stem-1.md, new-stem-2.md, … inside a directory.
// `takenPaths` is a Set<string> of currently-occupied paths (from the vault)
// so we don't collide with an open file we haven't read back yet.
export function uniquePath(dirPath, stem, takenPaths) {
  const dir = dirPath ? `${dirPath}/` : "";
  let candidate = `${dir}${stem}.md`;
  if (!takenPaths.has(candidate)) return candidate;
  for (let i = 1; i < 9999; i++) {
    candidate = `${dir}${stem}-${i}.md`;
    if (!takenPaths.has(candidate)) return candidate;
  }
  return `${dir}${stem}-${Date.now()}.md`;
}
