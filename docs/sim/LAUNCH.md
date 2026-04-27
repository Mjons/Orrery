---
tended_on: [tag-infer]
id: 01KPS7VDHYKM7CM3CWS63X9AK6
created: "2026-04-18T18:33:19.946Z"
---

# LAUNCH.md — Going Public

Plan for taking the universe simulator from a local artwork to a 24/7
Twitch channel + open-source repo that earns its virality instead of
begging for it.

Author: Michael · X: [@unrealape](https://x.com/unrealape)

---

## The pitch (memorise this)

> **Where celestial mechanics meet impressionist art. Giverny Phos turns
> the cold physics of the cosmos into living, breathing painting —
> every star a brushstroke, with its own soundtrack. One HTML file, in
> your browser.**

One paragraph, four sentences, the whole product. Every asset you ship —
repo readme, stream "About" panel, PH tagline, X bio — uses a variant of
this. If a piece of copy disagrees with it, the copy is wrong.

The shorter forms (use the right one for the surface):

- **Tagline (banners, headers, bios under 100 char):**
  > Where celestial mechanics meet impressionist art.
- **One-liner (X bio, PH tagline, HN title):**
  > A generative galaxy simulator that paints the cosmos.
- **The closing line (manifesto-bottom, About panel coda):**
  > The universe is not just a calculation; it is a garden of light
  > waiting to be painted.

Four hooks competing for attention. Lead with the one that matches the
audience:

- **"Impressionist physics."** Monet meets N-body. The hook that pops on
  X / generative-art Twitter — they've never seen a sim sold this way.
- **"Pointillist space."** Reimagining a galaxy as a field of luminous
  points where dots converge into texture. The hook for r/generative
  and r/proceduralgeneration.
- **"Single HTML file."** 90% of cool generative projects need
  `npm install`. Giverny Phos doesn't. The hook for HN.
- **"Has a soundtrack."** Ten original tracks in `ssi_tracks/`. The hook
  for Twitch — it's why the stream is appointment ambient viewing, not
  a tech demo.

Audience map: X → impressionist physics. Reddit → pointillist space.
HN → single file. Twitch → soundtrack.

---

## Brand and naming

**Name: Giverny Phos.** Decided 2026-04-23. Pronounced _jee-VER-nee
FOSS_. **Giverny** = Monet's village, the garden he painted into the
Water Lilies for thirty years; **phos** = Greek for light. The compound
reads as a deliberate fusion: the curated, painterly beauty of a tended
garden and the raw cosmic light of the simulation. Coined and unique
enough that the brand handles are almost certainly available; on-theme
without being on-the-nose like "Universe" or "Cosmos."

The product follows the name. Three principles, repeat them in every
piece of copy:

- **The Phosphene Effect** — capturing the fleeting, dreamlike quality
  of light that exists between observation and imagination.
- **Pointillist Space** — the galaxy as a collection of luminous points,
  where dots of light converge to create complex, high-fidelity
  textures.
- **Curated Chaos** — advanced simulation generates the beauty
  automatically, turning the entropy of space into a gallery of
  infinite, exportable art.

**Verify availability before claiming.** I haven't checked. Run through
the four handles below — if any of the primaries are taken on a service
that matters (Twitch first, then X, then domain), fall back to the
listed alt; if more than one is taken, escalate to the fallback name
list below this section.

- **Wordmark:** `giverny phos` — lowercase, two words, monospace
  (JetBrains Mono or Berkeley Mono). Matches the on-screen UI. The
  compact form `givernyphos` is for handles and URL slugs only.
- **Domain:** `givernyphos.app` ($12/yr at Porkbun or Cloudflare). If
  taken, fallback `givernyphos.art` (on-theme, leans into the painterly
  positioning) or `givernyphos.fm` (leans into the soundtrack).
  Register today.
- **Handles** (claim all four in one sitting, even if only X + Twitch
  are active to start):
  - X: `@givernyphos` if free, else `@givernyphos_` or `@givernyphosapp`.
    Keep `@unrealape` for personal.
  - GitHub: org `givernyphos` if free, else `giverny-phos`.
  - Twitch: `givernyphos` (fallback `givernyphosapp`).
  - Bluesky: `givernyphos.app` (the domain doubles as the handle).
- **Fallback names** (escalate in this order if Giverny Phos's handles
  are blocked across two or more services): **Monetary** (Monet + ary,
  cheeky), **Atelier Phos** (workshop of light; preserves the `phos`
  suffix), **Pointillis** (coined from pointillism). All three preserve
  the painterly framing.
- **Rejected candidates** (don't reopen): Phosphene (taken / generic),
  Small Sky (taken), Orrery (taken), Smallorrery (taken), Aperiodic
  (try-hard), Clockless (cold), Long Shadow (reads as a music project),
  Drift (taken), Endless (generic), Orbital (taken).

Visual identity:

- **Accent:** `--accent: #8ab4ff` from the sim. Don't invent a new one.
- **Favicon:** a single white pixel on black. It reads as a particle and
  scales infinitely.
- **Avatar (everywhere):** a 4× scaled cropped still from the sim — a
  single bright cluster against black. Same crop on X, Twitch, GitHub.
- **Banner (X / Twitch):** a 1500×500 / 1920×480 still from cinematic
  mode — a Monet-water-lilies-like fragment, dark with bright pointillist
  detail. Wordmark `giverny phos` (two words, lowercase) bottom-left,
  `givernyphos.app` bottom-right, both in dim grey. The tagline
  _"where celestial mechanics meet impressionist art"_ may sit centred
  in the lower third if the still has dead space — otherwise leave it
  off and let the bio text carry it.

---

## Three pillars

```
    ┌────────────────────────┐
    │    REPO (GitHub)       │  ← trust, install path, technical credibility
    └───────────┬────────────┘
                │
    ┌───────────┴────────────┐
    │    STREAM (Twitch)     │  ← ambient proof it works, free content loop
    └───────────┬────────────┘
                │
    ┌───────────┴────────────┐
    │    SOCIAL (X/@unrealape)│  ← discovery, clips, launch pops
    └────────────────────────┘
```

Each pillar reinforces the other. Stream drives people to repo. Repo
drives people to X. X drives people to stream. Nothing exists in
isolation.

---

## Pillar 1 — The repo

### Must-haves before first public link

1. **`README.md` that sells in 3 seconds.**
   - First element: an auto-playing WEBM or GIF of cinematic mode.
     Record a 20-second loop that shows _three_ different scenes and
     _one_ transition. No captions, no logo overlay.
   - Second element: one-line pitch. Exactly one.
   - Third element: "Open [index.html](index.html). That's it."
     (Link to the GitHub Pages deploy. See below.)
   - Then — and only then — anything else.

2. **GitHub Pages deploy.** One commit sets it up. The URL goes in the
   README's second line and in your X bio. Anyone can see it live
   without cloning. This is the force-multiplier.

3. **A `screenshots/` folder with 8 hero images.** One per scene.
   Shot at 2560×1440, no UI overlay. These are your thumbnails for
   every share, forever.

4. **A `CONTRIBUTING.md` whose entire content is "Add a scene."**
   Link to `CLAUDE.md`'s "Add a scene" section. Contribution funnel =
   new scenes. People _will_ submit scenes if the path is that
   obvious. Your PR backlog becomes the game.

5. **License.** MIT. Ship.

6. **A `CHANGELOG.md`** — short. Releases become tweetable: "v1.2 adds
   Stephan's Quintet scene." Free content loop.

### Repo nice-to-haves (week 2+)

- GitHub Actions that auto-build `screenshots/` from headless Chrome on
  every merge. Keeps hero shots fresh.
- Issue templates: "Scene idea", "Bug", "Performance report". Not
  "Feature request" — steer contribution toward scenes.
- Topics on the repo: `three-js`, `webgl`, `generative-art`,
  `n-body`, `simulation`, `shader`. Topics are how GitHub's discovery
  surfaces find you.

### What NOT to do

- **Don't split into packages.** The whole appeal is that `index.html`
  is the product. A monorepo would betray the pitch.
- **Don't add TypeScript, bundlers, or a build step.** See `CLAUDE.md`.
- **Don't write a manifesto.** README must be skimmable. No "the
  philosophy of emergent systems" essays above the GIF.
- **Don't auto-publish to npm.** There is no npm package. That's the
  point.

---

## Pillar 2 — The 24/7 stream

### Why this works

Your sim is already 24/7-shaped: cinematic mode runs forever, you have
~10 tracks of original music (`ssi_tracks/`), and there's no game logic
to break. A 24/7 stream of a real game would glitch and freeze. This
one won't.

### Twitch channel buildout (do this in one sitting)

Make a fresh account — your old barely-used one has the wrong handle,
wrong VODs, and the trust-from-age boost on a 0-watch-hours channel is
negligible. Block 90 minutes, do all of this in order, walk away.

**Account creation:**

- Email: `givernyphos@<your domain>` (set up the alias first; never use a
  personal address for a public-facing brand account).
- Username: `givernyphos` (capitalisation in Display Name only —
  Twitch handles are case-insensitive). Fallback `givernyphosapp`.
- Display Name: `Giverny Phos`.
- 2FA: required by Twitch for streaming anyway. Authenticator app, not
  SMS. Save recovery codes to a password manager.
- Birthday / location: real, private. Twitch needs DOB for age-gating
  category eligibility.

**Profile (Settings → Profile):**

- **Profile picture:** the avatar from the brand block above. 600×600.
- **Profile banner:** the dark cinematic still with wordmark. 1920×480.
- **Bio (300 char max):**
  > Where celestial mechanics meet impressionist art. Giverny Phos turns
  > the cold physics of the cosmos into living, breathing painting —
  > every star a brushstroke, with its own soundtrack. One HTML file:
  > [givernyphos.app](https://givernyphos.app)
- **Social links:** givernyphos.app · github.com/givernyphos · @givernyphosapp
  on X.

**Channel panels (under the video player — drag to order):**

1. **About** — the master pitch verbatim, then the manifesto:
   > Giverny Phos is a generative galaxy simulator designed to transform
   > the cold physics of the cosmos into living, breathing art. Inspired
   > by phosphenes — the ethereal light we see when we close our eyes —
   > and the curated beauty of Monet's gardens in Giverny, every star
   > and nebula is a deliberate brushstroke in a digital masterpiece.
   >
   > _The universe is not just a calculation; it is a garden of light
   > waiting to be painted._
   >
   > Made by @unrealape. Open source: github.com/givernyphos.
2. **Watch the source** — a screenshot from cinematic mode, click-
   through to `givernyphos.app`. Caption: "Same page running 24/7 here.
   Open it on your own machine, no install. One HTML file."
3. **Music** — list of `ssi_tracks/` titles, "all original, all CC-BY,
   download at givernyphos.app/music."
4. **Chat commands** — the bot command list (`!scene`, `!palette`,
   `!dice`, `!viewpoint`, `!info`). Pinned at top once the bot ships.
5. **Schedule** — "Always on. Cinematic mode runs forever. Live human
   tweaks: Sundays 8 PM ET." (Pick one weekly time you'll actually
   show up for — see below.)
6. **GitHub** — repo URL with the star count. "MIT, scene PRs welcome."
7. **Support** — Ko-fi / GitHub Sponsors link. Optional. Don't lead
   with this.

**Stream Info defaults (Stream Manager → Edit Stream Info):**

- **Title rotation** — see "Stream title rotation" subsection below.
  Set one as the live default; rotate via the bot or by hand weekly.
- **Category:** alternate week-to-week between **Software & Game
  Development** and **ASMR** (or **Music**). The category change is a
  re-surfacing signal to the directory algorithm.
- **Tags (max 10):** `Generative` `Art` `Ambient` `Procedural`
  `WebGL` `Particles` `OpenSource` `Impressionist` `Chill` `Coding`.
  Lead with Art and Generative — the painterly framing is the
  differentiator and the technical tags are the credibility tail.
- **Language:** English.
- **Branded content disclosure:** off (you're not paid).
- **Mature content:** off. Audience is broad.
- **Content classification labels:** none. The sim has no flashing
  strobes; if you ever add one, flip "Frequent or intense flashing".

**Channel safety (Settings → Privacy and Safety, and Moderation):**

- **Followers-only chat:** 10 minutes. Stops drive-by spam without
  alienating new viewers.
- **Slow mode:** off by default; the bot rate-limits commands.
- **AutoMod:** Level 3 (default). Tighter is fine; looser invites
  drama you don't want to moderate at 11pm.
- **Blocked terms:** the standard "no slurs, no link spam" list — copy
  from a moderator's published list (Wizebot or NightDev publish
  starter packs). Add `discord.gg/`, `t.me/`, and `bit.ly/` to the
  blocked-link list since the channel has its own Discord.
- **Block hyperlinks from non-mods:** on.
- **Mods:** add yourself's secondary account as a mod. Add the bot
  account (below) as a mod. Don't add anyone else for the first month
  — you don't know your community yet.
- **Chat rules (pinned message):**
  > 1. The sim runs forever. Lurk, vibe, leave. 2. Try a chat command
  >    — they're listed in the panels. 3. No links from non-mods. 4. Be
  >    kind or be banned.

**Stream key + OBS (Settings → Stream):**

- **Server:** Auto (Recommended). Twitch picks the closest ingest.
- **Bitrate:** 4500 kbps video, 160 kbps audio. The sim is mostly
  black — compresses well, leaves headroom for music clarity.
- **Resolution / FPS:** 1920×1080 @ 60. Don't downscale; the sim's
  dot-against-black look gets crushed at 720p.
- **Encoder:** NVENC HEVC if Twitch enabled HEVC for you yet,
  otherwise NVENC H.264 (your 4090 has plenty). x264 only as a
  fallback.
- **Keyframe interval:** 2 seconds (Twitch requirement).
- **Audio:** Music as the primary source. No mic. (When you go live
  for Sunday human-tweak sessions, add a noise-gated mic, but the
  default is silent-cinema-with-music.)
- **VODs:** auto-archive on, 14-day retention (default until you hit
  Affiliate; then 60).
- **Highlights / Clips:** clips enabled, 60-second max. Anyone can
  clip. Disable raids (`Settings → Channel → Raids`) until you have a
  community, then re-enable.

**Bot account:**

- Create a _second_ Twitch account: `givernyphosbot`. This is the IRC
  identity your scene-switch script logs in as.
- Verified bot status: not needed at launch (you're well under the
  message rate limits). Apply later if `!scene` chatter becomes heavy.
- OAuth token: generate at twitchapps.com/tmi or via the Twitch
  Developer console. Store in `.env`, never commit.

**Connections (Settings → Connections):**

- **YouTube:** connect, enable auto-export of highlights to a YouTube
  channel of the same name. Free distribution.
- **Discord:** connect for role-sync once your Discord exists.
- **X / Twitter:** connect so the "going live" auto-post fires when
  the bot restarts the stream after maintenance.

**Affiliate path (do not chase):**

Twitch Affiliate requires 50 followers, 500 minutes broadcast across
7 days, 3 average concurrent viewers. The 24/7 stream hits the
broadcast minutes immediately; the others come from the launch. Don't
optimise for it — it'll happen ~2 weeks in if the launch lands.

**Verification before going public:**

- Stream privately for one full week with `Hide your stream from being
found` on (`Settings → Stream → Visibility`). Confirm: 168 hours of
  uptime, no audio dropouts, no thermal throttling, music playlist
  loops without a gap.
- Only after that week, flip the visibility switch. The stream is now
  the product page; if it's offline when HN clicks through, you burn
  the shot.

### Setup

- **Machine:** a dedicated always-on box (your RTX 4090 is overkill for
  4096 bodies — leave the sim on a cheap secondary GPU if you have one,
  or run it on your main machine during work hours and pause nights
  until you dedicate hardware).
- **Broadcast:** OBS, 1080p60, low bitrate (4500kbps — the sim is mostly
  dark, compresses beautifully). Audio source: a rotating playlist of
  `ssi_tracks/` via OBS's media source or VLC input.
- **Overlay:** minimal. Stream title, current scene name, current track
  name, `@unrealape`, a QR to the repo. That's it.
- **Scene timings:** cinematic mode normal pace is correct. Don't
  speed it up for "engagement" — it'll cheapen the feel.

### Chat integration (the differentiator)

A 24/7 stream that viewers can _influence_ becomes appointment viewing.
Build a tiny bot that:

- `!scene <name>` — queues a scene switch at the next transition.
  Rate-limit to 1/minute. On cooldown, respond with "next scene in X
  seconds, try then."
- `!palette <name>` — same, for palette. Respects cinematic breathing.
- `!dice` — triggers the "roll the dice" emergence perturbation.
- `!viewpoint` — saves the current framing as a named viewpoint with
  the chatter's handle. You accumulate a library of fan-named shots
  over weeks.
- `!info` — responds with repo URL + current track.

Implementation: Node script listening to Twitch IRC, writes to a
websocket/EventSource the browser page listens on. 100 lines. Stays
out of the HTML file itself (respect the single-file invariant — this
is orchestration, not core code).

**Don't** give chat the ability to crash it (no body count changes,
no physics parameter writes). Stick to director-level commands the
cinematic system already supports.

### Stream title rotation

The title changes the thumbnail in Twitch's directory. Rotate daily —
keep one painterly, one technical, one ambient. Re-shuffle weekly:

- "painting the cosmos · live, forever"
- "where celestial mechanics meet impressionist art"
- "pointillist space · 4096 brushstrokes · original music"
- "infinite galaxy · never the same twice"
- "one HTML file painting a universe in your browser"
- "ambient / emergent / open source"
- "watching Monet's water lilies if Monet painted with stars"

Twitch categorises you under "Software & Game Development" (the
repo-facing audience) _and_ "ASMR" or "Music" (the vibes audience).
You can't be in both, but you can alternate week to week — the
algorithm treats the category change as a signal to re-surface you.

### Discord (low priority, but)

One Discord server. Two channels. Link in the stream overlay. Keep it
simple:

- `#stream` — auto-posted "now showing" from the bot
- `#scenes` — users share ideas / screenshots

---

## Pillar 3 — @unrealape and the launch

### Pre-launch (before you post anywhere)

Bank content. You need a reserve so you're not scrambling on launch
day. Sit down for two afternoons and capture:

- **8 scene clips.** 10–20s each, WEBM with music. One per scene.
- **3 transition clips.** 4s each, the moment a scene changes. These
  are the "whoa" clips.
- **1 long hero video.** 90s, showing cinematic mode holding, breathing,
  transitioning, holding again. This is the pinned tweet forever.
- **6 stills.** The screenshots from the repo double-duty here.

Name everything `givernyphos_<scene>_<variant>.webm`. Organise in a
`/press/` folder in the repo.

### Launch week (pick a week, commit to it)

**Day 0 — Sunday:**

- Repo goes public (or public if it wasn't). README polished. Pages
  deploy confirmed live.
- Stream starts. No announcement yet.
- Post a single "teaser" clip to X from @unrealape. No link. Just the
  hero video and a caption: "soon."

**Day 1 — Monday:**

- Quiet. Don't over-post. One scene-clip reply in the thread beneath
  the teaser. Let the teaser breathe.

**Day 2 — Tuesday, 8:30 AM ET:**

- Submit to **Hacker News**. Title: "Show HN: Giverny Phos – a
  single-file browser galaxy simulator that paints the cosmos." Link:
  the Pages URL, not the repo. (HN's audience rewards "single-file"
  more than "impressionist art" — lead with the technical hook in the
  title, save the painterly framing for the comment.)
- First comment (self-posted, always): technical hook + painterly
  context. "One HTML file, no build step. WebGL2 GPGPU N-body on
  4096 particles with a symplectic Euler integrator. The 'Giverny'
  half of the name is real — the project is an attempt to render
  N-body physics as impressionist art rather than a data viz. Twitch
  stream is the same page running 24/7."
- **Do not reply defensively to comments.** Answer technical Qs
  factually, say "good point" to critique, disappear if things get
  weird.
- X thread at 10 AM ET: the teaser video at top, 5 clip replies
  below. Last reply is the repo link.

**Day 3 — Wednesday:**

- Submit to **r/generative** and **r/proceduralgeneration** (not both
  in the same hour — spread by a day on different subs).
- Post a new unseen clip to X daily for the rest of the week.

**Day 4 — Thursday:**

- **Product Hunt launch.** Ship at 12:01 AM PT. Gallery = 4 clips +
  2 stills. First comment: tech hook again.
- X: "PH is live." One tweet. Pin it above the teaser.

**Day 5 — Friday:**

- **Email** three people who might amplify. Simon Willison, Zach
  Lieberman, Tyler Hobbs. Short, no favour-ask, just "I made this,
  thought of you because of [specific thing from their work]."
  Generosity-first. One of three will share. That's the play.

**Weekend:**

- Rest. Let the stream do the work. The stream does the work.

### Ongoing cadence (post-launch)

- **Twice a week**, post a new emergent moment from the stream.
  Record any interesting stretch via OBS replay buffer, trim, post.
  Never scripted.
- **Once a week**, ship a new scene or a new track. Release note.
  Tweet. Commit. Changelog. Small, steady drumbeat.
- **Once a month**, a longer-form post. "Here's how the cinematic
  director decides when to cut." "Here's why scenes never repeat."
  Technical essays in the same voice as `CLAUDE.md`. These get
  re-shared to HN organically over months.

Do not post when you have nothing new. Silence is better than filler.

---

## What kills this launch

- **Shipping before the stream is bulletproof.** If someone clicks the
  stream URL from HN and it's offline, you burn the shot. Run the
  stream for a full week to yourself first. Prove uptime.
- **Chat bot that crashes the page.** Guard every input server-side.
  Whitelist, don't blacklist.
- **Picking a name you hate.** You will see it 10,000 times. Don't
  settle.
- **Measuring too much too early.** Don't stare at repo stars on day 2.
  Check once a week. The stream's VoD count matters more than the
  star count anyway.
- **Abandoning the stream when numbers stay low.** The stream is a
  ~3-month slow cooker. It takes that long for Twitch's directory to
  trust you enough to feature you. Keep it running.

---

## Budget

- Domain: $12/yr
- Always-on machine: you have one
- OBS, Twitch, GitHub, X: free
- Music licensing: you wrote it
- A paid asset pass (one decent hero WEBM rendered in a tool that does
  90s seamlessly, if OBS export quality bothers you): $0–$100
- **Total: under $150.**

---

## What "success" looks like

- **Month 1:** 500 repo stars, 200 stream followers, one HN front page.
- **Month 3:** 2000 repo stars, 1500 followers, 20 community-submitted
  scenes merged, steady 10–40 concurrent stream viewers.
- **Month 6:** somebody writes a blog post about it you didn't ask them
  to. Somebody ports it to VR. Somebody remixes the music. This is the
  moment you've won.

Star counts are a vanity metric that correlate with success but don't
_cause_ it. The real outcome is that other people start making things
with your thing. Ship with a culture that welcomes scene PRs and this
compounds.

---

## The single next action

Right now, today, before anything else:

1. Record the 90s hero video with cinematic mode in normal pace.
2. Pick a name.
3. Deploy GitHub Pages.

Everything else waits. The video is the oxygen supply for all three
pillars. No video, no launch.

#star #daily #feature
