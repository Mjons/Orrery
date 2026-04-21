// Read/write the .universe/ sidecar directory. Workspace-local, rebuildable.
// Everything here is best-effort: if the user has denied write permission or
// the disk is out of space, the app keeps running with in-memory state.

const UNIVERSE_DIR = ".universe";
const STATE_FILE = "state.json";

async function getUniverseDir(root, { create = true } = {}) {
  return root.getDirectoryHandle(UNIVERSE_DIR, { create });
}

export async function loadState(root) {
  try {
    const dir = await getUniverseDir(root, { create: false });
    const fileHandle = await dir.getFileHandle(STATE_FILE);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (err) {
    if (err && (err.name === "NotFoundError" || err.name === "TypeError"))
      return null;
    console.warn("[bz] loadState failed:", err);
    return null;
  }
}

export async function saveState(root, state) {
  try {
    const dir = await getUniverseDir(root, { create: true });
    const fileHandle = await dir.getFileHandle(STATE_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    return true;
  } catch (err) {
    console.warn("[bz] saveState failed:", err);
    return false;
  }
}
