// Persist the FileSystemDirectoryHandle in IndexedDB so the user only has to
// pick the workspace folder once. Chromium stores the handle reference; the
// user must re-consent to read/write access on each new session via a
// user-initiated action (we route that through queryPermission /
// requestPermission).

const DB_NAME = "boltzsidian";
const DB_VERSION = 1;
const STORE = "handles";
const KEY = "workspace";

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
