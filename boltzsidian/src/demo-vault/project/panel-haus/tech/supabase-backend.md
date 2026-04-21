---
mtime: 2025-10-22
---

# Supabase backend

Postgres + auth + storage in one. For a solo-dev SaaS this is the
only sensible choice — rolling my own auth in 2026 is insane.

Tables:

- `pages` — per-page content, owner, version stream.
- `panels` — normalised panel records if we ever need per-panel
  queries (we might not).
- `libraries` — collections of pages.
- `shares` — public-share slugs.
- `ai_jobs` — status rows for [[Stability API]] calls.

Row-level security is the whole game. One bad policy = everyone's
comics leak. Policies get their own migration reviews.

Related: [[Svelte stack]], [[Cloud library]].

#stack-ph
