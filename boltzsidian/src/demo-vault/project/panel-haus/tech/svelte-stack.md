---
mtime: 2025-10-15
---

# Svelte stack

SvelteKit + TypeScript. Different stack from [[Boltzsidian]]
(vanilla + three.js) because the app has a different shape: forms,
dashboards, auth flows, paid upgrade paths. Svelte's components-with-
reactive-state model fits that kind of app better than hand-rolling it.

Deploy target: Cloudflare Pages. SSR for the public pages, SPA for
the editor itself.

TypeScript here but not in [[Boltzsidian]] — deliberate split. Panel
Haus has a public API and paying users; types pay for themselves.
Boltzsidian is one-user art-code.

Related: [[Supabase backend]], [[Canvas renderer]].

#stack-ph
