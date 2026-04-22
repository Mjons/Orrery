# CONSTELLATION_ANCHORS.md — User-declared constellations from a single note

Companion to [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) and
[REGIONS.md](REGIONS.md). Triggered by Michael's ask while looking at
a cluster where the heaviest-node heuristic named the region
"Caffeine Content Reference Chart" but he wanted it to read as
**Panel Haus**.

Everything upstream of this doc tried to make the detector smarter.
This one shortcuts: **let the user pick the anchor note, and render a
constellation from it.** A toggle on the note, like pinning.

---

## 0. The gesture in one sentence

A small icon in the note panel header — sibling of the pin icon. Tap
it: this note becomes a constellation anchor. Its title floats over
the cluster at wide zoom. Tap again: gone.

---

## 1. What it is

A **constellation anchor** is a single note the user marks as
"this note names the region around it." It's the lightest-weight
possible answer to "I want that cluster to read as Panel Haus."

- **One note declares it.** No dragging, no lassoing, no separate
  model object. Just a flag on an existing note.
- **Label renders at the anchor's position** (not a computed
  centroid). Predictable — the anchor note is already placed where
  the user put it, so the label lands where the user expects.
- **Name defaults to the note's title.** Editable inline; stored as
  `constellation_name` in frontmatter if different from `title`.
- **Toggleable per note** (icon) and globally (setting).

This is deliberately _not_ a region in empty sky ([REGIONS.md](REGIONS.md))
and _not_ a rename of an emergent cluster
([CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) §1.2). Those still
exist alongside it.

---

## 2. The icon

Lives in `note-panel` header, right of the pin icon.

```
 [ pin ] [ anchor ] [ edit ] [ close ]
```

States:

- **Off (default)** — outlined glyph. Tooltip: "Make this note a
  constellation anchor."
- **On** — filled + accent color. Tooltip: "Remove constellation
  anchor."

Glyph: small four-point star (✦) or circled dot. Not a pin — pin
already means "don't move this note in physics."

Click flips the frontmatter flag and forces a render. No dialog, no
confirmation. Reversible.

---

## 3. What renders

At wide zoom, every note flagged `constellation: true` emits one
label at its own on-screen position. Same haze + font as emergent
constellations, with two differences:

1. **Earlier reveal.** Show at a lower zoom ratio than emergent
   ones (say 2.5 vs 3.5). The user asked for this label
   deliberately, so it shouldn't hide as aggressively.
2. **Small leading glyph.** A ✦ or ★ in front of the name so it
   reads as intentional, not detected. Optional — ship without if
   the visual noise feels wrong.

At close zoom both kinds of label fade; nothing special.

---

## 4. Composition with emergent constellations

The two systems coexist. Rule when they collide:

| Situation                                      | Behavior                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Anchor lives inside an emergent cluster        | Emergent label suppresses; anchor wins. One label per region, the intentional one. |
| Two anchors inside the same emergent cluster   | Both render. User explicitly asked for two names in one region — respect it.       |
| Anchor with no nearby emergent cluster         | Anchor renders alone.                                                              |
| Emergent cluster with no anchors (the default) | Unchanged — current dedupe + disambiguate pass runs as today.                      |

Suppression uses membership: if a cluster contains any note flagged
`constellation: true`, `constellations.js` skips emitting the
emergent label for that cluster. Zero new data structures.

---

## 5. Persistence

Lives in the note's **frontmatter**. Same mechanism as `pinned`:

```yaml
---
id: 01KPRD9Z4H3PWQTHMGM084F3S8
title: Panel Haus
constellation: true
constellation_name: "Panel Haus Universe" # optional; omit to use title
---
```

Rules:

- `constellation: true` is the flag. Anything falsy (absent, false)
  = not an anchor.
- `constellation_name` is only written when the user renamed _away_
  from the note title. Clearing the name deletes the field and the
  label falls back to `title`.
- If the note is deleted, its anchor vanishes automatically — no
  orphan pointers.
- If the note is renamed (title changed) but `constellation_name`
  is set, the override wins.

**Why frontmatter, not a sidecar JSON.** This feature is about one
note declaring itself special. That declaration belongs _with_ the
note — moves with it, survives vault moves, is human-readable, and
composes with any other Obsidian-compatible tool the user uses.
Sidecar JSON is right for regions that don't belong to any single
note ([REGIONS.md](REGIONS.md)) and for override metadata that
shouldn't pollute note text (CONSTELLATION_NAMING.md §5). This one
belongs on the note.

---

## 6. Settings

A single global toggle in Settings → Display:

```
☑  Constellation labels (emergent)
☑  Constellation anchors (user-declared)
```

Both default on. Turning off the anchor toggle hides every
user-flagged constellation without clearing the frontmatter flags —
frontmatter is the source of truth; display is a view.

Setting key: `show_constellation_anchors: true`. Parallel to
existing `show_constellations`.

---

## 7. Interaction — rename

Reuse the existing inline rename from §2 of CONSTELLATION_NAMING.md
(already implemented in `ui/constellations.js`):

- **Double-click** label text → inline edit.
- **Enter** → writes `constellation_name` to the anchor's
  frontmatter if different from title, or deletes the field if the
  new value equals title.
- **Escape** → cancel.
- **Empty commit** → deletes `constellation_name`; label falls back
  to title.

The rename path for anchors is separate from the Jaccard-matched
rename path for emergent clusters. Anchors map 1:1 to a note by id;
no member-hash reconciliation needed.

Right-click behavior: _remove anchor_. Confirms in-line ("Remove
constellation anchor for Panel Haus?"). Equivalent to flipping the
header icon to off.

---

## 8. Edge cases

- **Two notes with the same title both become anchors.** Labels
  render separately at their respective positions. If they collide
  visually, the §1.1 dedupe pass applies — disambiguate with
  tag/folder/ordinal, or merge-badge if they sit on top of each
  other. Anchors flow through the same pipeline as emergent
  clusters for collision handling.
- **Anchor note is unpinned and drifts far from its original
  cluster.** The label follows it. That's correct: the label is
  tied to the note, not a region. If it looks wrong, the user
  either pins the note or removes the anchor.
- **User turns the feature off globally, then deletes a flagged
  note.** The flag is still in frontmatter until deletion. Nothing
  special to clean up.
- **Anchor is the only note in its folder.** Fine — the label just
  names itself. One-note "constellations" are legal under this
  model; they're really just "named pinned notes."

---

## 9. Implementation sketch

Files touched:

- **`vault/frontmatter.js`** — extend parser to recognize
  `constellation` (boolean) and `constellation_name` (string).
  Already parses arbitrary YAML keys, so the change is at the
  consumer, not the parser.
- **`vault/vault.js`** — when building the in-memory note, expose
  `note.constellation = !!fm.constellation` and
  `note.constellation_name = fm.constellation_name || null`.
- **`ui/note-panel.js`** — add the anchor icon to the header.
  Click handler calls `vault.mutations.setConstellationAnchor(note,
on)`, which writes frontmatter and triggers a re-render.
- **`vault/mutations.js`** — add `setConstellationAnchor(note,
on)` and `setConstellationName(note, name | null)`. Standard
  frontmatter write path.
- **`ui/constellations.js`** — in `update()`, before the emergent
  loop, iterate `vault.notes.filter(n => n.constellation)` and
  push each as an anchor entry with its world position →
  projected screen coords. Then run the suppression rule (§4):
  any emergent cluster containing an anchored note is skipped.
  Combine anchor entries + remaining emergent entries, feed the
  same disambiguate-and-render pipeline.
- **`state/settings.js`** — add `show_constellation_anchors: true`.
- **Settings panel** — one toggle, labeled as in §6.

No physics changes. No shader changes. Pure frontmatter + DOM.

Estimated: half-day for the whole thing, most of it in the icon
styling + frontmatter write path.

---

## 10. What's deliberately NOT here

- **Multi-note anchors** ("these 5 notes together form this
  region"). That's REGIONS.md territory.
- **Anchor hierarchies** (an anchor inside another anchor's
  region). Same reason CONSTELLATION_NAMING.md §7 excludes nested
  names — the zoom-cross-fade can't support two layers.
- **Auto-suggest anchor candidates** ("this hub note could be an
  anchor"). Possible later via the librarian, but not v1.
- **Custom icons or colors per anchor.** Tint follows the anchor's
  folder like any other label. Keeps visual consistency.

---

## 11. Relationship to the other two docs

Three overlapping ways to give the user control:

| Doc                                                | Mental model                              | Weight   |
| -------------------------------------------------- | ----------------------------------------- | -------- |
| [CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) | "Fix the emergent label I see right now." | Lightest |
| **This doc**                                       | "Let me pin a note as a region's name."   | Light    |
| [REGIONS.md](REGIONS.md)                           | "Give me a draggable region node."        | Heaviest |

CONSTELLATION_NAMING.md operates on what the detector already
found. This doc lets the user declare a constellation from a note
they care about. REGIONS.md lets them place a region as a
first-class body anywhere in space, even with no members.

Ship the CONSTELLATION_NAMING.md §1.1 pass (done), then this one,
then reassess whether REGIONS.md is still needed.

---

## 12. Minimal first cut

Shippable in one sitting:

1. Add frontmatter fields to the parser + `note` object.
2. Add the anchor icon to the note panel header. Wire click to
   mutation.
3. In `constellations.js update()`, enumerate anchor notes first;
   suppress emergent clusters containing any anchor.
4. Skip the suppression rule in v1.0 if it's fiddly — just let
   both render, and let the §1.1 dedupe pass sort out collisions.
   Add suppression in v1.1 if the double-label bugs the user.

Skip settings toggle, right-click removal, and leading glyph for
v1. Icon click + rename on double-click covers 95% of the use.

---

## 13. One sentence

The detector guesses; the user can now declare — tap a star, it
becomes a constellation, and the region bears the name the user
actually thinks of it by.
