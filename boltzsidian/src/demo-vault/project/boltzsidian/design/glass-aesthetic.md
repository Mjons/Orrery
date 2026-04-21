---
mtime: 2025-06-13
---

# Glass aesthetic

Panels are translucent with a blur backdrop — `backdrop-filter: blur(22px) saturate(140%)`
on a slightly tinted background. The universe shows through the
settings pane, the note panel, the morning report modal.

This is one of two reasons the app doesn't feel like a generic web
app (the other being [[One accent]]).

Trap: on low-end GPUs the blur cost adds up. If we ever hit a
device where it tanks framerate, we degrade to a solid background at
the same colour.

Related: [[One accent]], [[three.js stack]].

#design
