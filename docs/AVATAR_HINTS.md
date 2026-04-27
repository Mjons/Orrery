---
created: 2026-04-25
status: brainstorm
---

# AVATAR_HINTS.md — The avatar quietly teaches the app

The avatar today
([model-face.js](../boltzsidian/src/ui/model-face.js)) is a silent
weather system — it expresses, never speaks. Coachmarks
([coachmarks.js](../boltzsidian/src/ui/coachmarks.js)) speak, but they
live as detached tooltips with no persona behind them. This doc
proposes wiring the two together: **the avatar gains a one-line speech
register** and becomes the primary surface where hotkey tips and
gesture hints land.

The doc also fixes the open question in
[CONNECT_QUERY.md §Open questions](CONNECT_QUERY.md) — "where does the
hint live?" — by placing it in three loci of escalating assertiveness.

## The opinion

A hint that sits in a settings panel is dead. A hint that pops up at
random is a notification. A hint that the _gentle giant cloud watching
your notes_ murmurs at you while you're stuck — that's the same person
who already snarks at your stale drafts during chorus runs. He earns
the right to teach because he's already a character in the room.

## Style invariants (must inherit from FACE_EXPRESSIONS.md)

- The avatar is **weather, not a notification**. Lingers, doesn't
  snap.
- Tips ride on top of the current expression. A tip never replaces
  `idle` / `dreaming` — it overlays, then dissolves.
- One accent. The speech bubble uses `--mface-glow` (which already
  tints by current backend) for its border, never a new colour.
- Always behind the bodies in z-index. The bubble can sit slightly in
  front of the cloud, but the cloud never gets pulled to front.
- Dismissable instantly. Esc kills the current bubble; clicking it
  marks the hint dismissed-forever (same persistence the coachmark
  layer already uses).

## The new register

Add ONE expression beat to the avatar: **`murmuring`**. Visually:

- Cloud breathes 0.5× normal speed for the duration (slow exhale).
- Eyes drift to the gesture's anchor point in screen space (where the
  user's gaze should go — the search strip, the panel header, the
  hotkey).
- A small speech-glyph (a soft scribble blob, NOT a comic-style
  triangle bubble) appears flush with the cloud's edge, holding ONE
  line of text in the same scribble font.
- Glyph fades in over 700ms, holds for hint duration, fades out over
  900ms. No sliding, no popping.

The glyph is the avatar's body extending — same scribble strokes,
same anti-aliased bloom — so it reads as _the cloud thinking out
loud_, not a tooltip clipped onto it.

## Where the CONNECT_QUERY hint lives (the decision)

Three loci, ordered by how hard they nudge:

### 1. Passive — empty-state line in the search strip

When `Cmd+K` opens with an empty input, the existing summary slot
([search.js](../boltzsidian/src/ui/search.js)) shows:

```
search the universe       try: connect notes mentioning A, B, C
```

Right-aligned, dim (`--text-faint`). Always visible to anyone who
opens the strip. Costs nothing, teaches nobody who skims past it.

### 2. Reactive — avatar murmur on stuck signals

The avatar surfaces the hint _once_ when stuck behavior is detected:

- User typed two queries in a row that returned zero hits, OR
- User typed a query of ≥ 4 words that returned ≤ 2 hits (suggests
  they're trying to describe a region, not find one note).

After a 1.5 s settle (so it doesn't race the user's next keystroke),
the avatar drifts its eyes to the search strip and murmurs:

> _try `connect notes mentioning …`_

Hold 8 s, fade. Auto-dismissed if the user starts typing again.
Marked permanently dismissed once shown — the user has now seen it
in the moment they could use it. That's the only chance the avatar
gets.

### 3. Discoverable — hotkey overlay

The existing
[hotkey-overlay.js](../boltzsidian/src/ui/hotkey-overlay.js) gets a
new entry:

```
Cmd+K then "connect …"   batch-link by free text
```

Ground truth lives here. Anyone who's been told to "press ?" (or
whatever the overlay key is) can find it.

This three-tier pattern generalises — see "Generalising" below.

## Generalising — the avatar as hint surface

Once the murmur exists, every hotkey tip currently in
[coachmarks.js LIBRARY](../boltzsidian/src/ui/coachmarks.js) becomes
a candidate to migrate. Instead of detached coachmarks anchored to
geometry the user has to find, the avatar _points_ to the geometry
and says the line.

Migration mapping:

| coachmark id     | trigger condition                              | avatar anchor  |
| ---------------- | ---------------------------------------------- | -------------- |
| `click-to-open`  | 30 s idle, never opened a note this session    | nearest body   |
| `cmd-n`          | user has been reading 60 s, never written      | strip area     |
| `alt-drag`       | user just opened two notes in 30 s             | between bodies |
| `right-click`    | user created a manual link in last minute      | a tether       |
| `cmd-k`          | user is hunting (clicking around) for ≥ 45 s   | strip area     |
| `settings-slash` | first session, after 4 minutes of use          | rail edge      |
| `pin`            | user has dragged the camera away while reading | open note      |

Old detached coachmarks stay as a fallback path — if the avatar mount
isn't available (Studio mode strips it
[per index.html](../boltzsidian/index.html)), the existing tooltip
layer kicks in.

## Voice

Distinct from the chorus and dream voices already in
[local-backend.js](../boltzsidian/src/layers/utterance/local-backend.js).
The chorus is snarky, the dream is drifting — the murmur should be a
third register: **patient, low-stakes, slightly amused.**

Examples:

- _try `connect notes mentioning …`_
- _press N to write where you're looking_
- _alt-drag binds two stars together_
- _press \ for settings_
- _the tether is right-clickable_

Rules:

- ≤ 9 words. Anything longer becomes a dialogue and the avatar isn't
  here for a dialogue.
- Lowercase, one technical token allowed (the keystroke, the slash
  command).
- No exclamation, no second person scolding ("you should…"), no
  meta-tip ("here's a hint:").
- Never invents app behaviour — every murmur is a literal echo of a
  shipped gesture in the hotkey overlay.

These lines are **template-only** for v1. Don't route them through
the local LLM — they're tips, not utterances, and the chorus voice's
snark is wrong for teaching. Generated tips are a v2 question and
probably the wrong question.

## Frequency cap

The avatar can become a clown if it murmurs every minute. Caps:

- **At most one murmur per 5 minutes** of active session, regardless
  of how many tip conditions fire.
- **At most three murmurs per session.** After three, even if more
  tip conditions fire, the avatar stays silent. The user has been
  taught what they're going to be taught.
- **Never during active typing** (note panel focus, search strip
  focus, settings open).
- **Never during dream phase** with high sleep depth — the avatar's
  mood is wrong for teaching while it's dreaming.
- **Never overlapping a chorus or dream caption.** If a caption is
  in flight, the murmur queues; if more than 30 s has passed by the
  time the slot opens, the murmur is dropped (the moment is gone).

These caps are conservative and that's deliberate. A teach-once-and-
shut-up model is much harder to get wrong than a teach-continuously
model.

## Implementation sketch

Hooks already exist; this is mostly wiring.

### New API on the avatar

```js
modelFace.murmur({
  text: "try `connect notes mentioning …`",
  anchor: "search-strip" | "body:<id>" | "tether:<id>" | { x, y },
  ttlMs: 8000,
});
```

Internally: enqueues, applies the cap rules, then plays the
`murmuring` beat with the speech-glyph element bound to the anchor's
on-screen position.

### Trigger module

A small `hint-triggers.js` watcher in `ui/` that:

1. Subscribes to the existing event flow (search input, vault
   mutations, drag end, idle ticks).
2. Maintains the per-hint trigger conditions table.
3. Calls `modelFace.murmur(...)` when a condition fires AND the
   coachmark hasn't already been dismissed.
4. Marks the hint dismissed in the same `localStorage` key
   coachmarks already use, so the two systems share state — a
   user who dismissed `cmd-k` in v1 doesn't get murmured at in v2.

### Speech-glyph element

A new SVG path inside the `model-face` container. CSS-positioned
relative to the cloud, with a `data-anchor-x` / `data-anchor-y`
attribute updated each frame to follow whatever DOM element the
murmur is anchored to. Eyes drift toward the same coordinates via
the existing eye-track machinery.

### Voice strings

Centralised in `hint-triggers.js` — small dict, no per-locale
plumbing, plain English. Tips are a small finite set; a translation
layer is YAGNI.

## Why not just keep coachmarks separate

Coachmarks today are correct but anonymous. They could be the OS
giving you advice. The avatar IS the app's voice — chorus, dream,
idea-seed all flow through him. Letting him also do hints means:

- One persona, three registers (snark / dream / murmur), instead of
  one persona plus a disembodied tip system.
- The user's eye is already drawn to the avatar during expression
  beats; we leverage existing attention instead of fighting for new.
- The tip is a _character moment_, not a popup. That makes dismissal
  feel less rude (the cloud went back to dreaming) and the tip more
  memorable.

## Open questions

- **Studio mode.** If the avatar is hidden in Studio
  [per CLAUDE.md performance budgets](../boltzsidian/CLAUDE.md), the
  fallback to detached coachmarks is the right call — but should
  Studio mode suppress hints entirely on the theory that a Studio
  user already knows the app? Probably yes. Worth a settings toggle.
- **Welcome vault collision.** The welcome tutorial vault already
  IS the coachmark surface
  [per coachmarks.js comment](../boltzsidian/src/ui/coachmarks.js#L82-L84) —
  the murmur path needs the same isSuppressed gate so the tutorial
  vault doesn't get a second teaching layer on top.
- **Dismissal vs. snooze.** "Dismiss forever" is the current model.
  A user who didn't catch the murmur in 8s might want it back. A
  Settings → "show me a hint" button that picks the next undismissed
  one and plays it on demand could be a nice escape hatch.
- **Anchor for an off-screen target.** If the search strip is closed
  when the murmur fires, eyes can't drift to it cleanly. Two options:
  hold the gaze on the keystroke glyph (`Cmd+K`-shaped path floats
  over the cloud), or open the strip just enough to anchor to.
  Probably the floating glyph — opening UI on the user's behalf is a
  rude surprise.

#feature #avatar
