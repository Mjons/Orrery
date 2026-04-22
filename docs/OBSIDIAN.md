---
id: 01KPS9CFDGHZCHTKVJP1792738
created: "2026-04-21T20:01:50-04:00"
---

# OBSIDIAN.md — The Vault as Seed Corpus

A speculative design doc. [[BOLTZMANN]] sketched a meaning layer where stars
carry memories and interact. That doc left one thing open: _where do the
memories come from?_ Template Mad-Libs are fine for a demo, but the payoff
is higher if the memories are **real** — the user's own notes, loaded into
the physics, stirred, re-collided, read back.

Obsidian is the obvious fit. It's a local folder of markdown files with a
graph already baked in.

Nothing here is a plan. It's a map of how the vault and the sim could talk.

---

## 0. Why Obsidian specifically

- **It's already a graph.** Notes are nodes; `[[wikilinks]]` are edges.
  Obsidian has spent a decade being the file format everyone agreed on.
- **It's local.** No API key, no cloud, no auth handshake. A directory path
  is the entire integration surface.
- **The user already curated it.** Unlike a scrape or a chat log, the vault
  is _deliberate_. Every note is there because someone decided it should
  be. That's exactly the signal we want driving the meaning filter.
- **Frontmatter is a free typing system.** YAML at the top of each file is
  enough to carry kind, mass, palette channel, affinity tags — no schema
  migration required.

---

## 1. The mapping

| Obsidian                   | Sim                                               |
| -------------------------- | ------------------------------------------------- |
| Note                       | One star (kind 0) — or one galaxy, if it's big    |
| `[[wikilink]]`             | Hebbian bias on K between the two notes' kinds    |
| Tag (`#idea`, `#question`) | Kind assignment (see §3)                          |
| Folder                     | Galaxy / scene cluster                            |
| Backlink count             | Mass (salience)                                   |
| File mtime                 | ageNorm (recency of "rehearsal")                  |
| Frontmatter `affinity:`    | The 8-float affinity vector from [[BOLTZMANN]] §5 |
| Daily note                 | The scene's "now" — high-mass, short-life         |
| Canvas file                | Saved viewpoint + pre-placed body layout          |

The vault is already almost structured this way. We just read it.

---

## 2. Three integration routes

Ship the easiest first. Keep the interface stable so later ones drop in.

### 2.1 File-drop (ship this first)

The simplest honest version:

- User drags a folder onto the sim (or points at one via the File System
  Access API in Chromium).
- We recursively read `*.md`, parse frontmatter + links + tags.
- Each note becomes a body seeded by its metadata.
- A button: **Re-sync vault.** One-shot, not reactive.

Pros: no plugin, no install, no cross-origin grief. Works offline. Runs in
the existing single-HTML build.

Cons: no live updates. User has to re-sync after editing.

### 2.2 Watcher via local bridge

A tiny local helper (single Node script, ~50 lines) that watches the vault
and pushes diffs over a localhost WebSocket. The sim subscribes.

- Edit a note → its star's affinity drifts.
- Add a link → a K-bias edge lights up, visible as a momentary gravitational
  tug between the two bodies.
- Delete a note → the star's mass bleeds out over ~1 minute of sim-time,
  then it radiates off.

Pros: live. Feels like the vault is breathing.

Cons: breaks the single-file invariant. Needs a companion process. Only
worth building if §2.1 felt alive.

### 2.3 Obsidian plugin

A proper plugin in the vault that embeds the sim in a pane. Writes back
sim-generated ideas as new notes in a `universe/` subfolder.

Pros: bidirectional, discoverable via Obsidian's plugin marketplace, other
people could use it.

Cons: this is a whole project. Defer.

---

## 3. Parsing the vault into physics

### 3.1 Note → body

Per note, derive:

```
position     = f(graph layout, e.g. Obsidian's force-directed coords or folder path)
mass         = 1 + backlink_count * w_b + length_in_words * w_l
kind         = from tag (#episode→star, #fact→planet, #person→galaxyB, ...)
                or, if no tag, from file location
ageNorm      = 1 - normalize(mtime, now)
affinity_vec = from frontmatter, else hashed from tags, else zero
seed_text    = first 200 chars or the note's "summary::" dataview field
```

The defaults matter. A vault with zero tags and no frontmatter should still
load and look like a universe, just a less-differentiated one.

### 3.2 Link → K-bias

Links don't map to a single particle-particle force (we don't have O(n)
per-pair shaders). They map to K, the 7×7 interaction matrix, via
accumulation:

```
for each [[a → b]]:
    K[kind_a][kind_b] += η_link
```

With decay. This is the Hebbian update from [[BRAIN]] §3.2 but _seeded from
the vault's already-discovered associations_ instead of learned from sim
time. Your existing notes give us a warm-start K matrix for free.

### 3.3 Tags → palette

A named tag (`#grief`, `#work`, `#music`) maps to a palette channel or a
tint override. Notes with a tag glow that color. Visually: tag-clusters
appear as same-colored nebulae.

### 3.4 The daily note is the camera

Today's daily note is special: high mass, short lifetime, camera drift
biased toward it. This gives the sim a _now_. When the date rolls over, the
previous day decays to a normal star.

---

## 4. Closing the loop

This is where it gets interesting. The sim doesn't just _read_ the vault —
it writes back.

### 4.1 Promoted ideas become notes

[[BOLTZMANN]] §5 described an idea being promoted when its meaning-score
crosses threshold. When that happens:

- A new markdown file is written to `universe/ideas/YYYY-MM-DD-HHMM-<slug>.md`.
- Frontmatter records: `parents:` (the two note paths whose stars
  collided), `resonance:`, `score:`, `seed_text:`, `scene:`.
- Body is the generated utterance + a short block quote from each parent.

Over weeks, `universe/ideas/` becomes a log of what the universe has noticed
about your vault. Most of it will be junk. The good ones you'll drag into
your real notes and the link will survive; the rest you'll leave to decay.

This is the _second_ meaning filter — you. The sim surfaces candidates; you
ratify.

### 4.2 Observer captions as daily-note dispatches

The Boltzmann-observer chorus is too noisy to store in full, but the
highest-scoring utterance each day can append to the daily note as a
`> universe says:` quote block. Lightweight, auditable, easy to ignore or
grep for later.

### 4.3 Canvas as viewpoint exchange

Obsidian Canvas files are a JSON-y graph layout format. Two directions:

- **Canvas → sim**: load a Canvas as a pre-placed scene. Each card becomes
  a body at its canvas position.
- **Sim → Canvas**: export a saved viewpoint + its visible bodies as a
  Canvas file. Now the sim's "snapshots" are first-class Obsidian notes you
  can link to.

---

## 5. Privacy and trust

The vault is intimate. This matters more here than anywhere else in the
project.

- Default to **read-only**. Write-back (§4.1) is off until the user opts in,
  per-folder.
- Everything stays local. No note content ever leaves the machine unless
  the user picks the Claude-API utterance path ([[BOLTZMANN]] §4.3), in
  which case we send snapshots, not full notes, and we tell them exactly
  what's going in the payload.
- A `.universeignore` file in the vault root, globbed like `.gitignore`,
  excludes folders from the scan. Default-ignore `private/`, `journal/`,
  `therapy/` if they exist — err on the side of not touching sensitive
  content.
- Provide a **dry-run** toggle that parses and scores but doesn't write
  anything. Useful for trust-building on the first run.

---

## 6. What this unlocks that nothing else does

- **The sim stops being a toy and becomes a mirror.** The things you've
  already written about, already linked, already cared about enough to take
  a note on — those are the bodies. The physics is the surprise. The
  collisions are the insights.
- **Forgetting becomes visible.** A note you haven't touched in two years
  has high ageNorm and starts drifting to the halo. You see your own
  neglect as a literal gravitational outskirts.
- **Your vault gets critiqued by its own geometry.** If your #work cluster
  and your #art cluster never interact no matter how long the sim runs,
  that's a diagnostic. The meaning filter is refusing to promote
  cross-cluster ideas because there aren't any edges for it to find.
- **It's a writing prompt generator that knows you.** Promoted ideas are
  what's latent in the gaps between what you've already written. That's the
  kind of prompt that actually generates writing.

---

## 7. Minimal first cut

Shippable in an afternoon:

1. Add a **Load vault** button in the left rail. File System Access API;
   falls back to `<input webkitdirectory>`.
2. Walk the directory, parse markdown + frontmatter + `[[links]]` + `#tags`.
   Use a tiny regex parser — no full markdown AST needed for seeding.
3. Emit a scene from the parsed graph: one body per note, kind from tag,
   mass from backlink count, position from a 2-pass force layout of the
   link graph (reuse any off-the-shelf force-graph lib, or just do one
   Barnes-Hut pass ourselves).
4. Tint by tag via an existing palette channel.
5. No write-back. No meaning filter. No Boltzmann observers yet.

That alone — _my actual notes, as a universe_ — is worth the afternoon.
Everything else layers on top if the first sight of it lands.

#user #feature #phase
