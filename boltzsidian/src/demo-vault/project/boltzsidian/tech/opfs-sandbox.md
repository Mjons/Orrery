---
mtime: 2026-02-02
---

# OPFS sandbox

Origin Private File System — the browser-local filesystem every tab
has access to without permission prompts. We use it as the sandbox
for the demo vault.

Why not just bundle a demo folder? Because the demo vault has to be
_writable_. A user should be able to edit a demo note, alt-drag links,
and see the changes persist. OPFS gives us that without touching the
user's disk.

On install, we unpack the bundled markdown files into OPFS and drop a
`.demo-installed` sentinel that records which theme was installed.

Related: [[File System Access]], [[First-run experience]],
[[Phase 3.5 — first run]].

#stack
