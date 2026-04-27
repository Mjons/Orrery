---
created: 2026-04-25
status: brainstorm
---

# COMMAND_BAR.md — Converge Cmd+K and the filter bar into one toggleable surface

Today there are two top-of-screen text inputs:

- **Cmd+K search strip**
  ([search.js](../boltzsidian/src/ui/search.js)) — modal, summoned. MiniSearch
  fuzzy + prefix across title/tag/body. Top hit arcs the camera. Designed
  to find one note.
- **Filter bar** ([filter-bar.js](../boltzsidian/src/ui/filter-bar.js)) —
  persistent pill, F-focused. AND-composed `#tag` and substring tokens.
  Dims non-matches via the formations pipeline. Designed to live in the
  narrowed view.

Different engines, different syntaxes, different UX. The split is real and
intentional. This doc proposes keeping the engines separate but **collapsing
both into one bar with a mode toggle, hidable, with a breadcrumb so an
active filter is never invisible.**

## The opinion in one sentence

One bar at the top with a Search ↔ Filter mode pill, hidable when nothing
is active, and a compact breadcrumb whenever Filter is active but the bar
is hidden — so the user can never look at a half-dimmed universe and
wonder why.

## The three states

### State A — Hidden

Nothing visible. The universe is unfiltered. Default state on cold boot.

### State B — Summoned

Full bar at the top: mode pill on the left, input in the middle, mode-
specific feedback on the right (search ranks count + camera arc, filter
shows visible-count). Hint footer underneath. The same DOM surface as
today's `#search-strip` — just gains the mode pill and learns to behave
differently per mode.

### State C — Filtered breadcrumb

Active filter, bar dismissed. A small accent-tinted pill at the top centre
shows the filter terms with a close-X. Same vertical position the bar
occupied, just compressed. Click → re-summon in filter mode with terms
preloaded. Click X → clear filter, return to State A.

This third state is the load-bearing piece. Without it, hiding the bar
means a partially-dimmed universe with no UI explaining why — exactly the
"feels broken" moment the convergence has to avoid.

## Transitions

```
                ┌──────────────────────────────────────────┐
   Cmd+K        │                                          │
   ─────────►  Hidden ◄────── × on bar (no filter) ──────  │
                │                                          │
                │  ◄────── × on breadcrumb ────────────  Filtered
                │                                       breadcrumb
                ▼                                          ▲
              Summoned ──── Esc / × on bar (filter set)────┘
                ▲
                │
   F key  ──────┘   (focuses bar, switches to Filter mode)
```

Specifically:

- **Cmd+K** — summons in **Search** mode (or focuses if already summoned).
  If currently in filter mode, switches mode. Hides if pressed when
  summoned with empty input.
- **F** — summons in **Filter** mode (or switches mode if summoned).
  Pre-selects existing filter text so the user can refine.
- **Esc** — dismisses the bar. If a filter is active, leaves the
  breadcrumb. If not, returns to State A.
- **× button on the bar** — same as Esc.
- **× button on the breadcrumb** — clears the filter and returns to
  State A.
- **Click on the breadcrumb body** — re-summons in Filter mode with the
  terms in the input.
- **Mode pill click / Cmd+/** — toggle Search ↔ Filter without dismissing.

## The mode pill

A two-segment pill on the left of the input, glass-styled like everything
else:

```
┌──────────────────────────────────────────────────────────────┐
│ [ Search │ Filter ]  type to find a note…             ?  ×   │
└──────────────────────────────────────────────────────────────┘
```

Active segment uses `--accent`, inactive segment is dim. Click either
segment to switch. The placeholder copy and hint footer change with mode:

- **Search mode** — `type to find a note…`. Hint: `↑ ↓ navigate · Enter open`.
- **Filter mode** — `narrow visible notes…`. Hint: `#tag · word · multi-word AND`.
- **Connect sub-mode** — entered automatically when Search input starts
  with `connect|link|weave`. Pill stays on Search; the preview pane
  takes over the body of the bar (already shipped per
  [CONNECT_QUERY.md](CONNECT_QUERY.md)).

The pill is intentionally small — it's a mode indicator, not a primary
target. Power users hit **Cmd+/** to flip without mousing.

## Why one bar (not two)

The user's framing was right: there's a real design split between **find
one** and **narrow many**. The collapse only works because:

- **The two modes never want to be active simultaneously.** A user
  searching for a note doesn't also want to be filtering, and vice
  versa. One bar reflects that.
- **The grammars don't collide visually.** `#tag` is a literal tag in
  both modes — only its match semantics differ (filter requires the
  tag, search ranks notes that contain it higher). A user typing `#decision`
  gets sensible behaviour either way.
- **The bar already existed in two places.** Today the user sees a
  filter pill at top-centre AND the search strip slides down over it.
  Visually they jostle. One slot is cleaner.

## Why NOT one engine

Crucially we are NOT merging MiniSearch and the substring-AND filter
into a single matcher. The split engines are correct:

- **Search** wants fuzzy + prefix + ranking because the user is hunting
  for a half-remembered title. Forgiving is the feature.
- **Filter** wants exact AND-composition because the user is committing
  to a view. Surprise matches in a narrow view are noise.

Same surface, different brains. The mode pill is the user's signal for
which brain is listening.

## The breadcrumb

The most important new piece. Spec:

- **Position** — same top-centre slot as the bar, slightly smaller
  (max-width: 280px vs the bar's 620px).
- **Look** — glass background, accent-tinted border, short text:
  `filtered: #decision · pipeline`. If the filter is more than ~3 terms,
  truncate with ellipsis and surface count: `filtered: #decision · pipeline · +3`.
- **Click body** — re-summons the bar in Filter mode. Input pre-populated.
- **Click ×** — clears the filter, returns to State A.
- **Hover** — full term list in a small tooltip when truncated.
- **Animation** — fades in over 200ms when transitioning B→C; fades out
  over 200ms when C→A. No sliding; the user shouldn't see the bar
  "shrink" into the breadcrumb because that suggests they're the same
  surface (they're conceptually different states).

The breadcrumb is the only UI a filtered user sees if they've dismissed
the bar. It must be **always-visible** — never overlap-hideable, never
collapsable to an icon. Persistence is the entire point.

## State on mode switch

What happens to the input value when the user toggles modes?

- **Search → Filter** — input value transferred. The user's likely
  intent is "narrow to what I just searched." Filter engine re-parses
  the same text under its grammar; substring matches AND-compose, `#tag`
  becomes a real tag requirement. If the search was just typed and there
  are no hits in either engine, no harm done.
- **Filter → Search** — input value transferred. Search re-parses fuzzy.
  An active filter REMAINS APPLIED while you search — the dim is still
  on, the search ranks against the unfiltered vault but visually the
  user sees only matches that are also in the filtered set highlighted.
  This is subtle but right: search doesn't undo the user's filter.
- **Connect-query (verb-prefixed)** — only valid in Search mode. If the
  user types `connect …` while in Filter mode, the bar gently switches
  the pill to Search and runs the connect-query parser as normal. Auto-
  switch beats silently doing the wrong thing.

## Keyboard reference

| Key          | Hidden        | Summoned (Search) | Summoned (Filter)                    | Breadcrumb   |
| ------------ | ------------- | ----------------- | ------------------------------------ | ------------ |
| Cmd/Ctrl + K | Summon Search | Toggle hide       | Switch to Search                     | Re-summon    |
| F            | Summon Filter | Switch to Filter  | (no-op)                              | Re-summon    |
| Cmd/Ctrl + / | (no-op)       | Switch to Filter  | Switch to Search                     | (no-op)      |
| Esc          | (no-op)       | Hide              | Hide (→ breadcrumb if filter set)    | Clear filter |
| Enter        | (no-op)       | Open top hit      | (no-op — filter is live as you type) | (no-op)      |
| ↑ ↓          | (no-op)       | Walk hits         | (no-op)                              | (no-op)      |

## Implementation sketch

### Files

- **New: `boltzsidian/src/ui/command-bar.js`** — the orchestrator. Owns
  the top DOM surface, the mode pill, the breadcrumb, and routes input
  to either the search engine or the filter engine. Wraps both
  modules.
- **Modify: `boltzsidian/src/ui/search.js`** — extract the engine
  (MiniSearch index + the connect-query plan handling) into a function
  that takes a host DOM element. Today `createSearch` owns its own
  strip; we want to invert so the command-bar owns the strip and asks
  search to render into it.
- **Modify: `boltzsidian/src/ui/filter-bar.js`** — same inversion. The
  filter logic stays; the always-on pill DOM goes away in favour of
  the command-bar's slot.
- **Modify: `boltzsidian/index.html`** — replace `#search-strip` and
  `#filter-bar` with one `#command-bar`. CSS layers stay similar (glass,
  one accent, top-centre).
- **Modify: `boltzsidian/src/main.js`** — single `createCommandBar(...)`
  call replaces both `createSearch` and the filter-bar's createFilterBar.

### Order of work

1. Extract: turn `search.js` and `filter-bar.js` into engine modules
   that don't own DOM. (No behaviour change, just refactor.)
2. Add `command-bar.js` that mounts both engines into one `#command-bar`
   div, plus the mode pill.
3. Add breadcrumb DOM + the State B↔C transitions.
4. Wire keyboard table above.
5. Delete dead DOM and old createX entry points.

Each step ships behind a settings flag (`unified_command_bar`) until the
last — then the flag goes away. This lets the user A/B the change without
losing the option to roll back.

### What can stay

- **MiniSearch index** — exactly as it is.
- **Filter token grammar** — exactly as it is.
- **CONNECT_QUERY plan pane** — already lives in search.js and inherits
  unchanged.
- **F key** — same focus gesture, just hits the command-bar instead of
  the filter-bar.
- **Cmd/Ctrl + K** — same gesture, summons command-bar in Search mode.

### What goes away

- **Two separate top DOM surfaces** — `#search-strip` and `#filter-bar`
  collapse into `#command-bar`.
- **Always-on filter pill in empty state** — replaced by Hidden state
  (A). Currently the empty filter bar is visual furniture.
- **Always-summon-fresh-empty search** — search input now persists across
  open/close (filter does too), since the bar is now a stateful surface.

## Open questions

- **F focus when bar is in Search mode + has input** — does F switch to
  Filter mode and clear, or switch to Filter mode and TRANSFER input?
  The keyboard table says transfer; that respects user effort. But a
  user who presses F to "narrow what I see" might not want their
  half-typed search title transferred verbatim. Worth a settings
  toggle, or at minimum a soft animation that signals the transfer
  visibly so it's not surprising.
- **Connect-query during Filter mode** — table says auto-switch to
  Search. An alternative: the verb-prefix is a third "Connect" mode
  pill segment that appears only when relevant. Probably overkill —
  three segments is clutter. Auto-switch is fine.
- **Breadcrumb position when other top elements exist** — the
  hotkey-overlay activator, model-face, etc. all live near the top.
  The breadcrumb shouldn't fight them. Probably docks slightly below
  the screen edge with a clear margin, and the bar pushes it down
  briefly when summoned (or hides it entirely while summoned).
- **Filter persistence across sessions** — does an active filter
  survive page reload? Currently filter-bar.js's behaviour is the
  source of truth (haven't checked); the unified bar should match
  whatever it does. Probably yes — surprise filters on cold open are
  rare because the user can always Esc them.
- **Multi-instance scope** — if a user has multiple workspaces /
  projects loaded ([per WORKSPACE.md](WORKSPACE.md)), filter is
  workspace-scoped. The breadcrumb should make this scoping visible
  somehow — maybe `filtered (boltzsidian): #decision · pipeline` —
  so a user switching workspaces understands why the filter doesn't
  follow.

## Risk: discoverability of the toggle

A new user opens Cmd+K, types, hits Enter, opens a note. They've
discovered Search. They never learn Filter exists because they never
press F. The mode pill is the antidote — it's visible whenever the bar
is summoned, and a curious user clicks it.

[AVATAR_HINTS.md](AVATAR_HINTS.md) is the second line of defence: the
murmur for `cmd-k` already exists; add one for the Filter pill that
fires the first time the user re-opens Cmd+K after dismissing it. _"the
F key narrows your view — try it."_

## What to ship in v1

The doc above is the whole picture. v1 = everything except:

- Settings toggle for F-key transfer behaviour (open question).
- Multi-workspace breadcrumb scoping (defer to when multi-workspace
  itself ships per workspace.md gates).
- Cmd+/ as the explicit mode-switch hotkey — nice-to-have, can land in
  a follow-up. The mouse pill is enough for v1.

Everything else — the bar collapse, the breadcrumb, the mode-aware
keyboard table, the flag-gated rollout — is v1.

## Estimate

- Refactor existing modules to engine-shaped: half a day.
- Build the command-bar orchestrator + mode pill: half a day.
- Breadcrumb DOM + transitions: ~3 hours.
- Migrate keyboard handling and delete old surfaces: ~2 hours.
- Settings flag + manual A/B test: ~1 hour.

Roughly 1.5 days of focused work. Smaller than CONNECT_QUERY's full v1
because the engines are already there; this is mostly surface plumbing.

#feature #phase
