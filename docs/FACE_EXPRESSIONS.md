---
created: 2026-04-25
status: brainstorm
---

# FACE_EXPRESSIONS.md — Context-sensitive Pixar-level reactions

A menu of expressive beats for the existing avatar
([model-face.js](../boltzsidian/src/ui/model-face.js)). The look is
scribble + cloud — **don't change the style**; change the smoothness,
timing, and context-awareness of what we already have.

Pick from this list. Don't ship the whole thing.

## Style invariants (locked)

- Scribble strokes stay scribble. No clean vector eyes, no replacement
  geometry. Animate the existing `<path>` shapes.
- The seven expression groups stay (`idle / thinking / snarky / dreaming
/ speculating / template / sleeping`). New beats are _transient
  overlays_ that ride on top, not new permanent expressions.
- One accent color. Backend tint still drives `--mface-glow`.
- Cloud `::before` stays. Reactions can warp it, can't replace it.
- Always behind the bodies (z-index 3). Reactions can't bring it
  forward.

## Pixar principles, in our medium

We have an SVG cloud + scribble lines + a tilt + a glow + a hue. Apply:

- **Squash & stretch** → vertical/horizontal scale on individual
  scribble groups (eye widening, mouth gulp).
- **Anticipation** → tiny opposite motion ~120ms before the main beat
  (eyes pull in _before_ they bulge out).
- **Follow-through** → after the beat resolves, an overshoot wobble in
  the cloud blob.
- **Slow in / slow out** → cubic-bezier on every transient, never
  linear.
- **Secondary action** → cloud breathing speed shifts when the face
  reacts; halo glow pulses on a different curve than the face itself.
- **Arcs** → eye drift never travels in straight lines; bias the easing
  through a slight curve.
- **Exaggeration** → for the rare moments (delete, idea-lands), push
  scale ±35%, not ±5%.

---

## 1. Reactions to user actions

Beats triggered by what the user just did. Each is a _one-shot_ on top of
the current expression.

- [ ] **Eyes bulge on delete.** User deletes a note → eyes scale 1.4×
      with a 60ms anticipation squish first, mouth drops to a tiny "o"
      for 400ms, then settle. Cloud puffs outward 8% then deflates.
- [ ] **Wince on irreversible delete.** Empty trash / "delete and don't
      ask" path → both eye scribbles flatten to lines for 200ms while
      the mouth bends down. Like a flinch. Different from the bulge:
      bulge = surprise, wince = "ouch."
- [ ] **Eyebrow raise on weird link.** User backlinks a note to itself,
      creates a circular reference, or tags something with a tag that
      doesn't exist anywhere else → left scribble bows up into a `~` for
      900ms.
- [ ] **Tilt toward the active panel.** When a side panel opens, base
      tilt drifts ±4° over 600ms toward that panel. The face is
      _paying attention to it._ Already partially implemented via
      `--mface-look-tilt`; extend so the tilt holds while the panel is
      open.
- [ ] **Pursed-lip on rename.** User renames a note → mouth scribble
      compresses horizontally to ~60% width for 350ms. "Considering it."
- [ ] **Quick blink on save.** Ctrl-S → both eye scribbles flatten for
      80ms (one frame at 60fps + one), then back. Acknowledgment, not
      reaction. Cheaper than a toast.
- [ ] **Slow blink on autosave.** Same flatten but 240ms with ease-in-
      out. "I noticed but I'm not impressed." Distinct from the snappy
      Ctrl-S blink.
- [ ] **Look at the cursor's drag target.** While dragging a body / a
      tag onto a note, eyes track the _target_ (the orbit, the note),
      not the cursor itself. Reads as the face anticipating the
      outcome.
- [ ] **Squint on long search query.** User types > 20 chars in search →
      eye scribbles narrow vertically. As if trying to read along.
      Expand back when search closes.
- [ ] **No-results sympathy.** Search returns 0 hits → mouth flips down
      into a sad arc for 600ms, then back to current expression. Soft
      touch, no toast needed.
- [ ] **Eyebrow flicker on tag mismatch.** User adds a tag that exists
      elsewhere with different casing → tiny single-side eyebrow twitch
      (50ms up, 50ms down). Subliminal nudge to fix.
- [ ] **Look up on link insertion.** User opens the link picker → eyes
      drift up-and-toward the picker's screen position. "Considering
      options."
- [ ] **Settle on link confirmed.** User picks a link → eyes return to
      neutral, cloud breathes one full cycle slow. Resolution beat.

## 2. Reactions to the universe

Beats triggered by what the _bodies_ are doing.

- [ ] **Eyes follow the focused body.** Already implemented as
      `lookAt`. Add: when the body moves at high velocity, eye drift
      eases faster (track speed proportional to body speed). The face
      gets _animated by_ the universe.
- [ ] **Wide eyes during tether snap.** A tether breaking → both eye
      scribbles scale 1.25× for 500ms. Subtle "did you see that?"
- [ ] **Pulled-toward-collision lean.** Two bodies on a collision
      course → tilt leans 6° toward them in the last 500ms before
      impact. Anticipation of the event, even though it's emergent
      rather than scripted.
- [ ] **Flash on supernova / bright event.** A high-mass burst happens
      → halo pulses bright once (one cycle of mface-flash) on the same
      beat as the burst. The face _reflects_ the universe's mood.
- [ ] **Hue catch.** When a body in the focused cluster has a strongly
      saturated tint, the cloud `--mface-hue` drifts toward that tint
      over 3s, then drifts back. Background sympathy.
- [ ] **Sleepy lid droop on quiet universe.** No bodies near the cursor
      for > 30s → eye scribbles compress vertically by 20%. Not full
      sleep yet; "drifting." Wakes up the moment the user moves.
- [ ] **Constellation pride.** User confirms a constellation → cloud
      breathes one bigger cycle (scale 1.08 for 1.2s). Quiet
      acknowledgment.
- [ ] **Dream depth darkens halo.** As `sleepDepth` increases past 0.5,
      halo opacity drops smoothly from 0.42 to 0.08 instead of
      step-changing at 0.85. Makes the existing sleep transition feel
      _gradual_, not switched.

## 3. Reactions to the model

Beats around generation, not just the result expression.

- [ ] **Pre-think anticipation.** `onGenerateStart` → before the
      thinking expression takes over, a 100ms inhale: cloud scales
      0.96× and tilt straightens by 1°. Then thinking begins.
- [ ] **Long-think fidget.** Generation > 4s → eye scribbles drift to
      one side, hold 600ms, drift to the other. Reads as "still
      working." Stops on result.
- [ ] **Result-lands recoil.** `onGenerateResult` → 80ms eyes-narrow
      anticipation, then the expression swap is paired with a 6° tilt
      kick that springs back over 700ms. The result _arrives_, the
      face _catches_ it.
- [ ] **Snarky brow lift.** `snarky` expression → existing brow already
      arched; on entry, briefly lift another 4° then settle. Tiny
      double-take.
- [ ] **Speculating spark trail.** `speculating` already has a spark
      above. Animate the spark with a small upward arc instead of
      static. Pixar moment.
- [ ] **Dreaming sway.** `dreaming` → tilt oscillates ±3° on a 6s sine.
      Not the cloud breathing — the whole face. "Lost in thought."
- [ ] **Template defeat.** `template` expression entry → cloud breathes
      one slow exhale (scale 1.0 → 0.92 → 1.0 over 2.4s) and the halo
      dims. "I tried." Distinguishes failed-model from chosen-template.
- [ ] **Backend-switch surprise.** When the user switches backends mid-
      session → quick blink + a 200ms cloud color crossfade (instead of
      instant). Acknowledgment of the change.
- [ ] **Claude-cost flinch.** A Claude API call whose budget marker
      crosses a threshold → very subtle eye narrow (90ms). The face is
      counting tokens with you. (Optional; might feel anxious. Try
      first; cut if it stresses out the user.)

## 4. Ambient micro-expressions

Idle reactions that aren't tied to events. Pure presence.

- [ ] **Variable-rate blinks.** Replace the existing single-cadence
      blink with a Poisson-distributed schedule: average ~10s, but
      occasionally 2s apart, occasionally 25s. Living things don't
      blink on a metronome.
- [ ] **Double blink.** ~15% of blinks are doubles (close-open-close-
      open in 320ms). Reads as alive without being theatrical.
- [ ] **Cloud weather.** Once every ~90s, a slower-than-usual breath
      cycle (15s instead of 11s). Like a sigh. No paired face change.
- [ ] **Eye pre-saccade.** Before the eyes drift to a new target, both
      pupils briefly dart in the _opposite_ direction (~50ms) like a
      real eye anticipating. Pixar would call this "look the other way
      first to lead the audience."
- [ ] **Resting microsmile.** In `idle`, the mouth scribble curves up
      another 1px every ~30s for 2s and relaxes. Looks like the face
      is enjoying itself in private.
- [ ] **Wake-up stretch.** When `sleepDepth` drops below 0.5 from
      sleeping → cloud expands 1.12× over 1.2s and back. Yawning.

## 5. Reactions to time / state

- [ ] **Morning report bow.** When the morning report opens → small
      head-nod tilt: tilt drops 5° then returns over 700ms. "Good
      morning."
- [ ] **Long idle gaze-away.** No interaction for > 90s → eyes drift
      slowly to one extreme, hold 4s, drift back. Looking out the
      window.
- [ ] **Window-blur sleepiness.** `window` loses focus → eyes flatten
      30%. Regain on focus. Reduces ambient motion when the user is
      elsewhere.
- [ ] **Welcome-back perk.** App regains focus after > 5min away →
      cloud expands 1.06× for 400ms, eyes widen briefly. A greeting.
- [ ] **First-action of the session.** The user's first edit/create
      after launch → one quick blink + a small tilt nod. "Off we go."

## 6. Mechanics we'd add to support these

Non-exhaustive list of the new levers each beat needs. None require
changing the SVG style.

- A `pulse(name, durationMs)` function that toggles `data-pulse=name`
  on the SVG for one animation cycle, then clears it. Each beat above
  is a CSS keyframe keyed off `data-pulse=...`.
- An anticipation helper: `pulse('bulge')` actually fires
  `data-pulse=bulge-pre` for 80ms then swaps to `data-pulse=bulge`.
  One call site, one shape, two beats.
- Per-eye scale (today both eyes scale together via the SVG group).
  Wrap each eye scribble in its own `<g class="mface-eye-grp">` so we
  can asymmetric-animate (eyebrow flicker, single-side wince).
- A small event bus for "user did X" → pluck reaction events from the
  vault layer (note created, deleted, renamed) and the editor layer
  (typed, saved). Most reactions cost <200ms of CSS; the wiring is
  the work.
- A `prefers-reduced-motion` short-circuit on every transient. Already
  honored for the existing animation; new beats must check too.

## 7. What to deliberately skip

- **Talking mouth.** No phoneme animation. The face never speaks; it
  reacts.
- **Tear / sweat drops.** Crosses into mascot territory.
- **Gaze tracking via webcam.** Privacy + scope. We already follow
  cursor.
- **Sound effects on reactions.** Visual only. Audio is a separate
  decision.
- **Per-note-tag custom expressions.** "Show angry face on #anger."
  Too cute, breaks the impartial-observer vibe.
- **Different expression for each backend at idle.** Backend is the
  glow, not the personality.

## 8. Suggested first batch

If we ship 5, ship these — they each cost <30 min and together
_re-pixarize_ the face without bloating it:

1. Eye bulge on delete (the user's own example).
2. Quick blink on save.
3. Pre-think anticipation (100ms inhale before thinking).
4. Variable-rate blinks with occasional doubles.
5. Result-lands recoil (tilt kick + spring back).

Everything else is a candidate for a second pass after living with
those for a session or two.

#face #avatar #expressions #pixar #brainstorm
