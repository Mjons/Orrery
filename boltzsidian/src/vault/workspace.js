// Unified workspace lifecycle on top of two very different backends:
//   - "user" — FileSystemDirectoryHandle picked via the FS Access picker,
//     persisted via IndexedDB, needs permission after a reload.
//   - "demo" — OPFS root, no permission prompt, contents installed from
//     the bundled demo vault.
//
// Everything in the app that used to call fs.pickWorkspace / fs.restoreWorkspace
// now talks to this module. Callers get a {handle, kind} pair; the rest of
// the pipeline doesn't care which kind it is.

import {
  isSupported as fsIsSupported,
  pickWorkspace as fsPickWorkspace,
  restoreWorkspace as fsRestoreWorkspace,
  forgetWorkspace as fsForgetWorkspace,
} from "./fs.js";
import {
  getOpfsRoot,
  installDemoVault,
  isOpfsSupported,
  getInstalledDemoTheme,
} from "./opfs.js";

const KIND_KEY = "boltzsidian.workspace.kind";
const THEME_KEY = "boltzsidian.workspace.theme";
const DEFAULT_THEME = "astronomer";

export function getWorkspaceKind() {
  return localStorage.getItem(KIND_KEY);
}

export function getDemoTheme() {
  return localStorage.getItem(THEME_KEY) || DEFAULT_THEME;
}

function setWorkspaceKind(kind) {
  if (kind) localStorage.setItem(KIND_KEY, kind);
  else localStorage.removeItem(KIND_KEY);
}

function setDemoTheme(theme) {
  if (theme) localStorage.setItem(THEME_KEY, theme);
  else localStorage.removeItem(THEME_KEY);
}

export function userWorkspaceSupported() {
  return fsIsSupported();
}

export function demoSupported() {
  return isOpfsSupported();
}

// Returns one of:
//   null                                          — no previous workspace
//   { kind:'demo', handle }                       — demo, ready to read
//   { kind:'user', handle }                       — user, permission already granted
//   { kind:'user', handle, needsPermission:true } — user, needs click to re-grant
export async function restoreWorkspace() {
  const kind = getWorkspaceKind();
  if (kind === "demo") {
    try {
      const handle = await getOpfsRoot();
      // Reconcile the stored theme with what's actually on disk — the
      // sentinel is the truth, localStorage is the hint.
      const actual = await getInstalledDemoTheme(handle);
      if (actual) setDemoTheme(actual);
      return { kind: "demo", handle, theme: actual || getDemoTheme() };
    } catch (err) {
      console.warn("[bz] OPFS restore failed:", err);
      setWorkspaceKind(null);
      return null;
    }
  }

  const restored = await fsRestoreWorkspace();
  if (!restored) return null;
  if (restored.needsPermission) {
    return {
      kind: "user",
      handle: restored.handle,
      needsPermission: true,
    };
  }
  return { kind: "user", handle: restored };
}

export async function pickUserWorkspace() {
  const handle = await fsPickWorkspace();
  setWorkspaceKind("user");
  return { kind: "user", handle };
}

export async function startDemoWorkspace({
  onProgress,
  theme = getDemoTheme(),
} = {}) {
  const root = await getOpfsRoot();
  const result = await installDemoVault(root, { onProgress, theme });
  setWorkspaceKind("demo");
  setDemoTheme(result.theme || theme);
  return {
    kind: "demo",
    handle: root,
    theme: result.theme || theme,
    freshInstall: result.installed,
  };
}

export async function resetDemoWorkspace({
  onProgress,
  theme = getDemoTheme(),
} = {}) {
  const root = await getOpfsRoot();
  const result = await installDemoVault(root, {
    overwrite: true,
    onProgress,
    theme,
  });
  setWorkspaceKind("demo");
  setDemoTheme(result.theme || theme);
  return {
    kind: "demo",
    handle: root,
    theme: result.theme || theme,
    freshInstall: true,
  };
}

export async function forgetWorkspace() {
  await fsForgetWorkspace();
  setWorkspaceKind(null);
}
