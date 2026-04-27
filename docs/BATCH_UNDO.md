---
created: 2026-04-25
status: brainstorm
---

# BATCH_UNDO.md — Reversing batch operations after the fact

A batch op
([BATCH_LINK.md](BATCH_LINK.md), [KEYWORD_LINK.md](KEYWORD_LINK.md),
[CONNECT_QUERY.md](CONNECT_QUERY.md), eventually [WEAVE.md](WEAVE.md))
writes to many notes in one gesture. The preview catches mistakes
before they happen. This doc is about what happens when the user
realises _afterward_ — minutes, hours, or days later — that the
batch was wrong.

The trigger for this doc is the over-hub'd-notes question in
[CONNECT_QUERY.md §Open questions](CONNECT_QUERY.md): a popular note
accumulates synthetic hubs across repeated `connect …` runs. The
opinion: don't police this with caps, give the user clean reversal
instead. The user takes responsibility for _running_ the gesture;
the app takes responsibility for _unrunning_ it.

## The opinion in one sentence

Three time horizons of undo, each cheap, each composable, none
modal — so a regretted batch op is at most one click to reverse no
matter when the regret arrives.

## The horizons

### Horizon 1 — toast undo (≤ 30 seconds)

Standard pattern. Right after Apply lands, the toast bar shows:

```
Linked 12 notes to "Cepheid · Polaris · parallax".
[Undo · 28]
```

The countdown is visible (the toast literally counts down so the
user can see the window closing). Clicking Undo:

1. Reverses every body edit by exact text diff (the same edge list
   the apply step recorded).
2. Deletes the synthetic hub note if and only if it was created in
   _this_ batch AND has zero incoming links from outside the batch.
3. Emits a confirm toast: `Reverted. 12 wikilinks removed; hub
discarded.`

This is the version BATCH_LINK §3 already specs. It exists for the
"oh, wrong target" moment. It's the loudest layer because the
user's attention is still on the action.

Cap: works for batches up to ~200 edits. Above that the diff list
is too large to keep around for a 30 s window cheaply, and we
should have already shown a modal confirm
([per CONNECT_QUERY.md safety properties](CONNECT_QUERY.md)).

### Horizon 2 — session reversal (until reload)

Toasts are gone in 30 s. The user might realise the batch was wrong
ten minutes later, after reading through three of the linked notes.
Solve this with a small **Recent batches** drawer surfaced from the
toast bar:

```
Recent batches (this session)
─────────────────────────────
✓ 12 wikilinks · "Cepheid · Polaris · parallax" · 4m ago     [Reverse]
✓  8 wikilinks · "consciousness" → [[Mind]]                   [Reverse]
✓  3 #astrophotography tags                                   [Reverse]
```

- Each entry stores the edit diff (in-memory `Map<batchId, EditDiff>`)
  AND the tools to apply it in reverse: edge list, optional
  hub-delete handle, frontmatter snapshot for tag mutations.
- Reverse runs the same write loop as Apply, just inverted. Goes
  through the existing root-aware saver — same throttle, same
  toasts.
- A reverse is itself a batch — it gets its own entry in the
  drawer. Undoing the undo is fine. The drawer is a stack of facts,
  not a "current state" view.
- Kept in memory only. Reload clears the list. Persistence is
  Horizon 3's job.

Discoverability: a small numeric badge on the toast bar (`↶ 3`)
when the drawer has reversible entries. Click to open. Surface
appears only when there's something in it — invisible on first run.

Cost estimate: a 50-edit batch's diff is ~5 KB JSON. Session caps
at 50 batches → 250 KB ceiling, never written to disk. Cheap.

### Horizon 3 — long-term cleanup (the over-hub case)

Days later, the user opens the Whirlpool note and notices it now
links to `[[Cepheid · Polaris · parallax]]`, `[[Distance ladder ·
parallax]]`, and `[[Variable stars · M31]]` — three synthetic hubs
the user accepted on different evenings, forgotten about, and now
finds noisy.

This horizon doesn't need a per-batch reversal mechanism. It needs
**inventory and selective deletion**, leveraging tools already in
the app:

- Synthetic hubs carry `generated_by: "connect-query"` in
  frontmatter (per
  [CONNECT_QUERY.md §Topology 2](CONNECT_QUERY.md)). They're
  trivially queryable.
- A new **Tend** pass — `synthetic-hub-review` — surfaces the
  user's existing synthetic hubs in the Tend drawer with their
  satellite count and last-touched date. Per-hub Accept = "keep
  this hub" (clears it from future reviews); Reject = "delete
  hub + dangle the satellites' wikilinks" (existing
  broken-link Tend pass picks them up next run).
- The pass runs on the same cadence as other Tend passes
  (manual `Cmd+Shift+T`, or whatever the existing trigger is).
  No new surface, no new modality — just a new pass kind.

The user took responsibility by running `connect …` ten times.
Tend takes responsibility for surfacing the inventory in a
low-pressure place. Deletion is two clicks per regretted hub.

Per-satellite cleanup happens through the existing broken-link
pass, which means a satellite that linked to two hubs (one kept,
one rejected) settles correctly without batch-undo coordination —
each link has its own life from this point on.

## Why three horizons (not one)

A single "undo always available" stack is tempting but wrong-shaped:

- An always-undoable batch from a week ago means the app has to
  remember the edit diff against a vault state that's drifted
  underneath — by now the user may have manually edited the
  satellites, deleted some, re-linked others. Replaying an old
  diff against a new vault is the kind of thing that breaks state
  silently.
- An always-visible "reverse this" affordance per batch becomes
  noise. The whole point of batch-link's value is that it
  _commits_. A perpetual undo affordance suggests every batch is
  tentative.

Three horizons match three real time-frames of regret:

| Horizon   | Time window | Affordance          | What it stores             |
| --------- | ----------- | ------------------- | -------------------------- |
| 1. Toast  | ≤ 30 s      | One button          | Diff, in-memory            |
| 2. Drawer | Session     | Drawer + badge      | Diff stack, in-memory      |
| 3. Tend   | Days+       | Pass in Tend drawer | Frontmatter inventory only |

Each layer is cheap because each only needs to be correct for its
own time scale.

## Storage notes

### Diff format (Horizons 1 & 2)

Reuse what the apply step already builds for its undo path:

```js
{
  batchId: "01JZ…",        // ULID
  kind: "connect-query" | "batch-link" | "keyword-link" | "tag",
  prompt: "connect notes mentioning Cepheid, Polaris, parallax",
  appliedAt: 1746...,
  hub: { id: "01ABC…", path: "/astronomy/cepheid-polaris-parallax.md", created: true } | null,
  edits: [
    { noteId: "01XYZ…", before: "…body before…", after: "…body after…" },
    …
  ],
}
```

- `before` / `after` are the full body, not a positional patch —
  reverses cleanly even if the satellite was edited in between
  (we just compare current body against `after`, and skip the
  reverse for any note whose body has already drifted, surfacing
  those in the toast: _"Reverted 9; 3 had been edited since,
  left as-is"_).
- `hub.created: true` means we created it; reverse is allowed to
  delete it. If the user added incoming links to the hub from
  _outside_ the batch in the meantime, the reverse keeps the hub
  and only removes the satellite wikilinks (toast surfaces this).

### Frontmatter inventory (Horizon 3)

Already specced in CONNECT_QUERY:

```yaml
generated_by: connect-query
prompt: "connect notes mentioning Cepheid, Polaris, parallax"
created: 2026-04-25T22:14:01Z
```

The `prompt` field is the entire reason we keep this — the user
seeing _"oh, this was the night I was reading about the distance
ladder"_ is enough context to decide keep-or-delete. Without the
prompt the synthetic hub is anonymous and the user has to read
both the hub and several satellites to reconstruct intent. With it,
deletion is informed.

## Drift handling

A reverse against drifted state is the only place this gets
genuinely interesting. Three cases:

1. **Satellite body edited since batch.** Compare current body
   against the diff's `after`. Mismatch → skip this satellite,
   list it in the toast as "edited since." User can reverse
   manually if they want.
2. **Satellite deleted since batch.** Skip silently; the link
   went with it.
3. **Hub edited since batch.** Hub deletion proceeds anyway IF
   it was system-created (frontmatter says so) AND the user
   confirms (a small modal, not a toast — deleting a note the
   user may have reshaped is the one place we want active
   consent).

Drift handling is the reason the diff stores full bodies, not
positional patches. Patches against a moved file are how undo
systems silently corrupt content; full-body comparison fails
loudly instead.

## Surfaces and routing

- **Toast** — already exists, extend with countdown and Undo button.
  Lives in [boltzsidian/src/ui/toast.js](../boltzsidian/src/ui/toast.js).
- **Recent batches drawer** — small new panel, sliding up from the
  toast bar. Reuse the
  [tend-drawer.js](../boltzsidian/src/ui/tend-drawer.js)
  visual language (header, list, per-row actions) so it doesn't
  feel like new furniture.
- **Tend pass** — new file in
  [boltzsidian/src/layers/](../boltzsidian/src/layers/), siblings
  with the existing tend passes; adds itself to the tend pass
  registry. No new UI.

The avatar can murmur about the drawer
([per AVATAR_HINTS.md](AVATAR_HINTS.md)) the first time the badge
appears — _"↶ reverses recent batches"_ — once and once only.

## What we're NOT building

- No global undo stack across all edit kinds. Manual edits in the
  note panel keep their own undo (CodeMirror's built-in). Batch
  ops get their own. Mixing them is a feature creep wormhole.
- No "redo" of a reversed batch. Just run the original gesture
  again — the prompt is on the synthetic hub's frontmatter, so
  even rebuilding "the same batch" is a copy-paste away.
- No automatic prompt-to-revert on conflict. If a satellite has
  drifted since the batch, we surface it and stop; we don't try
  to "merge" the reverse into the new state. That's the kind of
  smart that's actually fragile.

## Recommended order

1. Extend the toast to show a countdown + Undo (Horizon 1).
2. Add the in-session diff stack and the Recent batches drawer
   (Horizon 2). Same diff format powers both.
3. Add the `synthetic-hub-review` Tend pass (Horizon 3) — only
   after `connect …` has been in the user's hands long enough
   to actually produce regret. Don't pre-build cleanup for
   regret that hasn't shown up yet.

Steps 1 and 2 ship together. Step 3 is a follow-up gated on
real signal.

## Open questions

- **Drawer scope.** Should the drawer also show non-batch
  edits — file deletes, file renames? Probably not; CodeMirror
  handles in-note undo and file-level deletes have their own
  trash flow. Mixing tiers blurs the model.
- **Cross-session undo for the toast Undo button.** A user who
  reloads three seconds after Apply loses their Undo. We could
  flush the most recent batch's diff to localStorage on apply
  and keep it for 60 s of wall-clock time across reloads. Cheap
  if scoped to _one_ batch, expensive if to many. Probably
  worth doing for the most-recent-only case.
- **Does the prompt belong on every wikilink site too?** Today
  the prompt only lives on the synthetic hub's frontmatter. A
  satellite that links to _three_ synthetic hubs has no
  per-link record of which prompt produced which link. Probably
  fine — the hub is the audit surface — but worth measuring
  after Horizon 3 ships.

#feature #phase
