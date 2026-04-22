# PULL_INTO_ORBIT.md — Click a node, type a word, attach everything that matches

Sibling to [KEYWORD_LINK.md](KEYWORD_LINK.md) and
[BATCH_LINK.md](BATCH_LINK.md). Those flows all start the same way:
open a modal, pick a target, type a keyword, apply. This doc cuts the
"pick a target" step — the target is the node the user just clicked.

## The idea in one sentence

Click a note. Press a button. Type a word. Every note containing that
word gets wikilinked to the note you clicked.

## Why

The current keyword-link flow (`Cmd+Shift+L`) has three fields and
three decisions: what's the keyword, what's the target, what's the
scope. In practice the user almost always _already knows_ the target —
they're staring at it on screen. What they want to express is "this
note is the hub for X; wire everything X-related to it."

Today that takes a modal, two field interactions, autocomplete
navigation, and a click to pick the target. Most of that is friction
the user has already resolved by selecting the node.

## The flow

1. User clicks a body in the universe (or is already reading a note
   in the side panel).
2. User presses **`O`** (mnemonic: "orbit") — or clicks a new **↯
   Pull into orbit** button in the note panel header.
3. A minimal one-field popover appears near the selected node.
   Single input: "word to pull in."
4. User types `pipeline` (or whatever phrase).
5. Live preview under the input: `47 matches in 12 notes`.
6. User presses **Enter** to apply. Popover closes; toast confirms.

No target picker. No autocomplete navigation. No modal full-screen
takeover. The target is the selected note; every other decision
collapses into one text field.

## Interaction details

### Trigger

The flow launches **only when a note is selected** (either focused in
the panel, or the last clicked body in the universe). If no note is
selected, `O` opens search (or a toast: "Click a note first to pull
matches into its orbit").

### The popover

A compact floating card anchored near either:

- The **note panel header** when the panel is open (to the left of
  the panel, at the header's vertical center), or
- The **clicked body's screen position** when no panel is open.

Contents:

```
╭─ Pull into orbit ─────────────────────╮
│ → [[Delphica]]                         │
│ word: [____________]                   │
│ 47 matches in 12 notes · ⏎ to apply    │
╰────────────────────────────────────────╯
```

### Keyboard

- `Enter` — apply and close.
- `Esc` — close without applying.
- `Tab` / click — same as `Enter` + close.
- `↑/↓` while preview is showing cycles through the skip list (if
  we add one in phase 2).

### Defaults

- **First-mention per paragraph** (same rule the keyword-link applier
  already uses — see [tend-apply.js:applyObviousLink](../boltzsidian/src/layers/tend-apply.js#L102)
  and [layers/keyword-link.js](../boltzsidian/src/layers/keyword-link.js)).
- **Case-insensitive** by default.
- **Skip already-linked.**
- **No confirm gate below ~30 matches** — it's one-click, we trust
  the user. Above 30, a native `confirm()` with the exact count.
- **Refuse above 500** — mirrors the existing `REFUSE_THRESHOLD` in
  keyword-link-picker.js.

## Implementation

All the heavy lifting already exists. This doc is 90% UI.

### Reuse

- **Scan + match:** [scanVaultForKeyword](../boltzsidian/src/layers/keyword-link.js#L258)
  from the keyword-link layer — same function, passed our selected
  note as `target`.
- **Apply loop:** the `onApply` callback in main.js (currently for
  the modal picker, [main.js:2030-2100](../boltzsidian/src/main.js#L2030))
  already does the frontmatter-parse / body-splice / saver dance
  per-note.
- **Target sanitization:** the same `title.replace(/\[\[|\]\]|\|/g, "")`
  we added for the modal picker.

### New

1. **Popover component** — a small anchored floating card.
   Dimensions: ~320px wide, three rows (title, input, preview).
2. **Anchor logic** — if `notePanel.isOpen()`, anchor to the panel's
   header `getBoundingClientRect()`. Else anchor to the selected
   body's screen-projected position (we already project positions
   for labels; reuse that math).
3. **Single-field parser** — whitespace → multi-word phrase, unlike
   the filter bar which splits tokens. Users who want a precise
   phrase get it verbatim.
4. **Hotkey wiring** — bare `O` when a note is selected and no
   modifier is held, same guard pattern as the other single-letter
   hotkeys in main.js.
5. **Button in panel header** — a subtle icon (lightning bolt or
   similar) next to the existing pin/mode/delete buttons. Tooltip:
   "Pull matching notes into orbit (O)".

### Module plan

New file: `src/ui/pull-into-orbit.js`.

```js
export function createPullIntoOrbit({ getVault, onApply }) {
  // ... popover DOM, input, preview, anchor logic ...
  function open({ target, anchorEl, anchorPoint }) { ... }
  function close() { ... }
  return { open, close, isOpen };
}
```

Reuses the keyword-link applier's `onApply` handler verbatim — the
same `({ target, selection })` shape that already works.

## Why this isn't just "Cmd+Shift+L with target pre-filled"

Technically it _is_ that in terms of plumbing. But the UX is
different:

- **Modal is too heavy for the common case.** A full-viewport modal
  with two inputs and a scrollable preview is right when the user
  is starting cold. It's wrong when the user has already selected
  a target and just needs to type one word.
- **Anchored popover keeps the universe visible.** The user can see
  the stars dim/brighten as matches light up (filter-bar-style
  visual feedback — see [VISIBILITY_FILTER.md](VISIBILITY_FILTER.md)).
- **One field, one decision.** The reduced surface area encourages
  the gesture to become reflexive: click → O → word → Enter. Three
  seconds.

## First cut (one afternoon)

1. `src/ui/pull-into-orbit.js` with a bare popover, one input, no
   anchor logic yet (positions top-center).
2. `O` hotkey when a note is selected. No panel-header button yet.
3. Reuses `scanVaultForKeyword` + the existing `onApply` from the
   keyword-link picker.
4. Skip: live filter-style visual feedback, skip-list cycling,
   anchor-to-panel, icon button.

Ship that. If the gesture becomes a reflex within a week, add the
anchor logic and the icon. If people keep typing into it and getting
unexpected matches, that's a signal that we need the live sim-side
brightness feedback from VISIBILITY_FILTER.

## Composition with other tools

- **With VISIBILITY_FILTER:** if the filter bar is active, the
  pull-into-orbit scan should respect the filter's scope (only pull
  notes that pass the active filter). One-line change in the scan
  call.
- **With BATCH_LINK:** BATCH_LINK pulls every note in a CLUSTER
  to a hub. Pull-into-orbit pulls every note MATCHING A WORD. Both
  target-known, both zero-modal-picker. They're the same gesture
  on two different selection mechanisms.

## What this isn't

- **Not full-text search.** Matching is literal substring, same as
  the filter bar and keyword-link. The user who types a fuzzy word
  gets fuzzy results — that's fine.
- **Not bidirectional.** We only write `[[Target]]` into the
  matching notes' bodies. The target note's backlinks update
  automatically as a consequence of the vault index. No dance
  required.
- **Not undoable from inside the app.** Like the keyword-link
  picker, undo is `git restore` on the vault folder. A proper undo
  stack is a separate doc ([BACKLOG.md](BACKLOG.md)).

## Kill condition

If the user reports "I keep pressing O by accident while typing in
another note" — the hotkey needs a modifier (`Cmd+O`) or the `O`
scope needs to be tighter (only when the note panel is focused, not
the canvas). Easy fix.

If "I find myself opening Cmd+Shift+L anyway because I want to see
the full list before committing" — the popover's preview needs to
be more detailed (per-match breakdown), and we've essentially
reinvented the modal. Keep the popover minimal; users who want the
full list already have that shortcut.

The feature is load-bearing when: the user's muscle memory for
"wire X notes into hub Y" becomes **click Y, press O, type X,
Enter**. Three seconds, no modal.

#linking #keyword #ux #phase
