# SLASH_COMMANDS.md — `/help` and friends

A speculative design doc. The Cmd+K search strip is now the most-used
piece of UI in Boltzsidian. It already does fuzzy text search; with one
extra branch it could also do _action_ search — Notion-style slash
commands for "do a thing" instead of "find a thing." This doc is about
whether to add that, where to put it, what to ship first, and what to
deliberately not turn into.

Nothing here is a plan. It's an honest look at one feature.

---

## 0. The minimal pitch

Type `/` as the first character in the Cmd+K input. The strip flips
modes: instead of fuzzy-searching notes, it's now matching commands.
Below the input we list the matching commands ranked by prefix, with
their argument pattern + a one-line description. Enter executes.

`/` is a verbed namespace; everything else is the noun namespace
(notes). Two universes, one input, one mode-switch character.

---

## 1. Why `/`, why the search strip

Two reasonable places this feature could live:

1. **The Cmd+K search strip** — already focused, already top-center,
   already where users go when they want _something to happen_.
2. **A dedicated command palette** — a separate widget summoned by
   `Cmd+Shift+P` (VS Code's pattern).

The argument for the dedicated palette is separation of concerns. The
argument for reusing search is that the user has already learned _one_
input. Forcing them to learn _another_ for the seven commands they'll
ever actually run is bad return on muscle memory.

**Verdict: reuse the search strip.** If the namespace pressure ever
gets so high that mode-switching feels confused, fork later. Until
then, one input.

A nice side effect: `/` is already an unambiguous prefix. No filename
in the user's vault starts with a literal `/` because filenames can't.
There's no overlap to disambiguate.

---

## 2. The starter set

Every command listed here passes a sniff test: it's an action a user
will _think to type_ but doesn't currently have a fast path for. If
the only way to discover a command is through `/help`, it shouldn't
ship — that means it has no demand pull.

| Command      | Args          | What it does                                                 |
| ------------ | ------------- | ------------------------------------------------------------ |
| `/help`      | —             | Lists all commands. Same UI as the popover from search-tips. |
| `/new`       | `<title>`     | Create a note in the current folder; opens the editor.       |
| `/dream`     | `[theme]`     | Kick off a dream cycle now. Optional theme name.             |
| `/sleep`     | `[depth]`     | Set sleep depth 0–1; default 0.7. Affects ambience + chorus. |
| `/wake`      | —             | Sleep depth → 0. Idle face, normal physics.                  |
| `/formation` | `<name>`      | Apply a formation by name (Halo, Protostars, etc.).          |
| `/folder`    | `<path>`      | Solo-folder formation: only that folder visible.             |
| `/tag`       | `<tag>`       | Filter to notes carrying that tag.                           |
| `/clear`     | —             | Drop all active formations + filters. Reset to All.          |
| `/snapshot`  | `[name]`      | Save current camera + filter state as a viewpoint.           |
| `/goto`      | `<viewpoint>` | Jump to a saved viewpoint by name.                           |
| `/settings`  | —             | Open the settings panel.                                     |
| `/about`     | —             | Open the about panel.                                        |
| `/canvas`    | `<file>`      | Load a `.canvas` file as the current scene (CANVAS.md §2.2). |
| `/morning`   | —             | Open the morning report manually.                            |
| `/export`    | —             | Export the current viewpoint as a Canvas (or PNG).           |

Eight to ten of these earn their keep; the others are speculative and
should be cut if they don't get exercised in the first month.

The five I'd actually ship in v1: `/help`, `/new`, `/dream`,
`/formation`, `/clear`. They cover the verbs users have asked for
shortcuts to. Everything else can wait for explicit pull.

---

## 3. Argument parsing — keep it dumb

This is where slash-command systems get cancerous. Resist.

- **Whitespace is the only separator.** `/folder /work` (or
  `/folder work`) — the parser doesn't care.
- **No flags.** `--depth 0.7` is a feature creep. If a command needs a
  flag, it needs to be split into two commands.
- **No quoting.** If a title has spaces, the rest of the input _is_
  the title. `/new my new note` produces a note titled "my new note."
  Don't make users escape anything.
- **One required arg, optional rest as freeform string.** Anything
  more structured belongs in a panel, not a command line.
- **Type-ahead picks for known-set arguments.** `/formation Pr` shows
  Protostars highlighted. Enter accepts. This is the _only_ form of
  smart parsing; it composes with the existing fuzzy matcher.
- **Unknown command → nothing happens.** No error toast, no scolding.
  The popover stays open, listing nothing matched. User can refine or
  bail. Slash-command systems that yell at typos feel hostile.

---

## 4. Discoverability and `/help`

`/help` is the most important command in the set, and the only one
the system itself drives discovery for.

Two visible affordances:

1. **In the search popover (the `?` we just added):** add a final
   bullet — "Type `/` to run a command." That's the entire onboarding
   for the feature. Users who want it find it on first read.
2. **`/help` itself:** when typed, the popover transforms into a
   formatted command reference, grouped: _Notes · Universe · Sleep ·
   Filters · Misc_. Each row is `command  args  description`. Enter
   on a highlighted row pre-fills the input with `/<command> ` so the
   user can complete it.

That second affordance — `/help` as a stepping stone, not a wall of
text — is what makes a command palette pleasant. Users discover by
running, not by reading.

---

## 5. The mode-switch UX

Subtle but load-bearing. When the user types `/`:

- The input gains a soft accent border (just the bottom edge, 1px
  brighter than `--glass-border`).
- The placeholder changes from `search the universe` to
  `command, e.g. /dream`.
- The hint row swaps from `↑↓ navigate · enter open · esc close` to
  `↑↓ pick · enter run · esc cancel · backspace exits`.
- The summary row now lists matched commands (max 8), most-prefix-
  match first.

Backspacing past the `/` flips back to search mode. No mode lock-in.

Visual rule: never two modes shown simultaneously. The strip is in one
or the other. This is the simplest way to keep the affordance honest.

---

## 6. What slash commands shouldn't be

Lines worth pre-drawing now, before pressure builds.

- **No destructive verbs.** `/delete`, `/drop`, `/wipe` are out. The
  only writes the system performs through commands are creates
  (`/new`, `/snapshot`). Deletion stays in the editor / panel where
  the user can see the consequence.
- **No shell escape.** No `/exec`, no `/eval`, no `/run-script`. The
  vault is intimate; commands stay scoped to vault + universe state.
- **No state bypass.** `/sleep 1` is fine because sleep is reversible
  and visible. `/disable-onboarding` is not — that hides UI, which is
  worse than a bad default.
- **No remote.** Commands never call out to a network service except
  through paths the user has already opted into (Phase 7 Claude API,
  with the same payload preview).
- **No 30+ commands.** A palette with 30 commands is two palettes
  stitched together. If the count grows past ~12, that's a signal to
  cut, not to categorize.

The constraint is: a command should be _something a user could already
do_, just faster. Never something the UI _doesn't already let them
do_.

---

## 7. Composability — small wins later

Once the basic system works, two cheap additions multiply its value.

### 7.1 Repeat-last-command

`Cmd+K` then `↑` (with empty input) recalls the previous command. Lets
users `/dream` repeatedly without retyping. Same pattern as terminal
history.

### 7.2 Command chaining via `;`

`/folder /work ; /tag idea` runs both in order. Useful for saved
formations (FORMATIONS §4.4) — a user can write a chain once, save it
as a viewpoint, and re-summon by name.

Both are cheap; both are skippable for v1. Mention here only because
they fall out cleanly from the dumb parser in §3, and skipping them
requires a deliberate "no" later.

---

## 8. Minimal first cut

Shippable in an afternoon, after the search-tips popover lands:

1. In `runSearch(q)`, branch on `q.startsWith("/")` to route to a
   command parser instead of the MiniSearch index.
2. Build a static `COMMANDS` array of `{ name, args, description, run
}`. The five v1 commands from §2.
3. Render matched commands into the same `.search-summary` slot;
   ↑/↓ walks them; Enter calls `run(args)`.
4. Add the bullet to the search-tips popover.
5. Mode-swap placeholder + hint copy in the `runSearch` branch.

Total surface: ~80 lines of JS, one CSS rule for the accent border.

The hard part isn't building it. The hard part is keeping the command
list small once everyone wants their pet verb in it.

---

## 9. What this is in one sentence

Slash commands are the verb namespace of the search strip — five of
them ship, twelve are tracked, and `/help` is the only one the system
itself advertises.
