---
mtime: 2025-11-05
---

# Canvas renderer

The editor surface. HTML canvas + OffscreenCanvas for export. Tried
SVG first — too slow above ~40 elements on a page — and fell back to
canvas.

Hit test for panel interactions uses a separate 1-channel "id canvas"
drawn in parallel: render each panel with a unique colour keyed to
its id, pick pixel at cursor, read id. Ten-line trick, saves a lot
of geometry math.

For [[Export formats]] the renderer reruns at the target DPI into an
OffscreenCanvas and pipes the raw pixels to `ag-psd` for the PSD path.

Related: [[Svelte stack]], [[AI panel layout]].

#stack-ph
