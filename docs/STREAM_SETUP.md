---
tended_on: [tag-infer]
id: 01KPS7VDVDX5ZCXF3V9C87SPZH
created: "2026-04-21T10:54:50.204Z"
---

# STREAM_SETUP.md — 24/7 Twitch Setup From Scratch

Everything required to go from a bare 1080ti box to a live, unattended,
music-scored Twitch stream of the universe sim. Follow top to bottom.
Budget: one focused afternoon.

Companion to `LAUNCH.md` (the why) and `CLAUDE.md` (the sim itself).

---

## 0. Inventory

Before you start, confirm you have:

- **Box** with GTX 1080ti, Windows 10/11, gigabit ethernet (not Wi-Fi for
  24/7), ≥16GB RAM, ≥100GB free SSD.
- **Accounts:** Twitch, a throwaway Gmail for the stream bot, GitHub
  (already yours).
- **Assets:** `ssi_tracks/` with your 10 original MP3s (already in
  repo).
- **Upload bandwidth:** 10 Mbps minimum. Test at fast.com from the box
  itself, not your laptop.

If any of the above is missing, fix it now. Everything else assumes they
exist.

---

## 1. Windows: prep for unattended operation

This is 30 minutes of clicking in Settings, but it's the difference
between 24/7 and 24/6.

**Power & sleep:**

- Settings → System → Power → Screen and sleep: set everything to
  _Never_.
- Settings → System → Power → Power mode: _Best performance_.
- Control Panel → Power Options → Change plan settings → Advanced →
  USB settings → _Disabled_ selective suspend. (OBS audio devices ghost
  otherwise.)
- Control Panel → Power Options → Advanced → PCI Express → Link State
  Power Management → _Off_. (Prevents GPU from dropping clocks
  mid-stream.)

**Windows Update:**

- Settings → Windows Update → Advanced → _Pause updates for 5 weeks_.
  Renew monthly. Never let it auto-reboot mid-stream.
- Settings → Windows Update → Active hours → set 24-hour window
  (trick it by making active 00:00–23:59).

**Notifications, overlays, surprises:**

- Settings → System → Notifications → _Off_.
- Settings → System → Focus → Turn on Focus _always_.
- Uninstall or disable GeForce Experience overlay (Alt+Z can trigger
  mid-stream). NVIDIA control panel only, no overlay.
- Disable Xbox Game Bar: Settings → Gaming → Xbox Game Bar → _Off_.

**Auto-login:**

- `Win+R` → `netplwiz` → untick "Users must enter a username and
  password" → enter the password when prompted.
  (Means if the machine reboots, it boots back into the stream user
  session without waiting for you.)

**Create a dedicated user:** `streambot`. Run everything from this
user, not your daily account. Keeps Chrome profiles / cookies /
notifications clean. **\*\***\*\*\*\***\*\***\*\*\***\*\***\*\*\*\***\*\***

---

## 2. GPU: drivers + temps

- Install the **NVIDIA Studio driver** (not Game Ready). More stable
  for long sessions. Skip the GeForce Experience checkbox.
- Install **MSI Afterburner + HWInfo64** for temp monitoring.
  - Set a modest fan curve: 40°C → 40%, 60°C → 65%, 75°C → 85%,
    80°C → 100%.
  - No overclock. This is a 24/7 workload, leave headroom.
- Run `furmark` or just the sim for 30 minutes and watch temps.
  Target: sustained GPU temp ≤ 75°C at 40–50% utilisation. If higher,
  clean the card or add a side-panel fan before continuing.

---

## 3. Deploy the sim (the thing being streamed)

You're streaming a **hosted** page, not a local file. This lets you
update the sim from anywhere without touching the stream box.

**On your main machine (not the stream box):**

```bash
cd l:/Projects_claudecode/Universe_sim_4_7
git init
git add index.html CLAUDE.md README.md ssi_tracks/
git commit -m "initial public version"
# Create repo on github.com (e.g. orrery), then:
git remote add origin git@github.com:unrealape/orrery.git
git push -u origin main
```

On GitHub: repo Settings → Pages → Source = `main` branch, `/` root.
Save. In 60 seconds the sim is live at
`https://unrealape.github.io/Orrery/` (or equivalent).

Load it from the stream box's browser. If it runs, you have a
streamable URL. This URL is now the single source of truth for the
stream. Update the sim → git push → stream reflects changes on next
page reload.

---

## 4. Browser setup (what's actually displayed)

The stream is a **maximised Chrome window** captured by OBS. Reasons:
sharper than OBS's browser source, respects GPU acceleration properly,
easier to restart.

Install **Chrome** on the stream box. Open it once, sign out of any
Google accounts (no notifications, no sync). Close it.

Create a launcher shortcut. Right-click desktop → New → Shortcut →
paste:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --start-fullscreen --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --autoplay-policy=no-user-gesture-required --app=https://unrealape.github.io/Orrery/
```

Name it `OrreryKiosk`. Double-click to test. Chrome should open
fullscreen showing the sim, no chrome (pun), no tab bar.

Exit with `Alt+F4`. (Users can't see `Alt+F4` in your stream.)

**Disable Chrome's annoying "Restore pages" prompt:**
Run Chrome once, go to `chrome://flags` → search "Infobars" → disable
the relevant crash-restore infobar flags.

**Disable sleep mode on the browser tab:**
The `--disable-background-timer-throttling` flag above handles it. If
you see the sim slow down when another window is focused, confirm the
flag is actually applied by visiting `chrome://version/`.

---

## 5. Audio: the rotating soundtrack

OBS can play audio directly, but **VLC** on Windows is more reliable
for an infinite shuffle playlist.

- Install VLC.
- Copy `ssi_tracks/` to `C:\stream\tracks\` (avoid spaces in paths).
- Open VLC → Media → Open Folder → select `C:\stream\tracks\`.
- Tools → Preferences → Show All → Playlist → enable _Repeat all_ and
  _Shuffle_. Save.
- View → Playlist → save as `C:\stream\tracks.xspf`.
- Create launcher:

```
"C:\Program Files\VideoLAN\VLC\vlc.exe" --loop --random --no-video --qt-start-minimized --intf=dummy C:\stream\tracks.xspf
```

No GUI, just audio. OBS will capture it via desktop audio.

**Volume target:** run VLC at 70% master, your OS mixer at 80%. Leaves
headroom so OBS doesn't clip the stream.

**"Now playing" text for the overlay:**
Tools → Preferences → Interface → check "Save current playlist". Then
install the free **rainmeter** skin `NowPlaying` pointed at VLC. It
writes the current track name to a text file at
`C:\stream\nowplaying.txt`. The overlay (§8) reads this file.

---

## 6. OBS: broadcast configuration

Install **OBS Studio** (latest). First-launch wizard: pick _Optimize for
streaming_, 1920×1080, 60fps.

### Settings

**Output → Streaming:**

- Encoder: **NVIDIA NVENC H.264 (new)**
- Rate Control: **CBR**
- Bitrate: **6000 Kbps** (Twitch max for non-partnered; drop to 4500
  if your upload fluctuates)
- Keyframe Interval: **2**
- Preset: **P5 (Slow, Quality)** — free with NVENC, looks great
- Tuning: Quality
- Profile: high
- Look-ahead: **enabled**
- Psycho Visual Tuning: **enabled**
- Max B-frames: 2

**Output → Recording:**

- Type: Standard
- Path: `C:\stream\recordings\`
- Recording Format: **mkv** (safe against crashes; remux to mp4 later)
- Encoder: (use stream encoder)
- Enable **Replay Buffer**, 60 seconds — this is how you grab emergent
  moments without rewinding. Hotkey: `Ctrl+F8`.

**Audio:**

- Sample Rate: 48 kHz
- Desktop Audio: Default
- Mic: **disabled**

**Video:**

- Base & Output resolution: 1920×1080
- FPS: 60

**Advanced:**

- Process Priority: Above Normal
- Color Space: sRGB, Color Range: Limited
- Enable _Automatically reconnect_ (10s delay, infinite retries)

### Scenes

One scene is enough. Call it `Main`.

Sources (top to bottom = draw order):

1. **Window Capture (WGC):** OrreryKiosk Chrome window. Method:
   _Windows 10 (1903 and up)_. Capture cursor: _off_.
2. **Audio Output Capture:** Default desktop (for VLC).
3. **Browser Source:** your local overlay (see §8), URL
   `file:///C:/stream/overlay/index.html`, 1920×1080, CSS: `body {
background: transparent; margin: 0; }`. Shutdown when not
   visible: _off_. Refresh browser when scene becomes active: _off_.

That's the whole production.

### Stream key

Twitch Dashboard → Settings → Stream → copy key → paste into OBS
Settings → Stream → Service: Twitch → Use Stream Key. Do _not_ post the
key anywhere (it's a password).

---

## 7. Twitch channel setup

From the stream user's browser on _any_ machine:

**Creator Dashboard → Channel:**

- Title: `orrery · infinite universe with original music`
- Category: **Software and Game Development** (week 1–2). Rotate to
  **ASMR** or **Music** after.
- Tags: `generative`, `ambient`, `music`, `opensource`, `simulation`,
  `art`, `coding`, `noCommentary`
- Language: your primary
- Mature content: off

**Profile:**

- Panels (below video): 4 panels, 320×100 each
  1. **About** — 2 sentences max
  2. **How it works** — "Running on [GitHub link]. One HTML file, no
     install"
  3. **Chat commands** — list `!scene`, `!palette`, `!dice`, `!info`
  4. **Contact** — `@unrealape` on X, repo link

**Notifications:**

- Dashboard → Preferences → Notifications → disable every email that
  isn't "security".

**Moderation:**

- AutoMod → level 3 (filter most, you're not there to moderate).
- Block hyperlinks from non-subs.
- Slow mode: 5 seconds.
- Add your own `!scene`, `!palette`, `!dice`, `!info` to the _allowed_
  commands list so AutoMod doesn't eat them.

**Stream key security:** Twitch → Settings → Security → enable 2FA
with an authenticator app (SMS is not acceptable).

---

## 8. The overlay

A tiny HTML file OBS renders on top of the Chrome window. Reads the
"now playing" text file and the current scene name from disk.

Create `C:\stream\overlay\index.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<style>
  :root {
    --accent: #8ab4ff;
  }
  body {
    margin: 0;
    color: white;
    font-family: "JetBrains Mono", monospace;
    background: transparent;
  }
  .wrap {
    position: fixed;
    inset: auto 24px 24px auto;
    text-align: right;
    font-size: 14px;
    line-height: 1.5;
    opacity: 0.75;
    text-shadow: 0 0 8px #000;
  }
  .brand {
    color: var(--accent);
    letter-spacing: 0.08em;
  }
  .qr {
    position: fixed;
    bottom: 24px;
    left: 24px;
    width: 96px;
    height: 96px;
    opacity: 0.6;
  }
</style>
<div class="wrap">
  <div class="brand">orrery · @unrealape</div>
  <div id="scene">—</div>
  <div id="track">—</div>
</div>
<img class="qr" src="qr.png" alt="" />
<script>
  async function tick() {
    try {
      const t = await (
        await fetch("C:/stream/nowplaying.txt?" + Date.now())
      ).text();
      document.getElementById("track").textContent = "♪ " + t.trim();
      const s = await (await fetch("C:/stream/scene.txt?" + Date.now())).text();
      document.getElementById("scene").textContent = "⟡ " + s.trim();
    } catch {}
    setTimeout(tick, 2000);
  }
  tick();
</script>
```

**Generate `qr.png`:** any free QR generator, encode your Pages URL,
save at 256×256 transparent.

**Writing `scene.txt`:** the chat bot (§9) will update this file every
time the cinematic director transitions. Until the bot is online,
create the file by hand with one scene name in it.

**Local fetch of `file://` URLs** may be blocked in Chrome unless the
browser source has "Shutdown when not visible = off" and you launched
OBS with its built-in browser source (CEF). If fetch fails, swap the
paths for relative paths and move `nowplaying.txt` / `scene.txt` into
`C:\stream\overlay\`.

---

## 9. The chat bot

This is the only piece of the stream that's outside `index.html`. It
listens to Twitch chat, writes director commands to the sim, and
updates `scene.txt` for the overlay.

### Architecture

```
  Twitch IRC ──► Node bot ──► WebSocket ──► sim page (overlay hook)
                     │
                     └──► writes C:\stream\scene.txt
```

The sim page already has a cinematic director with `applyScene(key)`,
palette switching, and the "roll the dice" perturbation. The bot sends
those same calls via a tiny WebSocket the page listens to.

### Install

Install Node.js LTS on the stream box. In `C:\stream\bot\`:

```bash
npm init -y
npm install tmi.js ws
```

Create `bot.js`:

```js
import tmi from "tmi.js";
import { WebSocketServer } from "ws";
import fs from "fs";

const VALID_SCENES = [
  "quiet-drift",
  "sagittarius",
  "collision",
  "birth",
  "event-horizon",
  "dust-storm",
  "orrery",
  "lattice",
];
const VALID_PALETTES = [
  "ice",
  "ember",
  "aurora",
  "nebula",
  "mono",
  "sunset",
  "bone",
  "vaporwv",
];

// --- websocket to the browser ---
const wss = new WebSocketServer({ port: 8091 });
let pageSocket = null;
wss.on("connection", (s) => {
  pageSocket = s;
});
function send(msg) {
  if (pageSocket?.readyState === 1) pageSocket.send(JSON.stringify(msg));
}

// --- Twitch IRC ---
const client = new tmi.Client({
  channels: ["unrealape"], // your channel
  options: { debug: false },
});
client.connect();

// per-user cooldown
const lastUse = new Map();
function cooled(user, ms = 60_000) {
  const t = Date.now();
  if ((lastUse.get(user) ?? 0) + ms > t) return false;
  lastUse.set(user, t);
  return true;
}

client.on("message", (channel, tags, msg, self) => {
  if (self) return;
  const user = tags.username;
  const [cmd, ...args] = msg.trim().split(/\s+/);

  if (cmd === "!scene") {
    const key = (args[0] || "").toLowerCase();
    if (!VALID_SCENES.includes(key)) return;
    if (!cooled(user)) return;
    send({ type: "scene", key });
    fs.writeFileSync("C:/stream/scene.txt", key);
  } else if (cmd === "!palette") {
    const key = (args[0] || "").toLowerCase();
    if (!VALID_PALETTES.includes(key)) return;
    if (!cooled(user)) return;
    send({ type: "palette", key });
  } else if (cmd === "!dice") {
    if (!cooled(user, 120_000)) return;
    send({ type: "dice" });
  } else if (cmd === "!info") {
    client.say(
      channel,
      "orrery · https://github.com/unrealape/orrery · runs in your browser",
    );
  }
});
```

Launch it:

```
node bot.js
```

Bot output to a log file: use the **NSSM** service wrapper to install
it as a Windows service so it starts on boot and restarts on crash.

### Hook the sim

In `index.html`, add a tiny listener (one block, sits outside the
director). Guard everything — if the socket fails, the sim runs
unchanged.

```js
(function installRemoteControl() {
  try {
    const ws = new WebSocket("ws://localhost:8091");
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "scene" && SCENES[m.key]) applyScene(m.key);
      else if (m.type === "palette" && PALETTES[m.key]) {
        params.palette = m.key;
        applyPalette(m.key);
      } else if (m.type === "dice") rollTheDice?.();
    };
    ws.onclose = () => setTimeout(installRemoteControl, 5000);
  } catch {}
})();
```

**Important:** this block stays in `index.html`. It's an inert no-op
when no WebSocket is listening (e.g. on the public Pages deploy from a
stranger's browser). Only your stream box runs the bot, so only your
stream responds to commands.

Update the bot/sim commands to emit a scene change to `scene.txt`
whenever the cinematic director switches scenes on its own — wire it
through the same WebSocket going the other direction so the overlay
stays in sync.

---

## 10. Watchdog and auto-restart

A 24/7 stream _will_ break. Prepare for it.

**Nightly browser restart (sheds memory leaks):**
Task Scheduler → Create Task:

- Trigger: Daily at 04:00
- Action: run `C:\stream\restart-chrome.ps1`

`restart-chrome.ps1`:

```powershell
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-Process "C:\stream\OrreryKiosk.lnk"
```

OBS will keep capturing — the "Window Capture" source re-binds to
the new Chrome window automatically if the title matches.

**OBS crash recovery:**
OBS has a built-in "Automatically reconnect" for stream drops. For OBS
itself crashing, add a second Task Scheduler task that runs every 5
minutes and checks `Get-Process obs64 -ErrorAction SilentlyContinue`;
if absent, relaunch.

**Disk-full watchdog:**
Replay buffer + recordings accumulate. Schedule a weekly task:

```powershell
Get-ChildItem C:\stream\recordings\ -Filter *.mkv |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item -Force
```

**Healthcheck webhook (optional, recommended):**
Sign up for https://healthchecks.io free tier. Create one ping URL.
Add to the bot: ping it every 5 minutes. If the bot dies, you get an
email in 15 minutes. Same for a Task Scheduler ping from the Chrome
restart script — confirms the box rebooted successfully.

---

## 11. The 72-hour burn-in

**Do not go public until this passes.**

- Start stream → **Twitch stream in OBS → Stream to a private key** (do
  _not_ hit "Start Streaming" yet). Instead, Start _Recording_. Record
  to disk for 72 hours continuously.
- Review: on hour 72, scrub the recording. Look for:
  - Frame drops (OBS has a stats overlay — monitor during the run)
  - Audio desync
  - Chrome tab freeze (look for a still frame for > 2s)
  - GPU temp spikes
  - Dropped network packets
- Fix everything you find. Repeat a 24h burn-in. If _that_ passes,
  proceed.

Only then, click **Start Streaming** and leave it running.

---

## 12. Go-live checklist

Morning of launch, in order:

- [ ] `nowplaying.txt` and `scene.txt` exist with sane content
- [ ] VLC running, music audible from OBS preview
- [ ] Chrome kiosk running, sim visible, cinematic mode on
- [ ] OBS stats overlay: 0 dropped frames, 0 skipped frames, 60fps
- [ ] Bot service running, `C:\stream\bot.log` not erroring
- [ ] GPU temp < 72°C, fan audibly ramping correctly
- [ ] Windows Update paused, Focus on
- [ ] Twitch panels populated, category set
- [ ] Hit **Start Streaming**
- [ ] Watch from your phone for 10 minutes. Everything readable,
      readable music, overlay legible at mobile size
- [ ] Pin one "we're live" tweet from @unrealape with a 20s clip and
      the Twitch link
- [ ] Walk away

---

## 13. Costs (monthly)

- Electricity (1080ti box 24/7, ~250W avg): ~$22/mo at US average rate
- Twitch: free
- GitHub Pages: free
- healthchecks.io: free tier
- Node bot: runs locally, free
- Domain (if you bought one): $1/mo amortised

**Total: ~$25/mo.**

---

## 14. When things break (they will)

- **Stream frozen, music still playing** → Chrome crashed, VLC fine.
  Run `restart-chrome.ps1` manually. Diagnose only if it happens
  twice/week.
- **Music stopped, video fine** → VLC. Restart it, then check if
  playlist has bad MP3s.
- **Bot not responding in chat** → `nssm restart OrreryBot`. Check
  `bot.log`.
- **Twitch says "offline" but OBS says streaming** → Twitch ingest
  issue. Switch ingest server in OBS → Stream settings. Usually
  resolves in minutes.
- **Everything frozen** → Windows. Reboot. Auto-login + autostart
  task will bring everything back in ~90 seconds.

Build an **incident log** in `C:\stream\incidents.md` — one line per
outage, duration, cause, fix. After two months you'll have a pattern
and most problems disappear.

---

## The very short version

If you only do four things, do these:

1. Host the sim on GitHub Pages.
2. Launch it in Chrome kiosk mode with the no-throttling flags.
3. OBS with NVENC + window capture + desktop audio. Nothing else.
4. Nightly scheduled Chrome restart.

Everything above is polish. These four will get you 90% of the way.

#panel #user #daily
