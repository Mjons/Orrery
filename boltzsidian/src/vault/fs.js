// FS Access API handshake. Chromium-only for real use; other browsers get a
// helpful error and can fall back to a zip-import mode (Phase 1+).
//
// This module owns the single workspace handle and the permission lifecycle.
// Phase 0 exposes: isSupported(), pickWorkspace(), restoreWorkspace(),
// forgetWorkspace().  Phase 1 will add walk() and read() over this.

import { saveHandle, loadHandle, clearHandle } from "./handle-store.js";

export function isSupported() {
  return typeof window.showDirectoryPicker === "function";
}

export async function pickWorkspace() {
  if (!isSupported())
    throw new Error(
      "File System Access API unavailable — use Chrome, Edge, Arc, or Brave.",
    );
  console.log("[bz] showDirectoryPicker...");
  const handle = await window.showDirectoryPicker({
    mode: "readwrite",
    id: "boltzsidian-workspace",
    startIn: "documents",
  });
  console.log("[bz] picker returned, saving handle to IDB...");
  try {
    await saveHandle(handle);
    console.log("[bz] handle saved");
  } catch (e) {
    console.warn("[bz] saveHandle failed (continuing):", e);
  }
  return handle;
}

/**
 * Try to restore a previously-picked workspace handle.
 * Returns the handle if permission is already granted, or null if not.
 * Does NOT prompt for permission — permission prompts have to be driven by
 * a user gesture; call ensurePermission() in a click handler if needed.
 */
export async function restoreWorkspace() {
  const handle = await loadHandle();
  if (!handle) return null;
  const mode = { mode: "readwrite" };
  const state = await handle.queryPermission(mode);
  if (state === "granted") return handle;
  // Known handle, but permission not granted yet. Return the handle so a
  // user-gesture handler can re-request permission.
  return { handle, needsPermission: true };
}

export async function ensurePermission(handle) {
  const mode = { mode: "readwrite" };
  let state = await handle.queryPermission(mode);
  if (state === "granted") return true;
  state = await handle.requestPermission(mode);
  return state === "granted";
}

export async function forgetWorkspace() {
  await clearHandle();
}
