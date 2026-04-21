---
mtime: 2025-09-03
---

# Keyboard first

Every action has a keyboard path. No action is mouse-only except the
one that intrinsically is (alt-drag to link).

Single-letter shortcuts for frequent app actions: `N` new note, `D`
morning report, `Shift+D` dream now, `E` toggle edit mode, `\`
settings, `Shift+F` formations rail, `1`–`5` formations.

We originally used Cmd/Ctrl+N and Cmd/Ctrl+D — those collide with
browser window/bookmark shortcuts and can't be intercepted. Plain
letters gated by the `isEditable` check (so we don't fire in
textareas) works cleanly.

Related: [[No sidebar]], [[First-run experience]] (coachmarks teach
these shortcuts one at a time).

#design #decision
