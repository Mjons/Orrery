---
mtime: 2025-07-02
---

# Vite setup

Vite 5, vanilla. No React, no TypeScript, no Tailwind. One npm script
each for `dev` and `build`. Deliberately boring — everything exotic
has to earn its keep.

Build output is a single hashed JS bundle plus the HTML. Static hosting
on Netlify for the hosted demo; self-hosters just copy `dist/`.

Bundle cost audit (from memory):

- three.js + post chunks: ~190 kB gzip
- CodeMirror 6 pieces: ~90 kB gzip
- marked + minisearch + ulid + gray-matter: ~40 kB gzip
- Our code: ~30 kB gzip
- Total: ~350 kB gzip — under the 600 kB budget from BUILD_PLAN §4.7

Related: [[three.js stack]], [[CodeMirror 6]].

#stack
