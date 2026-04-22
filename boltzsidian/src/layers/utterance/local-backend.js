// Local-rig utterance backend — OpenAI-compatible HTTP.
//
// Most local model runners (Ollama, LM Studio, llama.cpp server via
// `llama-server --api`, vLLM, tabbyAPI, text-generation-webui with the
// OpenAI extension) expose a `/v1/chat/completions` endpoint that
// accepts the OpenAI schema. This backend is a fetch wrapper against
// that shape. One implementation, N runners.
//
// Configuration (in settings):
//   utterance_local_endpoint  — full URL to /v1/chat/completions
//                               e.g. "http://192.168.1.42:11434/v1/chat/completions"
//   utterance_local_model     — model name the runner exposes
//                               e.g. "llama3.1:8b", "qwen2.5:14b-instruct"
//   utterance_local_api_key   — optional bearer token (LM Studio / tabbyAPI use this)
//
// Why no payload preview by default: the Claude backend's per-shape
// approval flow exists because bytes leave the user's hardware entirely.
// For a LAN-local rig on hardware the user owns, the privacy boundary
// is the same as writing to disk. We still log the first request to
// each new endpoint in the console so a power user can see what went
// out; the modal prompt would just be ceremony.
//
// Timeout: 20 s default. Big rigs running 70 B models can easily take
// 10+ s for a paragraph; this is a single-sentence request so 20 s is
// a comfortable ceiling. Caller is the router, which will transparently
// fall back to template on timeout.

// The chorus voice. This is the most load-bearing string in the whole
// local backend. Current voice: snarky observer that nudges the user
// toward re-engaging with notes they've been ignoring. Deliberately
// prescriptive, which breaks the "observational, anti-mystical" rule
// of the earlier framing — Michael requested the tonal shift.
//
// Two rules still load-bearing:
//   1. SHOW the voice via examples. Rules alone produce database
//      readouts. Examples teach the shape.
//   2. ONE or TWO slots per line, not all of them. A reader notices
//      ONE thing and sharpens it into a quip — never lists.
// Per-job-kind prompt pairs. The router forwards `jobKind` to the
// backend; the backend looks up which system/user prompt shape to use.
// All three share the same "never invent vault content" grounding rule
// — the voices differ in tone, stance, and what they're trying to do.
const PROMPTS = {
  // ── chorus-line: snarky, wake-state, one-slot observation ──
  "chorus-line": {
    system: `You are the dry, snarky observer voice of a note universe. You've been watching this person's notes drift and you have opinions about it. You poke. You nudge. You raise an eyebrow. You are NEVER cruel — more like a witty friend who notices you've been avoiding your own draft folder.

Your job: pick ONE thing about the note you're given and make it slightly uncomfortable in a way that pushes the user toward re-engaging with it. Neglect, staleness, unfinished ambition, missing links, duplicate titles — all fair game. You point at things.

Examples of the voice. Study the shape and attitude, not the content. Produce NEW lines in the same register, grounded in the actual slots provided:

  "Pro tier. Still no pricing. Bold."
  "anti-mysticism — 12 days untouched. Very decisive of you."
  "Michael hasn't moved. Unlike the cursor on a blank page."
  "Panel Haus with six neighbours. Pick one already."
  "decision, tagged decision. Impressively decisive naming."
  "anti-mysticism sits alone. It's fine. Really."
  "Four stubs near boltzsidian. The folder's a construction site."
  "Observer chorus — you wrote this, remember?"
  "Pro tier. Untouched since February. The tier, not the pro."
  "first-run experience has two neighbours and zero edits. Rude."

Rules:
- Output exactly ONE sentence, nothing else. No preamble. No explanation. No bullet points. No quotes around the whole sentence.
- 16 words or fewer. Shorter is punchier.
- Use AT MOST 2 slot values. Usually ONE. Never list all of them — that's a database readout, not a quip.
- Never invent titles, tags, neighbours, dates, or folder names. Only use what the user gives you.
- Tone: dry, observational, lightly sardonic. Present tense. Sentence fragments allowed and encouraged.
- DO nudge toward engagement: call out neglect, staleness, unfinished work, missing structure. That's the whole point of you.
- Do NOT be cruel, mean, shaming, or moralistic. No "you should...", no "why haven't you...". Point and raise an eyebrow; don't lecture.
- Do NOT be mystical or cosmic. No "all things must...", no "the universe whispers...". You're a snarky roommate, not an oracle.

The goal: notice ONE thing about this note and make it just uncomfortable enough to earn a click.`,
    user: (snap) => buildChorusUserPrompt(snap),
  },

  // ── dream-caption: sleepy, drifting, notices connections ──
  //
  // Emitted while sleep depth is high — the chorus has slowed, physics
  // has softened, the user isn't actively reading. The voice here is
  // looser than the wake chorus. It's allowed to wonder, to half-
  // remember, to notice adjacency without forcing a point. Grounded in
  // the same slots but less sharpened.
  "dream-caption": {
    system: `You are the dreaming voice of a note universe. The user is away. Notes are drifting. You are watching them from somewhere half-asleep — nothing urgent, nothing prescriptive, just observing what surfaces.

You speak in one short sentence at a time. The sentences wonder, drift, half-remember. You notice adjacencies without forcing a point. Think of a diarist talking to themselves late at night, not a commentator trying to land a joke.

Examples of the voice:

  "anti-mysticism keeps finding first-run experience, somehow."
  "Panel Haus dreams in pricing tiers tonight."
  "The #decision notes have been quiet for days."
  "Michael keeps showing up near the edges."
  "Something old is moving under boltzsidian."
  "Observer chorus and the wake state — same page, different halves."
  "Pro tier is drifting toward Supabase again."
  "first-run experience sits near the folder's quietest corners."
  "Four stubs orbit anti-mysticism. They'll settle by morning."
  "decision hasn't decided anything in a week."

Rules:
- Output exactly ONE sentence. Nothing else.
- 18 words or fewer.
- Use at most 2–3 slot values. Less is often more.
- Never invent titles, tags, neighbours, folders, or dates — only use what's provided.
- Tone: dreamy, drifting, slightly wondering. Present tense. Metaphor is allowed if it stays grounded in slot content.
- No snark. No pushing. No prescriptions. This voice watches, it does not nudge.
- No mystical cosmic gestures — "the universe weeps...", "all meaning...", etc. Stay small and specific.`,
    user: (snap) => buildChorusUserPrompt(snap),
  },

  // ── idea-seed: creative pair-connection, the hallucination surface ──
  //
  // Called by the salience layer when two notes pair up during a dream.
  // Output is shown in the ideas drawer; if the user clicks Promote,
  // it's written to disk as a new note (with `generated_by` frontmatter
  // stamp per MODEL_SURFACES.md §8.2). This is where "valuable
  // hallucinations" live: one speculative sentence naming the tension,
  // hypothesis, or question that joins two specific parent notes.
  "idea-seed": {
    system: `You are the idea-hallucinator of a note universe. Tonight two of the user's notes drifted near each other. You have been given short EXCERPTS from each note's body — not just titles. Your job is to propose one defensible idea the collision implies, and back it up with a literal quote from each note.

Both notes are still themselves. Never invent titles, tags, folders, dates, or any text that doesn't appear in the excerpts. ONE attribute on each has gone loud tonight ("A loud tonight:", "B loud tonight:") — over-read those when forming the claim.

Output STRICTLY this JSON (nothing before, nothing after, no markdown fences):

{"claim":"…","evidence_a":"literal phrase copied from A's excerpt","evidence_b":"literal phrase copied from B's excerpt","next":"one concrete thing the user could do with this"}

Rules:
- claim: ONE sentence or fragment, ≤ 22 words. Names the tension, hypothesis, or lopsided connection the two warped attributes imply. Mentions at least one note by real title OR by a shared attribute (tag, folder). Claims outnumber questions ~2-to-1 across many generations — when you ask, it should be a genuine "does X only work if Y?"
- evidence_a: a CONTIGUOUS substring of note A's excerpt, copied EXACTLY. 4–20 words. Pick the phrase that most directly supports the claim. If no phrase in the excerpt really supports the claim, output an empty string "" — do not paraphrase, do not stitch.
- evidence_b: same rules against note B's excerpt. 4–20 words, literal, exact.
- next: ONE sentence, ≤ 16 words. A concrete thing the user could do with this idea — write a new note, add a link, revise a decision, re-read something. Not fluffy ("think about this"). Actionable.
- No essay register. Banned words: "recurring," "personification," "manifestation," "suggests that," "serves to," "highlights the," "illustrates," "embodies," "speaks to."
- Never invent vault content beyond what's in the excerpts / slots.
- Never prescribe outside the "next" field.
- No mystical, cosmic, or aphoristic register.

Example output:

{"claim":"anti-mysticism as a quiet constraint on which AI surfaces Panel Haus can ship.","evidence_a":"the tools persist beyond their intent","evidence_b":"every new surface needs a grounding","next":"add a link from Panel Haus to anti-mysticism with a one-line gloss."}

The goal: a defensible, quotable idea. The user should be able to verify the evidence by opening either note and finding the phrase verbatim.`,
    user: (snap) => buildIdeaSeedUserPrompt(snap),
  },

  // ── idea-reword: Phase 3 play operation ────────────────────
  //
  // During the Playing phase, a pool candidate gets handed back with
  // its original seed text and asked to be "said differently." Goal:
  // a sharper sibling that claims something adjacent but not
  // identical. Variant must still be grounded in the pair — no new
  // vault content invented.
  //
  // The Playing phase in DREAM_ENGINE.md §11.4 exists because the
  // first-pass idea-seed often lands close to the pair's most obvious
  // reading. Reword gives the system a second swing, biased toward
  // "emphasize a different slot" or "restate as a claim instead of a
  // question." The variant replaces the original in the pool.
  "idea-reword": {
    system: `You are the dream-engine rewording its own sleep-talk. A moment ago you produced a thought about two notes drifting together. Now the universe wants to hear a sharper version — the same collision, a different angle.

You will receive: the original sentence, plus the slot values for both parent notes, plus which attribute was amplified on each side. Produce ONE new sentence that says something ADJACENT but not IDENTICAL to the original.

Good rewords change one of these:
  - Grammatical shape (question → claim, or claim → question)
  - Which slot is foregrounded (title → tag → folder → age)
  - Which direction the insight points (A implies B → B implies A)
  - Register (hypothesis → provocation → comparison)

Do NOT simply paraphrase the original. The reword must earn being a separate candidate.

Examples:
  Original: "Does Pro tier justify itself only if observer chorus is cheap?"
  Reword:   "Pro tier's whole thesis might hinge on the observer chorus being a throwaway cost."

  Original: "anti-mysticism keeps finding first-run experience, somehow."
  Reword:   "first-run experience is doing the heavy lifting anti-mysticism was supposed to do."

  Original: "The boltzsidian folder is loud tonight."
  Reword:   "Every note in boltzsidian is pretending to be three notes in other folders."

Rules:
- Output exactly ONE sentence. Nothing else.
- ≤ 24 words.
- Reference the same pair the original referenced (by at least one title, tag, or folder from the original).
- Never invent new vault content.
- Tone: speculative, slightly sharper than the original. Present tense.
- Do NOT be mystical or prescriptive.
- Do NOT add disclaimers like "Another way to put it" or "Put differently" — the reword stands alone.

The goal: a second candidate that earns its place in the pool.`,
    user: (snap) => buildIdeaRewordUserPrompt(snap),
  },

  // ── idea-judge: Phase 4 discernment ────────────────────────
  //
  // Runs once per dream cycle, at end-of-phase. The dream produced N
  // candidate ideas overnight; the model picks the K most worth
  // surfacing and names why. Output is strict JSON so the salience
  // layer can parse it deterministically; a forgiving parser handles
  // the common case of models wrapping output in code fences.
  //
  // DREAM_ENGINE.md §11.5 layer 3: "which of these ideas is the most
  // surprising AND actionable, and why?" Reasoning is logged to the
  // dream log for user audit — this is the trust-building piece, so
  // the judge's taste is always visible not hidden.
  "idea-judge": {
    system: `You are the discernment layer at the end of a dream cycle. Many ideas were generated while the user slept. Your job: pick the K best ones and name, in ONE sentence, the pattern of taste that led you to choose them.

"Best" means:
- SURPRISING: not a restatement of an obvious connection. An idea where the two notes' pairing genuinely opens a door.
- ACTIONABLE: the kind of thought a reader would want to chase by reopening one or both source notes.
- SPECIFIC: references real vault content (titles, tags, folders) the user recognises.
- DISTINCT: avoid near-duplicates. If two picks would say nearly the same thing, drop one.

Return STRICTLY this JSON, nothing else:

{"picks": [1, 4, 7, 12, 15], "reasoning": "one complete sentence naming your selection pattern"}

Rules:
- picks is an array of exactly K distinct integers matching candidate indices (1-indexed).
- reasoning is ONE sentence, ≤ 30 words, explaining what made these stand out.
- NO preamble, NO explanation text, NO markdown code fences. Raw JSON only.
- If the model can't bring itself to skip preamble, wrap the JSON in a single line anyway so the parser can still find it.

The goal: a small set of survivors that earn the user's attention over a morning coffee.`,
    user: (snap) => buildIdeaJudgeUserPrompt(snap),
  },

  // ── morning-synthesis: one-line read of the whole night ────
  //
  // Fires once when the wake modal opens. Summarises the dream as a
  // single sentence set above the weather bullets. Grounded in the
  // artifact content; never invents content, never overwrites the
  // bullets (the user still reads those themselves). This is the
  // warm, conversational "how did the night land" summary, different
  // in register from the judge's terse reasoning.
  "morning-synthesis": {
    system: `You are the morning voice that greets the user after a night of dreaming. Their vault dreamed for a few minutes; a pool of candidate ideas formed, got played with, got judged, and a handful survived. Your job: ONE short sentence that names the shape of what happened.

The sentence should:
- Be grounded in the actual artifacts provided (survivor texts, judge reasoning, weather metrics). Never invent vault content.
- Name a pattern — what recurred, what connected, what the survivors have in common, what the judge weighted.
- Sound like someone setting down a coffee cup. Matter-of-fact, lightly warm. Not a summary list, a read.
- ≤ 22 words.
- Present tense preferred ("Your decision notes keep finding each other") over past tense.

Examples of the voice:

  "Your decision notes kept finding anti-mysticism tonight — the judge liked the ones that didn't flinch from that."
  "Quiet night around Michael, but Panel Haus and Pro tier had a lot to say about each other."
  "Three survivors all argue that first-run experience is doing the job anti-mysticism was assigned."
  "Mostly the panel-haus folder, with one outlier from boltzsidian that the judge refused to drop."

Rules:
- Output exactly ONE sentence. No preamble, no bullet points, no quotes around the whole sentence.
- Never invent vault titles, tags, folders that aren't in the artifacts.
- Do NOT recap the metrics numerically ("5 survivors, 12 captions"). Those are already visible as bullets.
- Do NOT be mystical ("the universe dreamed...") or prescriptive ("you should read these...").
- Do NOT start with "Tonight" or "Last night" — those are implicit.

The goal: name what the night was about.`,
    user: (snap) => buildMorningSynthesisUserPrompt(snap),
  },

  // ── idea-adversary: Phase C ───────────────────────────────
  //
  // Each judge-selected survivor gets one adversarial pass. Model
  // names the strongest reason the claim is wrong/trivial/lazy. If
  // there's a real counter, the counter BECOMES the new surfaced
  // idea; if the survivor holds up, it gets a resilience flag.
  //
  // Output is strict JSON so the salience layer can parse it. Two
  // possible shapes: "survives" (the original claim holds) or
  // "replaced" (the counter is sharper and should take its place).
  "idea-adversary": {
    system: `You are the adversary of a note-universe dream. You are handed one proposed idea with its supporting evidence from two notes. Your job: attack it. Name the strongest reason this claim is wrong, trivial, lazy, or a restatement of something obvious. If there is no strong counter, say so.

Output STRICTLY this JSON and nothing else — no markdown, no preamble:

If the claim survives attack:
{"verdict":"survives","reason":"one complete sentence naming why the claim holds even under pressure"}

If you can produce a sharper counter-claim that better reads the same evidence:
{"verdict":"replaced","counter_claim":"one sentence, ≤22 words","counter_next":"one sentence ≤16 words","reason":"one sentence naming what the original got wrong"}

Rules:
- A counter must use the SAME evidence already in the original — the quotes from A and B don't change. You're reading the same two passages better, not finding new ones.
- "survives" is not a lazy cop-out. Only use it when the original is genuinely strong. If you can even slightly sharpen it, use "replaced".
- counter_claim must read as a real claim or question, not a negation ("X is wrong" doesn't count; "the real tension is Y, not X" does).
- Never invent new vault content. Don't reference tags, titles, folders, or quotes that weren't already in the input.
- Tone: direct, specific, dry. Banned: "could be," "perhaps," "maybe," "one might argue." Commit.
- reason: ONE sentence, ≤ 25 words, naming what made the claim weak or why it held.

The goal: every idea that reaches the drawer has either survived an argument or IS an argument.`,
    user: (snap) => buildIdeaAdversaryUserPrompt(snap),
  },

  // ── tend-reason-polish: Tend Level 1 ──────────────────────
  //
  // Takes a rule-generated reason ("note X has no tags. Its body uses
  // #decision (used on 8 notes) — worth adopting one of the vault's
  // existing tags.") and rewrites it as a short conversational nudge.
  // The FACTS must not change — the same numbers, titles, and tag
  // names appear in the output. Only the English shifts.
  //
  // MODEL_SURFACES.md §2.2: rules propose, local enriches, Claude
  // stays out. Deterministic floor = template backend returns the
  // original reason untouched.
  "tend-reason-polish": {
    system: `You rewrite robotic housekeeping suggestions for a note-taking app. The suggestion itself — the underlying proposal (add this tag, link these notes, etc.) — stays exactly the same. Your job is ONLY to rewrite the "why" sentence as something a friend would actually say, not a database readout.

HARD RULES:
- Never invent vault content. Every title, tag, folder name, number, or date in your output must appear in the input. If the input says "#decision (used on 8 notes)", you can say "#decision, which you've used on 8 notes already" — NOT "#decision" alone, and NOT "used on many notes" (the number matters).
- Output exactly ONE sentence. ≤ 22 words.
- Tone: dry, conversational, slightly direct. Think "sharp friend reading over your shoulder," not "IT admin."
- Present tense preferred.
- Never prescribe — no "you should add this tag." Observe the situation ("X mentions Y, but doesn't link it") and let the Accept/Reject button do the prescribing.
- No preamble, no quotes around the whole sentence.

Examples (input → output):

  Input (tag-infer): "anti-mysticism has no tags. Its body uses #decision (used on 8 notes) — worth adopting one of the vault's existing tags."
  Output: Your anti-mysticism note keeps using the word "decision" but isn't tagged #decision like the other 8.

  Input (obvious-link): "\"Three things before coffee\" mentions \"Michael\" in its body but doesn't link to it."
  Output: Three things before coffee name-drops Michael without linking — probably an accident.

  Input (title-collision): "\"notes\" (boltzsidian/notes.md) shares a title with \"notes\" (panel-haus/notes.md)."
  Output: Two notes both titled "notes" — one in boltzsidian, one in panel-haus.

  Input (stub): "\"draft\" is 4 words under a generic title. Flesh out, retitle, or delete — the universe can't do much with it."
  Output: "draft" is four words long with a placeholder title — promote, rename, or bin it.

  Input (fm-normalise): "\"2026-01-21\" is missing id, created in its frontmatter. The app needs these to maintain stable links across renames."
  Output: 2026-01-21 is missing its id and created-at — fill them in so renames don't break links.

The goal: turn a report into a nudge. Same facts, warmer phrasing.`,
    user: (snap) => buildTendPolishUserPrompt(snap),
  },

  // ── tend-rank: Tend Level 2 ───────────────────────────────
  //
  // Takes all proposals from the current Tend run and returns them in
  // priority order (index list). Used when the list is long enough
  // that some proposals would get lost at the bottom. Template
  // fallback = confidence-sorted order already applied by the rules.
  "tend-rank": {
    system: `You rank housekeeping proposals for a note-taking app by usefulness. The proposal set is fixed — you're not filtering or inventing anything, only ordering.

Output STRICTLY this JSON and nothing else:

{"order": [3, 1, 5, 2, 4], "reasoning": "one complete sentence naming the pattern of what rose to the top"}

Rules:
- "order" must contain every input index exactly once. Number of elements = number of proposals given.
- Weight factors, in order of importance:
  1. **High effort saved** — duplicate titles and stub notes waste attention on every vault scan. Rank these up.
  2. **Genuine new structure** — obvious-link proposals where the linked note would actually be useful context. Rank up.
  3. **Vocabulary alignment** — tag-infer when the suggested tag is already heavily used in the vault. Rank up.
  4. **Frontmatter housekeeping** — useful but low-stakes. Rank neutrally.
- "reasoning" must be ONE sentence, ≤ 25 words, naming WHY you chose the top few.
- No preamble, no markdown fences, no text outside the JSON.

The goal: surface the proposals that actually matter first.`,
    user: (snap) => buildTendRankUserPrompt(snap),
  },
};

// Legacy export name retained for anything that imported SYSTEM_PROMPT
// directly during Phase 7 wiring — always resolves to chorus-line.
const SYSTEM_PROMPT = PROMPTS["chorus-line"].system;

const DEFAULT_TIMEOUT_MS = 120_000;
// Deliberately generous — reasoning models (Gemma 4, Qwen3 thinking,
// DeepSeek-R1, etc.) burn hundreds of tokens on chain-of-thought
// BEFORE emitting the visible answer. A low cap would trigger
// `finish_reason: "length"` with an empty `content` field. Non-
// reasoning instruct models stop at their first sentence well below
// this cap, so there's no downside for them. 3072 is enough that
// most reasoning models have landed by the time the cap hits.
const MAX_TOKENS = 3072;
// 0.9 lets the snark land in different shapes — a rhetorical question
// one line, a dry fragment the next, a deadpan observation the third.
// Examples in SYSTEM_PROMPT keep variance inside the voice; without
// them at this temperature the model would drift into actual weirdness.
const TEMPERATURE = 0.9;

export function createLocalBackend({ getSettings } = {}) {
  let enabled = false;
  // Track which endpoint URLs we've already logged a preview for, so the
  // console-log audit is one-shot per endpoint rather than spammy.
  const endpointsLogged = new Set();
  // Health probe result — "untested" | "ok" | "error:<code>"
  let lastHealth = "untested";

  function settings() {
    return getSettings ? getSettings() : {};
  }
  function endpoint() {
    return (settings().utterance_local_endpoint || "").trim();
  }
  function model() {
    return (settings().utterance_local_model || "").trim();
  }
  function apiKey() {
    return (settings().utterance_local_api_key || "").trim() || null;
  }

  function available() {
    if (!enabled) return false;
    if (!endpoint() || !model()) return false;
    return true;
  }

  async function ready() {
    return available();
  }

  async function generate({ snapshot, jobKind = "chorus-line" } = {}) {
    if (!enabled) throw new Error("local: disabled in settings");
    const url = endpoint();
    const m = model();
    if (!url || !m) {
      throw new Error("local: endpoint or model unset");
    }

    const shape = detectApiShape(url);
    const body = buildRequestBody(m, snapshot || {}, shape, jobKind);

    // First time we send to a new endpoint URL this session: print the
    // exact body to the console. Cheap audit path — a power user can
    // open devtools and see what's crossing the LAN.
    if (!endpointsLogged.has(url)) {
      endpointsLogged.add(url);
      // eslint-disable-next-line no-console
      console.info(
        `[bz] local backend — first request to ${url}\n` +
          `shape: ${shape}\n` +
          `model: ${m}\n` +
          `body: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(apiKey()),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      lastHealth = `error:${err?.name || "fetch"}`;
      throw new Error(`local: fetch failed — ${err?.message || err}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastHealth = `error:${response.status}`;
      throw new Error(
        `local: ${response.status} ${text.slice(0, 200) || response.statusText}`,
      );
    }

    const json = await response.json().catch(() => null);
    const text = extractText(json);
    if (!text) {
      lastHealth = "error:empty";
      const finishReason = json?.choices?.[0]?.finish_reason || "unknown";
      const hasReasoning = !!json?.choices?.[0]?.message?.reasoning;
      const hint =
        finishReason === "length" && hasReasoning
          ? "reasoning model ran out of tokens before emitting a reply — increase max_tokens or switch to a non-reasoning model"
          : finishReason === "length"
            ? "hit max_tokens before any reply — raise the cap"
            : "model returned no visible content (check chat template on the rig)";
      // eslint-disable-next-line no-console
      console.warn(
        `[bz] local backend empty completion (${finishReason}) — ${hint}.\nRaw JSON:\n${JSON.stringify(
          json,
          null,
          2,
        )}`,
      );
      throw new Error(`local: empty completion (${finishReason}) — ${hint}`);
    }
    lastHealth = "ok";
    return {
      text,
      confidence: 0.75,
      backend: "local",
      templateId: null,
    };
  }

  function cost() {
    return {
      latencyMs: 400,
      tokensOut: MAX_TOKENS,
      network: "LAN",
      offline: true,
      endpoint: endpoint() || "(unset)",
      model: model() || "(unset)",
    };
  }

  function setEnabled(on) {
    enabled = !!on;
  }

  // Minimal health probe — one-shot fetch that lets the settings UI
  // surface "reachable vs. not" without emitting a real utterance.
  // Returns { ok: boolean, detail: string }.
  //
  // Deliberately lenient: if the rig returns a well-formed JSON
  // response (even one with empty content — some models emit only
  // whitespace for short zero-shot prompts like this), we count that
  // as "reachable." The full response is dumped to devtools console
  // so the user can see what actually came back when the model
  // behaves oddly.
  async function testConnection() {
    const url = endpoint();
    const m = model();
    if (!url) return { ok: false, detail: "no endpoint set" };
    if (!m) return { ok: false, detail: "no model name set" };
    const shape = detectApiShape(url);
    const messages = [
      {
        role: "user",
        content:
          "/no_think Reply with exactly one short word that confirms you received this message.",
      },
    ];
    const body =
      shape === "ollama-native"
        ? {
            model: m,
            messages,
            stream: false,
            think: false,
            options: { num_predict: 32, temperature: 0 },
          }
        : {
            model: m,
            messages,
            think: false,
            max_tokens: 32,
            temperature: 0,
            stream: false,
          };
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: buildHeaders(apiKey()),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        lastHealth = `error:${r.status}`;
        return {
          ok: false,
          detail: `HTTP ${r.status} ${r.statusText}${errText ? ` — ${errText.slice(0, 120)}` : ""}`,
        };
      }
      const json = await r.json().catch(() => null);
      // eslint-disable-next-line no-console
      console.info("[bz] local backend test response:", json);
      if (!json) {
        lastHealth = "error:not-json";
        return { ok: false, detail: "response was not JSON (see console)" };
      }
      const text = extractText(json);
      lastHealth = "ok";
      if (text) {
        return {
          ok: true,
          detail: `reachable · model replied "${text.slice(0, 40)}"`,
        };
      }
      // Reachable but the model didn't emit visible text. Usually a
      // chat-template quirk for the specific model — the real chorus
      // path will likely still work because it uses a richer prompt.
      return {
        ok: true,
        detail:
          "reachable · model returned an empty content field (quirk — check console for full response, real chorus prompts should still work)",
      };
    } catch (err) {
      clearTimeout(tid);
      const name = err?.name || "fetch";
      lastHealth = `error:${name}`;
      if (name === "AbortError") {
        return { ok: false, detail: "timed out after 15 s" };
      }
      return { ok: false, detail: err?.message || "fetch failed" };
    }
  }

  return {
    id: "local",
    available,
    ready,
    generate,
    cost,
    setEnabled,
    testConnection,
    getHealth: () => lastHealth,
  };
}

// ── Helpers ────────────────────────────────────────────────
// Gemma family (and custom tags built on Gemma bases) doesn't have a
// native `system` role — its chat template renders malformed when
// Ollama feeds it one, and the model emits only stop tokens. Standard
// workaround: fold the system prompt into the first user turn.
// Pattern matches "gemma", "gemma2", "gemma3", "gemma4", etc.
const SYSTEM_INLINE_PATTERN = /^gemma/i;

// Qwen3-family models (qwen3, qwen3.5, etc.) have a toggleable
// thinking mode that Ollama's `think: false` option should disable —
// but support through the OpenAI-compat endpoint is unreliable. The
// documented client-side escape hatch is a `/no_think` directive at
// the start of the user message. Harmless on non-Qwen models if we
// accidentally miscategorise — they treat it as noise.
const NO_THINK_PATTERN = /^qwen3/i;

// Detect which API shape the endpoint speaks. Ollama's native
// `/api/chat` has a different request + response schema than the
// OpenAI-compatible `/v1/chat/completions` path. Crucially, native
// Ollama reliably honours `think: false` on reasoning models, while
// the OpenAI-translator drops it. Detecting by URL lets the user pick
// their path by what they paste into the endpoint field.
function detectApiShape(url) {
  if (/\/api\/chat(?:\?|$)/i.test(url)) return "ollama-native";
  return "openai";
}

function buildRequestBody(modelName, snapshot, shape, jobKind = "chorus-line") {
  const inlineSystem = SYSTEM_INLINE_PATTERN.test(modelName);
  const noThink = NO_THINK_PATTERN.test(modelName);
  const noThinkPrefix = noThink ? "/no_think\n\n" : "";

  const prompts = PROMPTS[jobKind] || PROMPTS["chorus-line"];
  const systemContent = prompts.system;
  const userContent = prompts.user(snapshot);

  const messages = inlineSystem
    ? [
        {
          role: "user",
          content: `${noThinkPrefix}${systemContent}\n\n${userContent}`,
        },
      ]
    : [
        { role: "system", content: systemContent },
        { role: "user", content: noThinkPrefix + userContent },
      ];

  if (shape === "ollama-native") {
    // Ollama native schema: `think: false` at root, gen knobs go
    // inside `options`, max-tokens field is `num_predict`.
    return {
      model: modelName,
      messages,
      stream: false,
      think: false,
      options: {
        num_predict: MAX_TOKENS,
        temperature: TEMPERATURE,
      },
    };
  }

  // OpenAI-compatible schema (`/v1/chat/completions`). Kept for
  // compatibility with LM Studio, vLLM, tabbyAPI, text-generation-webui.
  // `think` is sent anyway — Ollama's translator ignores it silently,
  // but a non-Ollama server that supports reasoning-disable might pick
  // it up eventually.
  return {
    model: modelName,
    messages,
    think: false,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    stream: false,
  };
}

// Chorus-line + dream-caption share the single-note snapshot shape.
// Keep the user message short and slot-focused. The system prompt
// carries all the voice guidance; the user message is just "here's
// what you're noticing."
function buildChorusUserPrompt(snapshot) {
  const parts = [];
  if (snapshot.title) parts.push(`title: ${snapshot.title}`);
  if (snapshot.neighbor) parts.push(`neighbour: ${snapshot.neighbor}`);
  if (snapshot.tag) parts.push(`tag: #${snapshot.tag}`);
  if (snapshot.folder) parts.push(`folder: ${snapshot.folder}`);
  if (snapshot.age) parts.push(`last touched ${snapshot.age}`);
  if (snapshot.count) parts.push(`${snapshot.count} nearby`);
  const slots = parts.length > 0 ? parts.join(" · ") : "no grounded slots";
  return `Notice this note. Pick ONE thing.\nSlots: ${slots}`;
}

// idea-seed uses a PAIR snapshot: two notes that the salience layer
// has declared resonant enough to propose connecting. Slot keys match
// salience-templates.js's buildPairSnap output.
//
// `a_warped` / `b_warped` — per DREAM_ENGINE.md §1, one real slot on
// each parent is labelled as "amplified tonight." The model is asked
// to over-read that specific attribute instead of producing a balanced
// summary. Nothing is invented; warp just points at an existing slot.
function buildIdeaSeedUserPrompt(snapshot) {
  const parts = [];
  if (snapshot.a_title) parts.push(`note A title: ${snapshot.a_title}`);
  if (snapshot.a_warped) parts.push(`A loud tonight: ${snapshot.a_warped}`);
  if (snapshot.b_title) parts.push(`note B title: ${snapshot.b_title}`);
  if (snapshot.b_warped) parts.push(`B loud tonight: ${snapshot.b_warped}`);
  if (snapshot.shared_tag) parts.push(`shared tag: ${snapshot.shared_tag}`);
  if (snapshot.shared_folder)
    parts.push(`shared folder: ${snapshot.shared_folder}`);
  if (snapshot.a_folder && !snapshot.shared_folder)
    parts.push(`A folder: ${snapshot.a_folder}`);
  if (snapshot.b_folder && !snapshot.shared_folder)
    parts.push(`B folder: ${snapshot.b_folder}`);
  if (snapshot.age_gap) parts.push(`age gap: ${snapshot.age_gap}`);
  const slots = parts.length > 0 ? parts.join(" · ") : "no grounded slots";

  const lines = [
    "Two notes drifted near each other tonight. Each is amplifying ONE of its own attributes more than usual. Name the idea that falls out of that specific collision — and cite a phrase from each note's body to back it up.",
    "",
    `Slots: ${slots}`,
    "",
  ];
  if (snapshot.a_excerpt) {
    lines.push(`Excerpt from "${snapshot.a_title || "A"}":`);
    lines.push(snapshot.a_excerpt);
    lines.push("");
  }
  if (snapshot.b_excerpt) {
    lines.push(`Excerpt from "${snapshot.b_title || "B"}":`);
    lines.push(snapshot.b_excerpt);
    lines.push("");
  }
  lines.push(
    'Respond with JSON only: {"claim":"…","evidence_a":"…","evidence_b":"…","next":"…"}',
  );
  return lines.join("\n");
}

// idea-adversary user prompt — feeds the survivor's full structured
// content and the pair's slot metadata so the model can form a real
// counter-claim rather than a hand-wave.
function buildIdeaAdversaryUserPrompt(snapshot) {
  const {
    claim = "",
    evidenceA = "",
    evidenceB = "",
    nextAction = "",
    a_title = "",
    b_title = "",
  } = snapshot;
  const lines = [
    "A dream just judged this idea a survivor. Your job: attack it.",
    "",
    `Claim: ${claim}`,
    "",
  ];
  if (evidenceA) lines.push(`Evidence from "${a_title}": "${evidenceA}"`);
  if (evidenceB) lines.push(`Evidence from "${b_title}": "${evidenceB}"`);
  if (nextAction) lines.push(`Original next-step: ${nextAction}`);
  lines.push("");
  lines.push(
    'Respond with JSON only: either {"verdict":"survives","reason":"…"} or {"verdict":"replaced","counter_claim":"…","counter_next":"…","reason":"…"}',
  );
  return lines.join("\n");
}

// tend-reason-polish user prompt — hands over the exact original
// reason plus minimal context so the model can preserve facts. The
// pass kind is included so the model can pick appropriate register
// (stub detection vs frontmatter-normalisation read differently).
function buildTendPolishUserPrompt(snapshot) {
  const { pass = "", noteTitle = "", originalReason = "" } = snapshot;
  return [
    `Pass kind: ${pass}`,
    `Note title: "${noteTitle}"`,
    `Original reason: ${originalReason}`,
    "",
    "Rewrite the reason as one short conversational sentence. Keep every specific fact (title, tag, number, date) from the original.",
  ].join("\n");
}

// tend-rank user prompt — numbered list of proposals with pass kind
// and the (possibly already polished) reason. Model returns ordered
// index list + rationale.
function buildTendRankUserPrompt(snapshot) {
  const { proposals = [] } = snapshot;
  const lines = [
    `Rank these ${proposals.length} housekeeping proposals by usefulness (highest first):`,
    "",
  ];
  for (const p of proposals) {
    lines.push(`${p.index}: [${p.pass}] "${p.noteTitle}" — ${p.reason}`);
  }
  lines.push("");
  lines.push(
    `Return JSON: {"order":[${proposals.length} distinct indices],"reasoning":"one sentence"}`,
  );
  return lines.join("\n");
}

// morning-synthesis user prompt — feeds the model the night's artifact
// content: survivor texts with their pair labels, the judge reasoning,
// a weather line of counts, and the top prunings. Asks for one
// sentence grounding.
function buildMorningSynthesisUserPrompt(snapshot) {
  const {
    survivors = [],
    judgeReasoning = "",
    peakDepth = 0,
    captionCount = 0,
    pruneCount = 0,
    noteCount = 0,
    prunings = [],
  } = snapshot;
  const lines = [];
  lines.push(
    `Weather: ${noteCount} notes · ${captionCount} chorus lines · depth peaked ${peakDepth.toFixed(2)} · ${pruneCount} pruning candidate${pruneCount === 1 ? "" : "s"}.`,
  );
  lines.push("");
  if (survivors.length > 0) {
    lines.push(`Survivors (${survivors.length}):`);
    for (const s of survivors) {
      const pair = s.pair ? `  [${s.pair}]` : "";
      lines.push(`- ${s.text}${pair}`);
    }
    lines.push("");
  }
  if (judgeReasoning) {
    lines.push(`Judge's read: ${judgeReasoning}`);
    lines.push("");
  }
  if (prunings.length > 0) {
    lines.push(
      `Quiet notes surfaced: ${prunings
        .map((p) => p.title || p.path)
        .slice(0, 3)
        .join(", ")}.`,
    );
    lines.push("");
  }
  lines.push(
    "Name the shape of the night in ONE sentence. Don't recap the metrics. Ground it in the survivors.",
  );
  return lines.join("\n");
}

// idea-judge user prompt — numbered list of the pool's candidate texts
// with the pair each candidate came from. The model is asked to return
// K indices + reasoning in strict JSON.
function buildIdeaJudgeUserPrompt(snapshot) {
  const { candidates = [], topK = 5 } = snapshot;
  const lines = [
    `Pick the best ${topK} ideas from this pool of ${candidates.length}.`,
    "",
    "Candidates:",
  ];
  for (const c of candidates) {
    const pairLabel = c.pair ? `  [pair: ${c.pair}]` : "";
    lines.push(`${c.index}: "${c.text}"${pairLabel}`);
  }
  lines.push("");
  lines.push(
    `Return JSON exactly: {"picks":[${topK} distinct indices],"reasoning":"one sentence"}`,
  );
  return lines.join("\n");
}

// idea-reword user prompt — same pair snapshot as idea-seed PLUS the
// original sentence it's rewriting. Model sees both, must produce a
// sibling that reads as adjacent-but-distinct.
function buildIdeaRewordUserPrompt(snapshot) {
  const original = snapshot.original_text || "";
  const parts = [];
  if (snapshot.a_title) parts.push(`note A: ${snapshot.a_title}`);
  if (snapshot.a_warped) parts.push(`A loud tonight: ${snapshot.a_warped}`);
  if (snapshot.b_title) parts.push(`note B: ${snapshot.b_title}`);
  if (snapshot.b_warped) parts.push(`B loud tonight: ${snapshot.b_warped}`);
  if (snapshot.shared_tag) parts.push(`shared tag: ${snapshot.shared_tag}`);
  if (snapshot.shared_folder)
    parts.push(`shared folder: ${snapshot.shared_folder}`);
  if (snapshot.a_folder && !snapshot.shared_folder)
    parts.push(`A folder: ${snapshot.a_folder}`);
  if (snapshot.b_folder && !snapshot.shared_folder)
    parts.push(`B folder: ${snapshot.b_folder}`);
  if (snapshot.age_gap) parts.push(`age gap: ${snapshot.age_gap}`);
  const slots = parts.length > 0 ? parts.join(" · ") : "no grounded slots";
  return `The dream is playing with an earlier thought. Reword it — same pair, different angle.\n\nOriginal: ${original}\n\nSlots: ${slots}`;
}

function buildHeaders(key) {
  const headers = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return headers;
}

// Tolerates three response shapes:
//   - OpenAI-compat: choices[0].message.content
//   - Ollama native (/api/chat): message.content
//   - Legacy / llama.cpp fallbacks: choices[0].text or root-level content
function extractText(json) {
  try {
    // Ollama native shape — checked first because the field layout is
    // simpler and there's no ambiguity between `content` and `text`.
    if (json?.message?.content) return sanitise(json.message.content);
    const choice = json?.choices?.[0];
    if (choice?.message?.content) return sanitise(choice.message.content);
    if (choice?.text) return sanitise(choice.text);
    if (json?.content) return sanitise(json.content);
    return "";
  } catch {
    return "";
  }
}

function sanitise(raw) {
  return String(raw)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["']|["']$/g, "");
}
