---
mtime: 2025-11-02
---

# Phase 1 — read the vault

One week. Walk a folder of markdown, parse frontmatter + titles +
tags + `[[links]]`, lay them out with a force-directed pass, render
one body per note, click-to-open in a read-only panel.

Landed:

- Vault walker + parser (frontmatter, tags, wikilinks, H1 titles).
- One-shot force layout cached to `.universe/state.json`.
- Body rendering with mass-driven size.
- Cmd/Ctrl+K search via minisearch.

Exit gate: "reading a real vault this way should already feel better
than Obsidian's graph view." It did, which was the relief.

Related: [[Phase 0 — scaffold]], [[Phase 2 — write the vault]],
[[Obsidian (the app)]].

#phase #done
