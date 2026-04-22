---
tended_on: [tag-infer]
id: 01KPS7VDPKR1QVPZ8S2R1946KG
created: "2026-04-21T18:39:26.324Z"
---

# RITUALS.md — Times of day the universe remembers

A speculative design doc. Michael's note, verbatim:

> Times of the day — these essentially would reinforce systems and
> routines that the user has defined that they should do throughout the
> day. Our AI would basically nudge and chirp them until they said they
> finished the thing. Not even sure if it will end up fitting in this
> project.

The right to ask whether a feature fits is the most important question
in this doc. I'll answer it last, but the answer depends on the framing,
and the framing is where this stands or falls.

---

## 0. Word choice matters

Calling this "routines" collapses it into a productivity-app category
Boltzsidian is not in. Every habit-tracker ever shipped has pointed at
the same slot in the user's life and tried to charge rent there.

Calling it **"rituals"** gets us to a better place:

- Rituals are **self-chosen**. The app doesn't suggest them.
- Rituals are **meaningful to the person doing them**. Not productivity
  deliverables; things that matter.
- Rituals have **rhythm** (times, cadences) rather than deadlines.
- Missing a ritual is **a quiet absence**, not a failure.

If we can't uphold these four properties, we shouldn't ship this
feature — at best we'd make a pretty nag-app, which is a race to the
bottom we'd lose to Todoist or Streaks.

Framing assumed for the rest of the doc: **the universe remembers your
rituals** — not "the app tracks your routines."

---

## 1. How rituals live in the vault

Everything Boltzsidian does is grounded in markdown files. Rituals are
no exception.

A ritual is **a note** in the user's vault with a specific frontmatter
block:

```yaml
---
id: 01J...
ritual:
  at: "07:30" # wall-clock time (24h), workspace local TZ
  cadence: "daily" # daily | weekdays | weekends | mon,wed,fri | etc.
  window_minutes: 60 # grace period before becoming "overdue"
  tone: "gentle" # gentle | curious | dry (affects voice)
---
# Morning walk

Twenty minutes. No phone. Start before coffee.
```

Properties that matter:

- **The ritual is a note.** It can be linked, tagged, written about, let
  drift. Everything the rest of the app does to notes works on rituals.
- **No app-level ritual list.** If you want to see them all, you tag
  them `#ritual` and use Solo folder or search. The vault is the index.
- **Cadence is flexible strings.** Workspace parses them in a small
  shared module so the same vocabulary works across Boltzsidian,
  librarian, weed.
- **Window is user-set.** The user decides when a ritual becomes
  overdue, not the app. Default 60 minutes.
- **Tone is user-set.** Affects how the AI addresses them — gentle,
  curious, dry. No default "motivational" option.

---

## 2. State — four phases of a ritual's day

A ritual is in one of four states at any moment:

| State         | When                                | Visual signal                                    |
| ------------- | ----------------------------------- | ------------------------------------------------ |
| **Dormant**   | Today's window hasn't opened yet    | Normal star. Indistinguishable from other notes. |
| **Awake**     | Window is open, ritual not yet done | Subtle outward breathing at the star's edge.     |
| **Overdue**   | Window closed without completion    | The star's halo dims by ~30%. Soft wilt.         |
| **Completed** | User marked done today              | A gentle flash, then steady full-brightness.     |

At midnight (local), all rituals reset: Completed → Dormant, Overdue →
Dormant, Awake → Dormant. The previous day's completion is logged in
the ritual's note itself (see §4).

No gamification. No streaks, no points, no trophies. A ritual
completed yesterday and forgotten today is not a broken-chain
disaster; it's a single absence. The universe notices quietly.

---

## 3. The nudge model

This is the load-bearing section. Get this wrong and the product
identity is gone.

### 3.1 Absolutely no popups

Not a toast, not a dialog, not a notification permission request,
not a banner, not a sound. Ever. If a ritual feature requires any of
these, we've lost.

### 3.2 Three ambient channels, three volumes

The app already has three channels through which it addresses the
user:

1. **Observer chorus** — floating captions about the field.
2. **Model face** — expression above the HUD.
3. **Morning report** — the three-things modal on wake.

Rituals **weight** these three, proportional to overdue count — they
don't create a fourth channel.

- **Chorus** — while any ritual is Awake or Overdue, its utterance
  weighting tilts 25–40% toward mentioning the ritual. Not "you need
  to do this" — more like "there is a morning walk waiting." Pulls
  from existing template library + LLM backends, always grounded in
  the ritual's note text. More Overdue rituals → more weighting.
- **Face** — one new expression, `waiting`. A slightly cocked head,
  eyebrow up, patient-but-noticing. Not frowning. Cycles in when the
  Overdue count > 0, cycles out when back to zero.
- **Morning report** — if any rituals are Overdue from yesterday,
  they appear as a **fourth** block after Three Things, titled
  _"Carried over"_ — with a one-line reason and the option to mark
  them still-intended or retire them.

### 3.3 The escalation curve

How persistent is persistent? Most "nudge" systems get more
aggressive over time; Boltzsidian gets **gentler**.

- 0–30 min overdue: nothing changes. The window was generous for a
  reason.
- 30–90 min overdue: chorus weighting +25%, face `waiting`.
- 90 min – end of day: chorus weighting +40%, star visibly dims.
- End of day: ritual marked Overdue in its note's body, and appears
  in tomorrow's morning report once. Then silence.

**The chorus never says "you failed."** It says "morning walk" with
less of a smile in the template. The user fills in the meaning.

---

## 4. Marking done

Completion must be **faster than a Todoist tap**, or the system is
worse than the alternative.

Three paths, all first-class:

### 4.1 Keyboard

`Cmd+; D` — a two-step chord. With any ritual open in the note panel,
`Cmd+;` then `D` marks it done, appends a one-line log to the note
body, and fires the completion flash on the star.

### 4.2 Panel button

When a ritual note is open, a small **"Done"** pill appears next to
the pin button. Click → same effect.

### 4.3 Star interaction

Shift+click a ritual's star in the universe → toggles done state.
The star flashes and the orbit ring does a quick celebratory pulse.
No panel needed.

The completion log appended to the note body is plain markdown — one
line like:

```
> done · 2026-04-21 07:48
```

Searchable, grep-able, portable. If the user stops using Boltzsidian
and opens their vault in Obsidian, the history is preserved as prose.

---

## 5. The voice — AI without nagging

Utterances come from the existing router: template / local / Web-LLM /
Claude. For rituals, the backend receives a scoped snapshot:

```json
{
  "ritual_title": "Morning walk",
  "ritual_body_excerpt": "Twenty minutes. No phone...",
  "state": "overdue",
  "minutes_past_window": 45,
  "tone": "gentle",
  "recent_completions": ["2026-04-20", "2026-04-18", "2026-04-17"]
}
```

Prompts are **small and constrained**. The model's job is to generate
a 4–10 word caption that:

- Names the ritual obliquely.
- Respects the chosen tone.
- Does not moralize, motivate, or guilt.
- Does not assume the ritual's purpose.

Example template outputs with `tone: gentle`:

> "morning walk — still there, waiting"
> "the walk hasn't started yet"
> "twenty minutes, no phone — whenever you're ready"

Example Claude outputs with `tone: dry`:

> "a walk unthreatens."
> "the shoes sit."
> "no walk. interesting."

The user can edit the per-ritual `tone` string. If they want a
deadpan Beckett-ish cadence, they write `tone: "deadpan"` and
the LLM honors it. Templates fall back to gentle if they don't have
a match for the tone string.

**A hard prompt constraint, always appended:** _"Do not use the
second person. Do not prescribe action. Do not shame."_ That
constraint is non-negotiable and shipped even with user-supplied
custom prompts. The app owns this guardrail because getting it
wrong turns the whole product into the thing we're trying not to be.

---

## 6. Composition with existing layers

| Existing concept        | Ritual interaction                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Observer chorus         | Overdue rituals weight the utterance subject selection                                                |
| Model face              | New `waiting` expression when any Overdue > 0                                                         |
| Morning report          | Gains a "Carried over" block when rituals went unfinished yesterday                                   |
| Dream mode              | Rituals do NOT appear in dreams. Dreaming has no to-do list. Depth 0.3+ suppresses all ritual nudging |
| Formations — Protostars | Includes rituals whose window opened this week                                                        |
| Formations — Halo       | Rituals neglected for >2 weeks appear in halo                                                         |
| Librarian               | Can propose splitting / merging / renaming ritual notes, same as any other note                       |
| Ideas drawer            | Dream-born ideas are never rituals. Rituals are strictly user-authored                                |

The dream-mode suppression is critical. The whole point of sleep is
that it's free of obligation. If the user is napping and the chorus
starts chirping about their unfinished morning walk, they'll delete
the app. Dreaming rituals: never.

---

## 7. What this deliberately is NOT

- **Not a to-do app.** No "todo" items, no "projects," no "inbox."
  Rituals are time-of-day anchors; generic tasks belong in whatever
  the user already uses.
- **Not a habit tracker.** No streak graph, no completion percentage,
  no heatmap. If someone wants that they can write a Dataview
  query against the `> done ·` log lines themselves.
- **Not a calendar.** One-off appointments are not rituals. If a
  user wants that, it's a different feature with different
  assumptions (date-specific, ends after one occurrence).
- **Not an assistant.** The AI doesn't plan your day. It doesn't
  suggest new rituals. It doesn't ask how your ritual went. It
  reads the frontmatter and shapes its voice around it. That's it.
- **Not a sound machine.** No chimes, no bells, no haptic. The app
  stays quiet. The universe stays quiet.
- **Not notifications.** Nothing ever leaves the app's tab.
  No `Notification` API calls, ever.

---

## 8. Does this fit the project?

Honestly? **Maybe.** Here's the case for and against.

### 8.1 Why it fits

- Rituals are notes. Boltzsidian is a notes app. No new file format,
  no new data model, no new surface.
- The app already has a living presence (the model face + chorus).
  Routing ritual-awareness through existing channels is smaller scope
  than most speculative docs in this repo.
- It honors the project's distinctive claim — "your notes think about
  themselves" — in a new dimension: your scheduled intentions
  reinforce themselves too.
- Users who keep a daily-note practice and a morning-pages-style
  journal already use the vault for this purpose informally. Making
  rituals first-class is acknowledging what's already happening.

### 8.2 Why it might not

- Every feature that touches a user's _time_ (vs. their _notes_) is
  adjacent to wellness / productivity categories the app is
  otherwise not in. Drift risk is real.
- The existing app's mood is contemplative. Rituals introduce a
  time-pressure element, however gentle. That's a tonal shift.
- The hardest engineering challenge isn't the nudge curve — it's
  _not_ building toward notifications / sounds / streaks over time.
  Every ritual-adjacent feature the PM world has ever made has
  trended toward those. The discipline to resist is a cultural cost.
- The payoff is narrow. People who don't already have a "my vault
  holds my rituals" mental model won't find this. People who do are
  a subset of a subset.

### 8.3 My recommendation

**Ship it behind a per-workspace toggle, and only after the chorus
and morning report are in a stable place.** If the user never creates
a ritual note, the entire system is dormant and invisible. That's the
minimum bar: adding this feature must not change the experience of
users who don't use it.

Concretely: don't build this in the first 1.0. Revisit after users
have lived with the app for a season and either:

- Several users have asked for it, or
- The author's own vault already has rituals-as-notes and they want
  the app to surface them better.

If neither, this stays on the speculative shelf. Not every good idea
has to ship.

---

## 9. Minimal first cut (if/when we build it)

Three days, not three weeks. Respect the scope.

1. Parse `ritual:` frontmatter into a lightweight in-memory schedule
   at vault-open time. No separate storage.
2. Compute state (Dormant / Awake / Overdue / Completed) on a 30-sec
   tick. Completed today comes from scanning the note body for
   `> done · YYYY-MM-DD` lines matching today.
3. Weight the chorus utterance selection by state. New templates:
   10–15 lines per tone.
4. Add the `waiting` face expression. One SVG group, one CSS rule.
5. `Cmd+;` D chord + panel `Done` pill + Shift-click star completion.
6. Morning report gets a "Carried over" block.

That's it. No calendar view, no history panel, no analytics, no
settings beyond the per-ritual frontmatter the user already writes.

---

## 10. One sentence

Rituals are user-authored times of day the universe quietly remembers
— surfaced through the same ambient voices that already describe the
sky, suppressed when the sky is dreaming, and completed by a gesture
smaller than a breath.

#user #star #feature
