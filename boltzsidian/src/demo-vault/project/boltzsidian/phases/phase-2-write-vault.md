---
mtime: 2025-12-14
---

# Phase 2 — write the vault

One week. The app starts writing: CodeMirror 6 in the note panel,
300 ms autosave, `[[` autocomplete, Cmd/Ctrl+N for new notes, rate-
limited file renames when a title changes, and transactional link
rewrites when renames happen.

Landed:

- CM6 integration ([[CodeMirror 6]]).
- Atomic writes via FS Access `createWritable`.
- Title → filename rename debounced to 1/min per note.
- Incoming-link rewrites on title change.
- Frontmatter auto-maintenance for `id` + `created`.

Exit gate was the editor feel — 60% of the product's daily usability.
Got it right on the second pass.

Related: [[Phase 1 — read the vault]], [[Phase 3 — physical linking]].

#phase #done
