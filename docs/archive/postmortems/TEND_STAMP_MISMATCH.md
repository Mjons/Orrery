---
id: 01KR0000TENDSTAMPMISMATCH0
created: 2026-04-22
---

# TEND_STAMP_MISMATCH.md — Why Tend proposes the same items every scan

Observed: user runs Tend → 76 proposals appear. Accepts them all.
Shortly after completion, a fresh 76 appear. Clears, closes the
drawer, reopens by pressing T — **the same 76 are back.** The
"Accept" action apparently had no effect on what Tend considers
"already done."

This is not a race, not a DOM bug, not a concurrency issue. It's a
**data-shape mismatch between the writer and the reader** of the
`tended_on` frontmatter key. The writer stores an array; the reader
reads it as a dict. They've been out of sync, and the symptom is
that Tend has no memory.

---

## 1. The two sides

### 1.1 Writer — `stampTendedOn` in `tend-apply.js`

Every accepted or rejected proposal appends a string to the
note's `tended_on` **array**:

```js
function stampTendedOn(rawText, proposal, now, { prefix = "" } = {}) {
  const { data, content } = parseFrontmatter(rawText);
  const existing = Array.isArray(data.tended_on) ? data.tended_on : [];
  const key = `${prefix}${keyForProposal(proposal)}`;
  if (existing.includes(key)) return rawText;
  data.tended_on = [...existing, key]; // ← array of strings
  return stringifyFrontmatter(data, content);
}
```

Resulting on-disk frontmatter:

```yaml
tended_on:
  - obvious-link:01KPTK0AAMNWWNW6ERCCKEZTJT
  - obvious-link:01KPS3Z7FX1VFKTS2AYJADQK6Q
  - tag-infer
```

### 1.2 Reader — `alreadyTended` in `tend.js`

The scanner filters out notes that have already been tended:

```js
function alreadyTended(vault, proposal) {
  const note = vault.byId.get(proposal.noteId);
  if (!note) return true;
  const stamp = note.frontmatter?.tended_on;
  if (!stamp || typeof stamp !== "object") return false;
  const key = keyForProposal(proposal);
  return !!stamp[key]; // ← treats stamp as a dict
}
```

`stamp[key]` on an array with a string key returns `undefined`.
`!!undefined` is `false`. So **every proposal returns "not
tended"** regardless of what's in the array.

`typeof stamp !== "object"` passes for arrays too (arrays ARE
typeof `"object"` in JS), so the function doesn't early-return on
arrays.

The check executes without error, returns the wrong answer, and
every scan proposes the same work the user just finished.

---

## 2. Symptom matrix

The bug is silent in every normal use:

| User action                                                 | Observed behaviour                                   |
| ----------------------------------------------------------- | ---------------------------------------------------- |
| Press T                                                     | 76 proposals                                         |
| Accept-all                                                  | Stamps land on disk (correctly)                      |
| Immediate re-scan                                           | Same 76 proposals                                    |
| Restart app, re-scan                                        | Same 76 proposals                                    |
| Manually edit `tended_on` to `{obvious-link: true}` in yaml | 0 proposals (dict shape satisfies the broken reader) |

The data is being WRITTEN correctly. It's only being READ wrong.
That's why a git diff on the note files looks fine — every accept
leaves a growing array of pass keys. Tend just doesn't see them.

---

## 3. Why it hasn't caught anyone before

Two reasons:

### 3.1 Small vaults never noticed

On a 10-note test vault, a second Tend run might find 2-3 fresh
proposals (new links, new mass → new tag inferences). The "repeat"
noise was masked by legitimate fresh finds.

### 3.2 The "polish" pipeline made it feel intentional

During polish, the model rewords reasons. A second scan produces
the same rule-proposed action but with a different polished reason.
The user sees a not-identical drawer and assumes it's a legitimate
new proposal. Polish obscured the bug.

At 1000+ proposal scale, polish is suspended mid-bulk (by my
earlier `isBulkInProgress` change), so the user sees the raw
duplication clearly.

---

## 4. Fix

Make `alreadyTended` tolerant of both shapes (array is the current
writer output; dict is the legacy shape the reader was written
for). Also respect the `rejected:` prefix so rejected proposals
don't come back either.

### 4.1 The patch

```js
function alreadyTended(vault, proposal) {
  const note = vault.byId.get(proposal.noteId);
  if (!note) return true;
  const stamp = note.frontmatter?.tended_on;
  if (!stamp) return false;
  const key = keyForProposal(proposal);
  const rejectedKey = `rejected:${key}`;

  if (Array.isArray(stamp)) {
    return stamp.includes(key) || stamp.includes(rejectedKey);
  }
  if (typeof stamp === "object") {
    // Legacy dict shape: accept either truthy value or the rejected
    // alias. Kept so any hand-edited existing data keeps working.
    return !!stamp[key] || !!stamp[rejectedKey];
  }
  return false;
}
```

### 4.2 Why not also "fix" the writer to use dict shape?

- The array shape is already on every user's disk. Changing the
  writer would orphan existing stamps.
- The array shape is what dream logs, backup tooling, and any
  external consumer of the note frontmatter already sees.
- Dict shape silently drops duplicates; array shape preserves a
  chronological trail ("this note was tended for obvious-link N
  times over M passes") which is auditable.

Keep the writer. Fix the reader.

### 4.3 Why check `rejected:` too

`rejectProposal` in `tend-apply.js` writes `rejected:<key>` into
the same `tended_on` array. A user who REJECTED a proposal (saying
"no, I don't want this tag") should not see it surface again on
the next scan. Today the reader misses both stamps — accept AND
reject — so rejected proposals come back too. The rejectedKey
branch above covers that.

---

## 5. Verification

After the fix:

1. Press T → 76 proposals.
2. Accept 1 individually → proposal vanishes from drawer.
3. Press T to close, press T to reopen → **75 proposals**, not 76.
   (The accepted one stays gone.)
4. Accept-all the remaining 75 → drawer empties.
5. Press T again → **0 proposals. "Nothing obvious to tend right
   now" toast.** No flicker, no regeneration.
6. Close drawer. Edit one of the accepted notes — add a new
   wikilink target that creates a fresh obvious-link case. Press
   T → **1 proposal**, the fresh one. Old stamps remain respected.

For the reject path:

1. Press T → proposals appear.
2. Reject one.
3. Re-scan → rejected proposal DOES NOT come back.

---

## 6. Unrelated but adjacent questions this raised

### 6.1 Should Tend auto-scan after a bulk accept?

Today: no. The drawer just shows the post-accept state (empty if
everything was processed). User has to hit T to rescan.

When the reader is fixed, the post-bulk drawer will stay legitimately
empty most of the time. Currently it's populated by duplicates.
Once the duplicates stop, there's no reason to change the "T to
rescan" gesture.

### 6.2 Why did the user see "76 started over automatically" right

after the first accept-all finished?

Almost certainly because they pressed T after accept-all completed.
T on an empty drawer runs `runTendAndOpen` which re-scans. Scanner
returns the same 76 because `alreadyTended` returns false for all
of them. Same bug, different trigger path.

### 6.3 Could polish's background refresh be implicated?

No. Polish only mutates `proposal.reason`; it doesn't add or remove
proposals. After my `isBulkInProgress` change polish is suspended
during bulk anyway.

### 6.4 Is there a migration concern?

No — the array shape is already the de facto format on every
user's disk. The fix just makes the reader understand what the
writer has always written.

---

## 7. Scope

Three lines in `tend.js`'s `alreadyTended` function. No schema
change, no frontmatter migration, no test updates (there's no test
suite for this module today).

Ship time: ~5 minutes.

---

## 7.5 Pacing — let it go at the LLM's speed

Orthogonal to the stamp-mismatch bug, a design note worth
capturing here because the same user session surfaced it:

**The right pace for a bulk accept is whatever the model can
comfortably handle while everything else continues to breathe.**
There's no reason to sprint a 1280-proposal batch through in 30
seconds. A user who started Accept-all on that many items is
committing a walk-away session — they don't need the tab
responsive, they need it to FINISH without the system tipping
over. Fast + crashy is worse than slow + reliable.

Implications for `BATCH_PAUSE_MS` and the polish suspension:

- **Raise `BATCH_PAUSE_MS` to match LLM turnaround.** Polish today
  takes ~200-500 ms per reason via Claude / local Ollama. Pace
  the bulk accept at ~250 ms per item. That's ~5 minutes for a
  1000-proposal batch — fine for a walk-away. The main thread is
  idle 90%+ of each cycle.
- **Reconsider suspending polish during bulk.** The current
  `isBulkInProgress` flag stops polish entirely. If bulk paces at
  polish's natural speed, polish can run CONCURRENTLY — every
  bulk yield gives polish a turn to finish an in-flight call. By
  batch end every surviving reason is polished, and the user
  comes back to a fully-tended vault.
- **Add a user knob.** Settings → Tend → Bulk pace:
  - `Fast` (current default ~28 ms) — for small batches on beefy
    machines.
  - `Chill` (~250 ms) — default. Matches LLM cadence. Unhurried.
  - `Manual` — user clicks each accept.
  - No `Instant` tier. "Instant" is the crash path.

The spec already allows this: `BATCH_PAUSE_MS` is a constant
waiting to become a setting. No architectural change — just a few
defaults + a radio picker in Settings.

This is a small follow-up (~45 min) best done AFTER the stamp fix
in §4 lands. Sequence matters: fix the correctness bug first so
the user isn't redoing work; add the pacing tier second so big
batches are survivable by design, not by accident.

---

## 8. One sentence

Tend's "already done?" check was written for a dict shape that
`stampTendedOn` never produced — it always wrote an array — so
`stamp[key]` returned `undefined` on every scan and every
previously-accepted proposal was re-proposed as if nothing had
happened.

#tend #bug #data-shape #frontmatter
