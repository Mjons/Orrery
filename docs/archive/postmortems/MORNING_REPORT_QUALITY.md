---
tended_on: [tag-infer]
created: "2026-04-25T00:00:00.000Z"
---

# MORNING_REPORT_QUALITY.md

Six fixes to lift Boltzsidian's dream output from "occasionally
insightful, mostly noise" to "ruthlessly conservative, every survivor
worth a sip of coffee." Diagnosed from two batches of real outputs
(2026-04-24 / -25) on Qwen 2.5 9B locally.

---

## Diagnosis

Across 10 surfaced ideas:

- **2 / 10 were genuinely useful** (Messier↔Hubble, CodeMirror↔FSA).
  Both share a real compositional axis (#person tag; same
  architectural cluster) and quote literal phrases from both notes.
- **6 / 10 were self-refutations** dressed as findings. The adversary
  pass produced a "counter" that doesn't stand on its own — it just
  says "X is not Y." Per the [adversary prompt](../boltzsidian/src/layers/utterance/local-backend.js)
  rules these should be rejected, but the model ignores the rule.
- **2 / 10 leaked system metadata into the claim** ("older than an
  hour", "boltzsidian's age is just a couple of days stale"). The
  `age_gap` slot in the prompt is being read as content.
- **Salience mis-ranks**. Output 1 (nonsense) scored 0.67; Output 4
  (the good one) scored 0.58. The metric rewards confident-sounding
  claims over verifiable ones.

These are the failure modes. The fixes attack each.

---

## The six fixes (priority order)

### 1. Drop pure-refutation counters before surfacing (Fix A)

The single highest-ROI change.

When the adversary returns `verdict: "replaced"`, run a regex check on
`counter_claim` for negation patterns: starts with "the claim", "the
evidence", "this misapplies", "this conflates", "X does not", "X
falsely", "ignoring that", "assumes", etc. If matched, **drop the
candidate entirely** — don't replace, don't surface, don't log to disk.
The original claim was weak enough to be replaced and the replacement
was just refutation, not insight. Silence is the right behaviour.

Code: [`salience-layer.js`](../boltzsidian/src/layers/salience-layer.js)
`runAdversary()` and `qualityFilter()`.

### 2. Strip system metadata from prompts (Fix C)

The `age_gap` slot in `buildIdeaSeedUserPrompt` is the source of the
"older than an hour" leakage. Two changes:

- Remove the `age_gap` slot from the user prompt entirely.
- Add a directive to the system prompt: _"Never reference the
  Boltzsidian system, the dream cycle, your run time, note staleness,
  or temporal metadata about how long ago notes were edited. The
  notes' content is your only source."_

Code: [`local-backend.js`](../boltzsidian/src/layers/utterance/local-backend.js)
`"idea-seed"` system prompt + `buildIdeaSeedUserPrompt`.

### 3. Require a compositional axis (Fix D)

A pair only surfaces if it shares at least one of:

- A tag (`shared_tag` slot present)
- A folder (`shared_folder` slot present)
- A kind (both #person, both #object, both #event, etc.)
- An explicit named axis in the claim ("contrast", "depth", "scale",
  "time", etc. — kept open to extend)

Pairs without any axis (e.g. `Black hole · M45 Pleiades`, `Export
formats · Stripe Subscription`) get dropped at the surfacing gate.
Affinity-space resonance is good for _generating_ candidates but too
permissive for _surfacing_ them.

Code: `qualityFilter()` reads `parentA` / `parentB` and inspects their
shared metadata.

### 4. Specificity gate (Fix B)

Compute a specificity score for each surfaced candidate:

- Count tokens in the claim that appear verbatim in either source
  note's body (case-insensitive, ≥ 4 chars).
- Add weight for numbers and proper nouns (capitalised words) from
  the source.
- Normalise by claim length.

If `specificity < 0.15`, drop. This kills vague-but-confident outputs
like "PSD bundle expiration depends on backend logic, not just
subscriber payments" — high salience, zero literal grounding.

Code: `qualityFilter()` calls `computeSpecificity(claim, parentA,
parentB)`.

### 5. Verifiable Next action (Fix E)

Reject Next actions that don't reference at least one source note title
OR don't begin with a verb of action ("add", "link", "create",
"rename", "tag", "delete"). Vibes ("consider", "explore", "think
about", "draft") without an anchor get dropped.

Cheapest version: if `next` doesn't contain either source title (case-
insensitive) AND doesn't start with one of the action verbs, drop the
candidate.

Code: `qualityFilter()` calls `hasVerifiableNext(next, parentA,
parentB)`.

### 6. Hide score numbers from the drawer (Fix F)

The `salience 0.66 · novelty 1.00 · reach 0.33` line in the ideas
drawer invites the user to second-guess the score rather than judge the
suggestion. Wrap the score display in a `?debug` URL flag so it's
visible during tuning but not in the daily morning brief.

Code: [`ideas-drawer.js`](../boltzsidian/src/ui/ideas-drawer.js) lines
285–289 — gate behind `location.search.includes("debug=salience")`.

---

## Quality filter, in one place

All six fixes funnel through one new function in `salience-layer.js`:

```js
function qualityFilter(candidate) {
  // Fix A — pure-refutation counter
  if (candidate.adversaryReason && isNegationOnly(candidate.claim)) {
    return { drop: true, reason: "negation-only counter" };
  }
  // Fix D — compositional axis
  if (!hasAxis(candidate.parentA, candidate.parentB)) {
    return { drop: true, reason: "no compositional axis" };
  }
  // Fix B — specificity
  const spec = computeSpecificity(candidate);
  if (spec < 0.15) {
    return { drop: true, reason: `specificity too low (${spec.toFixed(2)})` };
  }
  // Fix E — verifiable next
  if (!hasVerifiableNext(candidate)) {
    return { drop: true, reason: "vague next action" };
  }
  candidate.specificity = spec;
  return { drop: false };
}
```

Called once at the end of `applySalienceWinners` and once after the
judge replaces `surfaced`. Drops are logged to `console.debug` so we
can audit during tuning. The drawer renders the survivors only — never
sees what was filtered.

---

## Acceptance criteria

Run a Dream Now cycle on the demo vault + Michael's vault. Compare
before / after on the same model (Qwen 2.5 9B):

1. **Self-refutation rate ≤ 5%**, measured by a manual spot-check on
   20 surfaced outputs across 4 cycles. (Was ~50% in the audited
   batches.)
2. **Specificity median ≥ 0.30** across surfaced outputs. (Spot-checks
   suggest current median is ~0.10.)
3. **Surfaced count median: 2–3 per cycle**, not 5. Fewer items
   forces the filter to be ruthless and the drawer to feel
   high-signal. (Currently up to 5.)
4. **Zero outputs reference system metadata** ("hour", "tonight",
   "stale", "Boltzsidian", "the dream") across 20 spot-checks.
5. **Every surfaced item passes a "would I act on this?" test from
   Michael** at a 60% rate. Currently ~25% by his read.

If any of 1–4 fail, the filter is too loose and we tighten thresholds.
If 5 fails despite 1–4 passing, the _generation_ prompt needs work,
not the filter.

---

## What we deliberately did not do

- **Bigger model.** Tempting (14B would catch more conflations than
  9B), but every fix here is independent of model and lifts every
  model. Ship the fixes first; upgrade to Qwen 14B as a follow-up if
  the spot-checks show the floor still isn't high enough.
- **Two-pass pipeline (9B generate, 14B judge).** Same reasoning —
  defer until the cheap fixes are exhausted.
- **Replace the salience scoring formula.** The math is reasonable;
  the issue is what we _do_ with the scores (mis-ranking + showing
  them to users). Both addressed by Fixes B and F.
- **Cross-encoder re-ranking.** Adds a second model download and
  ~50 ms per query. Out of scope for this pass; revisit if Fix B
  alone doesn't move the needle.

---

## Rollback

Every fix is gated independently. If the surfaced count drops to zero
on real vaults (filter too aggressive), the order to relax is:

1. Lower the specificity threshold (0.15 → 0.10).
2. Drop the verifiable-next requirement (Fix E).
3. Allow pairs without explicit axis if salience > 0.7 (loosen Fix D).

Keep Fixes A, C, F always-on — they're correctness, not tuning.

#feature #phase
