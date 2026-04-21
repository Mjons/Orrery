---
mtime: 2025-09-22
---

# CodeMirror 6

The editor inside the note panel. Markdown language support, custom
autocompletion extension for `[[wikilinks]]`, dark theme matched to
the glass aesthetic.

Why CM6 not a textarea: we need the link autocomplete and a proper
undo stack. `markdown()` gives us fenced code blocks and headings for
free. The bundle cost (~90 kB gzip) is worth it.

Integrated in [[Phase 2 — write the vault]] — this is where editing
stopped being a stub and started being the daily driver.

Related: [[three.js stack]], [[File System Access]].

#stack #decision
