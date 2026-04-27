---
tended_on: [tag-infer]
created: "2026-04-26T00:00:00.000Z"
---

# HUSH.md — Hide notes from the canvas without moving the file

A "soft archive" surface. Mark a note as quiet → its body disappears
from the universe (no spawn, no physics, no chorus, no dream pairing,
no morning-report participation), but the file stays in the workspace
folder, links to it still resolve, and you can find it from a
dedicated drawer.

Adjacent to but distinct from the existing Weed Archive (which moves
the file to `.universe/archive/YYYY/`). See §1 for why we shouldn't
call this one "Archive" too.

---

## 1. Naming — pick this first

**Recommendation: call it "Hush."**

The word "Archive" is already taken in Boltzsidian — see
[weed.js](../boltzsidian/src/layers/weed.js) `archiveNote`, which
physically moves the file to `.universe/archive/YYYY/`. That's a
heavier, near-irreversible action. The feature in this doc is lighter:
a frontmatter flag, no file move, easily reversed. Two things called
"Archive" with different mechanics will confuse users and us.

Why **Hush** specifically:

- Matches the brand register (dream / quiet / observer).
- Verbs cleanly: "hush this note", "hushed notes".
- Suggests _quieted, not gone_ — exactly the user's intent.
- The dedicated drawer reads naturally as "Hushed."

Other options if you want to bikeshed: `Quiet`, `Sleep`, `Shelve`,
`Hide`. All workable; `Hush` is the only one that doesn't already
mean something else in this codebase or in PKM convention.

The remainder of the doc uses **Hush** throughout.

---

## 2. Mechanism — frontmatter flag

A note is hushed iff its frontmatter contains `hushed: true`. That's
it. No new file, no separate index, no localStorage state, no IDB
table. The note itself is the record.

```yaml
---
id: 01HABCD...
created: 2025-11-03T10:14:00Z
hushed: true
hushed_at: 2026-04-26T14:22:00Z
hushed_reason: "out of date — superseded by [[New approach]]" # optional
---
```

Why frontmatter:

- **Portable.** Open the vault in Obsidian/Logseq tomorrow; the flag
  is just a YAML field. No data lock-in.
- **Single source of truth.** No "is this note hushed?" lookup
  required — the note tells you.
- **Git-friendly.** Diffs cleanly. Restoring is a single-line edit
  even outside Boltzsidian.
- **Composable with existing systems.** The vault parser already
  reads frontmatter; one new field fits the pattern.

`hushed_at` is for sorting the drawer by recency; `hushed_reason` is
optional free text the user can capture at the moment of hushing,
shown in the drawer for context.

---

## 3. What changes when a note is hushed

Affected systems:

| System            | Behaviour when note is hushed                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Body in the field | Not spawned. (Or spawned and immediately removed on the next vault rebuild.)                                                                                                       |
| Physics           | Not in the gravity edge list, not flocked, not dragged.                                                                                                                            |
| Tethers           | Outgoing tethers don't render; incoming tethers from live notes either render dimmer or skip. (See §6.)                                                                            |
| Chorus            | Never picked as an observer source.                                                                                                                                                |
| Dream / salience  | Excluded from candidate pairing. Hushed notes don't dream and aren't dreamed about.                                                                                                |
| Morning report    | Excluded from `pickThings`.                                                                                                                                                        |
| Tend              | Skipped by all passes — no tag-infer, no obvious-link, no stub-detection.                                                                                                          |
| Weed              | Excluded — hushed isn't a prune candidate (the user already made an explicit choice).                                                                                              |
| Search (Cmd+K)    | Excluded by default; searchable behind a "Show hushed" toggle in the strip. (See §5.)                                                                                              |
| Wikilink resolver | Still resolves — `[[Hushed Title]]` from a live note still finds the file. Renders with a "hushed" style (italic + dim) so the user sees it's a link to something currently quiet. |
| Stats line        | Hushed count surfaced as a separate sub-stat, not folded into the main count.                                                                                                      |

The principle: **hushed = invisible to the universe, present on disk
and to wikilinks.**

---

## 4. How the user hushes / un-hushes

Three entry points:

1. **From the note panel header** — a small `Hush` button next to the
   close button. Click → confirm → frontmatter writes, body fades from
   the field over ~600ms.
2. **Right-click a body** → `Hush` in the context menu (sibling to
   the existing actions).
3. **Hotkey** — `Cmd+Shift+H` while a note is focused. Discoverable
   via the hotkey overlay.

Un-hushing happens from the Hushed drawer — a `Restore` button per
row that flips the frontmatter and respawns the body at its last
known position (or near a parent link if the position was never
saved).

There's no bulk-hush from the UI in v1. If a user wants to hush ten
notes at once, they edit the frontmatter directly. (See §9 for the
Tend-integration follow-up.)

---

## 5. The Hushed drawer

A new drawer (mirror of Weed/Tend, lives on the left side per the
panel-watcher pattern). Selector `#hushed-drawer`. Lives behind a
hotkey + a settings entry; not a permanent HUD element.

Layout:

- **Header:** "Hushed · N notes"
- **Filter strip:** search-by-title input. Filter by reason text.
- **List:** one row per hushed note, sorted by `hushed_at` desc:
  - Title (clickable → opens the note panel; the body still doesn't
    appear in the field, but you can read/edit the note)
  - Folder / project root
  - Hushed date (relative: "2 weeks ago")
  - Reason text (if present)
  - `Restore` button (un-hushes + respawns)
  - `Move to archive folder` button (the existing Weed action — gives
    the user an upgrade path from "hide" to "actually archive to disk
    folder")
- **Empty state:** "No hushed notes. Anything you hush will show up
  here, ready to come back."

The drawer is the _only_ surface where hushed notes appear without
being asked for explicitly. Everywhere else they're invisible by
design.

---

## 6. Edge cases

**Backlinks from live notes to a hushed note.** Render dim + italic.
The link still works — clicking it opens the note panel for the
hushed note (which can be edited / un-hushed normally).

**Backlinks from a hushed note to a live note.** Don't render the
tether or count it for physics. The link is in the note's text but
it doesn't pull the live note around.

**Cluster membership.** A hushed note doesn't count for cluster
formation. If a cluster loses members and drops below the cluster
threshold (3+), the cluster dissolves naturally on the next rebuild.
No special-casing.

**Search — the "Show hushed" toggle.** A small chip/checkbox in the
Cmd+K search strip. When on, hushed notes appear in results with the
"hushed" style. Default off so the user isn't surprised by ghost
results.

**Pre-existing `hushed: true` notes on first load.** No migration
needed — the parser reads any frontmatter field. Notes that were
hand-edited to `hushed: true` outside Boltzsidian come up correctly
hushed on next load.

**Hushing a note with active children (promoted ideas).** Doesn't
cascade. The promoted-idea note still references the parent via
`frontmatter.parents`; it just won't see the parent in the field
unless the parent is un-hushed. (No need to nag the user about
orphans — the link still resolves.)

**Editing a hushed note from outside Boltzsidian.** If the user opens
the file in Obsidian/VS Code and removes `hushed: true`, on the next
vault rescan the note un-hushes. Symmetric: adding `hushed: true`
externally hushes it.

---

## 7. Confirmation & undo

Hushing is reversible (one click in the drawer) so the confirmation
modal is unnecessary friction. Use a soft-toast pattern:

- Hush fires immediately.
- A toast appears for 8 seconds: _"Hushed [[Note title]]. Undo."_
  Click Undo → frontmatter reverts.

Same pattern as the existing Weed actions. No modal interrupt.

---

## 8. Visual fade

When a note is hushed, the body shouldn't pop out — it should drift
out. Suggested:

- Body opacity ramps from 1.0 → 0 over 600ms.
- Mass ramps to 0 over the same window so it stops pulling neighbours.
- Tethers fade with their endpoints.
- Once opacity hits 0, body is removed from the GPGPU buffer.

When un-hushed, reverse: spawn at the saved position (or last known),
ramp opacity 0 → 1 over 800ms, mass 0 → its frontmatter mass over the
same.

This makes the transition feel like the note _quieted_, not _got
deleted_.

---

## 9. What's deliberately out of scope for v1

- **Bulk hush from the UI.** Edit frontmatter directly if needed.
  Add a Tend pass in v2 that proposes hushes for stale orphan notes.
- **Auto-hush rules** ("hush anything untouched > 90 days"). Wrong by
  default — destroys spatial memory the user built. Manual only.
- **Per-folder hush** ("hush everything in `archive/`"). Folder
  conventions overlap with the workspace's own `archive/`. Stay with
  the per-note flag.
- **Sub-hush levels** ("partially hushed — visible but not dreamed").
  YAGNI. Hushed is binary.
- **Hush expiry** ("auto-restore after 30 days"). Same reason. If the
  user wanted it, they'd have unhushed it.

---

## 10. Phasing

**Phase 1 — Hush + drawer (one weekend):**

- Frontmatter parser reads `hushed`/`hushed_at`/`hushed_reason`.
- Vault rebuild excludes hushed notes from body spawn.
- Note panel gets the Hush button + Cmd+Shift+H hotkey.
- New `#hushed-drawer` with list + Restore.
- Toast pattern for undo.

**Phase 2 — Polish (one weekend):**

- Visual fade in/out (currently a hard remove on rebuild).
- Backlink rendering (dim italic for hushed link targets).
- Search "Show hushed" toggle.
- Reason field captured at hush time.

**Phase 3 — Tend integration (later):**

- Tend pass: "stub or orphan, untouched > N days" → propose hush.
  User reviews in the standard Tend drawer. Never auto-applied.

---

## 11. Acceptance criteria

Ship Phase 1 when all hold:

1. A user can hush a note with one click + one undo opportunity.
2. The hushed body disappears from the field within one frame after
   the toast clears (worst case).
3. The hushed note doesn't appear in chorus, dream pairings,
   morning report, or default search.
4. Wikilinks from live notes to hushed notes still resolve.
5. The Hushed drawer lists the note with title, age, and a working
   Restore.
6. Restoring respawns the body and it participates in physics again.
7. Editing `hushed: true` in the file outside Boltzsidian hushes the
   note on the next rescan; removing it un-hushes.

---

## 12. The single-sentence framing

A way to say _"keep this, but get it out of my universe"_ — and a
quiet drawer for when you change your mind.

#feature #phase
