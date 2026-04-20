# WEB_DEMO.md — Ship It on Your Website

A concrete, start-to-finish plan for getting the sim running at a URL
you can link. Two deployment paths depending on whether you want it to
be the page itself, or embedded inside a page you already have.

Companion to `LAUNCH.md` (the why) and `STREAM_SETUP.md` (the 24/7
Twitch rig). The sim is already shipping-ready — it's one HTML file
with a `ssi_tracks/` folder, and it doesn't need a build step.

---

## Which path?

**Path A — Standalone page.** The sim _is_ the page. User lands on
`yourdomain.com` (or `yourdomain.com/smallsky`) and the simulator
takes over the window. No header, no navbar, no markdown copy. This is
what `unrealape.github.io/smallsky` would be. Best for HN / PH / X
sharing — the clean, pure demo.

**Path B — Embedded on an existing site.** The sim lives in an
`<iframe>` inside one of your existing pages (portfolio, blog post,
about page). You keep your normal layout around it. Best if you
already have a site with traffic that should see this alongside your
other work.

Both paths use the same deployed URL under the hood. Start with A —
you can always embed it from your site later.

---

## Path A — Standalone deploy on GitHub Pages

Cheapest, simplest. One-time setup, ~10 minutes.

### 1. Audit what's going up

Everything needed:

```
index.html          # the sim itself
ssi_tracks/         # 10 MP3s × ~5 MB each ≈ 55 MB total
```

Everything NOT to upload (not secret, just noise):

```
*.md                # all the planning docs
CLAUDE.md
SPEC.md
ROADMAP.md
...
nul                 # Windows artefact (git ignore this)
```

Optional but nice:

```
favicon.svg         # 1 white pixel on black (see LAUNCH.md)
og.png              # 1200×630 social-preview image
robots.txt          # "User-agent: *\nAllow: /"
```

### 2. Make the repo

From the project folder, assuming `git init` hasn't been run yet:

```bash
cd l:/Projects_claudecode/Universe_sim_4_7
git init
```

Create `.gitignore` so the planning docs and Windows artefacts stay
out:

```
nul
.vscode/
*.webm
_check.mjs
```

Stage only the files you want public:

```bash
git add index.html ssi_tracks/ README.md
git commit -m "initial public build"
```

(Keep the `.md` planning docs in a separate working copy, or add them
to `.gitignore` so they stay local.)

### 3. Push to GitHub

Create a new public repo at github.com — call it whatever you pick as
your product name (`smallsky`, `drift`, whatever landed from
`LAUNCH.md`). Then:

```bash
git remote add origin git@github.com:unrealape/smallsky.git
git branch -M main
git push -u origin main
```

### 4. Enable Pages

- Repo → Settings → Pages
- Source: **Deploy from a branch**
- Branch: **main** · folder: **/ (root)**
- Save

In ~60 seconds, the sim is live at:

```
https://unrealape.github.io/smallsky/
```

### 5. Test it from a fresh browser

Open an incognito window (your cached local files won't help diagnose
real deployment issues). Check:

- Sim loads, shows particles.
- Audio plays when you hit play.
- No console errors in DevTools.
- `Shift+C` plays a film cleanly end-to-end.

If anything breaks here, it's almost always one of three things:

- **MP3 paths broken** (case-sensitive! `Bough-Bend.mp3` ≠
  `bough-bend.mp3`). GitHub Pages is case-sensitive; Windows isn't.
  Verify filenames match exactly what's referenced in `index.html`.
- **Importmap CDN slow** — first load can take 10s while
  `unpkg.com/three@0.160.0/...` spins up. Refresh; second load is
  fast (cached).
- **MIME type on `.mp3`** — GitHub Pages serves audio correctly by
  default. If another host doesn't, add `.htaccess` or the host's
  equivalent.

### 6. (Optional) Custom domain

If you own `smallsky.app` or similar:

- Repo → Settings → Pages → Custom domain → enter `smallsky.app` →
  Save.
- GitHub creates a `CNAME` file automatically. Commit it.
- At your DNS registrar, add a CNAME record:
  ```
  CNAME   @   unrealape.github.io
  ```
  (or four A records to GitHub's IPs if apex-only — see GitHub
  Pages docs).
- Wait up to 24h for DNS, enable "Enforce HTTPS" in the Pages
  settings once the cert provisions.

The URL `smallsky.app` now serves the sim. This is the URL for your X
bio.

---

## Path B — Embedded on an existing site

Use when you have your own site and want the sim to appear inside one
of its pages (e.g., a project showcase, blog post, portfolio entry).

### Option B1 — Iframe the live Pages URL

Simplest. You don't duplicate the sim; you point at the one that's
already running.

In your site's HTML, wherever the sim should appear:

```html
<div
  style="position: relative; width: 100%; aspect-ratio: 16/9;
            background: #02030a; border-radius: 8px; overflow: hidden;"
>
  <iframe
    src="https://smallsky.app"
    style="position: absolute; inset: 0; width: 100%; height: 100%;
                 border: 0;"
    allow="autoplay; fullscreen"
    loading="lazy"
    title="small sky · universe simulator"
  >
  </iframe>
</div>
```

Notes:

- `allow="autoplay"` is required for the soundtrack to start without
  a user click. Without it, browsers block audio until user interacts.
- `loading="lazy"` defers the iframe until scrolled into view — keeps
  your page fast if the sim isn't above the fold.
- `aspect-ratio: 16/9` keeps it a nice widescreen rectangle. Adjust to
  taste.
- Don't set a fixed pixel height — the sim handles resize, but a
  responsive container is kinder on mobile.

Drawback: iframe limits keyboard capture. `Shift+C` and other hotkeys
only work once the user has **clicked** inside the iframe. Add a small
note above it: _"Click to focus, then press `B` for the scene
browser."_

### Option B2 — Copy the files into your site

If your site is a static-site generator (Astro, Eleventy, Hugo) and
you want the sim as a route (`yoursite.com/sim`):

1. Copy `index.html` and `ssi_tracks/` into your site at
   `public/sim/` (or whatever the static folder is called).
2. Update any relative paths in the sim's HTML if the tracks moved.
3. Link to `yoursite.com/sim/` from your nav or portfolio.

This duplicates the content but removes the iframe. Choice depends on
how integrated you want it.

---

## Meta tags for social preview

When someone pastes your URL into X, Discord, Slack, or LinkedIn, a
preview card appears. Yours currently shows nothing because
`index.html` has no `og:` tags. Add these in the `<head>` of
`index.html`:

```html
<meta property="og:title" content="small sky · an infinite universe" />
<meta
  property="og:description"
  content="A single-file, browser-based,
GPU N-body simulator with its own soundtrack."
/>
<meta property="og:image" content="https://smallsky.app/og.png" />
<meta property="og:url" content="https://smallsky.app" />
<meta property="og:type" content="website" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@unrealape" />
<meta name="twitter:creator" content="@unrealape" />

<meta
  name="description"
  content="A single-file, browser-based, GPU
N-body simulator with its own soundtrack. Runs in any modern browser,
no install."
/>
```

Then create `og.png`:

- 1200 × 630 pixels
- Screenshot of a good scene (Milky Way at 3/4 angle works) with a
  tiny wordmark in a corner
- < 1 MB file size
- Save at the root next to `index.html`

This is the image that appears in every share. It's the single most
leveraged asset in the whole project — make it look good once, reuse
it forever.

### Test your social preview

Before launching, verify:

- **X/Twitter**: [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
  (login required; paste your URL).
- **Discord / Slack / LinkedIn**: paste the URL in a draft message,
  watch the preview render. Doesn't need to be sent.
- **Facebook**: [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug)
  (uses the same OG tags).

If a platform caches a bad preview from an earlier version, most have
a "fetch new scrape" button in their debugger.

---

## File size and bandwidth

**55 MB of audio** is the big chunk. GitHub Pages has no hard bandwidth
limit documented but enforces a **"soft" 100 GB/month** for
high-traffic sites. At 55 MB per full load, that's ~1,800 unique
loads/month before you hear from GitHub. Generous for launch; you'd
upgrade to a CDN (Cloudflare free tier) before hitting it.

To keep bandwidth lower:

- **Don't auto-start audio.** Require a user gesture (the existing
  play button) — means audio only downloads when they actively want
  it.
- **Lower-bitrate MP3s.** Your current tracks are ~5 MB each (likely
  320 kbps). Re-encode at 192 kbps — half the size, indistinguishable
  on most consumer hardware.
- **Host audio on a CDN.** Cloudflare R2, Bunny CDN, or even a free
  S3 tier with CloudFront. Reference absolute URLs in the sim. Keeps
  GitHub Pages for the HTML and JS (tiny) and offloads the heavy
  bytes.

For launch, ship as-is. Re-encode if bandwidth becomes a concern.

---

## Mobile

The sim runs on phones but the experience isn't great:

- Touch doesn't map to mouse-hover-based UI (the left rail works,
  scene transitions work, but follow-cam click-picking is fiddly).
- 4096 bodies + bloom + GPGPU is heavy for mobile GPUs — iPhone 15
  Pro does 40 fps, iPhone 13 does 20, older devices drop frames.
- Portrait orientation wastes horizontal framing.

Options for mobile visitors:

1. **Show a redirect notice.** On a narrow viewport, render a fallback
   page with a hero still image, a short description, and a "best
   viewed on desktop" note. Detect via `window.matchMedia("(max-width:
768px)")`. ~20 lines of CSS + JS.
2. **Auto-reduce density.** Detect mobile → set `TEX_SIZE = 64`
   (4,096 → 4,096, wait that's the same; actually 64² = 4,096, but the
   default is 128² = 16,384; on mobile drop to 32² = 1,024). This is
   already wired via the density levels in `CLAUDE.md`.
3. **Ignore it.** Most first-time mobile visits convert to "I'll look
   later on my laptop" anyway. Don't optimise for it yet.

Recommendation: **ship option 3** (ignore) for launch week, **add
option 1** (fallback) week 2 if mobile traffic is > 30% of visits.

---

## Analytics (cheap and minimal)

If you want to know who's visiting and how long they stay:

- **Plausible** (plausible.io) — $9/mo, no cookies, no consent
  banner needed. Two-line snippet.
- **Cloudflare Web Analytics** — free, similar feature set, needs
  Cloudflare DNS.
- **Server logs only** — GitHub doesn't expose them. You'd need to
  move to Cloudflare Pages or Netlify for free log access.

For launch week, Plausible or Cloudflare is enough to answer "did HN
drive traffic, and did they watch for more than 10 seconds." Deeper
analytics isn't worth it until you have a reason.

Don't install Google Analytics. Heavy, consent-banner-requiring,
doesn't tell you what you actually want to know for this kind of
project.

---

## The update workflow

Once deployed:

1. Make a change in your local `index.html`.
2. Test locally — double-click the file, Chrome opens from `file://`,
   the sim runs without a server.
3. If happy:
   ```bash
   git add index.html
   git commit -m "tune Milky Way softening"
   git push
   ```
4. GitHub Pages rebuilds in ~30s. Your live URL updates.

No build step, no deploy pipeline, no CI. One of the happiest
consequences of keeping the whole thing single-file.

For bigger changes (new scene, new film), write them in a feature
branch first, test the deploy preview via GitHub Pages' per-branch
builds (Settings → Pages → Enable "Build preview deployments"), merge
when it feels right.

---

## Quick checklist

Before the launch post:

- [ ] Repo public on GitHub, Pages enabled, live URL returns the sim
- [ ] Custom domain working with HTTPS (if you bought one)
- [ ] `og.png` renders on X / Discord / Slack preview
- [ ] Incognito test from a different machine: sim loads, audio plays,
      `Shift+C` plays a film, keyboard shortcuts work
- [ ] README has a 20s clip / GIF at top and the live URL in line 2
- [ ] Meta tags for SEO (title, description, OG) populated
- [ ] Favicon in place (white pixel, black background — simple)
- [ ] Analytics snippet installed if you want it (optional)
- [ ] Bandwidth budget considered (CDN only if > 50k visits/month is
      plausible in month 1)

---

## The one-paragraph version

Create a GitHub repo with `index.html` and `ssi_tracks/`. Enable Pages
on main. In 60 seconds you're live at
`username.github.io/reponame`. Add OG meta tags and a `og.png`. Buy a
domain if you want; point CNAME at GitHub; enable HTTPS. Done.
Everything else — analytics, mobile fallback, CDN — is optimisation
you only need if launch week succeeds.
