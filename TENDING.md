# TENDING.md — How the Janitor Gets Better

A speculative design doc. STATES.md §2 introduces Tend — the manual
scanner that proposes obvious structural work on a vault. The v1
shipped in Phase 6.5 and its first real-vault run was informative: it
worked, it produced proposals, and most of them were wrong.

"Most of them were wrong" is, for this kind of system, not a failure.
It's **labelled training data**. Every Accept, Reject, and Skip is a
binary signal over a specific proposal shape. The interesting question
isn't _did the first run go well_ — it's _does the tenth run go
better than the first_.

This doc is about that loop. What to log, what to learn, how to avoid
learning the wrong things, and what the smallest useful version looks
like.

Nothing here is committed. It's the improvement surface we'd build
once Phase 6.5 has run on a real vault for a month.

---

## 0. Premise

Phase 6.5 Tend has hard-coded constants at the top of `tend.js`:

```js
const TAG_INFER_MIN_COHORT = 3;
const TAG_INFER_MIN_HITS_BODY = 2;
const TAG_INFER_MAX_PER_NOTE = 3;
const STUB_MAX_WORDS = 30;
```

These are reasonable guesses. They will be wrong for any specific
vault — Michael's technical-notes vault and his partner's recipe vault
probably want different thresholds. Hand-tuning for every user is
infeasible. Watching each user's decisions and adjusting is feasible
and almost-free — we already have the signal, we just aren't writing
it down.

The claim: **Tend's scoring function should be a function of (vault,
user-history), not just (vault).** The user-history part is
per-vault, written to `.universe/tend-history.json`, read on every
subsequent run.

---

## 1. What gets logged

Every Accept / Reject / Skip is persisted:

```json
{
  "version": 1,
  "runs": [
    {
      "at": "2026-04-22T09:14:00Z",
      "total_scanned": 62,
      "proposals": 14,
      "decisions": [
        { "pass": "tag-infer", "note": "boltzsidian/vision/anti-mysticism.md",
          "tags": ["decision"], "outcome": "accepted" },
        { "pass": "tag-infer", "note": "…/meeting.md",
          "tags": ["note"], "outcome": "rejected" },
        { "pass": "obvious-link", "from": "…/2026-02-14.md",
          "to": "…/first-run-experience.md", "outcome": "accepted" },
        …
      ]
    },
    …
  ]
}
```

One file. Append-only. Easy to audit with `cat`. Easy to reset by
deleting. The data doesn't leave the vault.

### 1.1 What's deliberately not logged

- **Free text.** We don't log the note body or the exact body phrases
  that triggered tag-inference. Only the outcome and enough structure
  (pass, note path, proposed tags / targets) to re-run the same
  decision.
- **Time-on-decision.** Nice signal, but invasive feeling. Skip.
- **Cross-vault aggregation.** Never. Each vault's tend-history is
  that vault's alone — no analytics pipeline, no cloud, no anything.

---

## 2. Acceptance-rate per pass → threshold nudges

Simplest possible loop, and probably the most useful.

For each pass, compute the 30-day rolling accept rate. If it deviates
from the target (say 70% per BUILD_PLAN §Phase 6.5 exit gate), nudge
the pass's threshold:

```
If accept_rate < 0.4:  tighten threshold by 5%.  (The bar was too low.)
If accept_rate > 0.85: loosen threshold by 5%.   (The bar was too high.)
```

Nudges are tiny and capped (±5% per run, max ±50% cumulative).
Displayed in the debug palette so the user can see what's drifting
and reset. Never auto-runs without the user having run Tend manually
at least N times — we need real data, not speculation, before
adjusting.

Separate accept-rate tracking per pass. A user who loves tag-inference
suggestions but hates obvious-link suggestions gets two independent
dials.

---

## 3. Per-user stopword learning

The `TAG_STOPWORDS` list in `tend.js` is hand-picked generics
(`note`, `day`, `project`, `work`, …). A specific vault may have tags
that ARE too generic FOR THAT VAULT — e.g. a novelist's vault where
`#character` appears in every body and gets proposed everywhere.

After K consecutive rejections of a specific (pass, tag) pair, the
system auto-adds to a **per-vault stopword list** stored in
tend-history.json. Future runs suppress that tag from the inference
pass. The user can see and edit the list in Settings → Tend.

Reverse: if a tag was stopworded but later the user manually adds it
to 3+ notes, auto-remove from the stopword list. Tend's stopwording
should follow the user's behaviour, not fight it.

Similarly for obvious-link: if A→B gets rejected 3 times, stop
proposing A→B. (Different from the current `tended_on: [rejected:…]`
stamp, which only covers the exact pair — a smarter version would
track "user never wants obvious-link proposals between these two
folders" etc.)

---

## 4. Confidence calibration

Proposals carry a `confidence` score (0–1) that's currently
hand-authored — 0.85 for obvious-link, 0.7 for fm-normalise, etc.
Over enough runs, we can check whether "0.85 confidence" proposals
actually get accepted 85% of the time. If not, the scoring function
is miscalibrated.

Simplest correction: bucket decisions into confidence bins (0.5-0.6,
0.6-0.7, …) and compute empirical accept rate per bin. If the curve
is shifted, apply an isotonic regression correction at display time
(so the user sees honest confidence) and at threshold time (so the
filter uses real data).

This is the same trick weather forecasts use to turn model output
into "70% chance of rain" that actually means 70% chance of rain.

---

## 5. Miss detection

The hardest signal: proposals Tend _should have made_ but didn't.
Two proxies:

- **User-added tags.** If the user manually adds `#person` to a note
  whose body contains clear `#person`-ish evidence, and Tend had
  recently scanned and NOT proposed it, log that as a miss for the
  tag-inference pass.
- **User-added links.** Same pattern. If the user types `[[Michael]]`
  into a note's body during wake, and the title "Michael" was present
  in the body before the link was added, Tend's obvious-link pass
  should have proposed it. Log the miss.

Miss detection requires the saver to compare the post-save note to
the pre-save note and check against the evidence Tend _could have_
used. A few hundred lines and a tend-history field per miss.

Miss rate complements acceptance rate: low acceptance + high miss
rate = threshold is both too loose AND too strict simultaneously,
which means the _criterion_ is wrong, not the threshold. Time to
rework that pass.

---

## 6. Meta-proposals

After enough data, Tend can surface proposals about itself:

- _"You've rejected 9 out of 11 tag-inference proposals for #note.
  Stop suggesting #note?"_
- _"The frontmatter-normalisation pass accepts at 94%. Can I run it
  automatically on newly-imported folders?"_
- _"Obvious-link proposals between /daily/ and /ideas/ reject at
  100%. Stop proposing across those folders?"_

Meta-proposals live in the same drawer as regular proposals, visually
distinct. Accept one and the underlying rule (stopword, auto-run
permission, folder-pair exclusion) gets written to the tend-history.

Meta-proposals are the _explicit_ version of the implicit learning
from §2–§3. The implicit version does the adjusting silently.
Meta-proposals ask first. Both have their place — the meta version
builds trust; the silent version saves attention.

---

## 7. Privacy is the constraint, not the feature

Everything in this doc stays local. The tend-history file is a sibling
of `.universe/state.json` and `.universe/prune-candidates.json` —
never synced, never uploaded, never aggregated. That's a hard rule.

The temptation to learn across users is enormous and should be
resisted. A "vault-of-vaults" aggregated scoring model would be
useful, but it would also be the single fastest way to erode the
trust that makes users willing to point the tool at their real notes.
BOLTZSIDIAN.md's no-telemetry commitment is load-bearing; tend-history
must not become the hole that rule crawls through.

If we ever ship a hosted variant, it ships with tend-history
**disabled** by default, and the user opts in per-vault via a toggle
that says exactly what's being stored. Probably we never ship that.

---

## 8. Risks of the improvement loop

### 8.1 Overfitting to the first runs

A user who opens Tend, rejects everything in a grumpy mood, and
closes the drawer trains the system to propose less of everything.
The next week Tend feels dead.

Guard: nudges from §2 are capped in magnitude (±5% per run, max
±50% cumulative) and require N≥5 runs of data before any adjustment
triggers. Early bad moods don't cascade.

### 8.2 Stockholm-syndrome tuning

If Tend only keeps suggesting things the user accepts, it never
surprises them with the missed thing they needed to see. The system
becomes a yes-machine.

Guard: reserve ~10% of proposals per run for "exploration" — items
that current scoring would suppress but that fit a slightly different
criterion. Think epsilon-greedy bandits. Logged separately so the
user can tell when the system is intentionally showing them something
unusual.

### 8.3 Signal contamination from bulk-accept

The Phase 6.5 "Accept all in this group" button treats every item as
an individually-endorsed accept. At scale, a bulk accept from a
distracted user poisons the accept-rate signal.

Guard: log bulk-accepts with a flag. Weight them at 0.3× of
individually-clicked accepts when computing rates. Per-item
individual review is always stronger signal than "the user hit accept
all while checking email."

### 8.4 The user can't tell the system changed

Silent tuning is efficient but undermines trust. The user runs Tend
today, gets a different set of proposals than a month ago, and has no
idea why.

Guard: the Tend debug panel (a sibling of Shift+S for salience)
shows the current threshold values, their default baselines, and the
last N nudges with reasons. Never a surprise. Resettable in one
click. Every adjustment is inspectable.

### 8.5 The log grows forever

At 14 proposals × 30 decisions per user per day, tend-history will
hit MB-scale in a year. Not a disaster, but also not disciplined.

Guard: roll up runs older than 60 days into a compact
`rolledup: { pass: { accepted, rejected, skipped } }` summary, drop
the per-proposal detail. The derivatives (acceptance rates, stopword
lists) stay; the raw history doesn't.

---

## 9. Minimal first cut

When (if) we revisit Tend's improvement loop, the weekend version:

1. **Write every decision to `.universe/tend-history.json`** — the
   full structure from §1. Zero dashboard, zero reading. Just record.
2. **One month later, read it.** Compute per-pass accept rates
   manually via the dev console. Look at which passes are dying, which
   are thriving, which are too generous. This is the version that
   informs whether automation is even worth building.
3. **Nudge thresholds by hand** if the numbers clearly want it. Move
   the hard-coded constants in `tend.js`. Ship.
4. **Only then** automate §2's threshold nudging behind a settings
   toggle, defaulting OFF.
5. **§3 stopword learning** after threshold-nudging has a month of
   data behind it.
6. **§6 meta-proposals** only if §3 is running cleanly. Probably a
   post-1.0 feature.
7. **§5 miss detection** is the richest signal and the most engineering
   work. Defer until the basic loop feels earned.

The pattern: log everything from day one, act on nothing until the
data actually tells us something. The first run of the improvement
loop is the same shape as the first run of Tend itself — it does a
shitty job, and that's fine, and the observation of the shitty job is
the input to the next run.

---

## 10. What this is in one sentence

Tend currently proposes what it thinks a human would notice; over
time, it should propose what _this specific human, in this specific
vault_ actually wants noticed — without ever sending a byte of that
observation anywhere else.
