---
tended_on: [tag-infer]
id: 01KPS7VDRX40THKTEJSX1J2P7S
created: "2026-04-19T01:12:58.148Z"
---

# SHARE.md — Seeds and Shareable URLs

A plan for encoding _everything the viewer is seeing_ — bodies, camera,
ambience, physics — into a compact URL that reloads the exact same shot
in anyone's browser. This is the feature that turns the sim from "a
thing you look at" into "a thing you send to a friend."

Companion to `LAUNCH.md` (why — virality mechanic) and `CLAUDE.md` (how
— scene authoring rules the plan must respect).

---

## What "share" actually means

A single URL on the address bar that, when opened elsewhere, produces
an identical frame to what the sharer saw when they copied it. Two
distinct pieces get encoded:

1. **Reproducible initial conditions** — a seed + scene key that
   regenerates body positions/velocities deterministically.
2. **Observer state** — everything on top: camera, palette, channel,
   post-fx, physics parameters, tints, flock/radiation weights.

"Initial conditions" means **the moment of scene creation**, not the
current frame mid-simulation. Two machines with the same seed see
identical _starting_ bodies, but floating-point order-of-operations
on GPUs will diverge within ~30s of physics. That's fine — people
share the opening composition, not a specific frame at t=47.3s.

Honest caveat to put in the UI: "shared shots recreate the starting
moment exactly — the universe evolves differently from there."

---

## What gets captured

Everything the user can touch, packed small.

```
{
  v: 1,                         // schema version
  scene: "birth",               // key into SCENES
  seed: 0x4a7f3c,               // 32-bit int, seeds the init PRNG
  cam: [x, y, z, tx, ty, tz, fov],
  palette: "ember",
  channel: "speed",
  post: {
    bloom, bloomRadius, exposure, ca, vignette, grain, trail, doppler,
  },
  physics: { G, softening, dt, speed },  // only if overridden vs scene default
  mix: { flock, radiation },             // only if overridden
  bhHighlight, speedMax,                 // only if overridden
  collisionScenario: "Antennae (prograde)", // only for scene=collision
  t: 0,                         // sim time offset; 0 = from scene start
}
```

Fields that equal their scene default are **omitted** from the URL so
seeds stay short. The decoder fills them in from the scene registry.

---

## URL format

Two flavours, both supported:

**Short form (preferred):**

```
https://unrealape.github.io/smallsky/?s=<base64url>
```

Where `<base64url>` is the above JSON, minified, then deflated (via
browser-native `CompressionStream`), then base64url-encoded. Typical
length: 60–120 characters. Fits in a tweet.

**Human form (debugging / manual edit):**

```
https://unrealape.github.io/smallsky/?scene=birth&seed=4a7f3c&cam=210,140,210,0,0,0,55
```

Each omitted field falls back to the scene default. Good for seed-only
shares ("same scene, different seed, everything else stock") and for
debugging URL issues.

On load, the short form takes priority if both are present.

---

## Seeded PRNG (the actual deterministic core)

Replace every `Math.random()` call in scene factories with a module-
scoped `rng()` that can be reseeded.

### Implementation

```js
// mulberry32 — 4 lines, ~3ns per call, good enough
let _rngState = 0;
function rng() {
  let t = (_rngState += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedRng(n) {
  _rngState = n | 0;
}
```

Drop both into Section 11 (body state helpers), next to `randn()`.

### Migration

116 `Math.random()` call sites today. Most are in scene factories and
`makeCurlNoise`. The rule:

- **Replace** any `Math.random()` that influences body initial state,
  body mass, kind assignment, or curl-noise seeding.
- **Do not replace** calls that drive cosmetic jitter that happens
  _every frame_ (there aren't many — check `// === 22` camera drift).
  Those should keep being non-deterministic so the view stays alive
  even when the seed is fixed.
- Also update `randn()` to use `rng()` internally — it already
  wraps two uniform samples.

Grep discipline: after the pass, `rg "Math\.random"` in the sim
should return zero hits inside scene factories. Hits elsewhere
(camera drift, UI flourishes) are fine.

### Reseeding

In `applyScene(key, opts)`, call `seedRng(opts.seed ?? hashString(key + Date.now()))`
**before** `sc.make()`. That's the only integration point.

The default seed is a random 32-bit int derived from scene key +
timestamp so a fresh load still feels unique. Users only notice seeds
when they explicitly want to.

---

## Encoder / decoder

One file section, ~60 lines. Reuses `CompressionStream` so there's no
library dependency — preserves the "single HTML file" invariant.

```js
async function encodeShare(state) {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("deflate-raw");
  const w = cs.writable.getWriter();
  w.write(bytes);
  w.close();
  const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function decodeShare(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter();
  w.write(bytes);
  w.close();
  const out = await new Response(ds.readable).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(out));
}
```

Called from:

- **Capture**: the user hits Copy Share Link. Collect all the diff-
  against-scene-default values, encode, write to clipboard, flash a
  confirmation.
- **Load**: on boot, parse `window.location.search`; if `?s=` present,
  decode and apply before the default scene loads. If both `?s=` and
  short-form params are present, `?s=` wins.

### Applying a decoded state

One function, clear order:

```
1. seedRng(state.seed)
2. applyScene(state.scene, { immediate: true, scenario: state.collisionScenario })
3. override post, palette, channel, physics, mix, bh, speedMax
4. camera.position/target/fov from state.cam; controls.update()
5. params.paused = true briefly → advance sim by state.t via directTick loop
6. unpause
```

Step 5 is only relevant if we later add "time offset" sharing. Default
`t: 0` skips it.

---

## UI

Two buttons in the left rail under Viewpoints:

```
┌─ Share ──────────────────────────┐
│  [ Copy share link ]             │
│  [ Paste link to visit ]         │
│                                  │
│  seed: 0x4a7f3c                  │
│  [ copy ] [ re-roll ]            │
└──────────────────────────────────┘
```

- **Copy share link** → writes the encoded URL to clipboard, flashes
  "✓ copied" for 1.5s.
- **Paste link to visit** → reads clipboard, parses, applies. Useful
  for desktop where people receive a link in Discord etc. and want to
  land on it without leaving fullscreen.
- **Seed readout** is live. It updates when cinematic mode picks a new
  random seed for a new scene. `copy` copies just the seed. `re-roll`
  reseeds the current scene without changing any other params — same
  scene, new bodies, everything else held.

Hotkeys:

- `S` — copy share link (Shift+S already means "save"; pick something
  free — `Ctrl+L` would read as "address bar" instinct, so probably
  good).
- `Ctrl+V` on canvas focus — paste and apply (nice-to-have).

---

## Cinematic-mode interaction

Two cases:

1. **Sharer has cinematic mode on when they copy the link.** The
   shared state freezes the _current_ snapshot. Recipients open it,
   see the exact frame, _without cinematic engaged_. They can press
   `C` to re-engage, but the director then free-schedules from that
   point — it doesn't try to replay the sharer's director path.
2. **Recipient opens a link while cinematic mode is already on for
   them.** Disable cinematic for 8s (the existing idle window) and
   show the shared shot. If the recipient doesn't interact within 8s,
   cinematic resumes from the shared shot as its new dwell point.

This keeps "I sent you a shot" and "I'm watching the channel forever"
from colliding.

---

## Twitch chat integration

The stream bot (from `STREAM_SETUP.md`) gains two commands:

- `!seed` — responds with the _current_ seed + a link that reloads it
  exactly. Free content every time someone asks.
- `!share <seed>` — queues a specific seed into the next scene change.
  Abuse-guard: validate that the seed parses as a 32-bit int and the
  scene key is in `SCENES`.

This wires the share URL into the live discovery loop. Viewer likes a
shot → types `!seed` → copies the URL → posts it wherever → that post
is now a free ad with a verifiable demo.

---

## Versioning

The `v: 1` field is the contract. When we add new state (e.g. a new
post parameter), bump to `v: 2`. The decoder:

- Accepts any version it recognises.
- Fills unknown-older-version fields with sensible defaults.
- Refuses higher-than-supported versions with a friendly "this link
  was made with a newer version of small sky, load the site again to
  get the latest" message and a `Retry` button that hard-reloads.

Never break old shared links. People _will_ have URLs from day one
pinned in Discord conversations forever. Plan for it.

---

## Emergent / non-obvious share patterns

Once seeds exist, users invent uses we didn't plan:

- **Daily seed.** You auto-post a "today's seed: 0x\_\_\_" at 9 AM ET
  with a hero clip. People wake up, click, land on the same universe
  globally that day. Cheap, viral.
- **Seed chains.** A shared link points at a scene; the recipient
  re-rolls once and posts _their_ seed as a reply. Thread becomes a
  gallery.
- **Scene challenges.** "Find a seed where both BHs collide in under
  60s." Contest mechanic.
- **Time-capsule shares.** A URL with `t: 300` would load the sim and
  silently advance 300 seconds before becoming visible. Too clever for
  v1 — skip. But the schema has a slot for it.

---

## What NOT to encode

- **Screenshot data.** URLs are not for image delivery. If someone
  wants a screenshot they can take one — the share URL is for the
  _live_ reproduction.
- **Account identity / handles.** The URL is anonymous. If we want
  attribution, that's an X thread problem, not a URL problem.
- **Recording metadata.** Recording is separate. Sharing a recording
  means sharing a WEBM file, not a URL.
- **Drift / autoOrbit / recording flags.** Those are view preferences,
  not scene state.

Keep the schema tight. The smaller the URL, the more places it fits.

---

## Gotchas

- **GPU determinism.** Two machines, same seed, same starting bodies
  — but after a few hundred frames of physics they diverge. This is
  correct behaviour; the share is of the opening configuration, not a
  frame-accurate replay.
- **Clipboard API permission.** `navigator.clipboard.writeText` needs
  a user gesture. Keep the Copy button user-triggered — no auto-copy
  on scene change.
- **URL length in social previews.** Twitter truncates URL previews at
  ~23 chars, so the compact path helps. Discord unfurls the whole URL
  fine.
- **Collision scene scenarios.** Collision has named sub-variants that
  live outside the normal scene params. Capture via
  `state.collisionScenario` and handle in step 2 of the apply
  sequence.
- **Halo visibility toggle.** `params.showHalo` is a cosmetic overlay,
  not bodies. Include in the state anyway — it's one bit.

---

## Build order

**Phase 1 — Determinism only (ship first, invisible win)**

- Add mulberry32, seedRng, rng.
- Replace Math.random() in scene factories and curl-noise.
- `applyScene(key, { seed })` accepts and applies a seed.
- **Ship.** No UI yet. This unlocks everything downstream.

**Phase 2 — Seed UI**

- Seed readout + copy + re-roll in left rail.
- `?seed=` URL param support.
- Hotkey binding.

**Phase 3 — Full state share**

- Encoder/decoder with deflate-raw.
- Copy/Paste share link buttons.
- Full apply path (camera + post + palette + etc.).
- `?s=` URL param.

**Phase 4 — Twitch integration**

- `!seed` and `!share <seed>` commands in the bot.

Phase 1 alone is a big unlock — `?seed=0x4a7f3c` works as a URL with
zero other changes. Phases 2–4 are polish around it.

---

## Test plan

- Open the sim with `?seed=0x4a7f3c&scene=birth`. Copy the URL.
  Open it in an incognito window on a different browser. First frame
  is pixel-identical.
- Copy a full share link. Open in a new tab. Camera + post + palette
  - bodies all match.
- Paste a known-bad base64 string into the URL bar. Sim loads the
  default scene, shows a friendly error toast. No console errors.
- Open a v1 URL after bumping schema to v2. URL still works with
  default-filled fields.
- Walk through every scene, share the default state, reopen. Verify
  each round-trips. Catches scenes with quirky params.
- Run cinematic mode, hit `S` at a moment you like, open the URL
  fresh — same shot. Hit `C` on the fresh load, director resumes.

---

## Costs

- Phase 1: ~2 hours
- Phase 2: ~2 hours
- Phase 3: ~half day (mostly the state-collection surface)
- Phase 4: ~1 hour on top of existing bot
- Total: ~1–1.5 days across all phases

Outsized return relative to cost. This is the closest thing the
project has to a growth-loop mechanic — ship it before launch week.

#phase #user
