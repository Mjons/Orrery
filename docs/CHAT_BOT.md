---
tended_on: [tag-infer]
created: "2026-04-24T00:00:00.000Z"
---

# CHAT_BOT.md — Twitch chat → sim bridge

Plan for the chat integration sketched in [LAUNCH.md §Pillar 2 — Chat
integration](LAUNCH.md). Five commands, ~100 lines of Node, zero
changes to the single-file invariant beyond a small read-only EventSource
listener inside `index.html`.

This is the differentiator: a 24/7 stream that _responds_ to chat
becomes appointment viewing instead of background ambient.

---

## 1. The shape

```
┌────────────────────────┐         ┌──────────────────────┐
│   Twitch IRC           │  ───►   │   bot/ (Node)        │
│   #givernyphos         │         │   tmi.js + tiny HTTP │
└────────────────────────┘         └──────────┬───────────┘
                                              │  Server-Sent Events
                                              │  (one-way, text/event-stream)
                                              ▼
                                   ┌──────────────────────┐
                                   │   index.html (sim)   │
                                   │   in OBS browser src │
                                   │   EventSource client │
                                   └──────────────────────┘
```

Three pieces, each with one job:

- **`bot/`** — Node process. Logs into Twitch IRC as `givernyphosbot`,
  parses `!commands`, applies rate limits, replies in chat, broadcasts
  validated events over local HTTP.
- **Transport: Server-Sent Events.** One-way (bot → sim). Simpler than
  websocket — no client→server channel needed, native browser
  `EventSource` API, auto-reconnect built in. ~10 lines of HTTP.
- **`index.html` listener.** A few lines that subscribe to
  `http://localhost:7777/events` and call existing functions
  (`applyScene`, `applyPalette`, `rollDice`, `saveViewpoint`). No new
  physics code. The listener is the only addition to the single file.

All three run on the same machine (the always-on box that hosts OBS).
The HTTP server binds to `127.0.0.1` only — never exposed to the
network. The bot's command interface is never reachable from the
internet; only Twitch chat reaches it, and only via a authenticated IRC
session.

---

## 2. The five commands

Per LAUNCH.md, exactly five. No room for "just one more."

### 2.1 `!scene <name>`

Queue a scene switch at the next cinematic transition. Doesn't yank —
respects the director's breathing.

- **Input parsing:** lowercase, hyphenate spaces, fuzzy-match against
  `SCENE_ORDER`. `!scene two galaxies` → `two-galaxies`. Bad input
  → "I don't know that scene. Try `!info` for the list."
- **Cooldown:** global, 60s per scene change. Per-user, 60s between
  any commands.
- **Reply:** "queued — switching to _two galaxies_ at the next transition
  (~25s)" or "next scene change in 38s, try then."
- **Sim-side:** the listener calls `queueSceneChange(key)`, a thin
  wrapper around `applyScene` that sets a flag the cinematic director
  reads at its next transition tick.

### 2.2 `!palette <name>`

Same pattern, palette instead of scene.

- **Input parsing:** match against `Object.keys(PALETTES)`. Fuzzy-
  prefix.
- **Cooldown:** global 30s. Per-user 60s.
- **Reply:** "palette → _ice_" (immediate; palette swaps don't need to
  wait for transitions).
- **Sim-side:** `applyPalette(name)` already exists — call it directly.

### 2.3 `!dice`

Trigger the `rollDice()` emergence perturbation that already lives in
[index.html §24](../index.html). Random kick to the field — the user
sees it as "the universe sneezed."

- **Cooldown:** global 90s (the perturbation is loud; let the field
  settle before another).
- **Per-user:** 120s (this one's the most popular; throttle it harder).
- **Reply:** "🎲 something interesting just happened — watch for the
  next 10s."

### 2.4 `!viewpoint <name>`

Save the current camera framing as a named viewpoint, attributed to the
chatter.

- **Input parsing:** name is `{display_name}_{user_provided}`, max 32
  chars total. Strip non-alphanumeric except `-` and `_`. If the user
  omits a name, default to `{display_name}_{timestamp}`.
- **Cooldown:** per-user 300s (5 minutes — viewpoints accumulate
  forever; one per session per user is the right rhythm).
- **Reply:** "📸 saved — `caitlin_purple-arc`. Recall with
  `!recall caitlin_purple-arc` (mods only)."
- **Sim-side:** `saveViewpoint(name)` writes to the existing
  `localStorage` slot ([index.html §21](../index.html)) AND the bot
  also persists it to `bot/viewpoints.json` so a browser-cache wipe
  doesn't nuke months of fan-named shots.

### 2.5 `!info`

The catch-all. No cooldown (read-only).

- **Reply:** "🌌 giverny phos · givernyphos.app · github.com/givernyphos
  · now playing: _{current track}_ · scenes: filament halo two-galaxies
  accretion flock cluster dust cinematic"
- **How the bot knows the current track:** the sim posts a `track`
  event back via a heartbeat (the listener keeps the bot informed of
  scene + track every 10s, sent via the SSE `comments` channel — yes,
  SSE is one-way at the protocol level, so this requires a tiny POST
  endpoint on the bot for `now-playing` updates from the sim).

---

## 3. Allowed scope (the "don't touch the physics" rule)

Hard line from LAUNCH.md: chat **never** writes to physics parameters,
body counts, or anything that can crash the sim. The five commands above
are the _complete_ allowlist. New commands require a design-doc
paragraph arguing why they can't crash the page.

- ✅ Director-level: scene, palette, viewpoint, dice (which is itself a
  bounded perturbation the sim already handles).
- ❌ Anything that takes a number input (body count, gravity G,
  softening, time-step). The single bad value rule kills the stream.
- ❌ Free-form text rendered on screen. No `!shoutout`. No banner
  injection. The sim's pixels are not chat's pixels.
- ❌ File system access on the host. The bot doesn't shell out.

---

## 4. The Node bot

Single file: `bot/index.js`. ~120 lines.

**Dependencies (two):**

- `tmi.js` — Twitch IRC client. ~30 KB, zero subdeps.
- Node's built-in `http`. No Express, no WebSocket library, no nothing.

**Skeleton:**

```js
import tmi from "tmi.js";
import http from "http";
import fs from "fs";

const config = {
  channel: "givernyphos",
  username: "givernyphosbot",
  oauthToken: process.env.TWITCH_OAUTH, // sk-tmi-...
  port: 7777,
};

// SSE clients. One in production (the sim's browser source).
const clients = new Set();

const cooldowns = {
  global: { scene: 0, palette: 0, dice: 0 },
  perUser: new Map(), // username → { cmd → tsMs }
};

const VIEWPOINTS_PATH = "./viewpoints.json";
const viewpoints = loadJSON(VIEWPOINTS_PATH, {});
let nowPlaying = { scene: null, track: null };

// --- HTTP: SSE down, now-playing POST up ---
http
  .createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.url === "/now-playing" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          nowPlaying = JSON.parse(body);
        } catch {}
        res.end("ok");
      });
      return;
    }
    res.writeHead(404).end();
  })
  .listen(config.port, "127.0.0.1");

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(payload);
}

// --- IRC ---
const client = new tmi.Client({
  identity: { username: config.username, password: config.oauthToken },
  channels: [config.channel],
});

client.on("message", (channel, tags, message, self) => {
  if (self || !message.startsWith("!")) return;
  const [cmd, ...rest] = message.slice(1).trim().toLowerCase().split(/\s+/);
  const arg = rest.join(" ");
  const user = tags["display-name"] || tags.username;
  const handler = HANDLERS[cmd];
  if (!handler) return;
  handler({ user, arg, reply: (m) => client.say(channel, m) });
});

const HANDLERS = {
  scene: ({ user, arg, reply }) => {
    /* §2.1 */
  },
  palette: ({ user, arg, reply }) => {
    /* §2.2 */
  },
  dice: ({ user, reply }) => {
    /* §2.3 */
  },
  viewpoint: ({ user, arg, reply }) => {
    /* §2.4 */
  },
  info: ({ reply }) => {
    /* §2.5 */
  },
};

client.connect();
```

The cooldown checks, fuzzy matching, and viewpoint persistence are
straight code — no architectural questions. Total file lands around
120 lines.

---

## 5. The sim-side listener

Inserted at the bottom of `index.html` in a new section, right before
the boot block:

```js
// === 31. CHAT BRIDGE (read-only EventSource from local bot) ===
(function chatBridge() {
  if (location.hash.includes("nochat")) return; // local dev escape
  const es = new EventSource("http://127.0.0.1:7777/events");
  es.addEventListener("scene", (e) => {
    const { key } = JSON.parse(e.data);
    queueSceneChange(key);
  });
  es.addEventListener("palette", (e) => {
    applyPalette(JSON.parse(e.data).name);
  });
  es.addEventListener("dice", () => rollDice());
  es.addEventListener("viewpoint", (e) => {
    const { name } = JSON.parse(e.data);
    saveViewpoint(name);
  });
  // Heartbeat so the bot can answer !info accurately.
  setInterval(() => {
    fetch("http://127.0.0.1:7777/now-playing", {
      method: "POST",
      body: JSON.stringify({
        scene: currentSceneKey,
        track: getCurrentTrackName?.() || null,
      }),
    }).catch(() => {});
  }, 10_000);
})();
```

That's the entire sim-side change. ~25 lines. Doesn't touch physics,
doesn't add a dependency, gracefully no-ops if the bot isn't running
(EventSource just retries silently).

`queueSceneChange` is new — about 5 lines that set a flag the cinematic
director reads at its next transition tick. Everything else
(`applyPalette`, `rollDice`, `saveViewpoint`) already exists.

---

## 6. Auth & deployment

- **Twitch OAuth:** generate once at twitchapps.com/tmi while logged in
  as `givernyphosbot`. Save the `oauth:...` token to a `.env` file at
  `bot/.env`. Never commit it. `.env` is already in the global
  `.gitignore`.
- **Run:** `node bot/index.js` from the always-on machine. The same
  process should ideally restart on crash — wrap in a tiny systemd
  unit on Linux, an `nssm` service on Windows, or a `pm2` process for
  cross-platform.
- **OBS browser source:** points at `file:///path/to/index.html` (or
  the deployed `givernyphos.app`). The EventSource URL is
  hard-coded to `http://127.0.0.1:7777/events`, which works from a
  `file://` context and from the deployed page only when the user is
  also running the bot locally — this is exactly the constraint we
  want. The hosted page on `givernyphos.app` for a random viewer does
  _nothing_ with the EventSource (their localhost has no bot); the
  stream-host's OBS browser source on the always-on rig connects fine.
- **No public deployment of the bot.** The 127.0.0.1 binding means
  even if a viewer port-scans, they can't reach the command interface.
  The only path in is via authenticated Twitch chat.

---

## 7. Rate limiting & abuse

Three layers:

1. **Per-user cooldown** (60s for most commands, 120s for `!dice`,
   300s for `!viewpoint`). Tracked in-memory; resets on bot restart,
   which is fine.
2. **Global cooldown** for high-impact commands (scene change, dice).
   Prevents two users coordinating to spam.
3. **Twitch followers-only chat (10 minutes)** already configured per
   [LAUNCH.md §Channel safety](LAUNCH.md). Drive-by spam never gets
   that far.

What we _don't_ do: a viewer-token economy, a queue with priority,
sub-only commands. All that would shift the dynamic from "fans get to
play with the universe" to "the universe is a tip-jar surface." Wrong
mood for the brand.

---

## 8. Failure modes

| failure                          | what happens                                                                                                          | mitigation                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Bot crashes                      | EventSource on the sim keeps trying to reconnect every few seconds. Sim continues running, just unresponsive to chat. | Process supervisor restarts the bot.                                     |
| Twitch IRC disconnects           | `tmi.js` auto-reconnects with exponential backoff.                                                                    | Log the reconnects; alert if > 3 in 10 min.                              |
| Sim browser source crashes (OBS) | Bot keeps running, replies in chat, but no scene changes happen. Looks weird to chat.                                 | OBS auto-restarts dead browser sources; verify in OBS settings.          |
| `viewpoints.json` corrupted      | Bot starts with empty viewpoints. Past saves lost from bot side; sim's localStorage still has them.                   | Daily cron copy of `viewpoints.json` to a sibling `.bak`.                |
| Malicious chat input             | Allowlist enforces — anything that's not one of the five commands is silently ignored.                                | The allowlist _is_ the mitigation; don't loosen it.                      |
| User picks unknown scene name    | Bot replies with the list. Doesn't guess. (No autocorrect → wrong scene = worse than "I don't know".)                 | Fuzzy-prefix match must require at least 3 chars and an unambiguous hit. |

---

## 9. Phasing

Two ships, not one.

**Phase 1 — three commands (one weekend):**

- `!scene`, `!palette`, `!info`. The dice and viewpoint commands are
  more involved (timing, persistence). Ship the scaffolding first with
  the easy three, prove the round-trip works on stream, _then_ layer
  on dice and viewpoints in Phase 2.
- The minimum viable chat integration — viewers can drive the visual
  on day one, which is the entire point of the differentiator.

**Phase 2 — dice and viewpoints (one more weekend):**

- `!dice` adds the perturbation hook (already exists; just rate-
  limited).
- `!viewpoint` adds the persistence to `bot/viewpoints.json` plus a
  `!recall` command (mods-only) to bring a saved viewpoint back. The
  recall channel is what closes the loop — viewers see their named
  shots come back on screen weeks later.

---

## 10. Out of scope

- **Subs-only commands.** Mood is wrong (see §7).
- **A web dashboard for the bot.** A Node script that prints to stdout
  is enough for one stream channel.
- **Multi-channel support.** This bot serves one channel. Forking it for
  someone else's stream is their problem.
- **Voice control / TTS.** Different surface entirely. Maybe later;
  not in this plan.
- **Storing chat-message text anywhere.** The bot reads, acts, drops.
  No transcript, no analytics, no NLP. Twitch's own VOD is the
  archive.
- **A web UI for `!viewpoint` browsing.** The viewpoints accumulate
  inside the sim. Recall happens in chat. A separate gallery page is
  Phase 3+ if there's demand.

---

## 11. Done means

- Stream is live with the bot running.
- A viewer types `!scene halo`, the bot replies "queued", the next
  transition picks up halo.
- The channel chat shows the bot acknowledging at least one of each
  command across an hour.
- Zero crashes attributable to chat input across the first week.
- A list of fan-named viewpoints in `bot/viewpoints.json` longer than
  zero.

#feature #phase
