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

> **A single HTML file that runs an infinite, emergent universe with its
> own soundtrack. No install. No repeats. Works in your browser.**

One sentence, one tweet, one HN title. Every asset you ship — repo
readme, stream "About" panel, PH tagline, X bio — uses a variant of this.
If a piece of copy disagrees with this sentence, the copy is wrong.

Three hooks competing for attention:

- **"Single HTML file."** 90% of cool generative projects require
  `npm install`. Yours doesn't. This is the hook that pops on HN.
- **"Never repeats."** Emergence + cinematic director. This is the hook
  that keeps people watching the stream.
- **"Has a soundtrack."** You have ~10 original tracks in `ssi_tracks/`.
  This is the hook that makes it not feel like a tech demo.

Pick one of the three as the lead depending on the audience. HN →
single-file. Twitter/X → the video. Twitch → the music.

---

## Brand and naming

The sim needs a name. "Universe sim 4.7" is the project folder, not the
product. Candidate names, cheap to test:

- **Small Sky** (calm, matches the `ssi_tracks` vibe — "Small Sky
  Instrument"?)
- **Aperiodic**
- **Orbital** (taken, skip)
- **Endless** (too generic, skip)
- **Drift** (perfect but taken — check anyway)
- **Clockless**
- **Long Shadow** (one of your own tracks — worth considering)

**Recommendation:** pick one you can live with today, register
`smallsky.app` or similar for $12, and never think about it again. The
code is the product; the name is a handle.

Visual identity:

- One accent colour: the existing `--accent: #8ab4ff`. Don't invent a
  new one.
- Wordmark: your choice of monospace (JetBrains Mono / Berkeley Mono) in
  lowercase. Matches the on-screen UI.
- Favicon: a single white pixel on black. Seriously. It reads as a
  particle and scales infinitely.

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

The title changes the thumbnail in Twitch's directory. Rotate daily:

- "infinite universe · new every second"
- "10,000 stars · one HTML file · original music"
- "watching a galaxy collide in real time"
- "ambient / emergent / open source"

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

Name everything `smallsky_<scene>_<variant>.webm`. Organise in a
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

- Submit to **Hacker News**. Title: "Show HN: Single-file browser
  universe simulator with a 24/7 stream." Link: the Pages URL, not
  the repo.
- First comment (self-posted, always): technical hook. "It's one
  HTML file, no build step, WebGL2 GPGPU N-body on 4096 particles
  with a symplectic Euler integrator. Twitch stream is the same
  page running 24/7."
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
