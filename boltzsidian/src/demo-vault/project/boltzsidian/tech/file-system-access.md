---
mtime: 2025-08-10
---

# File System Access

The only workable way to let a web app read and write a real folder
without uploading anything. Chromium-only for now; Firefox and Safari
have opposed the spec.

Flow:

1. `showDirectoryPicker({ mode: 'readwrite' })` — user grants once.
2. Persist the returned `FileSystemDirectoryHandle` to IndexedDB so
   we can re-access on reload.
3. Reload → `queryPermission` / `requestPermission` — permission has
   to be re-granted in a user gesture.

Unsupported browsers are told to use Chrome / Edge / Arc / Brave, or
the demo vault which runs via [[OPFS sandbox]].

Related: [[three.js stack]], [[Phase 1 — read the vault]].

#stack
