// Persist the FileSystemDirectoryHandle in IndexedDB so the user only has to
// pick the workspace folder once. Chromium stores the handle reference; the
// user must re-consent to read/write access on each new session via a
// user-initiated action (we route that through queryPermission /
// requestPermission).
//
// Key layout:
//   "workspace"     — primary (writeRoot) handle, legacy single-root key
//   "root:<rootId>" — additional roots referenced by the workspace
//                     manifest. Phase 5: every root in workspace.json
//                     lands here by id so reloads don't re-prompt.

const DB_NAME = "boltzsidian";
const DB_VERSION = 1;
const STORE = "handles";
const KEY = "workspace";
const ROOT_KEY_PREFIX = "root:";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const result = fn(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveHandle(handle) {
  await withStore("readwrite", (s) => s.put(handle, KEY));
}

export async function loadHandle() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    } catch (e) {
      reject(e);
    }
  });
}

export async function clearHandle() {
  await withStore("readwrite", (s) => s.delete(KEY));
}

// ── Multi-root handle storage (Phase 5) ─────────────────────
//
// Each non-primary root in a manifest lands in the same IDB store
// under key "root:<id>". Keys are validated so user-typed junk can't
// corrupt the store; ids must already be kebab-case (enforced by the
// manifest parser).

function rootKey(rootId) {
  if (!rootId || typeof rootId !== "string") {
    throw new Error("rootKey: rootId must be a non-empty string");
  }
  return `${ROOT_KEY_PREFIX}${rootId}`;
}

export async function saveRootHandle(rootId, handle) {
  if (!handle) throw new Error("saveRootHandle: handle is required");
  await withStore("readwrite", (s) => s.put(handle, rootKey(rootId)));
}

export async function loadRootHandle(rootId) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(rootKey(rootId));
      req.onsuccess = () => {
        db.close();
        resolve(req.result ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    } catch (e) {
      reject(e);
    }
  });
}

// Returns { [rootId]: handle } for every stored root handle. Used at
// boot to reconstitute the manifest's roots without hitting the
// picker for ones whose permission is still fresh.
export async function loadAllRootHandles() {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      const out = {};
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(out);
          return;
        }
        const key = String(cursor.key || "");
        if (key.startsWith(ROOT_KEY_PREFIX)) {
          out[key.slice(ROOT_KEY_PREFIX.length)] = cursor.value;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteRootHandle(rootId) {
  await withStore("readwrite", (s) => s.delete(rootKey(rootId)));
}

export async function clearAllRootHandles() {
  const handles = await loadAllRootHandles();
  const ids = Object.keys(handles);
  if (ids.length === 0) return;
  await withStore("readwrite", (s) => {
    for (const id of ids) s.delete(rootKey(id));
  });
}
