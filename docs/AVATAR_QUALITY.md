---
id: 01KR0000AVATARQUALITY00000
created: 2026-04-22
---

# AVATAR_QUALITY.md — Separate toggle + quality for the avatar face

The model face in the top-left HUD is its own render surface:
its own animation loop (eye-tracking rAF, CSS cloud pulse, mouth
bounce on generation), its own visual identity, its own set of
reasons a user might want it on or off independent of what the
universe is doing. Today it's implicitly yoked to the app's main
render pipeline — if you drop to Low everything dims together; if
you want to hide the face there's no switch.

This doc specifies a **separate toggle + quality tier** for the
avatar, independent of [[RENDER_QUALITY]]'s tier for the universe.

---

## 0. Premise

What the face does today (see
[`src/ui/model-face.js`](../boltzsidian/src/ui/model-face.js)):

- **SVG expression swap** (`idle` / `thinking` / `snarky` /
  `dreaming` / `speculating` / `template` / `sleeping`). Swap is
  instant; cost is near-zero.
- **Eye tracking**. `pointermove` listener throttled via rAF eases
  pupils toward the cursor target (damped easing per frame). Cost:
  a rAF per every ~50 ms of cursor movement until settled, then
  idle.
- **Face tilt**. Same pointer signal — small rotation of the whole
  mount.
- **Backend glow + amorphous cloud**. CSS `::before` element with
  animated gradient. GPU-cheap but not free.
- **Mouth pulse during generation**. CSS keyframes driven by
  `in-flight` counter.
- **Sleep-depth integration**. At deep sleep auto-swaps to
  `sleeping` expression.

Reasons the user might want the face **off**:

- Screen recording for a demo where the face would distract.
- Minimalist aesthetic — just the sky.
- A big monitor where the HUD clutter bothers them.

Reasons the user might want the face **less animated** (but still
present):

- Keyboard-heavy workflow where the cursor-tracking eyes feel
  invasive.
- Low-power device where even the cloud CSS animation costs.

Reasons the universe's quality tier shouldn't be the same knob:

- The face and the universe aren't on the same render surface; they
  have independent budgets.
- A user on Ultra universe + face-off is a legitimate
  configuration. A user on Low universe + full face is also
  legitimate (the face is tiny and GPU-cheap relative to bloom on a
  5000-body scene).

So: its own toggle + its own tier.

---

## 1. Avatar tiers

Parallel to the main tiers but with fewer levers (the face is
simpler). Four states:

| Tier     | Visible | Eye track | Cloud | Mouth pulse                   | Expression swap | Glow                    |
| -------- | ------- | --------- | ----- | ----------------------------- | --------------- | ----------------------- |
| Off      | no      | —         | —     | —                             | —               | —                       |
| Minimal  | yes     | no        | no    | no                            | yes             | static                  |
| Standard | yes     | yes       | yes   | yes                           | yes             | animated                |
| Full     | yes     | yes       | yes   | yes (+ subtle idle breathing) | yes             | animated + accent bloom |

- **Off** — `display: none` on the mount. The `pointermove`
  listener is detached so we don't even pay the event cost.
- **Minimal** — the SVG stays (so users can still tell which
  backend is active), but all animation is suppressed. No cursor
  tracking, no cloud pulse, no mouth bounce. Feels like a static
  icon with expression-change fidelity.
- **Standard** — today's behaviour. Default.
- **Full** — everything Standard does, plus a gentle idle
  "breathing" animation (a 4 s scale(0.98→1.0) loop) and a slightly
  brighter backend glow. Room to grow visual identity without
  hurting the average machine.

### 1.1 Explicit off vs suppressed off

The user's **toggle** (`settings.avatar_visible`) is the binary
on/off. When off, the face is hidden regardless of tier.

The **tier** (`settings.avatar_quality`) picks the fidelity among
Minimal / Standard / Full when visible.

Having both means the user can toggle the face off for a demo
recording without losing their preferred fidelity — when they
turn it back on, it returns to their tier. Simple semantic.

---

## 2. What each lever reaches

Mapping to the existing module:

| Lever                  | Low                              | Medium   | Full             |
| ---------------------- | -------------------------------- | -------- | ---------------- |
| `pointermove` listener | detached                         | detached | attached         |
| Cloud CSS animation    | paused via class `.mface-static` | paused   | animated         |
| Mouth pulse            | no class                         | no class | `.mface-pulse`   |
| Glow blur radius       | 0                                | reduced  | default          |
| Breathing (new)        | no                               | no       | `.mface-breathe` |

Translation layer: model-face's `setQuality(tier)` method toggles a
set of data attributes on `mount`:

```js
mount.dataset.faceQuality = tier; // "minimal" | "standard" | "full"
```

CSS targets:

```css
#model-face[data-face-quality="minimal"] .mface-cloud {
  animation: none;
  opacity: 0.35;
}
#model-face[data-face-quality="minimal"] .mface-mouth {
  animation: none;
}
#model-face[data-face-quality="full"] svg {
  animation: mfaceBreathe 4s ease-in-out infinite;
}
```

Cursor tracking is JS-side: `setQuality('minimal')` calls
`removeEventListener` on the `pointermove` handler. `setQuality` at
Standard / Full re-adds it.

---

## 3. Independence from main render quality

The two systems are **orthogonal by default.** The main tier's
`onTierChange` does NOT touch the avatar's tier. Settings-writes
don't couple.

**Optional coupling** (§5): one checkbox in Settings — "Follow
main quality" — that when on, automatically drops the avatar to
Minimal when the main tier hits Low, and returns to the user's
preferred avatar tier when main is ≥ Medium. Off by default.
Users who care about the face won't want it dropping on them.

---

## 4. Settings UI

### 4.1 Settings → Appearance → Avatar face

Two rows beneath the Constellations toggle:

```
Avatar face     [Off] [on]              (toggle)
Avatar quality  [Minimal] [Standard] [Full]    (segmented picker)
Follow main     ☐                            (checkbox — optional coupling)
```

When toggle = Off, the quality picker disables (dims). When on,
the quality picker is live.

### 4.2 Persistence

- `settings.avatar_visible: boolean` — default `true`.
- `settings.avatar_quality: 'minimal' | 'standard' | 'full'` — default `'standard'`.
- `settings.avatar_follow_main: boolean` — default `false`.

### 4.3 Mount behaviour

On `avatar_visible: false` → `mount.style.display = 'none'`, detach
pointer listener, cancel any in-flight rAF.
On true → `display = ''`, re-attach listener, re-apply tier.

---

## 5. Optional: follow-main coupling

When `avatar_follow_main` is on:

- `qualityMonitor.onTierChange(newMainTier)` also evaluates avatar:
  - If `newMainTier === 'low'` → avatar drops to Minimal.
  - Otherwise → avatar returns to `settings.avatar_quality`.
- The user's avatar_quality setting stays the source of truth.
  Follow-main is a RUNTIME override, not a persistence change.

Disabled by default because the face is cheap and most users want
it stable.

---

## 6. Implementation phases

### Phase A — model-face setQuality + visible · ~1 h

1. `model-face.js` exposes `setQuality(tier)` and `setVisible(flag)`.
2. `setQuality` writes `mount.dataset.faceQuality` and
   attaches/detaches the `pointermove` listener based on tier.
3. `setVisible` toggles `display: ''` / `display: 'none'` on mount
   and detaches the pointer listener on hide (redundant with
   `display: none` cost-wise but cleaner semantics).
4. CSS rules in `index.html` target
   `#model-face[data-face-quality="…"]` to pause / reduce animations.
5. Initial apply at boot from `settings.avatar_visible` /
   `settings.avatar_quality`.

### Phase B — Settings UI · ~45 min

1. `settings.avatar_visible` default `true`.
   `settings.avatar_quality` default `'standard'`.
   `settings.avatar_follow_main` default `false`.
2. Two rows in Settings → Appearance (+ optional coupling
   checkbox).
3. `handleSettingsChange` dispatches to `modelFace.setVisible` /
   `modelFace.setQuality`.

### Phase C — Follow-main coupling (optional) · ~30 min

1. `qualityMonitor.onTierChange` fires; if
   `settings.avatar_follow_main`, apply coupling rule.
2. UI reflects the runtime-effective avatar tier when follow-main
   is active (tiny italic hint "auto-dimmed").

**Total: ~2.25 hours for A–C.** ~1.75h without the optional
coupling.

---

## 7. Edge cases

- **User toggles off during a `thinking` animation.** Mount hides
  mid-mouth-pulse; cancel the rAF, no cleanup needed beyond
  `display: none`.
- **Dream wake while hidden.** Sleep-depth expression transitions
  still fire internally. When the user toggles visible again, the
  current expression reflects reality.
- **Eye tracking with the listener detached on Minimal.** Pupils
  stay at last-known offset. Fine; a static icon shouldn't
  twitch.
- **follow-main + main at Low + user explicitly sets Avatar to Full.**
  Who wins? The explicit setting. Follow-main only applies when the
  user's avatar_quality is at whatever it was before the main tier
  dropped. If the user changes avatar_quality while follow-main is
  dimming, they've overridden the dim — the new pick becomes the
  new baseline.
- **High-DPI + Minimal glow.** CSS `filter: blur(0)` removes the
  GPU glow layer entirely; the SVG renders crisp.

---

## 8. What to deliberately skip

- **Per-expression opt-out.** "I want the face but not the
  snarky expression." Too fiddly.
- **Custom face asset upload.** The face IS Boltzsidian's
  personality; users don't get to replace it.
- **Voice / audio output at higher tiers.** Out of scope; this
  doc is visual.
- **Animation profile presets** ("peaceful" vs "alert"). The four
  tiers cover the range.
- **Per-backend face visibility** ("show only for Claude, hide
  for template"). The face identifies the backend; hiding it for
  some backends defeats the purpose.

---

## 9. Interactions with existing features

- **[[RENDER_QUALITY]].** Orthogonal by default; coupling opt-in.
  The main tier HUD pill and the avatar HUD can both be visible;
  they describe different things.
- **[[MODEL_SURFACES]] §1.2.** The face is the UI the user sees
  that answers "which model produced this." Must stay visible in
  SOME form — Minimal keeps the SVG + backend glow so the
  identification contract holds.
- **[[DREAM]] / [[DREAM_ENGINE]].** Sleep-depth auto-swaps to
  `sleeping` expression — unchanged across tiers. The transition
  cost is trivial (data-attribute update).
- **[[STREAM_SETUP]].** Screen recorders want a clean canvas;
  one-click "hide face" is the primary reason for the toggle to
  exist.

---

## 10. One sentence

The avatar face is its own render surface with its own reasons to
be on or off at varying fidelity, so it gets its own toggle plus
three quality tiers independent of the universe — the user can
pair an Ultra sky with a hidden face, or a Low sky with a fully-
animated avatar, without either feature compromising the other.

#avatar #face #quality #toggle #independent
