---
tended_on: [tag-infer]
id: 01KPS7VDJQEXCQ6F5R21YB4002
created: "2026-04-21T13:05:01.626Z"
---

# LIBRARIAN.md — Letting the universe help you tidy

A speculative design doc. The question Michael asked:

> Like we should be able to organize a disorganized brain and infer
> connections and create tags etc. Will our system be able to do that
> with Claude plugged in?

Short answer: yes, and it's one of the biggest things the product could
do. Long answer: it's also the single feature most likely to turn
Boltzsidian into every other AI-wrapper-on-top-of-notes app if we get
the posture wrong. This doc is how to get the posture right.

---

## 0. The role

Imagine a librarian who comes in while you're away.

She doesn't edit your books. She doesn't rewrite your paragraphs. She
doesn't summarize your thoughts back at you. What she does:

- Notices that three of your books are clearly about the same subject
  and suggests a shelf label.
- Spots that you've misfiled one into the wrong section.
- Finds the two volumes that reference each other and ties a piece of
  string between them on the shelf.
- Flags the stack of loose papers on your desk: "these seem orphaned —
  want me to find a home for them?"
- Leaves a neat index card on your desk with a handful of proposals:
  _add this label; link these two books; move this stack to the
  reference section._
- Waits for you to come back and decide.

She never acts on her own. She never edits the inside of a book. She
_proposes_, and the proposals are easy to accept or reject one at a
time.

**This is the role.** Everything else in the doc is a consequence.

---

## 1. What she gets to do

Ten tasks, ranked by risk (lowest to highest). Each has a preconditon,
a prompt, and an outcome. Some need an LLM; some don't.

### 1.1 Tag normalization (no LLM)

> You have `#work`, `#job`, `#worklife`. Use one?

Pure string-similarity — edit distance, shared substrings, known
synonyms from a small hand-curated list. Detect near-duplicate tags,
surface as a suggestion, let the user merge. Ships without a key.

### 1.2 Orphan rescue (no LLM)

> These 14 notes have zero incoming or outgoing links. The ones in
> `/travel/` and `/work/` have clusters they could join. The ones in
> `/ideas/` don't, and have looked like this for 6 months.

Pure graph analysis. Detect halo notes, group by folder + tag, propose
candidate neighborhoods. No AI required; this is what the
_Halo formation_ gives you visually, plus a prose version.

### 1.3 Link density check (no LLM)

> Your `/music/` cluster has 24 notes and 3 links. Your `/art/`
> cluster has 18 notes and 41. Something's underlinked.

Compute link-to-note ratio per cluster (folder or tag region). Low
ratios surface as "this area feels underlinked — want to run the
link-inference pass?"

### 1.4 Tag suggestion (LLM)

> "This note mentions your brother five times and describes a conflict.
> Consider: `#family`, `#brother`, `#conflict`."

Per-note snapshot → model generates 2–5 candidate tags drawn from
your existing tag universe (never inventing new ones unless you allow
it). Sorted by confidence. You click to accept.

### 1.5 Link inference (LLM)

> "This note and _Childhood Summers_ both describe the cabin, the dog,
> and the same thunderstorm. They aren't linked. Link them?"

Given one note plus its N nearest semantic neighbors (by affinity
vector, or a cheaper BM25 match if no vectors), the LLM proposes
specific `[[links]]` with a one-sentence justification each. The user
accepts per link. The biggest payoff task, and the reason people will
install Boltzsidian.

### 1.6 Cluster naming (LLM)

> "This tightly-linked cluster of 12 notes is mostly about: learning
> to code. Suggested tag: `#learning-to-code`. Suggested folder:
> `/learning/code/`."

LLM receives titles + first-100-words of each note in a detected
cluster, returns a short label candidate. Useful after you've written
your way into a theme you hadn't named yet.

### 1.7 Kind reassignment (LLM, cheap)

> "This note is tagged `#episode` but it reads like a fact. Want to
> retag?"

Given your _tag → kind mapping_ and the note's body, the LLM checks
whether the assigned kind plausibly fits the content. Often catches
old notes whose content has drifted from their filing.

### 1.8 Spin-off extraction (LLM)

> "This 3,000-word note has three distinct threads: X, Y, Z. Consider
> splitting into 3 notes with `[[links]]` between them."

Structural analysis of a long note. Identifies topic shifts and
proposes a split. User reviews the proposed split, accepts or rejects.

### 1.9 Contradiction flag (LLM)

> "In _Dieting_ you said X. In _Food Truths_ you said the opposite of
> X. You may want to reconcile."

Two-note pairs flagged where the LLM detects logical conflict. Rare
but high-value. Purely advisory — never edits.

### 1.10 The weekly index (LLM)

> "This week you wrote or edited 14 notes. They touched three themes:
> … Two of them could link to older notes. Here's a card."

An optional recurring job (run on demand or weekly) that gives you a
one-page summary of _your writing activity and its shape_. Not
written into your vault — shown in a drawer you can dismiss.

---

## 2. The Suggestions drawer

All ten tasks dump their output into one surface: the **Suggestions
drawer**. Right-side panel, scrollable list of index cards. Each card
has:

```
┌───────────────────────────────────────────────────┐
│ Link inference · Childhood Summers                │
│                                                   │
│ This note and "The Cabin" both describe the       │
│ cabin, the dog, and the thunderstorm. They        │
│ aren't linked yet.                                │
│                                                   │
│ Propose:  [[The Cabin]]                           │
│                                                   │
│       [Accept]  [Dismiss]  [View both]  [Edit]    │
└───────────────────────────────────────────────────┘
```

One card = one atomic change. _Accept_ applies it and writes to disk.
_Dismiss_ records that you've seen it (so it doesn't come back next
week). _View both_ opens the two notes side-by-side. _Edit_ lets you
modify the proposal (rename a suggested tag, change the link text)
before accepting.

Nothing touches your files outside this drawer.

Drawer lives at Cmd+I ("intelligence") or a small icon in the top-right
HUD. Unseen suggestions show a dot on the icon.

---

## 3. How the librarian sees your vault

This is the privacy section. Read it twice.

### 3.1 Per-task scoped snapshots

The LLM _never_ gets your whole vault in a single prompt. It gets
task-scoped snapshots:

| Task                | What the LLM sees                                                   |
| ------------------- | ------------------------------------------------------------------- |
| Tag suggestion      | One note's body + your existing tag list                            |
| Link inference      | One note's body + N (≤12) nearest-neighbor titles + first-200-words |
| Cluster naming      | Titles + first-100-words of the cluster members (≤15)               |
| Kind reassignment   | One note's body + your kind labels                                  |
| Spin-off extraction | One note's body                                                     |
| Contradiction flag  | Two notes' bodies                                                   |
| Weekly index        | This week's edited notes' titles + first-paragraphs                 |

Never: "here is my vault, please organize it." Always a scoped,
specific question with a bounded payload.

### 3.2 Always visible

The drawer includes a **payload preview** button on each card: "see
what was sent." Clicking opens a modal with the exact bytes that went
to the model. No hidden prompts, no system-message surprises.

### 3.3 Opt-in per task

Each of the 7 LLM-native tasks has its own setting. The user can:

- Enable or disable individual tasks
- Cap their run frequency (e.g. "tag suggestion: one per day")
- Cap their cost (e.g. "link inference: $0.50 / week max")
- Provide per-task instructions ("never touch notes in `/therapy/`")

Default: everything off. The user turns on what they want, one by one.
Boltzsidian will not surprise you with a bill or a violation of
intent.

### 3.4 Respecting `.universeignore`

Any note inside a `.universeignore`-matching folder is simply invisible
to the librarian. Not redacted — invisible. The payload never contains
it; the snapshots skip it; the affinity vector isn't computed.

### 3.5 Local-only option

Every task has a fallback implementation using _Web-LLM_ (on-device
model). Quality is lower; privacy is total. A toggle per task picks
the backend.

The user can live in full-privacy mode forever. The librarian's heuristic
tasks (1.1, 1.2, 1.3) still work; the AI-native tasks downgrade to
on-device; the weekly index downgrades to "what you wrote, without
any prose summary."

---

## 4. Cost transparency

Token counts and prices are shown upfront.

- Before running a batch, the drawer shows: "10 candidates · est.
  ~12k tokens · ~$0.04 on Claude Sonnet / ~free on Web-LLM."
- Per task: a running tally of spend this month.
- A **hard cap** the user sets (default $5/month) stops tasks from
  running past it.

No progress bars, no opaque "working…" states. Either the card is
there or it isn't; cost is visible either way.

---

## 5. How this composes with the rest

The librarian is a _fourth layer_ alongside the three that already
exist in the product:

| Layer          | What it does                             | When it runs              |
| -------------- | ---------------------------------------- | ------------------------- |
| Write surface  | You create / edit / link                 | Wake, driven by you       |
| Dream mode     | Physics collides ideas into new ones     | Idle or Cmd+D, unattended |
| Meaning filter | Promotes high-resonance dream-born ideas | Inside a dream            |
| **Librarian**  | Proposes tidying actions to a queue      | Manual trigger or weekly  |

Key distinction: **dream mode produces new content; the librarian
organizes existing content.** They never step on each other.

A natural integration: the librarian can _notice_ dream-born ideas
that the user ratified last week and propose moving them out of
`/ideas/` into their right folder now that they've been kept. That's
the one place the two layers touch.

---

## 6. What the librarian does not get to do

The boundary is load-bearing.

- **Never writes prose content.** The librarian doesn't summarize, TLDR,
  rephrase, "improve," or autocomplete inside a note's body. The only
  text it generates is: tag names, folder names, link targets, and
  prose justifications _in the drawer_.
- **Never deletes.** No task ever removes a note, link, or tag. The
  drawer can propose _removal_, but acceptance only marks for review;
  the user manually deletes if they want to.
- **Never runs silently.** All librarian runs write to
  `.universe/librarian.log` with timestamp, task, snapshot bytes, and
  outcome. You can grep your own audit trail.
- **Never reorganizes in a single stroke.** There is no "tidy my whole
  vault" button. All action is atomic per card, reviewed by you.
- **Never uses the vault to train a model.** No outbound telemetry of
  any kind. The Claude / Gemini API path inherits the provider's
  terms; the user opts into those knowingly.
- **Never replaces the user's voice.** If a note reads like you wrote
  it at 2 AM and it's raw and ungrammatical, the librarian does not
  have an opinion about that. She shelves books; she doesn't copy-edit
  them.

If a feature request would cross any of these lines, it's not a
Boltzsidian feature. Build it in a different product.

---

## 7. Phasing

### 7.1 Phase 3.8 — Heuristic librarian (no LLM)

Lands after Phase 3.7 (formations). Ships the three no-LLM tasks:

- Tag normalization
- Orphan rescue
- Link density check

Plus the full **Suggestions drawer** UI. This is the surface the AI
tasks will plug into later. Even without any LLM, having the drawer
populated with heuristic suggestions is useful.

Duration: ~1 week. No dependency on Phase 7.

### 7.2 Phase 8 — AI librarian (uses Phase 7 backends)

Lands after Phase 7 (voice backends available). Adds the seven
LLM-native tasks, each individually toggleable and cost-capped:

- Tag suggestion
- Link inference
- Cluster naming
- Kind reassignment
- Spin-off extraction
- Contradiction flag
- Weekly index

Each task is a separate prompt template, a separate module, and a
separate entry in settings. Ship them incrementally; an early release
might include only Tag suggestion and Link inference, with the rest
behind an "experimental" flag.

Duration: ~2–3 weeks, plus ongoing prompt tuning. The surface never
moves; the tasks fill in.

---

## 8. What this unlocks

- **The "disorganized brain" problem gets a real answer** that respects
  authorship. Your vault gets cleaner without your notes getting
  rewritten.
- **Link inference is transformative.** Every note-taking tool today
  relies on the user to remember which notes connect. A system that
  _sees_ connections you've forgotten, proposes them, and waits for
  you to confirm is a genuinely new capability in this category.
- **Tag discipline becomes optional.** You don't have to invent a
  taxonomy up front — you write, the librarian proposes labels when
  patterns emerge. The taxonomy grows from use, not from planning.
- **The weekly index is a gift to anyone who journals.** One page a
  week, automatically, showing you the shape of what you wrote. It's
  the thing users will share screenshots of.
- **Privacy stays intact** because every payload is bounded and
  visible. You can use the LLM features and still trust the tool.

---

## 9. One sentence

The librarian organizes your books; she does not rewrite them, and she
never moves a single volume without your nod.

If the posture holds, Phase 8 is the thing that makes Boltzsidian not
just beautiful and not just useful, but _remarkable_ — the note-taking
app that actually helps you think clearer without doing the thinking
for you.

#user #phase #feature
