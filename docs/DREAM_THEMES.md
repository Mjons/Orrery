---
id: 01KR0000DREAMTHEMES0000000
created: 2026-04-22
---

# DREAM_THEMES.md — Telling the dream what to dream about

Today a dream cycle samples pairs uniformly across the whole vault.
That's great for discovery: surprises happen. It's bad for focus:
when you're in the middle of a project you don't want tomorrow
morning's suggestions to be about travel notes from two years ago.

A **theme** is the user saying "tonight I'm dreaming about X" — X
being a constellation, a folder, a tag, or a project root. The dream
still uses the whole vault as raw material. But every surfaced idea
at morning report time is FOR that theme.

Default is `random`. Themes are opt-in.

---

## 1. What a theme is

A theme is a **selector** — a rule that answers "is this note in the
theme set?" The selectors below compose naturally with existing
Boltzsidian structure:

1. **Constellation.** A cluster, named or ordinal. The cluster's
   `noteIds` set is the theme set. Easiest for the user — they've
   already been looking at the sky region they care about.
2. **Folder.** Every note whose `topLevelFolder` matches.
3. **Tag.** Every note with the hashtag.
4. **Root.** Every note whose `rootId` matches (multi-project vaults).
5. **Random** (default). No filter. Current behaviour.

One theme per dream cycle. No compound themes in v1 — users can
already AND-combine later if it's a real want.

---

## 2. What the theme affects (and what it doesn't)

Dreams have four phases. The theme wants to touch SOME of them, not
all, because the dream's process needs cross-pollination to stay
interesting.

| Phase      | With a theme                                                                              |
| ---------- | ----------------------------------------------------------------------------------------- |
| falling    | Unchanged.                                                                                |
| warming    | Attractor anchors near the theme's centroid (not Lissajous).                              |
| generating | Pair sampling: **at least one parent** from theme set per pair.                           |
| playing    | Rewording / compounding biased toward the theme's vocabulary.                             |
| discerning | Judge keeps only pairs where ≥ 1 parent is in the theme.                                  |
| waking     | Morning report leads with the theme name: "Last night you dreamed about [[Curiosities]]." |

The key decision: **cross-pollination happens at the pair level, not
the surfacing level.** Every surfaced candidate has at least one foot
in the theme. The OTHER foot can come from anywhere — that's the
surprise. A candidate whose parents are BOTH outside the theme is
silently discarded.

### 2.1 Cross-pollination quota

If we're not careful, "at least one parent in theme" collapses to
"both parents in theme" most of the time (since theme members
tether-cluster together during dream, and the attractor anchors
them). That makes the dream incestuous — every suggestion is about
a note the theme already knows about.

Counter: **at least 40% of the generating phase's pairs must have
exactly one parent in the theme (the other from outside).** Sample
accordingly: each pair-spawn tick flips a weighted coin between
"in-theme ↔ in-theme" (60%) and "in-theme ↔ random" (40%).

That keeps the dream reaching outward while still grounded.

---

## 3. The attractor with a theme

[[DREAM_GRAVITY]] specifies the invisible wandering attractor. With
a theme:

- **Warming.** Attractor starts at the theme cluster's centroid.
  Bodies bend toward it; the theme visibly gathers.
- **Generating.** Attractor wanders on a tighter Lissajous whose
  amplitude is `theme.extent * 1.3` (not the default 620). It orbits
  INSIDE the theme cluster's shape, so non-theme bodies feel less
  pull — the theme becomes a local weather system.
- **Playing.** Continues within theme extent. If theme has < 5 notes,
  extent is too tight for interesting motion — fall back to default
  amplitude.
- **Discerning.** Exhale dissolves the local pile; bodies settle
  back. Non-theme notes that happened to be nearby during the cycle
  return toward their normal positions.

Visually: the dream stops being "something's happening somewhere in
the universe" and becomes "something's happening HERE, in this
region I care about."

---

## 4. Selection UI

### 4.1 Settings → Dream → Theme

Dropdown beneath the Gravity + Strength controls. Options:

- **Random** (default, sentinel)
- **— Constellations —**
  - Every non-trivial cluster (≥ 3 members), named or ordinal
- **— Folders —**
  - Every top-level folder in the vault
- **— Tags —**
  - Top 12 tags by usage count (surfaces tag-vocab organically
    without a full taxonomy picker)
- **— Roots —**
  - Each project root when vault has > 1 root

Each entry stores a discriminated-union record:

```js
settings.dream_theme =
  null |
  {
    kind: "constellation" | "folder" | "tag" | "root",
    value: string, // cluster id | folder name | tag | rootId
  };
```

`null` = random.

### 4.2 Dream now submenu

`Dream now` button splits into a dropdown: `Dream now (random)` as
the primary, `Dream about…` as a secondary that opens a mini-picker
identical to the Settings dropdown. Selection is one-shot — the
next dream uses it, then reverts.

### 4.3 Alt+Dream now

Hold Alt while clicking `Dream now` → opens the picker. Same
semantics as the submenu path. Two entry points for the same thing,
both easy to discover by accident.

### 4.4 Remembering across sessions

`settings.dream_theme` persists normally. A user who picks
"claude-sdk" once dreams about it every cycle until they pick
something else or flip to Random. Low-friction, high-intent.

---

## 5. Surfacing filter

The salience layer surfaces candidates at the end of the discerning
phase (see [[DREAM_ENGINE]] §11.6). Add one filter step:

```js
if (theme) {
  const themeSet = resolveThemeSet(vault, theme);
  pool = pool.filter(
    (cand) => themeSet.has(cand.parentA?.id) || themeSet.has(cand.parentB?.id),
  );
}
```

Candidates that had both parents outside the theme get silently
discarded before the judge picks top-K. The judge only sees
theme-relevant survivors.

If the filtered pool is empty (theme was too narrow, or all in-theme
pairs failed critique), morning report says so gracefully: "No
strong ideas landed on [[Theme]] this cycle — the vault didn't have
enough raw material near that region."

---

## 6. Morning report

One new line at the top:

> **Theme:** [[Curiosities]] · 8 of 23 candidates survived

The count gives the user a sense of how fertile the theme is. 8/23
is healthy. 1/23 suggests the theme is either very narrow or not
well-populated yet. 0/23 is the empty-pool case above.

Candidate list rendering stays the same — just filtered to the
surviving set.

---

## 7. Random theme (the default path)

When `theme === null`:

- Attractor wanders the full Lissajous (current behaviour).
- Pair sampling is uniform (current behaviour).
- No surfacing filter.
- Morning report says "Theme: none" or omits the line entirely.

Random means: the dream has no agenda. Surprises can come from
anywhere. The system's working behaviour today.

Intentionally preserved as an option — sometimes the best dream is
the one that ranges freely.

---

## 8. Implementation phases

### Phase A — Theme setter + selector UI · ~1.5 h

- `settings.dream_theme` default `null`.
- Settings → Dream dropdown populates from vault clusters / folders /
  tags / roots.
- Dropdown writes to settings on change.
- No runtime behaviour change yet — just plumbing.

### Phase B — Theme set resolution · ~45 m

- `resolveThemeSet(vault, theme) → Set<noteId>` in a new
  `src/layers/dream-theme.js`.
- Dispatches on `theme.kind`, returns an empty set if the theme
  ref doesn't resolve anymore (cluster id gone, folder renamed).

### Phase C — Attractor anchoring to theme · ~1 h

- `updateAttractor` accepts a `themeCentroid` / `themeExtent` hint
  via a new callback.
- Main.js passes theme centroid (from the theme's cluster) when a
  theme is set.
- Warming phase pins attractor to centroid; generating uses a
  tighter Lissajous keyed to extent.

### Phase D — Pair sampling bias · ~1.5 h

- Salience layer's pair sampler takes a theme set.
- 60% of draws: both parents from theme. 40% of draws: one parent
  from theme, other from full vault.
- When theme is null, 100% uniform (current behaviour).

### Phase E — Surfacing filter + morning report · ~1 h

- Filter pool before judge picks top-K (unless theme is null).
- Morning report leads with theme name + survival ratio.

### Phase F — Dream-now theme picker · ~1 h

- Split `Dream now` into `Dream now (random)` + `Dream about…`.
- Shared picker component with Settings dropdown (extract into a
  small helper).

**Total: ~6.75 hours.** Full day.

---

## 9. Edge cases

- **Theme ref dissolves.** User picked a cluster; next boot the
  cluster id has renumbered or the notes were deleted.
  `resolveThemeSet` returns empty → random behaviour for that
  cycle, toast on wake: `Theme "<x>" not found — dreamed random
instead.`
- **Theme set size < 3.** Too small to cluster meaningfully. Fall
  back to random + toast on dream start.
- **All theme members are in read-only roots.** Attractor still
  anchors there, dreams happen, suggestions surface. The surfaced
  ideas link BACK to read-only members (dream logs are
  writeRoot-only artifacts — no read-only writes).
- **Theme has no neighbours in the graph.** Cross-pollination needs
  "random outside" parents; this works as long as the vault has
  any notes at all. If the vault is JUST the theme, 60/40 quota
  becomes irrelevant, dream surfaces normally.

---

## 10. Interactions with existing features

- **[[LIVE_CLUSTERS]].** If clusters repartition mid-session and the
  theme's cluster id drifts, reconciliation (Phase C of that doc)
  keeps the theme pointed at the same member set via Jaccard match.
- **[[REGIONS]].** A region note is a natural theme — creating a
  region is a first-class way to say "tomorrow night, dream about
  this." Region title becomes theme.value when theme.kind is
  `constellation`.
- **[[BATCH_LINK]].** Orthogonal. Theme doesn't affect linking; it
  affects dreaming.
- **[[DREAM_GRAVITY]].** Theme hooks the attractor to a centroid.
  Without a theme, attractor wanders the whole box.
- **[[MULTI_PROJECT]].** Root-kind themes are the "dream about
  project X" gesture — powerful for users with many roots.

---

## 11. What to deliberately skip

- **Compound themes** (`folder X AND tag Y`). Future polish; most
  users want one axis.
- **Per-theme attractor strength.** One slider is enough.
- **User-curated theme sets** (hand-pick notes into a theme). If
  users want a specific set, they can make a region or apply a tag.
- **Theme-aware salience scoring.** The surfacing filter is enough;
  don't also re-weight salience. Lets the model's instincts stay
  honest.
- **Theme rotation** (dream about theme A on Monday, B on Tuesday,
  etc.). User does this themselves. We're not a calendar.

---

## 12. One sentence

A theme is the user telling the universe which region of the sky
tonight's dream should be about — the whole vault is still raw
material, but every suggestion at morning comes back with its feet
planted in that region.

#dreams #theme #focus #attractor
