// Workspace manifest — the data model for multi-project vaults.
//
// MULTI_PROJECT.md §1.5 / MULTI_PROJECT_PLAN.md Phase 1. One vault
// is a composition of one or more ROOTS plus a designated writeRoot
// where all Boltzsidian writes land (ideas/, .universe/, new notes).
//
// This phase introduces the type + parser + synthesiser but does NOT
// change runtime behaviour. The legacy single-root openVault path is
// still exercised; anything that USES a manifest is dormant until
// Phase 2 wires the multi-root walker.
//
// ── Shapes ───────────────────────────────────────────────────
//
// A manifest stored as JSON on disk:
//
//   {
//     "version": 1,
//     "roots": [
//       { "id": "notes",       "name": "My notes", "path": "L:/notes" },
//       { "id": "panel-haus",  "name": "Panel Haus",
//         "path": "L:/projects_claudecode/panel-haus",
//         "readOnly": true,
//         "exclude": ["node_modules/**", "vendor/**"] }
//     ],
//     "writeRootId": "notes",
//     "defaultExcludes": ["node_modules/**", ".git/**"]
//   }
//
// At runtime each RootSpec gains a `handle` field
// (FileSystemDirectoryHandle) hydrated from IndexedDB or the pick
// flow in Phase 5. The parser here handles JSON-only shape and
// leaves `handle` for the caller.

// Default exclude globs applied to every root unless a root supplies
// its own override list. Conservative defaults — anything a user
// might reasonably want to keep out of a dream prompt excerpt.
export const DEFAULT_EXCLUDES = [
  "node_modules/**",
  "vendor/**",
  ".git/**",
  "dist/**",
  "build/**",
  "target/**",
  ".next/**",
  ".nuxt/**",
  ".cache/**",
  "coverage/**",
  "private/**",
  "*.secrets.md",
  "**/*.secrets.md",
];

export const MANIFEST_VERSION = 1;
export const MANIFEST_FILE = "workspace.json";
export const MANIFEST_DIR = ".universe";

// Parse a manifest from a JSON string or plain object. Returns a
// normalised manifest on success; throws a readable Error on
// validation failure. Does NOT touch the filesystem.
//
// Returned shape:
//   {
//     version: 1,
//     roots: RootSpec[],   // normalised — every root has id, name, path,
//                           //              readOnly, include, exclude
//     writeRootId: string, // guaranteed to refer to an existing root
//     defaultExcludes: string[],
//   }
export function parseManifest(input) {
  const raw = typeof input === "string" ? parseJsonStrict(input) : input;
  if (!raw || typeof raw !== "object") {
    throw new Error("manifest: expected an object");
  }
  const version =
    typeof raw.version === "number" ? raw.version : MANIFEST_VERSION;
  if (version !== MANIFEST_VERSION) {
    // Soft-warn but accept — future us can refuse on a real version
    // mismatch. For now anything non-1 is treated as "unknown
    // version, good luck" and fails validation below if the shape
    // doesn't match.
    console.warn(
      `[bz] manifest version ${version} (expected ${MANIFEST_VERSION}) — parsing best-effort`,
    );
  }
  if (!Array.isArray(raw.roots) || raw.roots.length === 0) {
    throw new Error("manifest: `roots` must be a non-empty array");
  }
  const defaultExcludes = Array.isArray(raw.defaultExcludes)
    ? raw.defaultExcludes.filter((s) => typeof s === "string")
    : DEFAULT_EXCLUDES.slice();
  const roots = raw.roots.map((r, i) => normaliseRoot(r, i, defaultExcludes));
  const ids = new Set();
  for (const r of roots) {
    if (ids.has(r.id)) {
      throw new Error(`manifest: duplicate root id "${r.id}"`);
    }
    ids.add(r.id);
  }
  const writeRootId =
    typeof raw.writeRootId === "string" ? raw.writeRootId : "";
  if (!writeRootId) {
    throw new Error(
      "manifest: `writeRootId` is required and must reference an existing root",
    );
  }
  const writeRoot = roots.find((r) => r.id === writeRootId);
  if (!writeRoot) {
    throw new Error(
      `manifest: writeRootId "${writeRootId}" does not match any root id`,
    );
  }
  if (writeRoot.readOnly === true) {
    throw new Error(
      `manifest: writeRoot "${writeRootId}" is marked readOnly — writeRoot must be writable`,
    );
  }
  return {
    version: MANIFEST_VERSION,
    roots,
    writeRootId,
    defaultExcludes,
  };
}

// Build an in-memory manifest for a single already-granted root
// handle. Phase 1 uses this when there's no on-disk manifest yet —
// the legacy single-workspace flow synthesises one on boot so
// downstream code (Phase 2+) has a uniform shape to consume.
//
// kind: "user" | "demo" — preserved from the pick flow. Demo
// handles get a stable id "demo" so state persistence doesn't
// co-mingle with real user vaults.
export function synthesizeSingleRootManifest(
  handle,
  { kind = "user", id = null, name = null } = {},
) {
  if (!handle) {
    throw new Error("synthesizeSingleRootManifest: handle is required");
  }
  const rootId = id || (kind === "demo" ? "demo" : deriveIdFromHandle(handle));
  const rootName = name || handle.name || rootId;
  const root = {
    id: rootId,
    name: rootName,
    // Path is unknown for FS Access handles (they don't expose full
    // filesystem paths to the tab for security). We store the
    // handle.name as a stand-in that renders reasonably in the UI.
    path: handle.name || rootId,
    readOnly: false,
    include: [],
    exclude: DEFAULT_EXCLUDES.slice(),
    handle,
    kind,
  };
  return {
    version: MANIFEST_VERSION,
    roots: [root],
    writeRootId: rootId,
    defaultExcludes: DEFAULT_EXCLUDES.slice(),
  };
}

// ── Helpers ─────────────────────────────────────────────────
function normaliseRoot(raw, index, defaultExcludes) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`manifest: roots[${index}] must be an object`);
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) {
    throw new Error(`manifest: roots[${index}].id is required (string)`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_\-.]*$/.test(id)) {
    throw new Error(
      `manifest: roots[${index}].id "${id}" must be kebab/snake-case alphanumeric`,
    );
  }
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  // Path is informational for FS Access (browsers don't give us the
  // real filesystem path), but if supplied it must be non-empty.
  if (raw.path != null && !path) {
    throw new Error(
      `manifest: roots[${index}].path must be non-empty if provided`,
    );
  }
  const readOnly = raw.readOnly === true;
  const include = Array.isArray(raw.include)
    ? raw.include.filter((s) => typeof s === "string")
    : [];
  // Root's own excludes take precedence when provided; otherwise the
  // manifest default applies.
  const exclude = Array.isArray(raw.exclude)
    ? raw.exclude.filter((s) => typeof s === "string")
    : defaultExcludes.slice();
  return {
    id,
    name,
    path,
    readOnly,
    include,
    exclude,
    // `handle` + `kind` are runtime fields — parser doesn't touch them.
  };
}

function parseJsonStrict(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`manifest: invalid JSON — ${err.message}`);
  }
}

// Derive a filesystem-safe id from a directory handle. Used when the
// single-root synthesiser has no explicit id to fall back on.
// Typical handle.name values: "my-notes", "Documents", "panel-haus".
// We lowercase + replace non-alphanumeric with hyphens.
function deriveIdFromHandle(handle) {
  const name = String(handle?.name || "root");
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "root"
  );
}

// Serialise a manifest back to JSON for on-disk storage. Strips the
// runtime-only `handle` and `kind` fields from each root so the file
// is portable.
export function serializeManifest(manifest) {
  const clean = {
    version: MANIFEST_VERSION,
    roots: manifest.roots.map((r) => {
      const out = { id: r.id, name: r.name, path: r.path };
      if (r.readOnly) out.readOnly = true;
      if (r.include && r.include.length > 0) out.include = r.include.slice();
      if (r.exclude && r.exclude.length > 0) out.exclude = r.exclude.slice();
      return out;
    }),
    writeRootId: manifest.writeRootId,
  };
  if (manifest.defaultExcludes && manifest.defaultExcludes.length > 0) {
    clean.defaultExcludes = manifest.defaultExcludes.slice();
  }
  return JSON.stringify(clean, null, 2);
}

// Look up a RootSpec by id. Used by writer resolution paths in
// Phase 3 onward.
export function getRoot(manifest, rootId) {
  return manifest?.roots?.find((r) => r.id === rootId) || null;
}

// Look up the writeRoot specifically. Never returns null on a valid
// manifest (parseManifest rejects manifests whose writeRootId doesn't
// match a root) but callers should still handle the null case
// defensively when manifest is absent entirely.
export function getWriteRoot(manifest) {
  return manifest ? getRoot(manifest, manifest.writeRootId) : null;
}

// ── On-disk manifest I/O (Phase 5) ─────────────────────────
//
// The manifest lives at `<writeRoot>/.universe/workspace.json`. These
// helpers are thin wrappers over FS Access + parseManifest/serialize.
// A missing file is not an error — it signals "no manifest, use
// single-root fallback" and returns null. All other read failures
// propagate so the caller can toast / log.

export async function loadManifestFromHandle(writeRootHandle) {
  if (!writeRootHandle) return null;
  let dir;
  try {
    dir = await writeRootHandle.getDirectoryHandle(MANIFEST_DIR, {
      create: false,
    });
  } catch (err) {
    if (err?.name === "NotFoundError") return null;
    throw err;
  }
  let file;
  try {
    const fh = await dir.getFileHandle(MANIFEST_FILE, { create: false });
    file = await fh.getFile();
  } catch (err) {
    if (err?.name === "NotFoundError") return null;
    throw err;
  }
  const text = await file.text();
  return parseManifest(text);
}

// Serialize a manifest and persist it at
// `<writeRoot>/.universe/workspace.json`. Creates the directory if
// missing. Runtime-only fields (handle, kind) are stripped by
// serializeManifest so the file is portable.
export async function saveManifestToHandle(writeRootHandle, manifest) {
  if (!writeRootHandle) {
    throw new Error("saveManifestToHandle: writeRootHandle is required");
  }
  const dir = await writeRootHandle.getDirectoryHandle(MANIFEST_DIR, {
    create: true,
  });
  const fh = await dir.getFileHandle(MANIFEST_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(serializeManifest(manifest));
  await w.close();
}
