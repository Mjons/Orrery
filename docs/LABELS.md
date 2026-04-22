---
tended_on: [tag-infer]
id: 01KPS7VDJDKH3FAJA2J44YHPZK
created: "2026-04-21T15:14:19.225Z"
---

# LABELS.md — When the titles get in the way

A short design doc. Michael's observation:

> Perhaps there's a way to toggle off the labels altogether which allows
> the mouse to interact with the objects on screen directly (stars and
> tethers).

Right. Labels are scaffolding. They help a new user (or anyone exploring
an unfamiliar vault) know which star is which. But they're also:

- **Opaque to the pointer.** With `pointer-events: auto` on each label
  (needed for label-hover), hovering a floating title intercepts the
  event that would otherwise hit the star under it, or the tether
  running through it.
- **Visually noisy.** At high zoom on a dense cluster, 20 overlapping
  titles can clutter the frame more than the bodies themselves.
- **Contrary to the aesthetic.** The universe is supposed to be a
  universe; constellations with floor-to-ceiling name tags read like a
  diagram, not a field.

A toggle is the minimum. But there's a better middle option that's
worth naming before we ship.

---

## 0. Three states, not two

Binary off/on is the ask. The design space has three points:

- **Always** (current default) — the nearest ~150 bodies get floating
  titles; fade with distance. Best for new users and unfamiliar vaults.
- **On hover** — no titles in the field. Hovering a star brings up its
  title near the star (plus the orange ring + orbit already wired in).
  The field reads as pure space; annotation appears exactly where you
  point and nowhere else.
- **Never** — no titles at all. Discover a star's identity by clicking
  it (panel opens). Pure universe mode. The screenshot you'd show
  someone to explain what Boltzsidian looks like.

Three states is correct. Shipping only on/off closes off the
"on hover" midpoint, which is probably the state most users would
settle into after a week — they've internalized the shape of their
vault and don't need ambient titles, but they still want the
affordance when they reach for it.

---

## 1. The keystroke

`L` cycles: Always → On hover → Never → Always. Single letter, easy to
rediscover. The HUD subtly reflects the current mode:

- Bottom-right sleep-depth pill shares its row with a tiny **L·a**,
  **L·h**, or **L·n** glyph that fades in for ~1.5s after toggling,
  then fades out so it doesn't permanent-clutter.
- Optional settings-pane dropdown for users who prefer menus.

No modifier required — `L` should never be eaten by anything else. Skip
the key when a text input is focused (already the pattern for other
keys like `\` settings and `/` search).

---

## 2. What labels stop being in each state

### 2.1 Always

No change. Labels are DOM elements above the canvas. Their own
`pointer-events: auto` regions intercept mouse events.

Cost: if you try to click a tether that runs under a label, the label
eats the event. If you try to pick a star that a label is painted
on top of, same. Today that's the friction Michael named.

Mitigation for this state specifically (orthogonal fix, worth
considering): make labels ignore pointer events when any modifier key
is held (Alt, Shift). Users who know the gesture get pass-through
behavior when they need it; everyone else keeps the label-hover
affordance.

### 2.2 On hover

Labels' DOM container flips to `pointer-events: none` wholesale. The
canvas gets every event. When the pointer-hover system (already
wired in `ui/hover.js`) picks a body, we draw a _single_ title label
near that body.

Only one label on screen at a time. Cheap. The existing label pool
(150 DOM elements) shrinks effectively to 1 in this mode — or we can
repurpose exactly one from the pool.

Where does the title render? Right above the star, same offset as
today. Or, if the orbit ring is already rendering there, slightly
to the upper-right to avoid overlap with the planets.

### 2.3 Never

Same as On hover but with the title suppressed. Everything else
remains: orange flare on pointer-hover, orbit ring, click-to-open.
Discovery becomes: hover → see the planet ring and flare → click to
reveal identity in the panel.

This sounds lossy but it's not. Someone in this mode already knows
their vault and is using Boltzsidian as a meditative surface, not a
browser. The spatial memory is the index.

---

## 3. What doesn't change

- **Search (Cmd+K).** Independent of label mode. Typing a query
  dims non-matches and arcs the camera regardless of whether titles
  are visible.
- **Formation pills.** Their highlighting (galactic core, halo,
  protostars, solo folder) applies equally in all label states.
- **Note panel.** Opening a note is a click, unrelated to labels.
- **Hover ring + orange flare + orbit.** All driven by pointer, not
  labels. Work in every mode.
- **Click → open.** Always.

---

## 4. What does change

- **Pointer pass-through.** Only labels in `Always` mode block
  pointer events. In `On hover`, the label that appears for one
  body is short-lived and positioned offset enough not to intercept
  what the user was aiming at. In `Never`, nothing blocks.
- **Density readability.** Without labels, tight clusters look more
  like collective glows and less like catalogs. For most users this
  is a net-positive aesthetic move once they know the vault.
- **Onboarding.** First-run users land in `Always` so they know what
  they're looking at. The coachmark for `L` fires the first time a
  user lingers for more than ~2 minutes without opening the settings
  pane — "press L to change how labels behave."

---

## 5. Implementation notes

Small surface. Roughly:

1. Add `label_mode` to `DEFAULT_SETTINGS`: `"always"` | `"hover"` | `"never"`.
   Default `"always"`.
2. In `ui/labels.js`, accept the mode as a getter. Its `update()` loop:
   - `always`: current behavior.
   - `hover`: early-exit the full projection loop; instead, render
     exactly one label for the currently-hovered note (main exposes
     a `getHoveredId()` getter). Position it with the same projection
     math.
   - `never`: hide every label; the pool stays in the DOM but all
     opacities are pinned to 0 and pointer-events all off.
3. A top-level `L` keydown in `main.js` cycles the mode, saves to
   settings, fires a tiny corner toast.
4. A settings-pane row under Appearance for the same dropdown.
5. Modifier-pass-through fix (described in §2.1) for the `always`
   state: when any modifier key is down, flip the label container's
   `pointer-events` to `none` so gestures aren't eaten.

No new rendering, no new shader work. Pure DOM + state.

Total change: probably ~80 lines across three files. An afternoon.

---

## 6. Open questions

1. **Does `L` conflict with anything?** Not currently. CodeMirror
   editor eats it inside the panel, which is the correct scope.
2. **Should `Never` mode also hide the corner HUD pills?** I think no
   — HUD is ambient product identity, not annotation. The user asked
   about _labels_, not about UI chrome. Scope creep.
3. **Should hover mode show the title above the star, or attached to
   the star in a connecting leader line?** The simple answer is
   above; the prettier answer is a thin line from the star to the
   title that fades with the label. Ship simple, iterate if it reads
   as disconnected.
4. **When search is active, does `hover` mode temporarily switch to
   `always` so matching bodies get titled?** Probably yes. Matching
   stars should shout their names for the 3 seconds a search is live.
   Revert on close.

---

## 7. One sentence

Three label modes — Always, On hover, Never — let the user choose
between a navigable diagram, a responsive field, and pure universe,
with one key.

#star #user #panel
