---
id: first-run-flow-2026-04-25
created: "2026-04-25"
---

# FIRST_RUN_FLOW.md — The path from "what is this" to "this is mine"

The journey doc. Where [ONBOARDING.md](ONBOARDING.md) owns the **content
of the welcome vault**, this doc owns the **arc that runs through it** —
the five acts a first-time user lives through, and the nudges that move
them between acts without ever feeling pushed.

Michael's note:

> A first-time user needs their wow moment. They start with the demo
> which explains things via the notes themselves. Then the big moment is
> adding their own folders, then weaving connections, then controlling
> their constellations. Make sure a first-time user goes on this exact
> path and is nudged properly.

The infra is already in place — welcome card, demo themes, coachmarks,
link-drag, constellations layer. What's missing is the **choreography**.
This doc is the choreography.

---

## 0. The five acts

| #   | Act      | What happens                          | Wow lever                                |
| --- | -------- | ------------------------------------- | ---------------------------------------- |
| 1   | Land     | Welcome card. Pick demo or own folder | The card itself looks like a sky         |
| 2   | Wander   | Welcome demo teaches via its notes    | "the app is teaching me by being itself" |
| 3   | Graduate | User opens their own folder           | "**my** notes look like this\*\*"        |
| 4   | Weave    | First link drawn between two stars    | "I just made gravity"                    |
| 5   | Conduct  | First constellation named / curated   | "I'm in charge of the sky"               |

**One rule throughout:** at no act do we ever block, gate, or modal the
user. Every nudge is one element they can ignore. The path is the
default; deviation is fine.

---

## 1. Stage detection (so nudges know where the user is)

We need a single source of truth for which act the user is in. Add a
small derived state in [src/state/](../boltzsidian/src/state/), call it
`firstRunStage`. Each tick it reads:

```js
{
  workspaceKind,           // 'demo' | 'user' | null
  demoTheme,               // 'welcome' | 'astronomer' | 'project' | null
  noteCount,               // total .md in the active vault
  linkCount,               // total wiki-links resolved
  userLinkCount,           // links the user has *drawn this session*
  constellationCount,      // user-named clusters
  msSinceFirstSeen,        // wall-clock since first paint of the universe
}
```

Derived act:

```
1 = no workspace yet
2 = workspaceKind === 'demo' && demoTheme === 'welcome'
3 = workspaceKind === 'user' && userLinkCount === 0
4 = workspaceKind === 'user' && userLinkCount >= 1 && constellationCount === 0
5 = workspaceKind === 'user' && constellationCount >= 1
```

`localStorage.boltzsidian.firstRun.actSeen` records the highest act the
user has reached. We never regress it. A returning user who deletes
their constellations is still in act 5 — they've already had the moment.

Every nudge below is gated on `actSeen < N` so it fires once and
never again.

---

## 2. Act 1 — Land

**Goal:** within 8 seconds, the user is either inside the demo or has
clicked "Open my folder."

**What exists:** [the welcome card](../boltzsidian/index.html#L4727)
with title, blurb, two buttons, three theme radios, an `about` link.

**What changes:**

- Before the buttons, add a single line of micro-copy under the blurb:
  > _Pick the tour if you've never been here. Pick your folder if you
  > already know what you want._
  > Pre-empts the choice paralysis the radio buttons cause.
- The card already looks like a sky thanks to the starfield behind it.
  Verify the starfield twinkle is running on the welcome card route —
  if it's flat we lose the first half-second of atmosphere.
- The "Welcome" radio is already first-run-default. Keep that. Once
  `welcome.seen.v1 === '1'` the default flips to astronomer's notebook
  ([main.js:1079](../boltzsidian/src/main.js#L1079)).
- **Do not add a "skip" or "later" button.** Two real choices is the
  whole UI.

**Anti-pattern:** a tour overlay that points at the buttons. The card is
already three sentences and three options. Pointing at it would be
embarrassing.

---

## 3. Act 2 — Wander (the welcome demo)

**Goal:** the user clicks 3-5 stars, hovers more, and at some point
notices that **the notes themselves are the tutorial**.

**What exists:** the welcome theme ([src/demo-vault/welcome/](../boltzsidian/src/demo-vault/welcome/))
— 11 notes (start-here, reading, hover-labels, searching, new-note,
linking, formations, dreaming, clusters, hotkeys, privacy). Coachmarks
are suppressed when this theme is active (see
[main.js:228](../boltzsidian/src/main.js#L228)).

**What changes:**

### 3.1 Refresh the welcome notes

Every welcome note ends in a verb-leading **Try it** instruction.
Re-read each one as if you are a brand-new user. Cuts to make:

- Any note over 4 sentences in the body should lose a sentence.
- Replace any reference to a hotkey with a link to `[[hotkeys]]` so
  there's one source of truth.
- Verify each "Try it" verb still works — for example, `linking.md`
  promises Alt-drag opens; if Alt-drag now requires a different modifier
  or a different starting state, fix the note.
- Add `id: 01J_welcome_*` IDs to any note still using the auto-generated
  ULID, so positions and tags are stable across reinstalls.

### 3.2 The graduation nudge — earned, not timed

This is the one new nudge in act 2 and it is the doc's most important
sentence. **The graduation prompt fires when the user has opened the
fifth different welcome star, not after a fixed elapsed time.** Time is
the lazy signal; engagement is the real one.

Mechanism:

- Track `welcomeStarsOpened` (Set of note ids) in session state.
- When `size === 5` and `actSeen < 3`, queue a coachmark at the
  bottom-center of the screen (no anchor):

  > _You've got the hang of this. Ready to see your **own** notes as a
  > sky? Press the folder icon, top-left._

- Click-through: the coachmark dismiss button is labelled
  **"Open my folder"** (not the usual "✓"). Clicking it opens the FS
  Access picker directly — `fsPickWorkspace()` is already wired in
  [main.js:1112](../boltzsidian/src/main.js#L1112).
- If the user dismisses without picking, the coachmark is gone forever.
  The folder icon remains; nothing about the demo changes.

Add this coachmark to the LIBRARY in
[coachmarks.js:16](../boltzsidian/src/ui/coachmarks.js#L16) under id
`graduate-to-own`, exempt it from the `welcome` suppression rule (this
is the **one** coachmark the welcome theme allows).

### 3.3 What we don't do

- We do not auto-prompt for a folder after N seconds of demo use.
- We do not show a "you've completed the tour" banner. There's nothing
  to complete.
- We do not lock the user out of acts 3-5 if they ignore the welcome
  vault. The folder button has always been right there.

---

## 4. Act 3 — Graduate (open my folder)

**Goal:** the user picks a folder, sees their own notes float into a
universe, and feels the second wow — _bigger_ than the first because
these stars are theirs.

**What exists:** [`pickUserWorkspace()`](../boltzsidian/src/vault/workspace.js#L88)

- [`setWorkspace()`](../boltzsidian/src/main.js) handle the actual
  folder mount. The first-paint is already the real wow — physics
  settles, labels appear, clusters separate.

**What changes:**

### 4.1 The arrival moment

When `actSeen` transitions from 2 → 3 (i.e. first time a user opens
their own folder, freshly, in this session):

- Camera does a slow 1.5 s wide-pull-back on first paint. Same easing
  as the existing scene transition. Just the camera; physics is normal.
- A single line of micro-copy fades in at top-center for 4 s, then out:

  > _N notes · M existing links. This is your sky._

  where N and M are real counts from the parsed vault. Source of facts
  matters here — if the user has 1200 notes and 0 links the line reads
  honestly; if they have 200 notes and 2000 links the line reads
  honestly. No marketing.

- After the line clears, the next coachmark is queued: see act 4.

### 4.2 What if the user has zero markdown files?

Edge case but not rare — they pointed at the wrong folder. Detect
`noteCount === 0` after parse. Show a non-blocking toast:

> _No markdown files in here yet. Create one and it'll appear, or pick
> a different folder._

The toast has a "Pick another folder" link that re-runs
`pickUserWorkspace()`. Don't fall back to the demo silently — the
user picked this folder for a reason.

---

## 5. Act 4 — Weave (the first link)

**Goal:** the user makes their first link **inside their own vault**
and sees two stars physically pull together. Wow #3.

**What exists:** Alt-drag link gesture in
[link-drag.js](../boltzsidian/src/ui/link-drag.js); the `K` interaction
matrix nudges affinity on link create
([kmatrix.js:35](../boltzsidian/src/sim/kmatrix.js#L35)); the
`alt-drag` coachmark already exists
([coachmarks.js:23](../boltzsidian/src/ui/coachmarks.js#L23)).

**What changes:**

### 5.1 First-link coachmark, properly fired

The existing `alt-drag` coachmark text is generic. For act 4 specifically,
schedule it once with anchor = the first star the user clicks on after
arriving in their own folder:

> _Hold **Alt** and drag from this star to another. They'll pull
> together._

Anchor on click of any star, not on hover (hover would chase). Fires
exactly once when `actSeen === 3` and 8 s have elapsed since arrival
(give them time to look around first).

### 5.2 The pull-together flash

When the user completes their first Alt-drag link in their own vault:

- The two stars get a one-shot **proximity glow** — same radiation
  burst the supernova hook uses, but tuned smaller. Lasts ~1.2 s.
- A toast slides in:
  > _You just bent gravity. Make a few more — once two stars share a
  > tag or a folder, they'll start to clump on their own._

This is the moment we let the meta layer speak. It's earned.

After this, mark `actSeen = 4` and never fire either of the above
again. The user is now a regular user in our minds.

### 5.3 What we don't do

- We don't auto-link inferred connections during act 4. The act is
  about _the user's own_ gesture. Inferred linking
  ([KEYWORD_LINK.md](KEYWORD_LINK.md)) can run, but its results are
  silent until act 5.
- We don't prompt for a tag, folder, or constellation here. One
  gesture, one wow. Don't pile on.

---

## 6. Act 5 — Conduct (the first constellation)

**Goal:** the user names a cluster and feels they've stopped _visiting_
the universe and started _running_ it.

**What exists:** clusters glow today and surface large soft labels at
the right zoom (see [CONSTELLATIONS.md](CONSTELLATIONS.md)); naming and
constellation curation is described in
[CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md).

**What changes:**

### 6.1 The conduct nudge

After the user has drawn ≥ 3 user-links in their own vault and has
zoomed out far enough that at least one constellation label is visible,
fire one coachmark anchored to the largest visible cluster's label:

> _This region of your sky is yours to name. Click the label to call
> it something._

Click handler on the constellation label opens an inline rename
input — same affordance as renaming a star title. On commit, the
constellation's name persists in vault metadata (see
[CONSTELLATION_NAMING.md](CONSTELLATION_NAMING.md) for storage).

### 6.2 The first-name flash

When the user commits their first constellation name:

- The label fades from the auto-generated name to the user's chosen
  name with a slow cross-dissolve (~1.0 s).
- A single line of micro-copy at top-center, 3 s:

  > _**{name}** is now part of your universe. The app remembers._

- Mark `actSeen = 5`. We are done with the first-run arc.

### 6.3 What we don't do

- We don't suggest names. The whole point is the user names it. An
  auto-name rendered as placeholder is fine; an "AI suggestion" button
  is not.
- We don't unlock anything new in the UI as a reward. The reward is
  that they did it.

---

## 7. The path, summarised

```
Land  ─────► Wander ───(5 stars opened)──► Graduate
   │            │                              │
   │            │                              ▼
   │            │                        Folder picker → first paint
   │            │                              │
   │            │                              ▼
   │            └─────────────────────────► Weave (first Alt-drag)
   │                                           │
   │                                           ▼
   └─────────────────────────────────────► Conduct (name a constellation)
```

A user who skips the demo and goes straight to "Open my folder" enters
at act 3 — the graduate moment. Acts 4 and 5 still fire normally. The
nudges are about **what they haven't done yet**, not about which path
they took.

A user who comes back the next day starts in whatever act they reached.
None of the act-1-to-N nudges re-fire.

---

## 8. Things we are explicitly NOT building

- A linear, gated tutorial. Every act is skippable.
- A progress meter. The user does not need a "1 of 5" indicator. The
  acts are invisible to them.
- Modal dialogs at act transitions. Coachmarks and toasts only.
- A "first-run mode" — there is no app state called that, only the
  derived `firstRunStage` value used to gate at-most-once nudges.
- An interactive checklist somewhere in the UI. The vault is the
  checklist; the user can tell what they have or haven't done by
  looking at it.

---

## 9. Risks

- **Engagement signal is wrong.** Opening 5 welcome stars might be too
  many for a quick scanner, too few for a deep reader. We can dial
  this — start at 5, log when the graduate coachmark fires vs when
  users actually pick a folder. If the gap is large in either
  direction, retune. Don't make it a setting.
- **Act 4 fires for users who already have links.** A returning user
  with a fully-linked vault doesn't need "make a link" prompted at
  them. Detection: if `linkCount > 50` at the moment of first paint,
  set `actSeen = 4` immediately. They have past the weave.
- **Act 5 fires too early.** A user with 50 links in one cluster and
  none anywhere else isn't ready to name a region. Gate the conduct
  nudge on the existence of ≥ 2 visually distinct clusters, not just
  link count.
- **Coachmark drift.** If a key changes (`Alt` becomes `Cmd`, etc.),
  every nudge above goes stale. The hotkey overlay and the welcome
  notes both reference a single source — the act-2 / act-4 / act-5
  coachmark texts must do the same. Centralise the modifier names in
  [coachmarks.js](../boltzsidian/src/ui/coachmarks.js).

---

## 10. Minimal first cut

Shippable in two sittings:

1. Add `firstRunStage` derived state and the `actSeen` localStorage key.
2. Track `welcomeStarsOpened` while in the welcome theme; fire the
   `graduate-to-own` coachmark on the 5th unique open. Wire its
   dismiss button to `pickUserWorkspace()`.
3. Arrival camera pull-back + "N notes · M links" line on first paint
   when `actSeen` transitions 2 → 3.
4. Tighten the existing `alt-drag` coachmark text and re-anchor it on
   first-star-click in own folder when `actSeen === 3`.
5. Add the proximity glow + "you bent gravity" toast on first user
   link.
6. Click-to-rename on a constellation label + the "{name} is part of
   your universe" line on commit.

After the first cut ships, watch (locally — no telemetry) which acts
users fall off at when Michael runs them through it. The acts that
work stay; the ones that drag get rewritten or removed.

---

## 11. One sentence

A first-time user opens the welcome card, learns by wandering a
hand-shaped sky, opens their own folder when they're ready, draws a
link and feels gravity, names a region and feels ownership — and at no
point along the way does the app ever ask them to do any of it.

#user #phase #feature
