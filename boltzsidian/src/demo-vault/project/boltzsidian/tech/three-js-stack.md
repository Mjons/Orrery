---
mtime: 2025-07-14
---

# three.js stack

Direct three.js r160 via npm, no React-Three-Fiber, no Babylon. Plain
WebGL2. GPGPU compute for physics stays available if we ever need it
(the sibling sim project uses it); bodies layer currently runs CPU
integration because the note counts are too small for GPU to pay off.

Key pieces we lean on:

- `THREE.Points` + custom shader material for stars.
- `OrbitControls` for camera.
- `LineSegments` for tethers; the preview line for alt-drag uses a
  minimal custom shader that matches the accent.
- `navigator.storage` (not three.js but) for OPFS.

Decisions: [[One accent]], [[Glass aesthetic]].

Related: [[Phase 0 — scaffold]].

#stack #decision
