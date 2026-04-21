# MODEL_SURFACES.md — Where model output is allowed to live

A speculative design doc. Phase 7 (BUILD*PLAN §Phase 7) ships the
access layer: a pluggable `UtteranceBackend` interface, key storage
with Credential-Management fallback, payload preview, transparent
template fallback. The \_scope* in BUILD_PLAN is narrow — chorus
sentences, dream reports, maybe salience seed text.

Local models break the narrow-scope argument. Once WebLLM is
downloaded, inference is free per call. The "LLMs are only for voice
because tokens cost money" line doesn't hold up. So the real question
is: _where else in this app should model output be allowed to live, and
what keeps those additions from eroding the trust the product is built
on?_

This doc is that question. It's a map, not a commit. Nothing here
ships in Phase 7. It exists so that when we extend beyond voice,
we've already thought once about the shape.

---

## 0. Premise

Four backends available after Phase 7:

| Backend   | Source                                  | Quality                       | Cost per call | Offline to the internet | Cold-start                 |
| --------- | --------------------------------------- | ----------------------------- | ------------- | ----------------------- | -------------------------- |
| template  | chorus-templates.js                     | floor                         | free          | yes                     | none                       |
| local-rig | self-hosted OpenAI-compatible endpoint  | _yours_ — whatever you loaded | free          | yes (LAN traffic only)  | none (rig already running) |
| WebLLM    | ~1 B quantised model in the browser tab | medium                        | free          | yes                     | 500 MB download            |
| Claude    | Anthropic API + key                     | high                          | $ per request | no                      | none (network required)    |

**local-rig** is the dominant local path for anyone with a dedicated
inference machine. An HTTP POST to `/v1/chat/completions` on
Ollama / LM Studio / llama.cpp server / vLLM / tabbyAPI — one backend
implementation covers all of them. The model on the rig can be as
small as a 1 B Q4 or as large as a 70 B Q4 depending on the rig's
VRAM; the backend doesn't care. Latency is LAN round-trip plus
whatever the rig takes to generate ~16 words.

**WebLLM** is the secondary local path for users _without_ a separate
rig — e.g. the laptop-on-a-plane case. Different constraint set from
local-rig (runs on the same GPU as the renderer, one-time 500 MB
download, quality bounded by what fits in the browser tab), so it's
kept as a distinct option rather than merged with local-rig.

A **job router** sits above this interface and picks the backend per
job kind and per user settings:

```js
routeBackend(jobKind, settings) → "template" | "local" | "webllm" | "claude"
```

Callers declare the job they want done. The router decides who does
it. Fallback on error is always template. User can override per job
class in Settings.

This doc is mostly about the inventory of `jobKind`s and the rules
each one has to satisfy to be allowed to exist.

---

## 1. The trust contract (load-bearing)

Every surface that accepts model output must satisfy all four:

1. **Deterministic floor.** There's a rule-based version that works
   with no model loaded, no network, no key. Template is always a
   legal answer. The floor must be _acceptable on its own_ — not
   "technically the app still runs."
2. **Visible marker.** When a surface is currently showing
   model-generated content, the user can see that at a glance. A
   dot, a tint, a small label — something durable, not a toast that
   fades. Trust rebuilt surface-by-surface.
3. **Auditable reason.** Every model-touched item has a one-line
   "why" that's grounded in vault content, not in model internals.
   "Proposed #decision because body mentions 'decided' 4 times" is
   legal. "Claude recommends #decision" is not.
4. **Local-first.** Claude is never the default for any surface. A
   surface that _requires_ Claude to be useful is rejected at spec
   time, not debugged later.

A surface that can't meet all four is not added to the router. It
lives in a design doc until the constraint can be satisfied.

BOLTZSIDIAN.md's no-telemetry commitment is not relaxed by any of
this. Cross-user aggregation stays banned — each vault's model traffic
is that vault's alone, and the payload preview flow stays in place
for every Claude request.

---

## 2. Surface inventory

Each row: the surface, the deterministic floor that already exists (or
would need to), the local enhancement a WebLLM pass could add, the
Claude upgrade (if any). Anything marked _rejected_ is out by the
§1 contract.

### 2.1 Voice (Phase 7 as spec'd)

| Surface              | Floor                      | Local                             | Claude                     | Status   | Notes                                                                                 |
| -------------------- | -------------------------- | --------------------------------- | -------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Observer chorus line | template from snapshot     | snarky one-slot observation       | best-quality rewrite       | **live** | Wake-state voice (`chorus-line` job kind). Live against Qwen3.5:9b on LAN rig.        |
| Dream caption        | template phrases           | drifting dream-voice observation  | summary of the whole cycle | **live** | Emitted when sleep depth > 0.3 (`dream-caption` job kind). Different voice from wake. |
| Morning-report blurb | derived bullets (existing) | one-line synthesis across bullets | prose synthesis            | stubbed  | `morning-synthesis` job kind in POLICY but not yet called from morning-report.js.     |

Already covered by Phase 7's scope. Two of three are live against the
local-rig backend as of this writing; morning-synthesis is a small
follow-up.

### 2.2 Structural enhancement (new; the interesting case)

| Surface                     | Floor                            | Local                                                   | Claude          | Notes                                                           |
| --------------------------- | -------------------------------- | ------------------------------------------------------- | --------------- | --------------------------------------------------------------- |
| Tend proposal _ordering_    | confidence score (current)       | re-rank by content-overlap judgment                     | _not justified_ | Local reorders, rules filter. Proposal set never changes.       |
| Tend proposal _reasons_     | rule-derived string (current)    | polish the reason into a human sentence                 | _not justified_ | The _fact_ stays rule-derived; only the English changes.        |
| Tend duplicate detection    | exact-title-normalised match     | "are these two notes about the same thing"              | _not justified_ | Local proposes; user confirms per pair (as today).              |
| Salience coherence re-score | affinity-vector dot product      | content-overlap bump on top of the geometric mean       | _not justified_ | Local supplements, never replaces, the existing score.          |
| Prune-candidate explanation | "no links, untouched for N days" | one-line "what this note was about" drawn from its body | _not justified_ | Helps the user decide Archive vs Keep without opening the note. |

The pattern: **rules propose, local enriches, Claude stays out.**
Claude isn't justified on any structural surface because the cost
scales with vault size and the payload preview UX doesn't survive
"every save asks permission."

### 2.3 Content assistance (new; opt-in per use)

| Surface                  | Floor                                    | Local                                                         | Claude                           | Status   | Notes                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------- | ------------------------------------------------------------- | -------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Idea-seed (salience)** | rule-picked template from pair-slot snap | one speculative sentence naming the tension joining two notes | higher-quality speculation       | **live** | Dream-only. Template emits sync so candidate is never empty; model output swaps in on arrival. Only touches disk if user Promotes — frontmatter gets `generated_by: <backend>` per §8.2. |
| Auto-title suggestion    | "Untitled"                               | "Meeting with Sarah · Fri"                                    | better title from fuller reading | pending  | Shows as a suggestion strip; never auto-applies.                                                                                                                                         |
| Stub elaboration draft   | stub stays a stub                        | paragraph draft from title + context                          | higher-quality draft             | pending  | Always diffable and rejectable — written into the note only on explicit accept.                                                                                                          |
| Note summary (1 line)    | first sentence                           | 1-line summary                                                | 1-line summary                   | pending  | Shown in search preview and hover label when the first sentence is noisy.                                                                                                                |
| Wiki-link autocomplete   | title-prefix match                       | semantic completion from body context                         | _not justified_                  | pending  | Existing `[[` autocomplete stays authoritative; semantic is a second list below it.                                                                                                      |

Claude _is_ justified here because these are one-shot, user-triggered,
and the payload-preview flow fits naturally — you asked for a title,
we're about to send the note, here's what we're sending.

**Idea-seed is the first content-assistance surface to go live.** It
was expected by the minimal-first-cut plan in §9 to follow Voice by
several iterations, but Michael asked to wire dream-state
hallucinations directly. The surface satisfies §1: template remains
the synchronous deterministic floor; the drawer shows which backend
produced the current seed; the `generated_by` frontmatter stamp on
promoted ideas honours the §8.2 feedback-loop guard; no Claude, no
network.

### 2.4 Semantic search (new surface, not yet built)

| Surface               | Floor                    | Local                             | Claude          | Notes                                                                |
| --------------------- | ------------------------ | --------------------------------- | --------------- | -------------------------------------------------------------------- |
| "Notes like this one" | _doesn't exist yet_      | embedding-based nearest-neighbour | _not justified_ | Requires embedding generation; local is the only sane path.          |
| Cross-vault free-text | title + tag string match | embedding search over body text   | _not justified_ | Upgrade path for the existing search pane, behind a settings toggle. |

Semantic search is the biggest payoff for local models and has no
reasonable Claude variant (you'd have to send every note to embed).

### 2.5 Rejected at spec time

| Surface                         | Why rejected                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Ask my vault a question"       | Can't meet §1.1 — no useful deterministic floor. The answer _is_ the model.                                                                    |
| Auto-delete / auto-archive      | Can't meet §1.2 — destructive action should never be silent, and a visible marker that says "about to delete" IS the Weed drawer.              |
| Dream-cycle goal-directed agent | Can't meet §1.3 — a model deciding what to dream about erodes the observational stance. Dreams stay emergent from physics.                     |
| Salience _replacement_          | Current scoring is legible. An LLM-based score isn't, regardless of backend. Re-score bump (§2.2) is the bounded form this is allowed to take. |

Rejection isn't permanent; it's current. Any of these can come back
with a design that satisfies §1. The doc is here so we don't re-argue.

---

## 3. The router

A single function. Lives in `src/layers/model-router.js` (doesn't
exist yet):

```js
import { TEMPLATE, WEBLLM, CLAUDE } from "./backends.js";

// Job class → preferred backend, with graceful degradation.
// "local" (self-hosted rig) is the preferred local path; "webllm"
// (in-browser) is the fallback for users without a dedicated rig.
const POLICY = {
  // Voice — cheap, constant, template-floor.
  "chorus-line": ["template", "local", "webllm", "claude"],
  "dream-caption": ["template", "local", "webllm", "claude"],

  // Structural enhancement — on-machine only, rules are authoritative.
  "tend-rerank": ["local", "webllm", "template"],
  "tend-reason-polish": ["local", "webllm", "template"],
  "salience-boost": ["local", "webllm", "template"],
  "prune-explain": ["local", "webllm", "template"],

  // Content assistance — user-triggered, Claude allowed.
  "title-suggest": ["local", "webllm", "claude", "template"],
  "stub-elaborate": ["local", "webllm", "claude", "template"],
  "note-summary": ["local", "webllm", "template"],

  // Semantic search — on-machine only (rig or in-browser).
  "semantic-search": ["local", "webllm"],
};

export function routeBackend(jobKind, settings) {
  const chain = POLICY[jobKind];
  if (!chain) throw new Error(`unknown job: ${jobKind}`);
  const override = settings.model_route_overrides?.[jobKind];
  if (override) return override;
  for (const b of chain) if (backendAvailable(b, settings)) return b;
  return "template";
}
```

Settings can override per-job. Fallback is always template. Unknown
job names throw — no silent routing.

---

## 4. GPU contention (WebLLM only)

Only one of the four backends runs on the same GPU as the renderer:
WebLLM. For the other three — template (CPU, trivial), local-rig
(different machine), Claude (different continent) — there's no
contention problem to solve.

**For WebLLM only:**

Boltzsidian runs on WebGL2 — gravity GPGPU, bloom, the body mesh. A
WebLLM model runs on WebGPU. Same silicon. Same VRAM. On a 4090 this
is fine; on a MacBook Air it's not.

Rules that keep this sane:

- **Never run WebLLM during a frame the renderer is doing gravity
  on.** Inference happens in idle frames, or during Dream depth > 0.6
  when the renderer has slowed anyway.
- **Budget.** A "local inference quota" in ms/frame, visible in the
  salience-debug palette. If it's breached, WebLLM falls back to
  template for the rest of the frame.
- **Queue, don't block.** Model calls are promises that resolve
  next-tick-after-ready. Chorus shows the template version, swaps in
  the model version when it lands. Never a dropped utterance.

The WebGPU / WebGL2 interaction is underbaked in current browsers —
benchmark on real hardware before committing WebLLM as a surface
default. This is the first thing that can derail a WebLLM-reliant
design, and it won't show up in a design doc, only in a profiler.

**For local-rig:**

The constraint becomes _network_ instead of _GPU_. LAN latency is
usually fine (1–5 ms on wired, 2–15 ms on wifi) but the rig itself
may take 200–1500 ms to finish generating. Queue-don't-block still
applies so a slow rig doesn't stall the chorus — template bridges
until the real sentence lands. If the rig is unreachable (off,
asleep, network partition), the router falls straight to template;
the user sees a status indicator in Settings but the chorus never
goes silent.

---

## 5. Quality tiers and what 1B can do

Honest about the ceiling:

| Task shape                                 | 1B quantized | Claude |
| ------------------------------------------ | ------------ | ------ |
| Single sentence, short input               | fine         | fine   |
| Paraphrase, 1–3 sentences                  | fine         | better |
| Single-step judgment (A ≈ B, yes/no)       | okay         | solid  |
| Multi-hop reasoning across 10+ notes       | random       | solid  |
| Stylistic consistency across many surfaces | poor         | fine   |

The router can't hide quality gaps. A job that genuinely needs
multi-hop reasoning either uses Claude, gets a user-triggered flow
that justifies the payload preview, or doesn't exist.

---

## 6. Cold-start and graceful degradation

WebLLM isn't available until the user has downloaded it. That's a
500 MB, 5-minute one-time cost that many users will skip. Any
surface that _requires_ local to be useful fails silently on those
users.

Rules:

- **Every `"webllm"` in POLICY must have `"template"` later in the
  chain.** Validated at app boot. No surface depends on WebLLM alone.
- **Semantic search is the exception.** It simply doesn't exist
  without a model — there's no rule-based "notes like this." Mark
  it as an opt-in surface that's greyed out until WebLLM is loaded,
  with clear copy explaining why.
- **First-run download is user-confirmed.** "You're about to download
  500 MB to run an on-device model. This is a one-time cost. Cancel
  any time." Progress bar with size + ETA. Cancel leaves the app in
  template-only mode, no retry nagging.

---

## 7. Privacy surfaces per backend

| Backend   | What leaves the Boltzsidian process      | Where it goes                 | What gets cached                          | User consent flow                                           |
| --------- | ---------------------------------------- | ----------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| template  | nothing                                  | —                             | nothing                                   | none                                                        |
| local-rig | the request body (slots + system prompt) | user's own machine on the LAN | endpoint URL + model name in localStorage | first-request body logged to console for audit; no modal    |
| WebLLM    | nothing (runs in the tab)                | —                             | model weights in browser cache (~500 MB)  | one-time download confirm                                   |
| Claude    | the payload shown in preview             | Anthropic servers             | rate-limit counters locally               | per-session first-request approval, per-job payload preview |

**local-rig vs Claude** is not a privacy spectrum — it's a trust-domain
boundary. Claude bytes leave hardware the user owns and land on a
third party's servers subject to that third party's retention and
training policies. local-rig bytes leave the Boltzsidian tab and land
on a different machine _the user also owns_. That's the same trust
level as writing to local disk. So the Claude backend gets the
full payload-preview-every-new-shape ceremony; the local-rig backend
gets a console log on first request to each new endpoint and no modal.

**local-rig is not telemetry-free** in the strict sense — the request
does cross a network interface. The privacy property Boltzsidian
guarantees is "nothing leaves hardware under your control without an
approval step," and local-rig satisfies that definition because the
destination is also under the user's control. If the user points the
endpoint at a cloud runner they don't own (say a rented GPU on a
public provider), the trust boundary shifts — but that's the user's
call, and the backend treats it the same way. The endpoint URL in
Settings is the declaration of trust.

The Claude flow is where most of the trust UX work lives. The first
request of a session surfaces the payload preview modal: exactly the
bytes that will be sent, user clicks Approve, session-cached approval
for that job class only. New job class → new preview. New session →
new approval.

No cross-user aggregation, ever. No Claude backend calls without a
user-supplied key. No "helpful" background calls when the user didn't
ask.

---

## 8. Risks specific to the expansion

### 8.1 Trust erosion by creep

Each new surface individually seems fine. Fourteen of them together
feel like a different app. Guard: surface count is in the settings
pane, labelled; each can be turned off; total model-touched surfaces
visible in about.

### 8.2 Feedback loops

Local model's suggestion becomes vault content, which is then read
back into the local model's context the next pass, which amplifies
its own stylistic tics into the user's actual writing. This is real
and understudied. Guard: model-generated text that ends up in a note
gets a `generated_by: <backend>` frontmatter field. Salience and tend
passes down-weight content marked that way so the model doesn't learn
from itself.

### 8.3 Quality regression masking bugs

A user who's gotten used to Claude-grade summaries will read "my app
got worse" when falling back to local on a network hiccup. Graceful
degradation is only graceful if the quality drop is visible. The
marker from §1.2 should also indicate _which_ backend produced the
current output.

### 8.4 Router complexity

Seven job classes today, fifteen in a year. The POLICY table starts
readable and ends a mess. Guard: the router is the _only_ place
job-class → backend routing is decided. Callers declare their job
class and take what they're given. No per-site overrides outside the
router.

### 8.5 The silent-Claude problem

A user flips Claude on for one job class, forgets, and months later
realises their daily summaries have been silently sent to Anthropic
the whole time. Guard: a permanent indicator (like the sleep-depth
HUD) when any job class is routed to Claude. Small, always visible,
no pretending.

---

## 9. Minimal first cut

When Phase 7 ships, the router is _not_ built. Phase 7 keeps its
narrow scope: three voice surfaces, plugged through a single
interface. We prove the plumbing works.

The expansion order, if we choose to take it:

1. **Phase 7** (as spec'd) — voice-only.
2. **Ship a month of voice-only.** Observe what feels lacking.
3. **Build the router** (§3) as a single file, wire the existing
   voice surfaces through it, no new surfaces. Zero user-visible
   change. Validates the shape.
4. **First structural enhancement: tend-reason-polish.** Lowest-risk
   — the proposal set doesn't change, only the English in the
   reason. Visible marker + frontmatter stamp. Observe if users
   notice / care / trust it.
5. **Semantic search.** Highest payoff. Settings-gated, local-only.
6. **Content assistance (title-suggest, stub-elaborate).** Per-use
   opt-in. Claude allowed behind the payload preview.
7. **Everything else.** One at a time, each with its own
   design-doc paragraph arguing §1.

The pattern: **ship the plug, live with it, extend one surface at a
time.** Never ship the router and six new surfaces in the same
release — the failure mode is unattributable.

---

## 10. What this is in one sentence

Phase 7 gives us a power strip; this doc is the list of things we're
allowed to plug into it, and the rules every new appliance has to
satisfy before we let it near the wall.
